/**
 * DEEP ANALYSIS BACKTEST — LT_SWING_BO_DOWN
 * 
 * Purpose: Run detailed simulation on 50 selected stocks for LT_SWING_BO_DOWN category.
 * Generates:
 * 1. Markdown Report with per-trade details and summary stats.
 * 2. CSV file for spreadsheet analysis.
 */

const path = require('path');
const fs = require('fs');
const { SMA, RSI } = require('technicalindicators');

// Import Strategy & Services
const strategy = require(path.join(__dirname, 'strategies', 'force_lt_down.cjs'));
const { calculateATR, findSwingLow, calculateIntelligentStop, calculateTrailingStop } = require(path.join(__dirname, '..', 'services', 'stopLossCalculator.cjs'));

// Config
const DATA_FILE = path.join(__dirname, '..', 'results', 'lt_down_data.json');
const REPORT_FILE = path.join(__dirname, '..', 'results', 'lt_swing_bo_down_deep_analysis.md');
const CSV_FILE = path.join(__dirname, '..', 'results', 'lt_swing_bo_down_raw.csv');

const MAX_HOLD_DAYS = 45; // Extended for LT
const TRAIL_PCT = 0.03;
const TRAIL_ACTIVATION = 0.015;
const BREAKEVEN_PCT = 0.02;
// LT might use wider stops/targets? Strategy decides. 
// We use strategy's output, but trail logic is simulated here.

const round2 = (v) => Math.round(v * 100) / 100;

// ═══════════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════════

async function main() {
    console.log('══════════════════════════════════════════════════════════════════════');
    console.log('  STEP 3: RUNNING DEEP BACKTEST (LT_SWING_BO_DOWN)');
    console.log('══════════════════════════════════════════════════════════════════════');

    if (!fs.existsSync(DATA_FILE)) {
        console.error(`Data file not found: ${DATA_FILE}`);
        return;
    }

    const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    const symbols = Object.keys(data);
    console.log(`Loaded data for ${symbols.length} stocks.`);

    const results = [];

    for (const symbol of symbols) {
        const stock = data[symbol];

        // 1. Prepare Data
        // 1. Prepare Data & Sort ASCENDING
        const daily = (stock.daily || []).sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
        const weekly = (stock.weekly || []).sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
        const nifty = (stock.nifty || []).sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

        if (daily.length < 30) {
            console.log(`Skipping ${symbol}: Insufficient daily data (${daily.length})`);
            continue;
        }

        // 2. Find Signal Date Index
        // The 'addedDate' is the signal date. Entry is addedDate + 1 day (or next available).
        const signalDateStr = new Date(stock.addedDate).toISOString().split('T')[0];
        const signalIdx = daily.findIndex(c => c.timestamp.startsWith(signalDateStr));

        if (signalIdx === -1) {
            console.log(`Skipping ${symbol}: Signal date ${signalDateStr} not found in daily data.`);
            continue;
        }

        // 3. Slice Past Data for Strategy
        const pastDaily = daily.slice(0, signalIdx + 1);
        const signalTime = new Date(stock.addedDate).getTime();
        const pastWeekly = weekly.filter(c => new Date(c.timestamp).getTime() <= signalTime);
        const pastNifty = nifty.filter(c => new Date(c.timestamp).getTime() <= signalTime);

        // 4. Run Strategy Logic
        // We act AS IF we are on signal date evening.
        const output = await strategy.checkSignal({ symbol }, pastDaily, pastWeekly, pastNifty);

        // 5. Simulate Trade (if BUY)
        // Note: We simulate even if strategy says SKIP? No, strictly follow strategy.
        // But user wants to analyze the category signals. 
        // If strategy returns SKIP, we should record that too?
        // User asked for "Trade Report" for each stock. I will record all, but only simulate BUYs.

        let tradeResult = {
            symbol,
            signalDate: signalDateStr,
            signal: 'NO_SIGNAL',
            pnlPct: 0,
            verdict: 'NO_TRADE'
        };

        if (output && output.signal === 'BUY') {
            // Entry is NEXT day
            const futureCandles = daily.slice(signalIdx + 1, signalIdx + 1 + MAX_HOLD_DAYS);
            if (futureCandles.length > 0) {
                const entryCandle = futureCandles[0];
                const entryPrice = entryCandle.open;
                const entryDate = entryCandle.timestamp.split('T')[0];

                // Recalculate intelligent stop for verify/breakdown (Strategy output has final values, but we want components)
                const atr = calculateATR(pastDaily, 14);
                const swingLow = findSwingLow(pastDaily, 5);
                const atrStop = entryPrice - (atr * 2.0);
                const structureStop = swingLow - (atr * 0.2);

                // Nifty Trend
                const niftyTrend = calculateNiftyTrend(pastNifty);

                // Simulation
                const sim = simulateTrade({
                    symbol, entryPrice, entryDate, futureCandles,
                    initialStop: output.stopPrice,
                    target: output.targetPrice,
                    enableTrailing: true,
                    tier: output.tier
                });

                // Context Metrics
                const weeklyTrend = calculateWeeklyTrend(pastWeekly);
                const preMove10 = calculatePreMove(pastDaily, 10);
                const preMove20 = calculatePreMove(pastDaily, 20);
                const rsiVal = calculateRSI(pastDaily);

                tradeResult = {
                    ...sim,
                    signal: 'BUY',
                    atrStopRaw: round2(atrStop),
                    structureStopRaw: round2(structureStop),
                    structureStopPct: round2((entryPrice - structureStop) / entryPrice * 100),
                    atrStopPct: round2((entryPrice - atrStop) / entryPrice * 100),
                    swingLow,
                    niftyTrend,
                    weeklyTrend,
                    preMove10,
                    preMove20,
                    rsi: rsiVal,
                    atr,
                    tier: output.tier,
                    setupType: output.reason
                };
            } else {
                tradeResult.signal = 'NO_DATA_FUTURE';
            }
        } else {
            tradeResult.signal = output ? output.signal : 'NO_SIGNAL';
            tradeResult.reason = output ? output.reason : 'Condition Failed';
        }

        results.push(tradeResult);
    }

    // 6. Generate Report
    generateMarkdownReport(results);
    generateCSV(results);
}

