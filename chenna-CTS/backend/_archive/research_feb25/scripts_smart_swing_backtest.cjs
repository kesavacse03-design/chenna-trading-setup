/**
 * Smart Swing Backtest for DAILY_CONTRACTION (NR7)
 * 
 * Intelligent trade management:
 * 1. Trailing stop (prev day extreme after +1R)
 * 2. Partial profit booking (50% at +1R, 25% at +2R)
 * 3. Failed breakout exit (price returns inside NR7 in 3 days)
 * 4. No-progress exit (<0.3R after 3 days)
 * 5. Reversal candle detection (2x avg body opposite candle)
 * 6. Let winners run (up to 15 days)
 * 
 * Compares results with the "dumb" fixed-target method.
 */

const { PrismaClient } = require('@prisma/client');
const priceService = require('../services/priceService.cjs');
const TA = require('../strategy/technicalAnalysis.cjs');
const fs = require('fs');
const path = require('path');

const prisma = new PrismaClient();

const ARTIFACT_DIR = path.join('C:', 'Users', 'chenn', '.gemini', 'antigravity', 'brain', 'a3cec65d-bae4-4202-9302-efffd9a138d8');
const REPORT_FILE = path.join(ARTIFACT_DIR, 'smart_swing_backtest_report.md');
const LOCAL_REPORT = path.join(__dirname, '..', 'results', 'smart_swing_backtest_report.md');
const LOCAL_CSV = path.join(__dirname, '..', 'results', 'smart_swing_trades.csv');

// ═══════════════════════════════════════════════════════════
// SIGNAL DETECTION (Same as dailyContractionStrategy.cjs)
// ═══════════════════════════════════════════════════════════

function detectInsiderNR7Signal(candles, idx) {
    if (idx < 8) return null; // Need at least 7+1 days of history

    const day0 = candles[idx - 1]; // NR7 Setup candle
    const day1 = candles[idx];     // Entry/Trigger candle
    const dayMinus1 = candles[idx - 2]; // Day before setup

    // 1. Verify NR7 on day0
    const range0 = day0.high - day0.low;
    for (let i = 2; i <= 7; i++) {
        const prev = candles[idx - i];
        if (!prev) return null;
        if ((prev.high - prev.low) <= range0) return null; // Not narrowest
    }

    // 2. Check Insider (Inside Day)
    const isInsider = dayMinus1 && day0.high < dayMinus1.high && day0.low > dayMinus1.low;
    if (!isInsider) return null; // Insider NR7 only

    // 3. Quality Score
    const score = calculateQualityScore(candles, idx, day0);

    // 4. Determine direction from close price
    let direction = null;
    if (day1.close < day0.low) direction = 'SHORT';
    else if (day1.close > day0.high) direction = 'LONG';
    if (!direction) return null;

    // 5. Trend filter for LONG only
    if (direction === 'LONG') {
        const sma20 = TA.calculateSMA(candles.slice(0, idx), 20);
        const isUptrend = sma20 && day0.close > sma20;
        const qualityLevel = score >= 3 ? 'HIGH' : score >= 1 ? 'MEDIUM' : 'LOW';
        if (!isUptrend || qualityLevel !== 'HIGH') return null;
    }

    return {
        direction,
        entryPrice: day1.close,
        nr7High: day0.high,
        nr7Low: day0.low,
        initialStop: direction === 'LONG'
            ? day0.low * 0.995
            : day0.high * 1.005,
        score,
        entryDate: day1.timestamp || day1.date,
        entryIdx: idx
    };
}

function calculateQualityScore(candles, idx, signalCandle) {
    let score = 1; // Insider NR7 = +1

    // Range Tightness
    const rangePercent = ((signalCandle.high - signalCandle.low) / signalCandle.close) * 100;
    if (rangePercent < 2.0) score += 1;
    else if (rangePercent > 4.0) score -= 1;

    // Volume Contraction
    let volAvg5 = 0, count = 0;
    for (let i = 2; i <= 6; i++) {
        if (candles[idx - i]) { volAvg5 += candles[idx - i].volume; count++; }
    }
    if (count > 0 && signalCandle.volume < volAvg5 / count) score += 1;

    // Key Level
    let high20 = -Infinity, low20 = Infinity;
    for (let i = 1; i <= 20; i++) {
        const c = candles[idx - i];
        if (c) { high20 = Math.max(high20, c.high); low20 = Math.min(low20, c.low); }
    }
    const range20 = high20 - low20;
    if (range20 > 0) {
        if ((high20 - signalCandle.high) / range20 < 0.1) score += 1;
        if ((signalCandle.low - low20) / range20 < 0.1) score += 1;
    }

    return score;
}

