/**
 * CTS V5 Full Backtest — SHORT_TERM_SWING_BO_UP
 * 
 * Runs the validated V5 backtest logic on ALL stocks in the
 * SHORT_TERM_SWING_BO_UP category across the entire dataset.
 * 
 * Usage:
 *   node scripts/full_backtest_st_up.cjs
 */

const path = require('path');
const fs = require('fs');
const priceService = require('../services/priceService.cjs');
const prisma = require('../lib/prisma.cjs');

// ═══════════════════════════════════════════════════
// TECHNICAL INDICATOR CALCULATIONS
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

function calcATR(candles, period = 14) {
    if (candles.length < period + 1) return null;
    const trs = [];
    for (let i = 1; i < candles.length; i++) {
        const tr = Math.max(
            candles[i].high - candles[i].low,
            Math.abs(candles[i].high - candles[i - 1].close),
            Math.abs(candles[i].low - candles[i - 1].close)
        );
        trs.push(tr);
    }
    if (trs.length < period) return null;
    return trs.slice(-period).reduce((a, b) => a + b, 0) / period;
}

function classifyStage(price, sma50, sma200) {
    if (!sma50 || !sma200) return 'UNKNOWN';
    if (price > sma50 && sma50 > sma200) return 'STAGE_2';
    if (price > sma50 && sma50 < sma200) return 'STAGE_1';
    if (price < sma50 && sma50 > sma200) return 'STAGE_3';
    if (price < sma50 && sma50 < sma200) return 'STAGE_4';
    return 'UNKNOWN';
}

// ═══════════════════════════════════════════════════
// NIFTY DATA FETCHING
// ═══════════════════════════════════════════════════

const NIFTY_SYMBOL = 'NIFTY 50';
const NIFTY_INSTRUMENT_KEY = 'NSE_INDEX|Nifty 50';
let niftyCandles = null;

async function fetchNiftyData() {
    process.stdout.write('\n📊 Fetching NIFTY 50 data...');
    const fromDate = '2023-01-01'; // Get a deep history for full backtest
    const toDate = toISTDateString(new Date());

    const data = await priceService.fetchPrice(NIFTY_SYMBOL, NIFTY_INSTRUMENT_KEY, fromDate, toDate);
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
    if (!niftyCandles) return { pass: true, reason: 'No data' };

    let idx = niftyCandles.findIndex(c => c.date >= signalDateStr);
    let niftyIdx = -1;
    if (idx === -1) {
        niftyIdx = niftyCandles.length - 1;
    } else if (niftyCandles[idx].date === signalDateStr) {
        niftyIdx = idx;
    } else {
        niftyIdx = Math.max(0, idx - 1);
    }

    if (niftyIdx < 20) return { pass: true, reason: 'Insufficient NIFTY history' };

    const closes = niftyCandles.slice(0, niftyIdx + 1).map(c => c.close);
    const niftyClose = closes[closes.length - 1];
    const niftyEMA20 = calcEMA(closes, 20);

    // 2% BUFFFER APPLIED
    const isBullish = niftyClose > (niftyEMA20 * 0.98);

    return {
        pass: isBullish,
        niftyClose,
        niftyEMA20
    };
}

// ═══════════════════════════════════════════════════
// MAIN PIPELINE
// ═══════════════════════════════════════════════════

