/**
 * CTS V5 Backtest — 25-Stock Validation Script
 * 
 * Standalone implementation of the Strategy Blueprint v3 from Agent Brief v5.
 * Runs each stock through 4 gates (Stage, RSI, NIFTY, Pullback) and simulates
 * trades with structure stops and 3-phase trailing logic.
 * 
 * Usage:
 *   node scripts/validate_25_stocks.cjs                    # Run all 25 stocks
 *   node scripts/validate_25_stocks.cjs --stock HEROMOTOCO # Run single stock
 */

const path = require('path');
const fs = require('fs');
const priceService = require('../services/priceService.cjs');
const prisma = require('../lib/prisma.cjs');

// ═══════════════════════════════════════════════════
// TECHNICAL INDICATOR CALCULATIONS
// (Self-contained — no external dependencies)
// ═══════════════════════════════════════════════════

function toISTDateString(date) {
    const d = new Date(date);
    d.setMinutes(d.getMinutes() + 330);
    return d.toISOString().split('T')[0];
}

/** Simple Moving Average from an array of close prices */
function calcSMA(closes, period) {
    if (closes.length < period) return null;
    const slice = closes.slice(closes.length - period);
    return slice.reduce((a, b) => a + b, 0) / period;
}

/** Exponential Moving Average from an array of close prices */
function calcEMA(closes, period) {
    if (closes.length < period) return null;
    const k = 2 / (period + 1);
    let ema = closes.slice(0, period).reduce((a, b) => a + b, 0) / period;
    for (let i = period; i < closes.length; i++) {
        ema = closes[i] * k + ema * (1 - k);
    }
    return ema;
}

/** RSI using Wilder's smoothing from an array of close prices */
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

/** ATR (Average True Range) from candle array */
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

/** Minervini Stage Classification */
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
    console.log('\n📊 Fetching NIFTY 50 data...');
    // Fetch a wide range covering all test stock dates
    const fromDate = '2024-06-01';
    const toDate = toISTDateString(new Date());

    const data = await priceService.fetchPrice(NIFTY_SYMBOL, NIFTY_INSTRUMENT_KEY, fromDate, toDate);
    if (!data || data.length === 0) {
        console.error('❌ FATAL: Could not fetch NIFTY 50 data!');
        process.exit(1);
    }
    // Sort chronologically
    data.sort((a, b) => new Date(a.timestamp || a.date) - new Date(b.timestamp || b.date));
    niftyCandles = data.map(c => ({
        date: getCandleDateStr(c),
        open: parseFloat(c.open),
        high: parseFloat(c.high),
        low: parseFloat(c.low),
        close: parseFloat(c.close),
        volume: parseInt(c.volume || 0)
    }));
    console.log(`   ✅ Got ${niftyCandles.length} NIFTY candles (${niftyCandles[0].date} to ${niftyCandles[niftyCandles.length - 1].date})`);
}

function getCandleDateStr(c) {
    const ts = String(c.timestamp || c.date || '');
    return ts.includes('T') ? ts.split('T')[0] : ts.split(' ')[0];
}

/** Check NIFTY close vs 20 EMA on a specific date */
function checkNiftyGate(signalDateStr) {
    if (!niftyCandles) return { pass: true, reason: 'No NIFTY data' };

    // Find the candle on or just before the signal date
    const idx = niftyCandles.findIndex(c => c.date >= signalDateStr);
    let niftyIdx = -1;
    if (idx === -1) {
        niftyIdx = niftyCandles.length - 1; // Use latest
    } else if (niftyCandles[idx].date === signalDateStr) {
        niftyIdx = idx;
    } else {
        niftyIdx = Math.max(0, idx - 1); // Previous trading day
    }

    // Need at least 20 candles for EMA
    if (niftyIdx < 20) return { pass: true, reason: 'Insufficient NIFTY history' };

    const closes = niftyCandles.slice(0, niftyIdx + 1).map(c => c.close);
    const niftyClose = closes[closes.length - 1];
    const niftyEMA20 = calcEMA(closes, 20);

    const isBullish = niftyClose > (niftyEMA20 * 0.98);

    return {
        pass: isBullish,
        niftyClose: Math.round(niftyClose),
        niftyEMA20: Math.round(niftyEMA20),
        market: isBullish ? 'BULLISH (Wait/Buffer)' : 'BEARISH',
        reason: isBullish
            ? `close ${Math.round(niftyClose)} > EMA-2% ${Math.round(niftyEMA20 * 0.98)}`
            : `close ${Math.round(niftyClose)} < EMA-2% ${Math.round(niftyEMA20 * 0.98)}`
    };
}

