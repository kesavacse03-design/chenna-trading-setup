/**
 * TradeCode NR7 Backtest
 * 
 * Enhances DAILY_CONTRACTION strategy with TradeCode confluence factors:
 * 1. Structural Context: NR7 at Key Support/Resistance (20d High/Low)
 * 2. Momentum: RSI Divergence
 * 3. Scoring: Hierarchical Tier System (Premium/Good/Marginal)
 * 
 * Uses 'DUMB' trade management (Fixed 1.5R Target) as proven best for NR7.
 */

const { PrismaClient } = require('@prisma/client');
const priceService = require('../services/priceService.cjs');
const TA = require('../strategy/technicalAnalysis.cjs');
const fs = require('fs');
const path = require('path');

const prisma = new PrismaClient();

const ARTIFACT_DIR = path.join('C:', 'Users', 'chenn', '.gemini', 'antigravity', 'brain', 'a3cec65d-bae4-4202-9302-efffd9a138d8');
const REPORT_FILE = path.join(ARTIFACT_DIR, 'tradecode_nr7_backtest_report.md');
const LOCAL_CSV = path.join(__dirname, '..', 'results', 'tradecode_nr7_trades.csv');

// ═══════════════════════════════════════════════════════════
// NEW SIGNAL DETECTION LOGIC
// ═══════════════════════════════════════════════════════════

function detectTradeCodeNR7(candles, idx) {
    if (idx < 22) return null; // Need history for 20d levels + RSI

    const day0 = candles[idx - 1]; // NR7 Setup candle
    const day1 = candles[idx];     // Entry/Trigger candle
    const dayMinus1 = candles[idx - 2]; // Day before setup

    // 1. Verify NR7 (Pattern)
    const range0 = day0.high - day0.low;
    for (let i = 2; i <= 7; i++) {
        const prev = candles[idx - i];
        if (!prev) return null;
        if ((prev.high - prev.low) <= range0) return null; // Not narrowest
    }

    // 2. Check Insider (Inside Day) - Core Pattern
    const isInsider = dayMinus1 && day0.high < dayMinus1.high && day0.low > dayMinus1.low;
    if (!isInsider) return null;

    // 3. Determine Direction (Breakout)
    let direction = null;
    if (day1.close < day0.low) direction = 'SHORT';
    else if (day1.close > day0.high) direction = 'LONG';
    if (!direction) return null;

    // ═══════════════════════════════════════════════════════
    // TRADECODE CONFLUENCE CHECKS
    // ═══════════════════════════════════════════════════════

    // A. Structural Context (Key Levels)
    const context = checkKeyLevels(candles, idx - 1); // Check at NR7 candle

    // B. Momentum (RSI Divergence)
    const momentum = checkRSIDivergence(candles, idx - 1, direction);

    // C. Pattern Quality (Existing)
    const patternScore = calculatePatternScore(candles, idx, day0);

    // ═══════════════════════════════════════════════════════
    // SCORING & TIERING
    // ═══════════════════════════════════════════════════════

    // Tier 1: Pattern (Max 3)
    // Tier 2: Context (Max 3)
    // Tier 3: Momentum (Max 3)

    let totalScore = patternScore; // Base score (1-3)

    // Context Score
    let contextScore = 0;
    if (context.isKeyLevel) {
        // Bonus if direction matches level bias
        if ((context.type === 'RESISTANCE' && direction === 'SHORT') ||
            (context.type === 'SUPPORT' && direction === 'LONG')) {
            contextScore += 2;
        } else {
            // Contra-trend breakout? Still significant but risky
            contextScore += 1;
        }
    }
    if (context.isFirstApproach) contextScore += 1;
    totalScore += contextScore;

    // Momentum Score
    let momentumScore = 0;
    if (momentum.hasRegularDivergence) momentumScore += 2;
    if (momentum.isInFavorableZone) momentumScore += 1; // RSI not overextended
    totalScore += momentumScore;

    // Determine Tier
    let tier = 'SKIP';
    if (totalScore >= 7) tier = 'PREMIUM';
    else if (totalScore >= 5) tier = 'GOOD';
    else if (totalScore >= 3) tier = 'MARGINAL';

    return {
        direction,
        entryPrice: day1.close,
        nr7High: day0.high,
        nr7Low: day0.low,
        initialStop: direction === 'LONG' ? day0.low * 0.995 : day0.high * 1.005,
        entryDate: day1.timestamp || day1.date,
        entryIdx: idx,

        // Metadata for report
        scores: {
            total: totalScore,
            pattern: patternScore,
            context: contextScore,
            momentum: momentumScore
        },
        tier,
        details: {
            level: context.type,
            divergence: momentum.hasRegularDivergence ? 'YES' : 'NO'
        }
    };
}