async function processStock(symbol, instrumentKey, signalDateStr) {
    const signalDate = new Date(signalDateStr + 'T00:00:00+05:30');
    const fetchFrom = new Date(signalDate);
    fetchFrom.setDate(fetchFrom.getDate() - 365);
    const fetchTo = new Date(signalDate);
    fetchTo.setDate(fetchTo.getDate() + 25);

    const rawData = await priceService.fetchPrice(
        symbol, instrumentKey,
        toISTDateString(fetchFrom), toISTDateString(fetchTo)
    );

    if (!rawData || rawData.length === 0) {
        return { symbol, signalDate: signalDateStr, result: 'SKIPPED', reason: 'No candle data' };
    }

    const allCandles = rawData
        .map(c => ({
            date: String(c.timestamp || c.date).includes('T') ? String(c.timestamp || c.date).split('T')[0] : String(c.timestamp || c.date).split(' ')[0],
            open: parseFloat(c.open),
            high: parseFloat(c.high),
            low: parseFloat(c.low),
            close: parseFloat(c.close)
        }))
        .sort((a, b) => a.date.localeCompare(b.date));

    const signalIdx = allCandles.findIndex(c => c.date === signalDateStr);
    if (signalIdx === -1) {
        return { symbol, signalDate: signalDateStr, result: 'SKIPPED', reason: 'Signal date not in data' };
    }

    const historyCandles = allCandles.slice(0, signalIdx + 1);
    const closes = historyCandles.map(c => c.close);

    // ── GATE 1: STAGE CHECK ──
    const signalCandle = allCandles[signalIdx];
    const price = signalCandle.close;
    const sma50 = calcSMA(closes, 50);
    const sma200 = calcSMA(closes, 200);
    const stage = classifyStage(price, sma50, sma200);

    if (stage !== 'STAGE_2') {
        return { symbol, signalDate: signalDateStr, result: 'BLOCKED_STAGE', stage };
    }

    // ── GATE 2: RSI CHECK ──
    const rsi = calcRSI(closes, 14);
    if (!rsi || rsi < 60 || rsi > 70) {
        return { symbol, signalDate: signalDateStr, result: 'BLOCKED_RSI', rsi, stage };
    }

    // ── GATE 3: NIFTY CHECK ──
    const niftyCheck = checkNiftyGate(signalDateStr);
    if (!niftyCheck.pass) {
        return { symbol, signalDate: signalDateStr, result: 'BLOCKED_NIFTY' };
    }

    // ── GATE 4: PULLBACK ENTRY (Day 2-5) ──
    const signalClose = signalCandle.close;
    const signalLow = signalCandle.low;
    let entryPrice = null;
    let entryDate = null;
    let entryDay = null;
    let entryIdx = null;

    for (let d = 1; d <= 5; d++) {
        const candleIdx = signalIdx + d;
        if (candleIdx >= allCandles.length) break;

        const candle = allCandles[candleIdx];
        const prevCandle = allCandles[candleIdx - 1];

        if (d === 1) continue; // Skip Day+1

        const gapPct = ((candle.open - prevCandle.close) / prevCandle.close) * 100;
        if (Math.abs(gapPct) > 2) continue; // Gap filter

        const riseAboveSignal = ((candle.open - signalClose) / signalClose) * 100;
        if (riseAboveSignal > 3) continue; // Run away filter

        if (candle.low >= signalLow * 0.99) { // Pullback holds low
            entryPrice = candle.open;
            entryDate = candle.date;
            entryDay = d;
            entryIdx = candleIdx;
            break;
        }
    }

    if (!entryPrice) {
        return { symbol, signalDate: signalDateStr, result: 'NO_ENTRY' };
    }

    // ── STRUCTURE STOP ──
    let pullbackLow = Infinity;
    for (let d = 1; d <= entryDay; d++) {
        pullbackLow = Math.min(pullbackLow, allCandles[signalIdx + d].low);
    }

    let rawRiskPct = ((entryPrice - pullbackLow) / entryPrice) * 100;
    let finalRiskPct = Math.max(1.5, Math.min(4.0, rawRiskPct));
    let stopPrice = entryPrice * (1 - finalRiskPct / 100);

    // ── POSITION SIZING ──
    const riskPerShare = entryPrice - stopPrice;
    const qty = Math.floor(1000 / riskPerShare);

    // ── TRAIL SIMULATION ──
    const atr = calcATR(historyCandles, 14);
    const targetPrice = entryPrice + (atr ? 2 * atr : entryPrice * 0.04);

    let currentStop = stopPrice;
    let exitPrice = null;
    let exitReason = null;
    let exitDate = null;
    let daysHeld = 0;

    for (let holdDay = 1; holdDay <= 10; holdDay++) {
        const candleIndex = entryIdx + holdDay;
        if (candleIndex >= allCandles.length) {
            exitPrice = allCandles[candleIndex - 1].close;
            exitReason = 'TIME_DATA_END';
            exitDate = allCandles[candleIndex - 1].date;
            daysHeld = holdDay;
            break;
        }

        const todayCandle = allCandles[candleIndex];
        daysHeld = holdDay;

        if (todayCandle.low <= currentStop) {
            exitPrice = currentStop;
            exitReason = 'STOP';
            exitDate = todayCandle.date;
            break;
        }

        if (todayCandle.high >= targetPrice) {
            exitPrice = targetPrice;
            exitReason = 'TARGET';
            exitDate = todayCandle.date;
            break;
        }

        // Trail updates (end of day)
        if (holdDay >= 4 && holdDay <= 5) {
            const profitPct = ((todayCandle.close - entryPrice) / entryPrice) * 100;
            if (profitPct >= 1.5) {
                const newStop = entryPrice * 0.99;
                if (newStop > currentStop) currentStop = newStop;
            }
        }
        if (holdDay >= 6) {
            const prevLow = allCandles[candleIndex - 1].low;
            if (prevLow > currentStop) currentStop = prevLow;
        }

        if (holdDay >= 10) {
            exitPrice = todayCandle.close;
            exitReason = 'TIME_LIMIT';
            exitDate = todayCandle.date;
            break;
        }
    }

    if (!exitPrice) {
        const lastAvail = allCandles[Math.min(entryIdx + 10, allCandles.length - 1)];
        exitPrice = lastAvail.close;
        exitReason = 'DATA_END';
        exitDate = lastAvail.date;
    }

    const pnlPerShare = exitPrice - entryPrice;
    const totalPnl = pnlPerShare * qty;

    return {
        symbol,
        signalDate: signalDateStr,
        result: 'TRADED',
        outcome: totalPnl > 0 ? 'WIN' : 'LOSS',
        entryDate,
        entryPrice,
        pullbackLow,
        stopPrice,
        stopPct: finalRiskPct,
        qty,
        exitPrice,
        exitDate,
        exitReason,
        pnl: totalPnl,
        daysHeld,
        targetPrice
    };
}

