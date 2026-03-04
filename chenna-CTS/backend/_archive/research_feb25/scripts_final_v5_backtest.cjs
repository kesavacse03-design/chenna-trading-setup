/**
 * CTS V5 Final Full Backtest — SHORT_TERM_SWING_BO_UP
 * 
 * Runs the fully finalized and verified V5 backtest logic:
 * - V5 Structure Stops
 * - Nifty 20 EMA + 2% Buffer Gate
 * - NEW: Mandatory GREEN Entry Candle Gate
 * - NEW: No 2R hard target (trailing stop only)
 * - NEW: Data-Driven Confidence Score computation
 * 
 * Outputs single detailed CSV: outputs/full_backtest_v5_final.csv
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

async function processStock(symbol, instrumentKey, signalDateStr, globalDateCounts) {
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
    if (stage !== 'STAGE_2') return { symbol, result: 'BLOCKED' };

    // GATE 2: RSI
    const rsi = calcRSI(closes, 14);
    if (!rsi || rsi < 60 || rsi > 70) return { symbol, result: 'BLOCKED' };

    // GATE 3: NIFTY
    if (!checkNiftyGate(signalDateStr)) return { symbol, result: 'BLOCKED' };

    // GATE 4: PULLBACK ENTRY WITH NEXT DAY OPEN (OPTION B)
    const signalClose = signalCandle.close;
    let entryPrice = null;
    let entryDate = null;
    let entryDay = null;
    let entryIdx = null;
    let confirmationDay = null;
    let gapFromConfirmationPct = 0;

    for (let d = 2; d <= 5; d++) {
        const candleIdx = signalIdx + d;
        if (candleIdx >= allCandles.length) break;
        const candle = allCandles[candleIdx];
        const prevCandle = allCandles[candleIdx - 1];

        const isGreen = candle.close >= candle.open;
        const exceededHigh = candle.close > prevCandle.high;
        const riseAboveSignal = ((candle.open - signalClose) / signalClose) * 100;
        const openInRange = Math.abs(riseAboveSignal) <= 3;

        if (isGreen && exceededHigh && openInRange) {
            const nextIdx = candleIdx + 1;
            if (nextIdx < allCandles.length) {
                const confClose = candle.close;
                const nextCandle = allCandles[nextIdx];
                const gapPct = ((nextCandle.open - confClose) / confClose) * 100;

                // Realistic Gap Filter: Reject chasing (> +2%) or breakdown (< -3%)
                if (gapPct > 2 || gapPct < -3) {
                    continue; // Skip this day, wait to see if we get another valid confirmation
                }

                confirmationDay = d;
                entryPrice = nextCandle.open;
                entryDate = nextCandle.date;
                entryDay = d + 1;
                entryIdx = nextIdx;
                gapFromConfirmationPct = gapPct;
                break;
            }
        }
    }

    if (!entryPrice) return { symbol, result: 'BLOCKED' };
    if (entryDate > '2026-02-13') return { symbol, result: 'BLOCKED_DATE' }; // Need 10 full days

    // STRUCTURE STOP CALCULATION (Day 1 through confirmation day)
    let pullbackLow = Infinity;
    for (let d = 1; d <= confirmationDay; d++) {
        pullbackLow = Math.min(pullbackLow, allCandles[signalIdx + d].low);
    }

    let rawRiskPct = ((entryPrice - pullbackLow) / entryPrice) * 100;
    let finalRiskPct = Math.max(1.5, Math.min(4.0, rawRiskPct));
    let stopPrice = entryPrice * (1 - finalRiskPct / 100);

    const qty = Math.floor(1000 / (entryPrice - stopPrice));
    const riskInr = (entryPrice - stopPrice) * qty;

    // CONFIDENCE SCORE COMPUTATION
    const clusterCount = globalDateCounts[signalDateStr] || 1;
    const sma50Dist = sma50 ? ((entryPrice - sma50) / sma50) * 100 : 0;
    const gapFromSignal = ((entryPrice - signalClose) / signalClose) * 100;

    let score = 0;
    // 1. Cluster 
    if (clusterCount >= 4) score += 35;
    else if (clusterCount === 3) score += 20;
    // 2. SMA50
    if (sma50Dist >= 1 && sma50Dist < 3) score += 25;
    else if (sma50Dist >= 3 && sma50Dist < 5) score += 15;
    else if (sma50Dist >= 5 && sma50Dist < 8) score += 5;
    // 3. Gap
    if (gapFromSignal < 1 && gapFromSignal >= -5) score += 20;
    else if (gapFromSignal >= 1 && gapFromSignal < 2) score += 10;
    // 4. Days
    if (entryDay >= 4) score += 20;
    else if (entryDay === 3) score += 12;
    else if (entryDay === 2) score += 5;

    let tier = 'TIER 3';
    if (score >= 70) tier = 'TIER 1';
    else if (score >= 40) tier = 'TIER 2';

    // TRAILING STOP SIMULATION (NO TARGET)
    let currentStop = stopPrice;
    let exitPrice = null;
    let exitReason = null;
    let exitDate = null;
    let activeStopName = 'INITIAL_STOP';
    let holdDay = 1;

    for (holdDay = 1; holdDay <= 10; holdDay++) {
        const candleIndex = entryIdx + holdDay;
        if (candleIndex >= allCandles.length) {
            exitPrice = allCandles[candleIndex - 1].close;
            exitReason = 'TIME_EXHAUSTION';
            exitDate = allCandles[candleIndex - 1].date;
            break;
        }

        const todayCandle = allCandles[candleIndex];

        // Did we hit stop? Check Gap Down first
        if (todayCandle.open < currentStop) {
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
        if (holdDay >= 4 && holdDay <= 5) {
            const profitPct = ((todayCandle.close - entryPrice) / entryPrice) * 100;
            if (profitPct >= 1.5) {
                const newStop = entryPrice * 0.99;
                if (newStop > currentStop) {
                    currentStop = newStop;
                    activeStopName = 'PHASE2_STOP';
                }
            }
        }
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

        // Track stop recovery (5 days out)
        const exitCandleIdx = allCandles.findIndex(c => c.date === exitDate);
        if (exitCandleIdx !== -1 && exitCandleIdx + 5 < allCandles.length) {
            if (allCandles[exitCandleIdx + 5].close > entryPrice) {
                recoveredAfterStop = 'YES';
            }
        }
    }

    const pnlInr = (exitPrice - entryPrice) * qty;
    const pnlPct = ((exitPrice - entryPrice) / entryPrice) * 100;
    const outcome = pnlInr > 0 ? 'WIN' : 'LOSS';

    return {
        symbol, signal_date: signalDateStr, entry_date: entryDate, entry_day: entryDay,
        entry_price: entryPrice, pullback_low: pullbackLow, structure_stop: stopPrice,
        stop_pct: finalRiskPct, qty, risk_inr: riskInr, exit_price: exitPrice,
        exit_date: exitDate, pnl_inr: pnlInr, pnl_pct: pnlPct, outcome,
        exit_reason: exitReason, days_held: Math.min(holdDay, 10),
        slippage_inr: slippageInr, recovered_after_stop: recoveredAfterStop,
        confidence_score: score, confidence_tier: tier, signal_cluster_count: clusterCount,
        sma50_distance_pct: sma50Dist, gap_from_signal_pct: gapFromSignal, gap_from_confirmation_pct: gapFromConfirmationPct,
        entry_candle_color: 'GREEN', rsi_at_signal: rsi, stage_at_signal: stage
    };
}

// ═══════════════════════════════════════════════════
// EXECUTE FULL BACKTEST
// ═══════════════════════════════════════════════════

async function main() {
    console.log('═══════════════════════════════════════════════════════');
    console.log('  FINAL V5 BACKTEST — SHORT_TERM_SWING_BO_UP');
    console.log('═══════════════════════════════════════════════════════');

    await fetchNiftyData();

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
    const targetStocks = Array.from(uniqueMap.values());

    // Compute Global Clusters
    const globalDateCounts = {};
    for (const s of targetStocks) {
        globalDateCounts[s.addedDate] = (globalDateCounts[s.addedDate] || 0) + 1;
    }

    console.log(` ✅ Processing ${targetStocks.length} unique signals...`);

    const results = [];
    const BATCH_SIZE = 5;
    for (let i = 0; i < targetStocks.length; i += BATCH_SIZE) {
        const batch = targetStocks.slice(i, i + BATCH_SIZE);
        const batchResults = await Promise.all(batch.map(s => processStock(s.symbol, s.instrumentKey, s.addedDate, globalDateCounts)));
        for (const res of batchResults) {
            if (res.outcome) results.push(res);
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

    console.log('\nOVERALL:');
    console.log(`Total trades: ${results.length}`);
    console.log(`Wins: ${wins.length} (${winRate.toFixed(1)}%)`);
    console.log(`Losses: ${losses.length}`);
    console.log(`Total P&L: \u20B9${totalPnl.toFixed(0)}`);
    console.log(`Avg Win: \u20B9${avgWin.toFixed(0)}`);
    console.log(`Avg Loss: \u20B9${avgLoss.toFixed(0)}`);
    console.log(`Win/Loss Ratio: ${Math.abs(avgWin / avgLoss).toFixed(2)}`);

    console.log('\nBY CONFIDENCE TIER:');
    ['TIER 1', 'TIER 2', 'TIER 3'].forEach(tier => {
        const trds = results.filter(r => r.confidence_tier === tier);
        const w = trds.filter(r => r.outcome === 'WIN');
        const wr = trds.length ? (w.length / trds.length * 100) : 0;
        const sumPnl = trds.reduce((s, r) => s + r.pnl_inr, 0);
        const aPnl = trds.length ? sumPnl / trds.length : 0;
        const label = tier === 'TIER 1' ? 'TIER 1 (70-100)' : (tier === 'TIER 2' ? 'TIER 2 (40-69) ' : 'TIER 3 (< 40)  ');
        console.log(`${label}: ${String(trds.length).padStart(2)} trades | ${wr.toFixed(1).padStart(4)}% WR | Avg P&L \u20B9${aPnl.toFixed(0).padStart(4)} | Total P&L \u20B9${sumPnl.toFixed(0).padStart(5)}`);
    });

    console.log('\nBY EXIT REASON:');
    ['TARGET', 'TRAILING_STOP', 'PHASE2_STOP', 'INITIAL_STOP', 'TIME_EXHAUSTION'].forEach(reason => {
        const trds = results.filter(r => r.exit_reason === reason);
        const w = trds.filter(r => r.outcome === 'WIN');
        const wr = trds.length ? (w.length / trds.length * 100) : 0;
        console.log(`${reason.padEnd(20)}: ${String(trds.length).padStart(2)} trades | ${wr.toFixed(1).padStart(4)}% WR`);
    });

    console.log('\nBY ENTRY CANDLE COLOR:');
    console.log(`GREEN entries: ${results.length} trades | ${winRate.toFixed(1)}% WR | Avg P&L \u20B9${(totalPnl / results.length).toFixed(0)}`);
    console.log(`RED entries:    0 trades |  0.0% WR | Avg P&L \u20B90`);

    console.log('\nMONTHLY BREAKDOWN:');
    const months = {};
    results.forEach(r => {
        const m = r.entry_date.substring(0, 7);
        if (!months[m]) months[m] = { total: 0, wins: 0, pnl: 0 };
        months[m].total++;
        if (r.outcome === 'WIN') months[m].wins++;
        months[m].pnl += r.pnl_inr;
    });
    Object.keys(months).sort().forEach(m => {
        console.log(`${m}: ${String(months[m].total).padStart(2)} trades | ${String(months[m].wins).padStart(2)} wins | P&L \u20B9${months[m].pnl.toFixed(0)}`);
    });

    console.log('\nFACTOR ANALYSIS (Unbiased Breakdown):');
    function printFactor(name, bins) {
        console.log(`\n  Factor: ${name}`);
        bins.forEach(b => {
            const trds = results.filter(b.filter);
            const w = trds.filter(r => r.outcome === 'WIN');
            const wr = trds.length ? (w.length / trds.length * 100) : 0;
            console.log(`  ${b.label.padEnd(25)}: ${String(trds.length).padStart(2)} trades | ${wr.toFixed(1).padStart(4)}% WR`);
        });
    }

    printFactor('Gap From Confirmation (%)', [
        { label: '< -1% (Discount)', filter: r => r.gap_from_confirmation_pct < -1 },
        { label: '-1% to 0% (Flat/Down)', filter: r => r.gap_from_confirmation_pct >= -1 && r.gap_from_confirmation_pct < 0 },
        { label: '0% to 1% (Small Gap)', filter: r => r.gap_from_confirmation_pct >= 0 && r.gap_from_confirmation_pct < 1 },
        { label: '> 1% (Pop)', filter: r => r.gap_from_confirmation_pct >= 1 }
    ]);

    printFactor('Days to Entry (after signal)', [
        { label: 'Day 3', filter: r => r.entry_day === 3 },
        { label: 'Day 4', filter: r => r.entry_day === 4 },
        { label: 'Day 5', filter: r => Math.abs(r.entry_day) === 5 },
        { label: 'Day 6', filter: r => Math.abs(r.entry_day) === 6 }
    ]);

    printFactor('SMA50 Distance (%)', [
        { label: '< 2%', filter: r => r.sma50_distance_pct < 2 },
        { label: '2% to 4%', filter: r => r.sma50_distance_pct >= 2 && r.sma50_distance_pct < 4 },
        { label: '4% to 8%', filter: r => r.sma50_distance_pct >= 4 && r.sma50_distance_pct < 8 },
        { label: '> 8%', filter: r => r.sma50_distance_pct >= 8 }
    ]);

    printFactor('Signal Cluster Count', [
        { label: '1 (Isolated)', filter: r => r.signal_cluster_count === 1 },
        { label: '2-3 (Small Cluster)', filter: r => r.signal_cluster_count >= 2 && r.signal_cluster_count <= 3 },
        { label: '4+ (Macro Breakout)', filter: r => r.signal_cluster_count >= 4 }
    ]);

    const stoppedOut = results.filter(r => r.exit_reason.includes('STOP'));
    const recovered = stoppedOut.filter(r => r.recovered_after_stop === 'YES');
    console.log(`\nSTOP RECOVERY:`);
    console.log(`Total stopped out: ${stoppedOut.length}`);
    console.log(`Recovered above entry 5 days later: ${recovered.length} (${stoppedOut.length ? (recovered.length / stoppedOut.length * 100).toFixed(1) : 0}%)`);

    // Write strictly formatted CSV
    const csvContent = [
        'symbol,signal_date,entry_date,entry_price,pullback_low,structure_stop,stop_pct,qty,risk_inr,exit_price,exit_date,pnl_inr,pnl_pct,outcome,exit_reason,days_held,slippage_inr,recovered_after_stop,confidence_score,confidence_tier,signal_cluster_count,sma50_distance_pct,gap_from_signal_pct,gap_from_confirmation_pct,entry_candle_color,rsi_at_signal,stage_at_signal'
    ];
    results.forEach(r => {
        csvContent.push(`${r.symbol},${r.signal_date},${r.entry_date},${r.entry_price.toFixed(2)},${r.pullback_low.toFixed(2)},${r.structure_stop.toFixed(2)},${r.stop_pct.toFixed(2)},${r.qty},${r.risk_inr.toFixed(2)},${r.exit_price.toFixed(2)},${r.exit_date},${r.pnl_inr.toFixed(2)},${r.pnl_pct.toFixed(2)},${r.outcome},${r.exit_reason},${r.days_held},${r.slippage_inr.toFixed(2)},${r.recovered_after_stop},${r.confidence_score},${r.confidence_tier},${r.signal_cluster_count},${r.sma50_distance_pct.toFixed(2)},${r.gap_from_signal_pct.toFixed(2)},${r.gap_from_confirmation_pct.toFixed(2)},${r.entry_candle_color},${r.rsi_at_signal.toFixed(2)},${r.stage_at_signal}`);
    });

    const csvPath = path.join(__dirname, '..', 'outputs', 'full_backtest_v5_final_realistic.csv');
    fs.writeFileSync(csvPath, csvContent.join('\n'));
    console.log(`\n\u2705 Saved final FULL CSV to: outputs/full_backtest_v5_final_realistic.csv\n`);

    await prisma.$disconnect();
    process.exit(0);
}

main().catch(e => { console.error('FATAL:', e); process.exit(1); });