// ═══════════════════════════════════════════════════════════
// SMART TRADE SIMULATION
// ═══════════════════════════════════════════════════════════

function simulateSmartSwingTrade(signal, candles, startIdx) {
    const { direction, entryPrice, nr7High, nr7Low, initialStop, score } = signal;

    const initialRisk = Math.abs(entryPrice - initialStop);
    if (initialRisk <= 0) return null;

    let currentStop = initialStop;
    let highestProfit = 0;
    let position = 1.0; // 100% of position
    let bookedPnL = 0;  // Already locked-in P&L in R-multiples
    let tradeLog = [];
    let breakEvenSet = false;

    const maxHoldDays = 15;
    const availableDays = Math.min(maxHoldDays, candles.length - startIdx - 1);

    for (let dayOffset = 1; dayOffset <= availableDays; dayOffset++) {
        const candleIdx = startIdx + dayOffset;
        if (candleIdx >= candles.length) break;

        const candle = candles[candleIdx];
        const prevCandle = candles[candleIdx - 1];
        if (!candle || !prevCandle) break;

        const currentPrice = candle.close;
        const dayHigh = candle.high;
        const dayLow = candle.low;

        // Current unrealized P&L in R
        const unrealizedR = direction === 'LONG'
            ? (currentPrice - entryPrice) / initialRisk
            : (entryPrice - currentPrice) / initialRisk;

        // Intraday best for trailing
        const intradayBestR = direction === 'LONG'
            ? (dayHigh - entryPrice) / initialRisk
            : (entryPrice - dayLow) / initialRisk;
        highestProfit = Math.max(highestProfit, intradayBestR);

        // ───────────────────────────────────────────
        // RULE 1: CHECK STOP LOSS HIT (Intraday)
        // ───────────────────────────────────────────
        if (direction === 'LONG' && dayLow <= currentStop) {
            const exitPrice = currentStop;
            const exitR = (exitPrice - entryPrice) / initialRisk;
            const totalPnL = bookedPnL + (exitR * position);
            tradeLog.push(`Day ${dayOffset}: LOW ₹${dayLow.toFixed(1)} hit stop ₹${currentStop.toFixed(1)} → EXIT`);
            return buildResult(signal, candle, dayOffset, exitPrice, totalPnL,
                breakEvenSet ? 'TRAILING_STOP_HIT' : 'INITIAL_STOP_HIT', tradeLog, position, bookedPnL);
        }
        if (direction === 'SHORT' && dayHigh >= currentStop) {
            const exitPrice = currentStop;
            const exitR = (entryPrice - exitPrice) / initialRisk;
            const totalPnL = bookedPnL + (exitR * position);
            tradeLog.push(`Day ${dayOffset}: HIGH ₹${dayHigh.toFixed(1)} hit stop ₹${currentStop.toFixed(1)} → EXIT`);
            return buildResult(signal, candle, dayOffset, exitPrice, totalPnL,
                breakEvenSet ? 'TRAILING_STOP_HIT' : 'INITIAL_STOP_HIT', tradeLog, position, bookedPnL);
        }

        // ───────────────────────────────────────────
        // RULE 2: PARTIAL PROFIT BOOKING
        // ───────────────────────────────────────────
        if (intradayBestR >= 1.0 && position === 1.0) {
            // Book 50% at +1R
            bookedPnL += 0.5 * 1.0;
            position = 0.5;
            tradeLog.push(`Day ${dayOffset}: 🎯 Booked 50% at +1.0R (+0.50R locked)`);

            // Move stop to breakeven
            currentStop = entryPrice;
            breakEvenSet = true;
            tradeLog.push(`Day ${dayOffset}: Stop → BREAKEVEN ₹${entryPrice.toFixed(1)}`);
        }

        if (intradayBestR >= 2.0 && position === 0.5) {
            // Book another 25% at +2R
            bookedPnL += 0.25 * 2.0;
            position = 0.25;
            tradeLog.push(`Day ${dayOffset}: 🎯 Booked 25% at +2.0R (+0.50R locked)`);
        }

        // ───────────────────────────────────────────
        // RULE 3: TRAIL STOP (After breakeven set)
        // ───────────────────────────────────────────
        if (breakEvenSet) {
            const buffer = entryPrice * 0.005;

            if (direction === 'LONG') {
                const newStop = prevCandle.low - buffer;
                if (newStop > currentStop) {
                    currentStop = newStop;
                    tradeLog.push(`Day ${dayOffset}: Trail stop → ₹${newStop.toFixed(1)} (prev low - buffer)`);
                }
            } else {
                const newStop = prevCandle.high + buffer;
                if (newStop < currentStop) {
                    currentStop = newStop;
                    tradeLog.push(`Day ${dayOffset}: Trail stop → ₹${newStop.toFixed(1)} (prev high + buffer)`);
                }
            }
        }

        // ───────────────────────────────────────────
        // RULE 4: FAILED BREAKOUT (Price returns DEEP inside NR7 range)
        // V2: Requires >50% retracement into NR7 range AND not in profit
        // ───────────────────────────────────────────
        if (dayOffset <= 3 && position === 1.0 && unrealizedR < 0) {
            const nr7Range = nr7High - nr7Low;
            const midNR7 = (nr7High + nr7Low) / 2;

            if (direction === 'LONG' && currentPrice < midNR7) {
                const exitR = (currentPrice - entryPrice) / initialRisk;
                tradeLog.push(`Day ${dayOffset}: Close ₹${currentPrice.toFixed(1)} < NR7 Mid ₹${midNR7.toFixed(1)} → DEEP FAILED BREAKOUT`);
                return buildResult(signal, candle, dayOffset, currentPrice, exitR,
                    'FAILED_BREAKOUT', tradeLog, position, bookedPnL);
            }
            if (direction === 'SHORT' && currentPrice > midNR7) {
                const exitR = (entryPrice - currentPrice) / initialRisk;
                tradeLog.push(`Day ${dayOffset}: Close ₹${currentPrice.toFixed(1)} > NR7 Mid ₹${midNR7.toFixed(1)} → DEEP FAILED BREAKOUT`);
                return buildResult(signal, candle, dayOffset, currentPrice, exitR,
                    'FAILED_BREAKOUT', tradeLog, position, bookedPnL);
            }
        }

        // ───────────────────────────────────────────
        // RULE 5: NO PROGRESS after 3 days
        // ───────────────────────────────────────────
        if (dayOffset === 3 && Math.abs(unrealizedR) < 0.3 && position === 1.0) {
            tradeLog.push(`Day ${dayOffset}: P&L ${unrealizedR.toFixed(2)}R < 0.3R after 3 days → NO PROGRESS EXIT`);
            return buildResult(signal, candle, dayOffset, currentPrice, unrealizedR,
                'NO_PROGRESS_3D', tradeLog, position, bookedPnL);
        }

        // ───────────────────────────────────────────
        // RULE 6: REVERSAL CANDLE
        // ───────────────────────────────────────────
        const candleBody = Math.abs(candle.close - candle.open);
        let avgBody = 0;
        let bodyCount = 0;
        for (let b = 1; b <= 5; b++) {
            const bc = candles[candleIdx - b];
            if (bc) { avgBody += Math.abs(bc.close - bc.open); bodyCount++; }
        }
        avgBody = bodyCount > 0 ? avgBody / bodyCount : candleBody;

        const isReversalCandle = candleBody > avgBody * 2.5; // V2: Stricter threshold
        const isBearishReversal = direction === 'LONG' && candle.close < candle.open && isReversalCandle;
        const isBullishReversal = direction === 'SHORT' && candle.close > candle.open && isReversalCandle;

        // V2: Only trigger reversal if trade is LOSING (against you)
        // If profitable, let trailing stop handle the exit instead
        if ((isBearishReversal || isBullishReversal) && dayOffset >= 2 && unrealizedR < 0) {
            const exitR = unrealizedR;
            const totalPnL = bookedPnL + (exitR * position);
            tradeLog.push(`Day ${dayOffset}: ⚠️ REVERSAL CANDLE (body ${candleBody.toFixed(1)} > 2.5x avg ${avgBody.toFixed(1)}) → EXIT`);
            return buildResult(signal, candle, dayOffset, currentPrice, totalPnL,
                'REVERSAL_CANDLE', tradeLog, position, bookedPnL);
        }

        // Log daily status
        tradeLog.push(`Day ${dayOffset}: Close ₹${currentPrice.toFixed(1)} | P&L: ${unrealizedR >= 0 ? '+' : ''}${unrealizedR.toFixed(2)}R | Stop: ₹${currentStop.toFixed(1)} | Pos: ${(position * 100).toFixed(0)}%`);
    }

    // ───────────────────────────────────────────
    // MAX HOLD TIMEOUT
    // ───────────────────────────────────────────
    const lastIdx = Math.min(startIdx + availableDays, candles.length - 1);
    const finalCandle = candles[lastIdx];
    const finalPrice = finalCandle.close;
    const finalR = direction === 'LONG'
        ? (finalPrice - entryPrice) / initialRisk
        : (entryPrice - finalPrice) / initialRisk;
    const totalPnL = bookedPnL + (finalR * position);
    tradeLog.push(`Day ${availableDays}: ⏰ MAX HOLD TIMEOUT → EXIT at ₹${finalPrice.toFixed(1)}`);
    return buildResult(signal, finalCandle, availableDays, finalPrice, totalPnL,
        'MAX_HOLD_15D', tradeLog, position, bookedPnL);
}

