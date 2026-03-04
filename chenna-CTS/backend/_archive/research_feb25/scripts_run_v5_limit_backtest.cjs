/**
 * CTS V5 Limit Order Backtest — SHORT_TERM_SWING_BO_UP (Option 2)
 * 
 * Re-runs the full ST_SWING_BO_UP category using Option 2 Limit Entry:
 * - Signal Close - 2.0% limit placed for 5 days
 * - Gap handling: if opens < limit, fill at Open. If opens < -3% below signal, skip.
 * - Structure stop fixed at 2% below limit fill price.
 * - 3-phase trailing mechanics.
 */

const path = require('path');
const fs = require('fs');
const priceService = require('../services/priceService.cjs');
const prisma = require('../lib/prisma.cjs');

// ═══════════════════════════════════════════════════
// TECHNICAL INDICATORS & CONSTANTS
// ═══════════════════════════════════════════════════

function toISTDateString(date) {
    const d = new Date(date);
    d.setMinutes(d.getMinutes() + 330);
    return d.toISOString().split('T')[0];
}

function calcSMA(closes, period) {
    if (closes.length < period) return null;
    const slice = closes.slice(closes.length - period);
    return slice.reduce((a, b) => a + b, 0) / period;
}

function calcEMA(closes, period) {
    if (closes.length < period) return null;
    const k = 2 / (period + 1);
    let ema = closes.slice(0, period).reduce((a, b) => a + b, 0) / period;
    for (let i = period; i < closes.length; i++) {
        ema = closes[i] * k + ema * (1 - k);
    }
    return ema;
}

function calcRSI(closes, period = 14) {
    if (closes.length < period + 1) return null;
    let gains = 0, losses = 0;
    for (let i = 1; i <= period; i++) {
        const diff = closes[i] - closes[i - 1];
        if (diff > 0) gains += diff; else losses -= diff;
    }
    let avgGain = gains / period, avgLoss = losses / period;
    for (let i = period + 1; i < closes.length; i++) {
        const diff = closes[i] - closes[i - 1];
        avgGain = (avgGain * (period - 1) + (diff > 0 ? diff : 0)) / period;
        avgLoss = (avgLoss * (period - 1) + (diff < 0 ? -diff : 0)) / period;
    }
    if (avgLoss === 0) return 100;
    return 100 - (100 / (1 + avgGain / avgLoss));
}

function classifyStage(price, sma50, sma200) {
    if (!sma50 || !sma200) return 'UNKNOWN';
    if (price > sma50 && sma50 > sma200) return 'STAGE_2';
    if (price > sma50 && sma50 < sma200) return 'STAGE_1';
    if (price < sma50 && sma50 > sma200) return 'STAGE_3';
    if (price < sma50 && sma50 < sma200) return 'STAGE_4';
    return 'UNKNOWN';
}

const NIFTY_SYMBOL = 'NIFTY 50';
const NIFTY_INSTRUMENT_KEY = 'NSE_INDEX|Nifty 50';
let niftyCandles = null;

async function fetchNiftyData() {
    process.stdout.write('\n📊 Fetching NIFTY 50 data...');
    const data = await priceService.fetchPrice(NIFTY_SYMBOL, NIFTY_INSTRUMENT_KEY, '2023-01-01', toISTDateString(new Date()));
    if (!data || data.length === 0) {
        console.error('\n❌ FATAL: Could not fetch NIFTY 50 data!');
        process.exit(1);
    }
    data.sort((a, b) => new Date(a.timestamp || a.date) - new Date(b.timestamp || b.date));
    niftyCandles = data.map(c => ({
        date: String(c.timestamp || c.date).includes('T') ? String(c.timestamp || c.date).split('T')[0] : String(c.timestamp || c.date).split(' ')[0],
        close: parseFloat(c.close)
    }));
    console.log(` ✅ Got ${niftyCandles.length} candles`);
}

function checkNiftyGate(signalDateStr) {
    if (!niftyCandles) return false;
    let idx = niftyCandles.findIndex(c => c.date >= signalDateStr);
    let niftyIdx = (idx === -1) ? niftyCandles.length - 1 : (niftyCandles[idx].date === signalDateStr ? idx : Math.max(0, idx - 1));
    if (niftyIdx < 20) return false;
    const closes = niftyCandles.slice(0, niftyIdx + 1).map(c => c.close);
    const niftyClose = closes[closes.length - 1];
    const niftyEMA20 = calcEMA(closes, 20);
    return niftyClose > (niftyEMA20 * 0.98);
}

// ═══════════════════════════════════════════════════
// MAIN PIPELINE
// ═══════════════════════════════════════════════════