// ═══════════════════════════════════════════════════
// MAIN PIPELINE — PROCESS ONE STOCK
// ═══════════════════════════════════════════════════

async function processStock(stockEntry) {
    const { symbol, addedDate, expected, reason: expectedReason } = stockEntry;
    const signalDateStr = addedDate;

    console.log(`\n${'═'.repeat(55)}`);
    console.log(`STOCK: ${symbol} | Signal Date: ${signalDateStr}`);
    console.log(`Expected: ${expected} (${expectedReason})`);
    console.log(`${'═'.repeat(55)}`);

    // ── FETCH CANDLE DATA ──
    // Look up instrument key from database
    const stock = await prisma.stock.findUnique({ where: { symbol } });
    if (!stock || !stock.instrumentKey) {
        console.log(`  ❌ Stock ${symbol} not found in database or no instrument key`);
        return { symbol, signalDate: signalDateStr, result: 'SKIPPED', reason: 'No instrument key' };
    }

    // Fetch 365 calendar days before + 20 days after signal date
    const signalDate = new Date(signalDateStr + 'T00:00:00+05:30');
    const fetchFrom = new Date(signalDate);
    fetchFrom.setDate(fetchFrom.getDate() - 365);
    const fetchTo = new Date(signalDate);
    fetchTo.setDate(fetchTo.getDate() + 25); // Extra padding for forward data

    const rawData = await priceService.fetchPrice(
        symbol, stock.instrumentKey,
        toISTDateString(fetchFrom), toISTDateString(fetchTo)
    );

    if (!rawData || rawData.length === 0) {
        console.log(`  ❌ No candle data for ${symbol}`);
        return { symbol, signalDate: signalDateStr, result: 'SKIPPED', reason: 'No candle data' };
    }

    // Parse and sort candles
    const allCandles = rawData
        .map(c => ({
            date: getCandleDateStr(c),
            open: parseFloat(c.open),
            high: parseFloat(c.high),
            low: parseFloat(c.low),
            close: parseFloat(c.close),
            volume: parseInt(c.volume || 0)
        }))
        .sort((a, b) => a.date.localeCompare(b.date));

    // Find signal day index
    const signalIdx = allCandles.findIndex(c => c.date === signalDateStr);
    if (signalIdx === -1) {
        console.log(`  ❌ Signal date ${signalDateStr} not found in candle data (${allCandles.length} candles, range ${allCandles[0].date} to ${allCandles[allCandles.length - 1].date})`);
        return { symbol, signalDate: signalDateStr, result: 'SKIPPED', reason: 'Signal date not in data' };
    }

    // History up to signal day (inclusive)
    const historyCandles = allCandles.slice(0, signalIdx + 1);
    const closes = historyCandles.map(c => c.close);

    console.log(`  Candles fetched: ${allCandles.length} (from ${allCandles[0].date} to ${allCandles[allCandles.length - 1].date})`);
    console.log(`  History up to signal: ${historyCandles.length} candles`);

    // ── GATE 1: STAGE CHECK ──
    const signalCandle = allCandles[signalIdx];
    const price = signalCandle.close;
    const sma50 = calcSMA(closes, 50);
    const sma200 = calcSMA(closes, 200);
    const stage = classifyStage(price, sma50, sma200);

    console.log(`\n  GATE 1 — STAGE CHECK:`);
    console.log(`    Price on signal date: ${price.toFixed(2)}`);
    console.log(`    SMA50: ${sma50 ? sma50.toFixed(2) : 'NULL (insufficient data)'}`);
    console.log(`    SMA200: ${sma200 ? sma200.toFixed(2) : 'NULL (insufficient data)'}`);
    console.log(`    Stage: ${stage}${stage === 'STAGE_2' ? ' (Price > SMA50 > SMA200)' : ''}`);

    if (stage !== 'STAGE_2') {
        console.log(`    Result: FAIL ✗ — SKIPPED (${stage})`);
        return { symbol, signalDate: signalDateStr, result: 'BLOCKED_STAGE', stage, sma50, sma200, price };
    }
    console.log(`    Result: PASS ✓`);

    // ── GATE 2: RSI CHECK ──
    const rsi = calcRSI(closes, 14);

    console.log(`\n  GATE 2 — RSI CHECK:`);
    console.log(`    RSI(14): ${rsi ? rsi.toFixed(2) : 'NULL'}`);
    console.log(`    Range: 60-70`);

    if (!rsi || rsi < 60 || rsi > 70) {
        console.log(`    Result: FAIL ✗ — SKIPPED (RSI ${rsi ? rsi.toFixed(1) : 'NULL'} outside 60-70)`);
        return { symbol, signalDate: signalDateStr, result: 'BLOCKED_RSI', rsi, stage };
    }
    console.log(`    Result: PASS ✓`);

    // ── GATE 3: NIFTY CHECK ──
    const niftyCheck = checkNiftyGate(signalDateStr);

    console.log(`\n  GATE 3 — NIFTY CHECK:`);
    console.log(`    NIFTY Close on ${signalDateStr}: ${niftyCheck.niftyClose || 'N/A'}`);
    console.log(`    NIFTY 20 EMA: ${niftyCheck.niftyEMA20 || 'N/A'}`);
    console.log(`    Market: ${niftyCheck.market || 'UNKNOWN'} (${niftyCheck.reason})`);

    if (!niftyCheck.pass) {
        console.log(`    Result: FAIL ✗ — SKIPPED (BEARISH market)`);
        return { symbol, signalDate: signalDateStr, result: 'BLOCKED_NIFTY', niftyClose: niftyCheck.niftyClose, niftyEMA20: niftyCheck.niftyEMA20 };
    }
    console.log(`    Result: PASS ✓`);

    // ── GATE 4: PULLBACK ENTRY (Next Day Open Confirmation) ──
    console.log(`\n  GATE 4 — PULLBACK ENTRY (Day 2-5 Confirmation):`);

    const signalClose = signalCandle.close;
    let entryPrice = null;
    let entryDate = null;
    let entryDay = null; // The day we actually enter (Day+3 to Day+6)
    let entryIdx = null;
    let confirmationDay = null;

    for (let d = 2; d <= 5; d++) {
        const candleIdx = signalIdx + d;
        if (candleIdx >= allCandles.length) {
            console.log(`    Day+${d}: No data available`);
            break;
        }

        const candle = allCandles[candleIdx];
        const prevCandle = allCandles[candleIdx - 1];
        const color = candle.close >= candle.open ? 'Green' : 'Red';

        console.log(`    Day+${d} (${candle.date}): O:${candle.open.toFixed(2)} H:${candle.high.toFixed(2)} L:${candle.low.toFixed(2)} C:${candle.close.toFixed(2)} — ${color} candle`);

        // Check confirmation rules EOD
        const isGreen = candle.close >= candle.open;
        const exceededHigh = candle.close > prevCandle.high;

        // Open within 3% of signal close
        const riseAboveSignal = ((candle.open - signalClose) / signalClose) * 100;
        const openInRange = Math.abs(riseAboveSignal) <= 3; // within +/- 3%

        if (isGreen && exceededHigh && openInRange) {
            console.log(`      → CONFIRMED (Green, close > prev high, open within 3% of signal).`);
            confirmationDay = d;

            const nextIdx = candleIdx + 1;
            if (nextIdx < allCandles.length) {
                const nextCandle = allCandles[nextIdx];
                entryPrice = nextCandle.open;
                entryDate = nextCandle.date;
                entryDay = d + 1;
                entryIdx = nextIdx;
                console.log(`      → ENTRY TRIGGERED on Day+${entryDay} (${entryDate}) at OPEN: ${entryPrice.toFixed(2)}`);
            } else {
                console.log(`      → No data for next day to enter.`);
            }
            break;
        } else {
            console.log(`      → Skip (Green:${isGreen}, >PrevHigh:${exceededHigh}, OpenIn3%:${openInRange} [${riseAboveSignal.toFixed(1)}%])`);
        }
    }

    if (!entryPrice) {
        console.log(`    Result: FAIL ✗ — No valid green confirmation in Day 2-5`);
        return { symbol, signalDate: signalDateStr, result: 'NO_ENTRY', reason: 'No valid pullback confirmation' };
    }

    // ── STRUCTURE STOP CALCULATION ──
    // Find lowest low from Day+1 through confirmation day (inclusive)
    let pullbackLow = Infinity;
    for (let d = 1; d <= confirmationDay; d++) {
        pullbackLow = Math.min(pullbackLow, allCandles[signalIdx + d].low);
    }

    let rawRiskPct = ((entryPrice - pullbackLow) / entryPrice) * 100;
    let finalRiskPct = Math.max(1.5, Math.min(4.0, rawRiskPct));
    let stopPrice = entryPrice * (1 - finalRiskPct / 100);

    console.log(`    Pullback low used: ${pullbackLow.toFixed(2)} (from Day+1 to Day+${entryDay})`);
    console.log(`    Raw risk: ${rawRiskPct.toFixed(2)}% → Bounded: ${finalRiskPct.toFixed(2)}%`);
    console.log(`    Structure stop: ${stopPrice.toFixed(2)}`);
    console.log(`    Result: ENTRY ✓`);

    // ── POSITION SIZING ──
    const riskPerShare = entryPrice - stopPrice;
    const qty = Math.floor(1000 / riskPerShare);
    const capitalDeployed = qty * entryPrice;
    const maxRisk = qty * riskPerShare;

    console.log(`\n  POSITION:`);
    console.log(`    Entry: ${entryPrice.toFixed(2)} | Stop: ${stopPrice.toFixed(2)} | Risk: ${riskPerShare.toFixed(2)}/share`);
    console.log(`    Qty: floor(1000 / ${riskPerShare.toFixed(2)}) = ${qty} shares`);
    console.log(`    Capital deployed: ${capitalDeployed.toFixed(0)} | Max risk: ${maxRisk.toFixed(0)} INR`);

    // ── TRAIL SIMULATION ──
    console.log(`\n  TRAIL SIMULATION (No Target, Trailing Stop Only):`);

    let currentStop = stopPrice;
    let exitPrice = null;
    let exitReason = null;
    let exitDate = null;
    let daysHeld = 0;
    let highestPrice = entryPrice;

    for (let holdDay = 1; holdDay <= 10; holdDay++) {
        const candleIndex = entryIdx + holdDay;
        if (candleIndex >= allCandles.length) {
            console.log(`    Day ${holdDay}: No data — TIME EXIT at previous close`);
            exitPrice = allCandles[candleIndex - 1].close;
            exitReason = 'TIME_EXHAUSTION';
            exitDate = allCandles[candleIndex - 1].date;
            daysHeld = holdDay;
            break;
        }

        const todayCandle = allCandles[candleIndex];
        daysHeld = holdDay;

        // Track highest price
        if (todayCandle.high > highestPrice) highestPrice = todayCandle.high;

        // Check if gap down past stop at open
        if (todayCandle.open < currentStop) {
            exitPrice = todayCandle.open;
            exitReason = 'STOP';
            exitDate = todayCandle.date;

            let phase = holdDay <= 3 ? 'Phase 1' : (holdDay <= 5 ? 'Phase 2' : 'Phase 3');
            console.log(`    Day ${holdDay}: Gapped down open ${todayCandle.open.toFixed(2)} < Stop ${currentStop.toFixed(2)} → EXIT at ${exitPrice.toFixed(2)} (${phase})`);
            break;
        } else if (todayCandle.low <= currentStop) {
            // Intraday stop hit
            exitPrice = currentStop;
            exitReason = 'STOP';
            exitDate = todayCandle.date;

            let phase = holdDay <= 3 ? 'Phase 1' : (holdDay <= 5 ? 'Phase 2' : 'Phase 3');
            console.log(`    Day ${holdDay}: Low ${todayCandle.low.toFixed(2)} <= Stop ${currentStop.toFixed(2)} → EXIT at ${exitPrice.toFixed(2)} (${phase})`);
            break;
        }

        // ── TRAILING STOP UPDATES (end of day) ──
        let stopAction = 'hold';
        const oldStop = currentStop;

        // Phase 1 (Day 1-3): Keep initial stop. No changes.
        if (holdDay >= 1 && holdDay <= 3) {
            stopAction = 'Phase 1 — hold';
        }

        // Phase 2 (Day 4-5): If profit >= 1.5%, move stop to entry - 1%
        if (holdDay >= 4 && holdDay <= 5) {
            const profitPct = ((todayCandle.close - entryPrice) / entryPrice) * 100;
            if (profitPct >= 1.5) {
                const newStop = entryPrice * 0.99; // 1% below entry, NOT exact breakeven
                if (newStop > currentStop) {
                    currentStop = newStop;
                    stopAction = `Phase 2 — entry-1% (profit ${profitPct.toFixed(1)}%)`;
                } else {
                    stopAction = `Phase 2 — already higher (profit ${profitPct.toFixed(1)}%)`;
                }
            } else {
                stopAction = `Phase 2 — hold (profit only ${profitPct.toFixed(1)}%)`;
            }
        }

        // Phase 3 (Day 6-10): Trail to previous day's low
        if (holdDay >= 6) {
            const prevLow = allCandles[candleIndex - 1].low;
            if (prevLow > currentStop) {
                currentStop = prevLow;
                stopAction = `Phase 3 — trail to prev low ${prevLow.toFixed(2)}`;
            } else {
                stopAction = `Phase 3 — hold (prev low ${prevLow.toFixed(2)} < stop)`;
            }
        }

        console.log(`    Day ${holdDay}: Close ${todayCandle.close.toFixed(2)} | High ${todayCandle.high.toFixed(2)} | Stop ${currentStop.toFixed(2)}${currentStop !== oldStop ? ' ↑' : ''} (${stopAction})`);

        // Day 10 timeout
        if (holdDay >= 10) {
            exitPrice = todayCandle.close;
            exitReason = 'TIME_EXHAUSTION';
            exitDate = todayCandle.date;
            console.log(`    Day ${holdDay}: TIME LIMIT → EXIT at close ${exitPrice.toFixed(2)}`);
            break;
        }
    }

    // If we still don't have an exit (ran out of data)
    if (!exitPrice) {
        const lastAvail = allCandles[Math.min(entryIdx + 10, allCandles.length - 1)];
        exitPrice = lastAvail.close;
        exitReason = 'DATA_END';
        exitDate = lastAvail.date;
        console.log(`    ⚠ Ran out of forward data — exit at last available close ${exitPrice.toFixed(2)}`);
    }

    // ── RESULT ──
    const pnlPerShare = exitPrice - entryPrice;
    const totalPnl = pnlPerShare * qty;
    const outcome = totalPnl > 0 ? 'WIN' : 'LOSS';
    const pnlPct = ((exitPrice - entryPrice) / entryPrice * 100);

    console.log(`\n  RESULT: ${outcome} | P&L: (${exitPrice.toFixed(2)}-${entryPrice.toFixed(2)}) * ${qty} = ${totalPnl >= 0 ? '+' : ''}${totalPnl.toFixed(2)} INR | ${pnlPct.toFixed(2)}% | Days: ${daysHeld} | Exit: ${exitReason}`);

    return {
        symbol,
        signalDate: signalDateStr,
        result: 'TRADED',
        outcome,
        entryDate,
        entryDay,
        entryPrice,
        pullbackLow,
        stopPrice,
        stopPct: finalRiskPct,
        qty,
        riskInr: maxRisk,
        exitPrice,
        exitDate,
        exitReason,
        pnl: totalPnl,
        pnlPct,
        daysHeld,
        stage,
        rsi,
        sma50,
        sma200,
        expected
    };
}