// ═══════════════════════════════════════════════════════════
// DUMB (Fixed Target) SIMULATION — for comparison
// ═══════════════════════════════════════════════════════════

function simulateDumbTrade(signal, candles, startIdx) {
    const { direction, entryPrice, initialStop } = signal;
    const initialRisk = Math.abs(entryPrice - initialStop);
    if (initialRisk <= 0) return null;

    const target = direction === 'LONG'
        ? entryPrice + initialRisk * 1.5
        : entryPrice - initialRisk * 1.5;

    const maxDays = 10;
    const availableDays = Math.min(maxDays, candles.length - startIdx - 1);

    for (let dayOffset = 1; dayOffset <= availableDays; dayOffset++) {
        const candleIdx = startIdx + dayOffset;
        if (candleIdx >= candles.length) break;
        const candle = candles[candleIdx];

        // Check target
        if (direction === 'LONG' && candle.high >= target) {
            return { pnlR: 1.5, exitReason: 'TARGET_HIT', daysHeld: dayOffset, outcome: 'WIN' };
        }
        if (direction === 'SHORT' && candle.low <= target) {
            return { pnlR: 1.5, exitReason: 'TARGET_HIT', daysHeld: dayOffset, outcome: 'WIN' };
        }

        // Check stop
        if (direction === 'LONG' && candle.low <= initialStop) {
            return { pnlR: -1.0, exitReason: 'SL_HIT', daysHeld: dayOffset, outcome: 'LOSS' };
        }
        if (direction === 'SHORT' && candle.high >= initialStop) {
            return { pnlR: -1.0, exitReason: 'SL_HIT', daysHeld: dayOffset, outcome: 'LOSS' };
        }
    }

    // Timeout
    const lastIdx = Math.min(startIdx + availableDays, candles.length - 1);
    const finalR = direction === 'LONG'
        ? (candles[lastIdx].close - entryPrice) / initialRisk
        : (entryPrice - candles[lastIdx].close) / initialRisk;

    return { pnlR: finalR, exitReason: 'TIMEOUT', daysHeld: availableDays, outcome: finalR > 0 ? 'WIN' : 'LOSS' };
}