// ─── Helper: Key Levels ───
function checkKeyLevels(candles, idx) {
    const lookback = 20;
    const subset = candles.slice(idx - lookback, idx);
    const highest = Math.max(...subset.map(c => c.high));
    const lowest = Math.min(...subset.map(c => c.low));

    const current = candles[idx];
    const close = current.close;

    // Within 2% of 20d High/Low?
    const nearHigh = (highest - close) / highest < 0.02;
    const nearLow = (close - lowest) / lowest < 0.02;

    let type = 'NONE';
    if (nearHigh) type = 'RESISTANCE';
    else if (nearLow) type = 'SUPPORT';

    // First approach? (Count touches in last 10 days)
    let isFirstApproach = false;
    if (type !== 'NONE') {
        const last10 = candles.slice(idx - 10, idx);
        let touches = 0;
        const threshold = type === 'RESISTANCE' ? highest * 0.99 : lowest * 1.01;

        for (const c of last10) {
            if (type === 'RESISTANCE' && c.high > threshold) touches++;
            if (type === 'SUPPORT' && c.low < threshold) touches++;
        }
        isFirstApproach = touches <= 2; // Strict: 1-2 touches max
    }

    return { isKeyLevel: type !== 'NONE', type, isFirstApproach };
}

// ─── Helper: RSI Divergence ───
function checkRSIDivergence(candles, idx, direction) {
    // Calculate RSI for last 10 candles
    // Need enough history for RSI(14) calculation
    // We assume TA.calculateRSI can handle array
    // NOTE: TA.calculateRSI needs full history array to be accurate
    const rsiPeriod = 14;
    const lookback = 20;
    const history = candles.slice(0, idx + 1); // History up to NR7 day

    // We need RSI values for last 5 days
    // Since our TA lib calculates one value, we need to loop? 
    // Optimization: Just calculate last 5 manually call or assume standard divergence logic
    // Let's rely on slope estimation

    const rsiNow = TA.calculateRSI(history, rsiPeriod);
    const rsi5Ago = TA.calculateRSI(history.slice(0, -5), rsiPeriod);

    if (!rsiNow || !rsi5Ago) return { hasRegularDivergence: false, isInFavorableZone: false };

    const priceNow = candles[idx].close;
    const price5Ago = candles[idx - 5].close;

    const priceSlope = priceNow - price5Ago;
    const rsiSlope = rsiNow - rsi5Ago;

    let hasRegularDivergence = false;

    // Bullish Divergence (LONG): Price Lower/Flat, RSI Higher
    if (direction === 'LONG') {
        if (priceSlope <= 0 && rsiSlope > 5) hasRegularDivergence = true;
    }
    // Bearish Divergence (SHORT): Price Higher/Flat, RSI Lower
    else if (direction === 'SHORT') {
        if (priceSlope >= 0 && rsiSlope < -5) hasRegularDivergence = true;
    }

    // Favorable Zone
    // LONG: RSI 30-60 (Room to grow)
    // SHORT: RSI 40-70 (Room to fall)
    let isInFavorableZone = false;
    if (direction === 'LONG' && rsiNow >= 30 && rsiNow <= 60) isInFavorableZone = true;
    if (direction === 'SHORT' && rsiNow >= 40 && rsiNow <= 70) isInFavorableZone = true;

    return { hasRegularDivergence, isInFavorableZone };
}

// ─── Helper: Pattern Score (Existing) ───
function calculatePatternScore(candles, idx, signalCandle) {
    let score = 1; // Base

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

    return Math.max(1, Math.min(3, score)); // Clamp 1-3
}

// ═══════════════════════════════════════════════════════════
// TRADE SIMULATION (Proven DUMB Method)
// ═══════════════════════════════════════════════════════════

function simulateTrade(signal, candles, startIdx) {
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
    const finalPrice = candles[lastIdx].close;
    const finalR = direction === 'LONG'
        ? (finalPrice - entryPrice) / initialRisk
        : (entryPrice - finalPrice) / initialRisk;

    return {
        pnlR: finalR,
        exitReason: 'TIMEOUT',
        daysHeld: availableDays,
        outcome: finalR > 0 ? 'WIN' : finalR < -0.1 ? 'LOSS' : 'BREAKEVEN'
    };
}

// ═══════════════════════════════════════════════════════════
// MAIN EXECUTION
// ═══════════════════════════════════════════════════════════