// ═══════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════

function calculateNiftyTrend(candles) {
    if (!candles || candles.length < 50) return 'UNKNOWN';
    const closes = candles.map(c => c.close);
    // Simple logic: Price > SMA50 ? UP : DOWN
    // Or User asked for UP/DOWN/SIDEWAYS.
    const sma50 = SMA.calculate({ period: 50, values: closes });
    if (!sma50 || sma50.length === 0) return 'UNKNOWN';

    const lastClose = closes[closes.length - 1];
    const lastSma = sma50[sma50.length - 1];

    if (lastClose > lastSma * 1.01) return 'UP';
    if (lastClose < lastSma * 0.99) return 'DOWN';
    return 'SIDEWAYS';
}

function calculateWeeklyTrend(candles) {
    if (!candles || candles.length < 20) return 'UNKNOWN';
    const closes = candles.map(c => c.close);
    const sma20 = SMA.calculate({ period: 20, values: closes });
    if (!sma20 || sma20.length === 0) return 'UNKNOWN';

    const lastClose = closes[closes.length - 1];
    const lastSma = sma20[sma20.length - 1];

    return lastClose > lastSma ? 'UP' : 'DOWN';
}

function calculatePreMove(candles, days) {
    if (candles.length <= days) return 0;
    const current = candles[candles.length - 1].close;
    const past = candles[candles.length - 1 - days].close;
    return round2((current - past) / past * 100);
}

function calculateRSI(candles) {
    const closes = candles.map(c => c.close);
    const rsi = RSI.calculate({ period: 14, values: closes });
    return rsi.length > 0 ? round2(rsi[rsi.length - 1]) : 0;
}