// ═══════════════════════════════════════════════════════════
// RESULT BUILDER
// ═══════════════════════════════════════════════════════════

function buildResult(signal, exitCandle, daysHeld, exitPrice, totalPnL, reason, tradeLog, remainingPos, bookedPnL) {
    return {
        symbol: signal.symbol,
        direction: signal.direction,
        entryDate: signal.entryDate,
        exitDate: exitCandle.timestamp || exitCandle.date,
        entryPrice: signal.entryPrice,
        exitPrice,
        nr7High: signal.nr7High,
        nr7Low: signal.nr7Low,
        initialRisk: Math.abs(signal.entryPrice - signal.initialStop),
        initialRiskPercent: (Math.abs(signal.entryPrice - signal.initialStop) / signal.entryPrice * 100),
        pnlR: totalPnL,
        pnlPercent: (totalPnL * Math.abs(signal.entryPrice - signal.initialStop) / signal.entryPrice * 100),
        outcome: totalPnL > 0 ? 'WIN' : totalPnL < -0.01 ? 'LOSS' : 'BREAKEVEN',
        exitReason: reason,
        daysHeld,
        qualityScore: signal.score,
        tradeLog,
        bookedPnL,
        remainingPosition: remainingPos
    };
}

// ═══════════════════════════════════════════════════════════
// MAIN EXECUTION
// ═══════════════════════════════════════════════════════════