async function processStock(symbol, instrumentKey, signalDateStr) {
    const signalDate = new Date(signalDateStr + 'T00:00:00+05:30');
    const fetchFromStr = toISTDateString(new Date(signalDate.getTime() - 365 * 24 * 60 * 60 * 1000));
    const fetchToStr = toISTDateString(new Date(signalDate.getTime() + 25 * 24 * 60 * 60 * 1000));

    const rawData = await priceService.fetchPrice(symbol, instrumentKey, fetchFromStr, fetchToStr);
    if (!rawData || rawData.length === 0) return { symbol, result: 'SKIPPED' };

    const allCandles = rawData
        .map(c => ({
            date: String(c.timestamp || c.date).split('T')[0].split(' ')[0],
            open: parseFloat(c.open),
            high: parseFloat(c.high),
            low: parseFloat(c.low),
            close: parseFloat(c.close)
        }))
        .sort((a, b) => a.date.localeCompare(b.date));

    const signalIdx = allCandles.findIndex(c => c.date === signalDateStr);
    if (signalIdx === -1) return { symbol, result: 'SKIPPED' };

    const historyCandles = allCandles.slice(0, signalIdx + 1);
    const closes = historyCandles.map(c => c.close);

    // GATE 1: STAGE
    const signalCandle = allCandles[signalIdx];
    const price = signalCandle.close;
    const sma50 = calcSMA(closes, 50);
    const sma200 = calcSMA(closes, 200);
    const stage = classifyStage(price, sma50, sma200);
    if (stage !== 'STAGE_2') return { symbol, result: 'BLOCKED_STAGE' };

    // GATE 2: RSI
    const rsi = calcRSI(closes, 14);
    if (!rsi || rsi < 60 || rsi > 70) return { symbol, result: 'BLOCKED_RSI' };

    // GATE 3: NIFTY
    if (!checkNiftyGate(signalDateStr)) return { symbol, result: 'BLOCKED_NIFTY' };

    // GATE 4: LIMIT ORDER ENTRY (Option 2: Signal Close - 2.0%)
    const signalClose = signalCandle.close;
    const limitPrice = signalClose * 0.98;

    let fillPrice = null;
    let fillDate = null;
    let fillDay = null;
    let fillIdx = null;
    let fillType = null;

    for (let d = 1; d <= 5; d++) {
        const candleIdx = signalIdx + d;
        if (candleIdx >= allCandles.length) break;
        const candle = allCandles[candleIdx];

        if (candle.low <= limitPrice) {
            const openGapFromSignal = ((candle.open - signalClose) / signalClose) * 100;

            // If the stock gaps down heavily, opening >3% below signal close -> SKIP entirely
            if (openGapFromSignal < -3.0) {
                return { symbol, result: 'BLOCKED_GAP' };
            }

            // Fill occurred
            if (candle.open < limitPrice) {
                fillPrice = candle.open;
                fillType = 'GAP_FILL';
            } else {
                fillPrice = limitPrice;
                fillType = 'LIMIT';
            }

            fillDate = candle.date;
            fillDay = d;
            fillIdx = candleIdx;
            break;
        }
    }

    if (!fillPrice) return { symbol, result: 'NO_FILL' };
    if (fillDate > '2026-02-13') return { symbol, result: 'BLOCKED_DATE' };

    // FIXED STRUCTURE STOP (2% below limit fill price)
    const finalRiskPct = 2.0;
    const stopPrice = fillPrice * 0.98;

    const qty = Math.floor(1000 / (fillPrice - stopPrice));
    const riskInr = (fillPrice - stopPrice) * qty;

    // TRAILING STOP SIMULATION
    let currentStop = stopPrice;
    let exitPrice = null;
    let exitReason = null;
    let exitDate = null;
    let activeStopName = 'INITIAL_STOP';
    let holdDay = 1;

    for (holdDay = 1; holdDay <= 10; holdDay++) {
        const candleIndex = fillIdx + holdDay;
        if (candleIndex >= allCandles.length) {
            exitPrice = allCandles[candleIndex - 1].close;
            exitReason = 'TIME_EXHAUSTION';
            exitDate = allCandles[candleIndex - 1].date;
            break;
        }

        const todayCandle = allCandles[candleIndex];

        // Did we hit stop? Check Gap Down first
        if (todayCandle.open <= currentStop) {
            exitPrice = todayCandle.open;
            exitReason = activeStopName;
            exitDate = todayCandle.date;
            break;
        } else if (todayCandle.low <= currentStop) {
            exitPrice = currentStop;
            exitReason = activeStopName;
            exitDate = todayCandle.date;
            break;
        }

        // Apply Trailing Logic EOD
        // Phase 2 (Day 4-5): If +2%, move stop to entry-1%
        if (holdDay >= 4 && holdDay <= 5) {
            const profitPct = ((todayCandle.close - fillPrice) / fillPrice) * 100;
            if (profitPct >= 2.0) {
                const newStop = fillPrice * 0.99;
                if (newStop > currentStop) {
                    currentStop = newStop;
                    activeStopName = 'PHASE2_STOP';
                }
            }
        }
        // Phase 3 (Day 6-10): Trail to previous day low
        if (holdDay >= 6) {
            const prevLow = allCandles[candleIndex - 1].low;
            if (prevLow > currentStop) {
                currentStop = prevLow;
                activeStopName = 'TRAILING_STOP';
            }
        }

        if (holdDay === 10) {
            exitPrice = todayCandle.close;
            exitReason = 'TIME_EXHAUSTION';
            exitDate = todayCandle.date;
            break;
        }
    }

    if (!exitPrice) {
        exitPrice = currentStop;
        exitReason = activeStopName;
        exitDate = allCandles[allCandles.length - 1].date;
    }

    let slippageInr = 0;
    let recoveredAfterStop = 'NO';
    if (exitReason && exitReason.includes('STOP')) {
        slippageInr = (currentStop - exitPrice) * qty;

        const exitCandleIdx = allCandles.findIndex(c => c.date === exitDate);
        if (exitCandleIdx !== -1 && exitCandleIdx + 5 < allCandles.length) {
            if (allCandles[exitCandleIdx + 5].close > fillPrice) {
                recoveredAfterStop = 'YES';
            }
        }
    }

    const pnlInr = (exitPrice - fillPrice) * qty;
    const pnlPct = ((exitPrice - fillPrice) / fillPrice) * 100;
    const outcome = pnlInr > 0 ? 'WIN' : 'LOSS';

    return {
        symbol, signal_date: signalDateStr, limit_price: limitPrice, fill_date: fillDate,
        fill_price: fillPrice, fill_type: fillType, structure_stop: stopPrice,
        stop_pct: finalRiskPct, qty, risk_inr: riskInr, exit_price: exitPrice,
        exit_date: exitDate, pnl_inr: pnlInr, pnl_pct: pnlPct, outcome,
        exit_reason: exitReason, days_held: Math.min(holdDay, 10),
        slippage_inr: slippageInr, recovered_after_stop: recoveredAfterStop,
        result: 'TRADE'
    };
}