function simulateTrade(params) {
    const { symbol, entryPrice, entryDate, futureCandles, initialStop, target, enableTrailing, tier } = params;

    let currentStop = initialStop;
    let highestPrice = entryPrice;
    let exitPrice = futureCandles[futureCandles.length - 1].close;
    let exitReason = 'TIME_EXIT';
    let exitDate = futureCandles[futureCandles.length - 1].timestamp.split('T')[0];
    let daysHeld = futureCandles.length;
    const dailyLog = [];
    let maxAdverse = 0;

    for (let i = 0; i < futureCandles.length; i++) {
        const candle = futureCandles[i];
        const h = candle.high;
        const l = candle.low;
        const c = candle.close;
        const date = candle.timestamp.split('T')[0];

        if (h > highestPrice) highestPrice = h;

        // Max Adverse
        const adverse = (l - entryPrice) / entryPrice * 100;
        if (adverse < maxAdverse) maxAdverse = adverse;

        // Check Stop
        if (l <= currentStop) {
            exitPrice = currentStop; // Assume slippage? No, use stop price.
            // Check if gap down? simplified: use stop price.
            exitReason = currentStop > initialStop ? (currentStop >= entryPrice ? 'BREAKEVEN' : 'TRAILING_STOP') : 'INITIAL_STOP';
            exitDate = date;
            daysHeld = i + 1;
            dailyLog.push({ day: i + 1, date, high: h, low: l, close: c, stop: round2(currentStop), action: exitReason });
            break;
        }

        // Check Target
        if (h >= target) {
            exitPrice = target;
            exitReason = 'TARGET';
            exitDate = date;
            daysHeld = i + 1;
            dailyLog.push({ day: i + 1, date, high: h, low: l, close: c, stop: round2(currentStop), action: 'TARGET' });
            break;
        }

        // Trailing
        let action = 'NO_CHANGE';
        if (enableTrailing) {
            const trailCalc = calculateTrailingStop({
                entryPrice, currentStop, highestPrice,
                trailPct: TRAIL_PCT,
                activationPct: TRAIL_ACTIVATION,
                breakevenPct: BREAKEVEN_PCT
            });
            if (trailCalc.newStop > currentStop) {
                currentStop = trailCalc.newStop;
                action = trailCalc.action;
            }
        }

        dailyLog.push({ day: i + 1, date, high: h, low: l, close: c, stop: round2(currentStop), action });

        if (i === futureCandles.length - 1) {
            exitReason = 'TIME_EXIT';
            exitPrice = c;
            // daysHeld already set
        }
    }

    const pnlPct = round2((exitPrice - entryPrice) / entryPrice * 100);
    const verdict = pnlPct > 0 ? 'WINNER ✅' : pnlPct < 0 ? 'LOSER ❌' : 'BREAKEVEN ⚪';

    return {
        symbol,
        entryPrice, entryDate, initialStop, target,
        exitPrice, exitReason, exitDate, daysHeld, pnlPct,
        maxFavorable: round2((highestPrice - entryPrice) / entryPrice * 100),
        maxAdverse: round2(maxAdverse),
        finalStop: round2(currentStop),
        dailyLog,
        verdict
    };
}