async function run() {
    console.log('═══════════════════════════════════════════════════');
    console.log('  SMART SWING BACKTEST - DAILY_CONTRACTION (NR7)  ');
    console.log('═══════════════════════════════════════════════════\n');

    try {
        // 1. Get stocks from DB
        const category = await prisma.category.findUnique({
            where: { key: 'DAILY_CONTRACTION' },
            include: { stocks: { include: { stock: true } } }
        });

        if (!category) {
            console.error('Category DAILY_CONTRACTION not found!');
            return;
        }

        // Deduplicate by symbol (keep earliest addedDate)
        const seen = new Map();
        for (const entry of category.stocks) {
            const sym = entry.stock.symbol;
            if (!seen.has(sym) || new Date(entry.addedDate) < new Date(seen.get(sym).addedDate)) {
                seen.set(sym, entry);
            }
        }
        const stocks = Array.from(seen.values());
        console.log(`Found ${category.stocks.length} entries → ${stocks.length} unique stocks\n`);

        // 2. Fetch prices and run simulation
        const smartResults = [];
        const dumbResults = [];
        let processed = 0;
        let skipped = 0;

        for (const stockEntry of stocks) {
            processed++;
            const symbol = stockEntry.stock.symbol;
            const instrumentKey = stockEntry.stock.instrumentKey;
            const addedDate = stockEntry.addedDate;

            process.stdout.write(`\r[${processed}/${stocks.length}] ${symbol}...                    `);

            try {
                // Fetch daily data using correct API
                const fromDateStr = new Date(addedDate).toISOString().split('T')[0];
                const toDateStr = new Date().toISOString().split('T')[0];
                const candles = await priceService.fetchPrice(
                    symbol, instrumentKey, fromDateStr, toDateStr, 'day'
                );

                if (!candles || !Array.isArray(candles) || candles.length < 50) {
                    skipped++;
                    continue;
                }

                // Corruption check
                if (candles.length > 1000) {
                    const t1 = new Date(candles[0].timestamp).getTime();
                    const t2 = new Date(candles[1].timestamp).getTime();
                    if (Math.abs(t2 - t1) < 3600000) {
                        skipped++;
                        continue;
                    }
                }

                // Scan for signals
                for (let i = 50; i < candles.length - 15; i++) {
                    const signal = detectInsiderNR7Signal(candles, i);
                    if (!signal) continue;

                    signal.symbol = symbol;

                    // Run SMART simulation
                    const smartResult = simulateSmartSwingTrade(signal, candles, i);
                    if (smartResult) {
                        smartResults.push(smartResult);
                        console.log(`\n  ✓ SMART: ${symbol} ${signal.direction} | P&L: ${smartResult.pnlR >= 0 ? '+' : ''}${smartResult.pnlR.toFixed(2)}R | ${smartResult.exitReason} (${smartResult.daysHeld}d)`);
                    }

                    // Run DUMB simulation for comparison
                    const dumbResult = simulateDumbTrade(signal, candles, i);
                    if (dumbResult) {
                        dumbResults.push({
                            symbol, direction: signal.direction,
                            ...dumbResult
                        });
                    }

                    break; // One trade per stock
                }

            } catch (err) {
                console.error(`\n  ⚠️ ${symbol}: ${err.message}`);
                skipped++;
            }
        }

        console.log(`\n\n═══════════════════════════════════════════════════`);
        console.log(`Processing complete. ${smartResults.length} trades found.`);
        console.log(`Skipped: ${skipped} stocks`);
        console.log(`═══════════════════════════════════════════════════\n`);

        // 3. Generate report
        generateReport(smartResults, dumbResults);

    } catch (e) {
        console.error('Fatal Error:', e);
    } finally {
        await prisma.$disconnect();
        process.exit(0);
    }
}