async function run() {
    console.log('═══════════════════════════════════════════════════');
    console.log('  TRADECODE NR7 BACKTEST - Enhanced Logic');
    console.log('═══════════════════════════════════════════════════\n');

    try {
        const category = await prisma.category.findUnique({
            where: { key: 'DAILY_CONTRACTION' },
            include: { stocks: { include: { stock: true } } }
        });

        if (!category) return;

        // Dedup
        const seen = new Map();
        for (const entry of category.stocks) {
            const sym = entry.stock.symbol;
            if (!seen.has(sym) || new Date(entry.addedDate) < new Date(seen.get(sym).addedDate)) {
                seen.set(sym, entry);
            }
        }
        const stocks = Array.from(seen.values());
        console.log(`Processing ${stocks.length} unique stocks...\n`);

        const allTrades = [];
        let processed = 0;

        for (const stockEntry of stocks) {
            processed++;
            const symbol = stockEntry.stock.symbol;
            const instrumentKey = stockEntry.stock.instrumentKey;

            process.stdout.write(`\r[${processed}/${stocks.length}] ${symbol}...                    `);

            try {
                // Fetch daily data properly
                const fromDateStr = new Date(stockEntry.addedDate).toISOString().split('T')[0];
                const toDateStr = new Date().toISOString().split('T')[0];
                const candles = await priceService.fetchPrice(
                    symbol, instrumentKey, fromDateStr, toDateStr, 'day'
                );

                if (!candles || !Array.isArray(candles) || candles.length < 50) continue;

                // Scan for signals
                for (let i = 50; i < candles.length - 15; i++) {
                    const signal = detectTradeCodeNR7(candles, i);
                    if (!signal) continue;

                    // Skip 'SKIP' tier immediately? No, log it for comparison
                    // if (signal.tier === 'SKIP') continue;

                    const result = simulateTrade(signal, candles, i);
                    if (result) {
                        allTrades.push({
                            symbol,
                            ...signal,
                            ...result
                        });
                        console.log(`\n  ${symbol} [${signal.tier}] Sc:${signal.scores.total} ${signal.direction} -> ${result.outcome} (${result.pnlR.toFixed(2)}R)`);
                    }

                    break; // One per stock
                }
            } catch (err) {
                // Ignore errors
            }
        }

        console.log('\n\nGenerating Report...');
        generateReport(allTrades);

    } catch (e) {
        console.error(e);
    } finally {
        await prisma.$disconnect();
        process.exit(0);
    }
}

// ═══════════════════════════════════════════════════════════
// REPORT GENERATION
// ═══════════════════════════════════════════════════════════

function generateReport(trades) {
    if (trades.length === 0) { console.log('No trades.'); return; }

    const tiers = ['PREMIUM', 'GOOD', 'MARGINAL', 'SKIP'];
    let md = `# 🏆 TradeCode NR7 Tier Analysis
> Trade Management: Fixed 1.5R Target (Optimal)
> Data: ${trades.length} Trades across 193 Stocks

## 1. Performance by Tier

| Tier | Score Range | Count | Win Rate | Net P&L | Avg P&L |
|------|-------------|-------|----------|---------|---------|
`;

    for (const tier of tiers) {
        const tTrades = trades.filter(t => t.tier === tier);
        const count = tTrades.length;
        if (count === 0) continue;

        const wins = tTrades.filter(t => t.outcome === 'WIN').length;
        const wr = (wins / count * 100).toFixed(1);
        const totalR = tTrades.reduce((s, t) => s + t.pnlR, 0);
        const avgR = (totalR / count).toFixed(2);

        md += `| **${tier}** | ${getScoreRange(tier)} | ${count} | **${wr}%** | **${totalR > 0 ? '+' : ''}${totalR.toFixed(1)}R** | ${avgR}R |\n`;
    }

    md += `\n## 2. Factor Analysis\n`;

    // Key Level Impact
    const atKeyLevel = trades.filter(t => t.details.level !== 'NONE');
    const notKeyLevel = trades.filter(t => t.details.level === 'NONE');
    md += `\n**Key Level Context:**\n`;
    md += `- At Key Level: ${atKeyLevel.length} trades, WR: **${calcWR(atKeyLevel)}%**, Avg: ${calcAvg(atKeyLevel)}R\n`;
    md += `- Random Level: ${notKeyLevel.length} trades, WR: ${calcWR(notKeyLevel)}%, Avg: ${calcAvg(notKeyLevel)}R\n`;

    // Momentum Impact
    const wDiv = trades.filter(t => t.details.divergence === 'YES');
    const noDiv = trades.filter(t => t.details.divergence === 'NO');
    md += `\n**RSI Divergence:**\n`;
    md += `- With Divergence: ${wDiv.length} trades, WR: **${calcWR(wDiv)}%**, Avg: ${calcAvg(wDiv)}R\n`;
    md += `- No Divergence: ${noDiv.length} trades, WR: ${calcWR(noDiv)}%, Avg: ${calcAvg(noDiv)}R\n`;

    md += `\n## 3. Trade Detail\n`;
    md += `| Symbol | Tier | Score | Dir | Context | Div | Result | P&L |\n|---|---|---|---|---|---|---|---|\n`;

    trades.sort((a, b) => b.scores.total - a.scores.total).forEach(t => {
        md += `| ${t.symbol} | ${t.tier} | ${t.scores.total} | ${t.direction} | ${t.details.level} | ${t.details.divergence} | ${t.outcome} | ${t.pnlR.toFixed(2)}R |\n`;
    });

    fs.writeFileSync(REPORT_FILE, md);
    console.log(`Report saved to ${REPORT_FILE}`);
}

function getScoreRange(tier) {
    if (tier === 'PREMIUM') return '7-9';
    if (tier === 'GOOD') return '5-6';
    if (tier === 'MARGINAL') return '3-4';
    return '0-2';
}

function calcWR(list) {
    if (list.length === 0) return '0.0';
    return (list.filter(t => t.outcome === 'WIN').length / list.length * 100).toFixed(1);
}

function calcAvg(list) {
    if (list.length === 0) return '0.00';
    return (list.reduce((s, t) => s + t.pnlR, 0) / list.length).toFixed(2);
}

run();