// ═══════════════════════════════════════════════════
// MAIN ENTRY POINT
// ═══════════════════════════════════════════════════

async function main() {
    console.log('═══════════════════════════════════════════════════════');
    console.log('  CTS V5 BACKTEST — 25-STOCK VALIDATION');
    console.log('  Strategy Blueprint v3 | Agent Brief v5');
    console.log('═══════════════════════════════════════════════════════');

    // Load test stocks
    const testStocksPath = path.join(__dirname, '..', 'test_stocks.json');
    let testStocks = JSON.parse(fs.readFileSync(testStocksPath, 'utf8'));

    // Check for --stock filter
    const stockArg = process.argv.find(a => a.startsWith('--stock'));
    const singleStock = stockArg ? process.argv[process.argv.indexOf(stockArg) + 1] :
        process.argv.find((a, i) => i > 1 && !a.startsWith('--'));

    if (singleStock) {
        testStocks = testStocks.filter(s => s.symbol === singleStock);
        if (testStocks.length === 0) {
            console.error(`Stock ${singleStock} not found in test_stocks.json`);
            process.exit(1);
        }
        console.log(`\n🎯 Running single stock: ${singleStock}`);
    } else {
        console.log(`\n📋 Running ${testStocks.length} test stocks`);
    }

    // Fetch NIFTY data first
    await fetchNiftyData();

    // Process all stocks
    const results = [];
    for (const stock of testStocks) {
        try {
            const result = await processStock(stock);
            results.push(result);
        } catch (e) {
            console.error(`\n  ❌ ERROR processing ${stock.symbol}: ${e.message}`);
            results.push({ symbol: stock.symbol, signalDate: stock.addedDate, result: 'ERROR', reason: e.message });
        }
    }

    // ── PIPELINE FUNNEL SUMMARY ──
    console.log('\n\n' + '═'.repeat(55));
    console.log('  PIPELINE FUNNEL SUMMARY');
    console.log('═'.repeat(55));

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

    console.log(`\n  Total signals:                ${total}`);
    console.log(`  Skipped (no data):            ${skipped}`);
    console.log(`  Passed Stage 2:               ${passedStage}`);
    console.log(`  Passed Stage 2 + RSI 60-70:   ${passedRSI}`);
    console.log(`  Passed NIFTY filter:          ${passedNifty}`);
    console.log(`  Valid pullback entry:          ${traded}`);
    console.log(`  No valid pullback:             ${noEntry}`);
    console.log(`  FINAL TRADES:                 ${traded}`);

    // ── TRADE SUMMARY ──
    const trades = results.filter(r => r.result === 'TRADED');
    if (trades.length > 0) {
        console.log('\n\n' + '═'.repeat(55));
        console.log('  TRADE RESULTS');
        console.log('═'.repeat(55));

        console.log('\n  symbol, signal_date, entry_date, entry_price, pullback_low, stop, stop_pct, qty, risk_inr, exit_price, exit_date, pnl_inr, outcome, exit_reason, days_held');

        for (const t of trades) {
            console.log(`  ${t.symbol}, ${t.signalDate}, ${t.entryDate}, ${t.entryPrice.toFixed(2)}, ${t.pullbackLow.toFixed(2)}, ${t.stopPrice.toFixed(2)}, ${t.stopPct.toFixed(2)}%, ${t.qty}, ${t.riskInr.toFixed(0)}, ${t.exitPrice.toFixed(2)}, ${t.exitDate}, ${t.pnl >= 0 ? '+' : ''}${t.pnl.toFixed(0)}, ${t.outcome}, ${t.exitReason}, ${t.daysHeld}`);
        }

        const wins = trades.filter(t => t.outcome === 'WIN');
        const losses = trades.filter(t => t.outcome === 'LOSS');
        const totalPnl = trades.reduce((s, t) => s + t.pnl, 0);
        const zeroPnl = trades.filter(t => Math.abs(t.pnl) < 10); // within ₹10 of zero
        const stopPcts = trades.map(t => t.stopPct);
        const uniqueStops = new Set(stopPcts.map(s => s.toFixed(2)));
        const day1Entries = trades.filter(t => t.entryDay === 1);

        console.log(`\n  ── STATS ──`);
        console.log(`  Total trades: ${trades.length}`);
        console.log(`  Wins: ${wins.length} | Losses: ${losses.length}`);
        console.log(`  Win Rate: ${trades.length > 0 ? (wins.length / trades.length * 100).toFixed(1) : 0}%`);
        console.log(`  Total P&L: ₹${totalPnl >= 0 ? '+' : ''}${totalPnl.toFixed(0)}`);
        console.log(`  Avg P&L: ₹${(totalPnl / trades.length).toFixed(0)}`);
        console.log(`  Zero-PnL exits: ${zeroPnl.length}`);
        console.log(`  Unique stop distances: ${uniqueStops.size} (${Array.from(uniqueStops).join('%, ')}%)`);
        console.log(`  Day+1 entries (should be 0): ${day1Entries.length}`);

        if (wins.length > 0) {
            const avgWin = wins.reduce((s, t) => s + t.pnl, 0) / wins.length;
            console.log(`  Avg win: ₹${avgWin.toFixed(0)}`);
        }
        if (losses.length > 0) {
            const avgLoss = losses.reduce((s, t) => s + t.pnl, 0) / losses.length;
            console.log(`  Avg loss: ₹${avgLoss.toFixed(0)}`);
        }
    }

    // ── VALIDATION CHECKS ──
    console.log('\n\n' + '═'.repeat(55));
    console.log('  VALIDATION CHECKS');
    console.log('═'.repeat(55));

    const checks = [
        {
            name: 'HEROMOTOCO passes Stage 2',
            pass: results.find(r => r.symbol === 'HEROMOTOCO' && r.signalDate === '2025-08-04')?.result !== 'BLOCKED_STAGE',
            detail: results.find(r => r.symbol === 'HEROMOTOCO' && r.signalDate === '2025-08-04')
        },
        {
            name: 'AUROPHARMA blocked by Stage filter',
            pass: results.find(r => r.symbol === 'AUROPHARMA')?.result === 'BLOCKED_STAGE',
            detail: results.find(r => r.symbol === 'AUROPHARMA')
        },
        {
            name: 'BOSCHLTD blocked by RSI filter',
            pass: results.find(r => r.symbol === 'BOSCHLTD')?.result === 'BLOCKED_RSI',
            detail: results.find(r => r.symbol === 'BOSCHLTD')
        },
        {
            name: 'CAMS blocked by NIFTY filter (Nov 2025)',
            pass: results.find(r => r.symbol === 'CAMS')?.result === 'BLOCKED_NIFTY',
            detail: results.find(r => r.symbol === 'CAMS')
        },
        {
            name: 'Stop distances vary (not all same)',
            pass: trades.length > 1 && new Set(trades.map(t => t.stopPct.toFixed(2))).size > 1,
            detail: `${new Set(trades.map(t => t.stopPct.toFixed(2))).size} unique values`
        },
        {
            name: 'No Day+1 entries',
            pass: trades.filter(t => t.entryDay === 1).length === 0,
            detail: `${trades.filter(t => t.entryDay === 1).length} Day+1 entries found`
        },
        {
            name: 'Zero-PnL exits ≤ 2',
            pass: trades.filter(t => Math.abs(t.pnl) < 10).length <= 2,
            detail: `${trades.filter(t => Math.abs(t.pnl) < 10).length} zero-PnL exits`
        },
        {
            name: 'Funnel decreasing at each stage',
            pass: passedStage >= passedRSI && passedRSI >= passedNifty && passedNifty >= traded,
            detail: `Stage=${passedStage} → RSI=${passedRSI} → NIFTY=${passedNifty} → Trades=${traded}`
        }
    ];

    let passCount = 0;
    for (const check of checks) {
        const icon = check.pass ? '✅' : '❌';
        console.log(`  ${icon} ${check.name}`);
        if (check.detail && typeof check.detail === 'object' && check.detail.result) {
            console.log(`     → Got: ${check.detail.result}${check.detail.stage ? ' (' + check.detail.stage + ')' : ''}${check.detail.rsi ? ' RSI=' + check.detail.rsi?.toFixed(1) : ''}`);
        } else if (typeof check.detail === 'string') {
            console.log(`     → ${check.detail}`);
        }
        if (check.pass) passCount++;
    }

    console.log(`\n  Result: ${passCount}/${checks.length} checks passed`);

    if (passCount === checks.length) {
        console.log('\n  🎉 ALL CHECKS PASSED — Ready for full backtest!');
    } else {
        console.log('\n  ⚠️  Some checks failed — Review and fix before proceeding to full backtest.');
    }

    // ── BLOCKED STOCKS DETAIL ──
    const blocked = results.filter(r => r.result.startsWith('BLOCKED'));
    if (blocked.length > 0) {
        console.log(`\n\n  ── BLOCKED STOCKS ──`);
        for (const b of blocked) {
            console.log(`  ${b.symbol} (${b.signalDate}): ${b.result}${b.stage ? ' Stage=' + b.stage : ''}${b.rsi ? ' RSI=' + b.rsi.toFixed(1) : ''}${b.niftyClose ? ' NIFTY=' + b.niftyClose + ' vs EMA=' + b.niftyEMA20 : ''}`);
        }
    }

    console.log('\n');
    await prisma.$disconnect();
    process.exit(0);
}

main().catch(e => {
    console.error('FATAL:', e);
    process.exit(1);
});