// ═══════════════════════════════════════════════════════════
// REPORT GENERATION
// ═══════════════════════════════════════════════════════════

function generateReport(smartTrades, dumbTrades) {
    if (smartTrades.length === 0) {
        console.log('No trades to report.');
        return;
    }

    // ─── Smart Stats ───
    const smartWins = smartTrades.filter(t => t.outcome === 'WIN');
    const smartLosses = smartTrades.filter(t => t.outcome === 'LOSS');
    const smartWR = (smartWins.length / smartTrades.length * 100).toFixed(1);
    const smartTotalR = smartTrades.reduce((s, t) => s + t.pnlR, 0);
    const smartAvgR = (smartTotalR / smartTrades.length).toFixed(2);
    const smartBest = smartTrades.reduce((best, t) => t.pnlR > best.pnlR ? t : best, smartTrades[0]);
    const smartWorst = smartTrades.reduce((worst, t) => t.pnlR < worst.pnlR ? t : worst, smartTrades[0]);
    const smartAvgDays = (smartTrades.reduce((s, t) => s + t.daysHeld, 0) / smartTrades.length).toFixed(1);

    // ─── Dumb Stats ───
    const dumbWins = dumbTrades.filter(t => t.outcome === 'WIN');
    const dumbWR = dumbTrades.length > 0 ? (dumbWins.length / dumbTrades.length * 100).toFixed(1) : '0';
    const dumbTotalR = dumbTrades.reduce((s, t) => s + t.pnlR, 0);
    const dumbAvgR = dumbTrades.length > 0 ? (dumbTotalR / dumbTrades.length).toFixed(2) : '0';

    // ─── Exit Reason Breakdown (Smart) ───
    const exitReasons = {};
    smartTrades.forEach(t => {
        exitReasons[t.exitReason] = (exitReasons[t.exitReason] || 0) + 1;
    });

    // ─── Direction Stats ───
    const smartLongs = smartTrades.filter(t => t.direction === 'LONG');
    const smartShorts = smartTrades.filter(t => t.direction === 'SHORT');
    const longWR = smartLongs.length > 0
        ? (smartLongs.filter(t => t.outcome === 'WIN').length / smartLongs.length * 100).toFixed(1)
        : 'N/A';
    const shortWR = smartShorts.length > 0
        ? (smartShorts.filter(t => t.outcome === 'WIN').length / smartShorts.length * 100).toFixed(1)
        : 'N/A';
    const longR = smartLongs.reduce((s, t) => s + t.pnlR, 0);
    const shortR = smartShorts.reduce((s, t) => s + t.pnlR, 0);

    // ─── Build Markdown Report ───
    let md = `# 🧠 Smart Swing Backtest Report
> DAILY_CONTRACTION (Insider NR7)
> Generated: ${new Date().toISOString().split('T')[0]}

## 1. SMART vs DUMB Comparison

| Metric | 🧠 SMART | 🤖 DUMB (Fixed 1.5R) | Δ |
|--------|---------|---------------------|---|
| Total Trades | ${smartTrades.length} | ${dumbTrades.length} | - |
| Win Rate | **${smartWR}%** | ${dumbWR}% | ${(parseFloat(smartWR) - parseFloat(dumbWR)).toFixed(1)}% |
| Total P&L | **${smartTotalR >= 0 ? '+' : ''}${smartTotalR.toFixed(1)}R** | ${dumbTotalR >= 0 ? '+' : ''}${dumbTotalR.toFixed(1)}R | ${(smartTotalR - dumbTotalR) >= 0 ? '+' : ''}${(smartTotalR - dumbTotalR).toFixed(1)}R |
| Avg P&L/Trade | ${smartAvgR}R | ${dumbAvgR}R | ${(parseFloat(smartAvgR) - parseFloat(dumbAvgR)).toFixed(2)}R |
| Best Trade | +${smartBest.pnlR.toFixed(2)}R (${smartBest.symbol}) | - | - |
| Worst Trade | ${smartWorst.pnlR.toFixed(2)}R (${smartWorst.symbol}) | - | - |
| Avg Hold Days | ${smartAvgDays} | - | - |

## 2. Direction Analysis (Smart)

| Direction | Trades | Win Rate | P&L (R) |
|-----------|--------|----------|---------|
| LONG | ${smartLongs.length} | ${longWR}% | ${longR >= 0 ? '+' : ''}${longR.toFixed(1)}R |
| SHORT | ${smartShorts.length} | ${shortWR}% | ${shortR >= 0 ? '+' : ''}${shortR.toFixed(1)}R |

## 3. Exit Reason Breakdown (Smart)

| Exit Reason | Count | Avg P&L (R) |
|-------------|-------|-------------|
`;

    for (const [reason, count] of Object.entries(exitReasons).sort((a, b) => b[1] - a[1])) {
        const reasonTrades = smartTrades.filter(t => t.exitReason === reason);
        const avgR = (reasonTrades.reduce((s, t) => s + t.pnlR, 0) / reasonTrades.length).toFixed(2);
        md += `| ${reason} | ${count} | ${avgR}R |\n`;
    }

    md += `\n## 4. Trade-by-Trade Detail\n\n`;

    for (const trade of smartTrades) {
        const dir = trade.direction === 'LONG' ? '🟢 LONG' : '🔴 SHORT';
        const outcome = trade.outcome === 'WIN' ? '✅ WIN' : trade.outcome === 'LOSS' ? '❌ LOSS' : '⚪ BE';

        md += `### ${trade.symbol} (${dir}) — ${new Date(trade.entryDate).toISOString().split('T')[0]}

| Field | Value |
|-------|-------|
| Entry | ₹${trade.entryPrice.toFixed(1)} |
| NR7 Range | ₹${trade.nr7Low.toFixed(1)} – ₹${trade.nr7High.toFixed(1)} |
| Initial Risk | ₹${trade.initialRisk.toFixed(1)} (${trade.initialRiskPercent.toFixed(1)}%) |
| Quality Score | ${trade.qualityScore}/5 |
| Exit | ₹${trade.exitPrice.toFixed(1)} via **${trade.exitReason}** |
| P&L | **${trade.pnlR >= 0 ? '+' : ''}${trade.pnlR.toFixed(2)}R** ${outcome} |
| Days Held | ${trade.daysHeld} |

\`\`\`
${trade.tradeLog.join('\n')}
\`\`\`

---

`;
    }

    // ─── Save Files ───
    try { fs.mkdirSync(path.dirname(REPORT_FILE), { recursive: true }); } catch (e) { }
    try { fs.mkdirSync(path.dirname(LOCAL_REPORT), { recursive: true }); } catch (e) { }

    fs.writeFileSync(REPORT_FILE, md);
    fs.writeFileSync(LOCAL_REPORT, md);
    console.log(`\n✅ Report saved to:\n  ${REPORT_FILE}\n  ${LOCAL_REPORT}`);

    // CSV
    const csvHeader = 'Symbol,Direction,EntryDate,EntryPrice,ExitPrice,PnlR,Outcome,ExitReason,DaysHeld,QualityScore';
    const csvRows = smartTrades.map(t =>
        `${t.symbol},${t.direction},${new Date(t.entryDate).toISOString().split('T')[0]},${t.entryPrice.toFixed(2)},${t.exitPrice.toFixed(2)},${t.pnlR.toFixed(2)},${t.outcome},${t.exitReason},${t.daysHeld},${t.qualityScore}`
    );
    fs.writeFileSync(LOCAL_CSV, [csvHeader, ...csvRows].join('\n'));
    console.log(`  ${LOCAL_CSV}`);
}

run();