// ═══════════════════════════════════════════════════
// EXECUTE FULL BACKTEST
// ═══════════════════════════════════════════════════

async function main() {
    console.log('═══════════════════════════════════════════════════════');
    console.log('  CTS V5 FULL BACKTEST — SHORT_TERM_SWING_BO_UP');
    console.log('═══════════════════════════════════════════════════════');

    await fetchNiftyData();

    console.log('\n📊 Fetching categories from DB...');
    // Fetch all stock entries added for this category
    const cat = await prisma.category.findUnique({ where: { key: 'SHORT_TERM_SWING_BO_UP' } });
    if (!cat) {
        console.error('❌ Category SHORT_TERM_SWING_BO_UP not found in DB!');
        process.exit(1);
    }

    const stockEntries = await prisma.stockCategory.findMany({
        where: { categoryId: cat.id },
        include: { stock: true }
    });

    // Sort by addedDate natively
    stockEntries.sort((a, b) => new Date(a.addedDate) - new Date(b.addedDate));

    // Deduplicate same stock on same day
    const uniqueMap = new Map();
    for (const sc of stockEntries) {
        const dStr = toISTDateString(sc.addedDate);
        const k = `${sc.stock.symbol}_${dStr}`;
        if (!uniqueMap.has(k)) {
            uniqueMap.set(k, {
                symbol: sc.stock.symbol,
                instrumentKey: sc.stock.instrumentKey,
                addedDate: dStr
            });
        }
    }
    const targetStocks = Array.from(uniqueMap.values());
    console.log(` ✅ Found ${targetStocks.length} unique daily stock signals in DB for category.`);

    const results = [];
    const BATCH_SIZE = 5; // Do 5 concurrent to speed up without rate limiting Upstox
    let processed = 0;

    process.stdout.write(`\n🚀 Assaying ${targetStocks.length} signals `);

    for (let i = 0; i < targetStocks.length; i += BATCH_SIZE) {
        const batch = targetStocks.slice(i, i + BATCH_SIZE);
        const batchResults = await Promise.all(batch.map(s => processStock(s.symbol, s.instrumentKey, s.addedDate)));

        results.push(...batchResults);
        processed += batch.length;
        process.stdout.write('.');
    }

    console.log(' DONE!\n');

    // ── PIPELINE FUNNEL SUMMARY ──
    const total = results.length;
    const skipped = results.filter(r => r.result === 'SKIPPED' || r.result === 'ERROR').length;
    const blockedStage = results.filter(r => r.result === 'BLOCKED_STAGE').length;
    const blockedRSI = results.filter(r => r.result === 'BLOCKED_RSI').length;
    const blockedNifty = results.filter(r => r.result === 'BLOCKED_NIFTY').length;
    const noEntry = results.filter(r => r.result === 'NO_ENTRY').length;
    const traded = results.filter(r => r.result === 'TRADED').length;

    const passedStage = total - skipped - blockedStage;
    const passedRSI = passedStage - blockedRSI;
    const passedNifty = passedRSI - blockedNifty;

    console.log('═'.repeat(55));
    console.log('  PIPELINE FUNNEL SUMMARY');
    console.log('═'.repeat(55));
    console.log(`  Total DB Signals:             ${total}`);
    console.log(`  Skipped (No Candle Data):     ${skipped}`);
    console.log(`  Passed Stage 2:               ${passedStage}`);
    console.log(`  Passed Stage 2 + RSI 60-70:   ${passedRSI}`);
    console.log(`  Passed NIFTY filter (-2%):    ${passedNifty}`);
    console.log(`  FINAL TRADES (Pullback entered): ${traded}`);
    console.log(`  No valid pullback:            ${noEntry}`);

    // ── TRADE SUMMARY ──
    const trades = results.filter(r => r.result === 'TRADED');
    if (trades.length > 0) {
        const wins = trades.filter(t => t.outcome === 'WIN');
        const losses = trades.filter(t => t.outcome === 'LOSS');
        const totalPnl = trades.reduce((s, t) => s + t.pnl, 0);
        const avgWin = wins.length > 0 ? wins.reduce((s, t) => s + t.pnl, 0) / wins.length : 0;
        const avgLoss = losses.length > 0 ? losses.reduce((s, t) => s + t.pnl, 0) / losses.length : 0;
        const zeroPnl = trades.filter(t => Math.abs(t.pnl) < 10);

        console.log('\n' + '═'.repeat(55));
        console.log('  TRADE RESULTS SUMMARY');
        console.log('═'.repeat(55));
        console.log(`  Total trades: ${trades.length}`);
        console.log(`  Wins: ${wins.length} | Losses: ${losses.length}`);
        console.log(`  Win Rate: ${(wins.length / trades.length * 100).toFixed(1)}%`);
        console.log(`  Total P&L: ₹${totalPnl >= 0 ? '+' : ''}${totalPnl.toFixed(0)}`);
        console.log(`  Avg Win: ₹${avgWin.toFixed(0)}`);
        console.log(`  Avg Loss: ₹${avgLoss.toFixed(0)}`);
        console.log(`  Zero-PnL exits: ${zeroPnl.length}`);

        // Build CSV Data
        const csvLines = [
            'Symbol,Signal Date,Entry Date,Entry Price,Pullback Low,Stop Price,Stop Pct,Quantity,Exit Price,Exit Date,Exit Reason,P&L INR,Outcome,Days Held,Target Price'
        ];
        for (const t of trades) {
            csvLines.push(`${t.symbol},${t.signalDate},${t.entryDate},${t.entryPrice.toFixed(2)},${t.pullbackLow.toFixed(2)},${t.stopPrice.toFixed(2)},${t.stopPct.toFixed(2)}%,${t.qty},${t.exitPrice.toFixed(2)},${t.exitDate},${t.exitReason},${t.pnl.toFixed(0)},${t.outcome},${t.daysHeld},${t.targetPrice.toFixed(2)}`);
        }

        const outDir = path.join(__dirname, '..', 'outputs');
        if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

        const csvPath = path.join(outDir, 'full_backtest_st_up_v5.csv');
        fs.writeFileSync(csvPath, csvLines.join('\n'));
        console.log(`\n✅ Saved comprehensive CSV report to: ${csvPath}`);
    } else {
        console.log('\n❌ No valid trades executed.');
    }

    await prisma.$disconnect();
    process.exit(0);
}

main().catch(e => {
    console.error('FATAL:', e);
    process.exit(1);
});