function generateMarkdownReport(results) {
    let md = '# DEEP ANALYSIS: LT_SWING_BO_DOWN\n\n';
    md += `**Generated:** ${new Date().toLocaleString()}\n`;
    md += `**Total Sample:** ${results.length} stocks\n\n`;

    const trades = results.filter(r => r.signal === 'BUY');

    // Summary Stats
    if (trades.length > 0) {
        md += '## 📊 Summary Statistics\n\n';
        const winners = trades.filter(t => t.pnlPct > 0);
        const losers = trades.filter(t => t.pnlPct < 0);
        const winRate = round2(winners.length / trades.length * 100);
        const avgPnl = round2(trades.reduce((s, t) => s + t.pnlPct, 0) / trades.length);
        const pf = losers.length > 0 ? round2(winners.reduce((s, t) => s + t.pnlPct, 0) / Math.abs(losers.reduce((s, t) => s + t.pnlPct, 0))) : 'Infinity';

        md += `| Metric | Value |\n|---|---|\n`;
        md += `| **Win Rate** | **${winRate}%** (${winners.length}W ${losers.length}L) |\n`;
        md += `| **Avg P&L** | **${avgPnl >= 0 ? '+' : ''}${avgPnl}%** |\n`;
        md += `| **Profit Factor** | ${pf} |\n`;
        md += `| **Avg Days Held** | ${round2(trades.reduce((s, t) => s + t.daysHeld, 0) / trades.length)} |\n\n`;
    }

    // Individual Reports
    md += '## 📝 Individual Trade Reports\n\n';

    for (const t of results) {
        if (t.signal !== 'BUY') {
            md += `### ${t.symbol}: ${t.signal} (${t.reason || 'Skipped'})\n\n---\n\n`;
            continue;
        }

        md += `### ${t.symbol} (${t.tier === 1 ? 'Tier 1' : 'Tier 2'}) - ${t.verdict}\n\n`;
        md += `**Signal Date:** ${t.signalDate} | **Entry:** ${t.entryDate}\n\n`;

        md += `**Context:**\n`;
        md += `- Nifty Trend: **${t.niftyTrend}**\n`;
        md += `- Weekly Trend: **${t.weeklyTrend}**\n`;
        md += `- RSI(14): **${t.rsi}**\n`;
        md += `- Pre-Move: 10d ${t.preMove10}% | 20d ${t.preMove20}%\n\n`;

        md += `**Trade Setup:**\n`;
        md += `- Entry: ₹${t.entryPrice}\n`;
        md += `- ATR(14): ₹${t.atr} | Stop: ₹${t.structureStopRaw} (Struct) vs ₹${t.atrStopRaw} (ATR)\n`;
        md += `- FINAL Stop: **₹${t.initialStop}**\n`;
        md += `- Target: **₹${t.target}**\n\n`;

        md += `**Result:**\n`;
        md += `- Exit: **${t.exitReason}** at ₹${t.exitPrice} on ${t.exitDate}\n`;
        md += `- P&L: **${t.pnlPct}%**\n`;
        md += `- Max Favorable: +${t.maxFavorable}% | Max Adverse: ${t.maxAdverse}%\n\n`;

        md += `| Day | Date | High | Low | Close | Stop | Action |\n`;
        md += `|---|---|---|---|---|---|---|\n`;
        for (const d of t.dailyLog) {
            md += `| ${d.day} | ${d.date} | ${d.high} | ${d.low} | ${d.close} | ${d.stop} | ${d.action} |\n`;
        }
        md += `\n---\n\n`;
    }

    fs.writeFileSync(REPORT_FILE, md);
    console.log(`Saved Report: ${REPORT_FILE}`);
}

function generateCSV(results) {
    const header = 'Symbol,Signal,Date,Tier,NiftyTrend,WeeklyTrend,PreMove10d,RSI,Entry,Exit,PnlPct,ExitReason,DaysHeld,MaxFav,MaxAdv';
    const rows = results.map(t => {
        if (t.signal !== 'BUY') return `${t.symbol},${t.signal},${t.signalDate},,,,,,,,,,,,`;
        return `${t.symbol},BUY,${t.signalDate},${t.tier},${t.niftyTrend},${t.weeklyTrend},${t.preMove10},${t.rsi},${t.entryPrice},${t.exitPrice},${t.pnlPct},${t.exitReason},${t.daysHeld},${t.maxFavorable},${t.maxAdverse}`;
    }).join('\n');

    fs.writeFileSync(CSV_FILE, header + '\n' + rows);
    console.log(`Saved CSV: ${CSV_FILE}`);
}

main().catch(console.error);