// ═══════════════════════════════════════════════════
// EXECUTE FULL BACKTEST
// ═══════════════════════════════════════════════════

async function main() {
    console.log('═══════════════════════════════════════════════════════');
    console.log('  V5 BACKTEST — LIMIT ORDER OPTION 2');
    console.log('═══════════════════════════════════════════════════════');

    const isTest = process.argv.includes('--test');

    await fetchNiftyData();

    let targetStocks = [];
    if (isTest) {
        const testData = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'test_stocks.json'), 'utf8'));
        // Load instrument keys from DB for the test stocks
        for (const st of testData) {
            const dbStock = await prisma.stock.findUnique({ where: { symbol: st.symbol } });
            if (dbStock) {
                targetStocks.push({ symbol: st.symbol, instrumentKey: dbStock.instrumentKey, addedDate: st.addedDate });
            }
        }
        console.log(`\n🧪 RUNNING IN TEST MODE (${targetStocks.length} test stocks)`);
    } else {
        const cat = await prisma.category.findUnique({ where: { key: 'SHORT_TERM_SWING_BO_UP' } });
        if (!cat) process.exit(1);

        const stockEntries = await prisma.stockCategory.findMany({
            where: { categoryId: cat.id },
            include: { stock: true }
        });
        stockEntries.sort((a, b) => new Date(a.addedDate) - new Date(b.addedDate));

        const uniqueMap = new Map();
        for (const sc of stockEntries) {
            const dStr = toISTDateString(sc.addedDate);
            uniqueMap.set(`${sc.stock.symbol}_${dStr}`, { symbol: sc.stock.symbol, instrumentKey: sc.stock.instrumentKey, addedDate: dStr });
        }
        targetStocks = Array.from(uniqueMap.values());
        console.log(`\n🌎 RUNNING FULL BACKTEST (${targetStocks.length} signals)`);
    }

    const funnel = {
        total: targetStocks.length,
        stage: 0, rsi: 0, nifty: 0, limitPlaced: 0, filled: 0, gapSkipped: 0, dateBlocked: 0, trades: 0
    };

    const results = [];
    const BATCH_SIZE = 5;
    for (let i = 0; i < targetStocks.length; i += BATCH_SIZE) {
        const batch = targetStocks.slice(i, i + BATCH_SIZE);
        const batchResults = await Promise.all(batch.map(s => processStock(s.symbol, s.instrumentKey, s.addedDate)));

        for (const res of batchResults) {
            if (!res) continue;

            if (res.result === 'BLOCKED_STAGE') funnel.stage++;
            else if (res.result === 'BLOCKED_RSI') funnel.rsi++;
            else if (res.result === 'BLOCKED_NIFTY') funnel.nifty++;
            else {
                // Made it past filters -> Limit Placed
                funnel.limitPlaced++;

                if (res.result === 'BLOCKED_GAP') funnel.gapSkipped++;
                else if (res.result === 'BLOCKED_DATE') funnel.dateBlocked++;
                else if (res.result === 'NO_FILL') { /* counted dynamically */ }
                else if (res.result === 'TRADE') {
                    funnel.filled++;
                    funnel.trades++;
                    results.push(res);
                }
            }
        }
        process.stdout.write('.');
    }
    console.log(' DONE!\n');

    // ── SUMMARY STATS ──
    const wins = results.filter(r => r.outcome === 'WIN');
    const losses = results.filter(r => r.outcome === 'LOSS');
    const totalPnl = results.reduce((sum, r) => sum + r.pnl_inr, 0);
    const avgWin = wins.length ? wins.reduce((sum, r) => sum + r.pnl_inr, 0) / wins.length : 0;
    const avgLoss = losses.length ? losses.reduce((sum, r) => sum + r.pnl_inr, 0) / losses.length : 0;
    const winRate = results.length ? (wins.length / results.length * 100) : 0;

    console.log('\n========================================');
    console.log(' PIPELINE FUNNEL   ');
    console.log('========================================');
    console.log(`Raw signals:           ${funnel.total}`);
    console.log(`After Stage 2:         ${funnel.total - funnel.stage}`);
    console.log(`After RSI 60-70:       ${funnel.total - funnel.stage - funnel.rsi}`);
    console.log(`After NIFTY filter:    ${funnel.limitPlaced}`);
    console.log(`Limit orders placed:   ${funnel.limitPlaced}`);
    console.log(`Filled but gap-skipped:${funnel.gapSkipped}`);
    console.log(`Limit orders filled:   ${funnel.filled} (${funnel.limitPlaced ? (funnel.filled / funnel.limitPlaced * 100).toFixed(1) : 0}%)`);
    console.log(`Excluded (Date/Other): ${funnel.dateBlocked}`);
    console.log(`FINAL TRADES:          ${funnel.trades}`);

    console.log('\n========================================');
    console.log(' PERFORMANCE (LIMIT ORDER OPTION 2)');
    console.log('========================================');
    console.log(`Total trades:       ${results.length}`);
    console.log(`Win rate:           ${winRate.toFixed(1)}%`);
    console.log(`Total P&L:          \u20B9${totalPnl.toFixed(0)}`);
    console.log(`Avg Win:            \u20B9${avgWin.toFixed(0)}`);
    console.log(`Avg Loss:           \u20B9${avgLoss.toFixed(0)}`);
    if (avgLoss !== 0) {
        console.log(`R:R ratio:          ${Math.abs(avgWin / avgLoss).toFixed(2)}`);
    }

    // Write strictly formatted CSV
    const csvContent = [
        'symbol,signal_date,limit_price,fill_date,fill_price,fill_type,structure_stop,stop_pct,qty,risk_inr,exit_price,exit_date,pnl_inr,pnl_pct,outcome,exit_reason,days_held,slippage_inr,recovered_after_stop'
    ];
    results.forEach(r => {
        csvContent.push(`${r.symbol},${r.signal_date},${r.limit_price.toFixed(2)},${r.fill_date},${r.fill_price.toFixed(2)},${r.fill_type},${r.structure_stop.toFixed(2)},${r.stop_pct.toFixed(2)},${r.qty},${r.risk_inr.toFixed(2)},${r.exit_price.toFixed(2)},${r.exit_date},${r.pnl_inr.toFixed(2)},${r.pnl_pct.toFixed(2)},${r.outcome},${r.exit_reason},${r.days_held},${r.slippage_inr.toFixed(2)},${r.recovered_after_stop}`);
    });

    const suffix = isTest ? '_test' : '';
    const csvPath = path.join(__dirname, '..', 'outputs', `limit_backtest_option2${suffix}.csv`);
    fs.writeFileSync(csvPath, csvContent.join('\n'));
    console.log(`\n\u2705 Saved CSV to: outputs/limit_backtest_option2${suffix}.csv\n`);

    await prisma.$disconnect();
    process.exit(0);
}

main().catch(e => { console.error('FATAL:', e); process.exit(1); });
