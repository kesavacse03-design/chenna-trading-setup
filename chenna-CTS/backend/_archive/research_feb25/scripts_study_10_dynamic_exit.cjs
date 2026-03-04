const fs = require('fs');
const path = require('path');

const cacheDirDay = path.join(__dirname, '../cache/day');

function loadCache(symbol) {
    const cleanKey = symbol.replace(/[^a-zA-Z0-9_-]/g, '_');
    const fp = path.join(cacheDirDay, `${cleanKey}_master.json`);
    if (!fs.existsSync(fp)) return null;
    try {
        const d = JSON.parse(fs.readFileSync(fp, 'utf8'));
        return d.map(c => ({
            date: String(c.timestamp || c.date).split('T')[0],
            open: parseFloat(c.open), high: parseFloat(c.high),
            low: parseFloat(c.low), close: parseFloat(c.close), volume: parseFloat(c.volume)
        })).sort((a, b) => a.date.localeCompare(b.date));
    } catch (e) { return null; }
}

function getTrades() {
    const dumpPath = path.join(__dirname, '../db_trades_dump.json');
    if (!fs.existsSync(dumpPath)) return { stUp: [], stDown: [], ltUp: [] };
    const data = JSON.parse(fs.readFileSync(dumpPath, 'utf8'));

    const stUpRunId = 'c2f83919-7fb8-47e9-84d8-2bd69c3d54e0';
    const stDownRunId = '1fa6b975-690c-43db-929c-e5f16a0c2931';
    const ltUpRunId = '83cfbb5d-5aa0-4e8a-8f96-38bfb776b545';

    // Find runs
    const stUpRun = data.runs.find(r => r.id === stUpRunId);
    const stDownRun = data.runs.find(r => r.id === stDownRunId);
    const ltUpRun = data.runs.find(r => r.id === ltUpRunId);

    const mapTrade = (t, cat) => ({
        symbol: t.symbol,
        entryPrice: t.entryPrice || t.signalPrice || t.price || 0,
        entryDate: String(t.entryDate || t.signalDate).split('T')[0],
        originalPnl: t.pnl || 0,
        originalExitReason: t.exitReason,
        category: cat
    });

    return {
        stUp: stUpRun && stUpRun.trades ? stUpRun.trades.map(t => mapTrade(t, 'ST_SWING_BO_UP')) : [],
        stDown: stDownRun && stDownRun.trades ? stDownRun.trades.map(t => mapTrade(t, 'SHORT_TERM_SWING_BO_DOWN')) : [],
        ltUp: ltUpRun && ltUpRun.trades ? ltUpRun.trades.map(t => mapTrade(t, 'LONG_TERM_SWING_BO_UP')) : []
    };
}

function simulateExit(trade, defaultTimeLimit) {
    const dailyC = loadCache(trade.symbol);
    if (!dailyC) return { ...trade, dynPnl: 0, fixedPnl: 0, dynExitReason: 'NO_DATA' };

    const eIdx = dailyC.findIndex(c => c.date >= trade.entryDate);
    if (eIdx === -1) return { ...trade, dynPnl: 0, fixedPnl: 0, dynExitReason: 'NO_DATA' };

    // Day 0 is entry date
    let exitReason = null;
    let exitPrice = null;
    let holdLimit = defaultTimeLimit;

    // We simulate day by day
    for (let i = 1; i <= holdLimit && (eIdx + i) < dailyC.length; i++) {
        const cToday = dailyC[eIdx + i];
        const cPrev = dailyC[eIdx + i - 1]; // Previous day

        // Check Hard Stops (simplification: 4% hard stop for downside protection)
        const currentPnlPct = trade.category.includes('DOWN')
            ? ((trade.entryPrice - cToday.high) / trade.entryPrice) * 100
            : ((cToday.low - trade.entryPrice) / trade.entryPrice) * 100;

        if (currentPnlPct <= -4.0) {
            // Hit hard stop intraday
            exitReason = 'HARD_STOP';
            exitPrice = trade.category.includes('DOWN') ? trade.entryPrice * 1.04 : trade.entryPrice * 0.96;
            break;
        }

        // Health checks are naturally checked at the end of the day, acting on the next open.
        // But for simplicity of PnL, we'll imagine we exit at the close of the triggered day, 
        // to approximate "exit next morning".

        // Day 1 Check: Bearish Engulfing or Marubozu Red
        if (i === 1) {
            // Only applicable to UP trades in premise
            if (trade.category.includes('UP')) {
                const bodySize = Math.abs(cToday.open - cToday.close);
                const totalSize = cToday.high - cToday.low;
                let isMarubozuRed = (cToday.close < cToday.open) && (bodySize / totalSize > 0.85);
                let isEngulfingRed = (cToday.open > cPrev.close && cToday.close < cPrev.open);
                if (isMarubozuRed || isEngulfingRed) {
                    exitReason = 'DYN_DAY1_BEARISH';
                    exitPrice = cToday.close;
                    break;
                }
            } else {
                // For DOWN: Bullish Engulfing or Marubozu Green
                const bodySize = Math.abs(cToday.close - cToday.open);
                const totalSize = cToday.high - cToday.low;
                let isMarubozuGreen = (cToday.close > cToday.open) && (bodySize / totalSize > 0.85);
                let isEngulfingGreen = (cToday.open < cPrev.close && cToday.close > cPrev.open);
                if (isMarubozuGreen || isEngulfingGreen) {
                    exitReason = 'DYN_DAY1_BULLISH';
                    exitPrice = cToday.close;
                    break;
                }
            }
        }

        // Day 5 Check: Volume Ratio
        if (i === 5) {
            let greenV = 0, redV = 0;
            for (let j = 1; j <= 5; j++) {
                const dayC = dailyC[eIdx + j];
                if (!dayC) continue;
                if (dayC.close >= dayC.open) greenV += dayC.volume;
                else redV += dayC.volume;
            }
            const ratio = redV === 0 ? 999 : greenV / redV;

            if (trade.category.includes('UP')) {
                if (ratio < 0.8) {
                    exitReason = 'DYN_DAY5_DISTRIBUTION';
                    exitPrice = cToday.close;
                    break;
                } else if (ratio > 2.0 && cToday.close > trade.entryPrice) {
                    holdLimit = 15; // Extend limit!
                }
            } else {
                // DOWN
                const downRatio = greenV === 0 ? 999 : redV / greenV;
                if (downRatio < 0.8) {
                    exitReason = 'DYN_DAY5_ACCUMULATION';
                    exitPrice = cToday.close;
                    break;
                } else if (downRatio > 2.0 && cToday.close < trade.entryPrice) {
                    holdLimit = 15;
                }
            }
        }

        if (i === holdLimit) {
            exitReason = 'TIME_LIMIT_REACHED';
            exitPrice = cToday.close;
            break;
        }
    }

    if (!exitReason) {
        // Assume latest available data
        const lastC = dailyC[Math.min(dailyC.length - 1, eIdx + holdLimit)];
        exitReason = 'OPEN/END_OF_DATA';
        exitPrice = lastC.close;
    }

    if (trade.entryPrice <= 0) {
        return { ...trade, dynPnl: 0, fixedPnl: 0, dynExitReason: 'NO_ENTRY_PRICE' };
    }

    const originalPctPnl = trade.category.includes('DOWN')
        ? ((trade.entryPrice - exitPrice) / trade.entryPrice)
        : ((exitPrice - trade.entryPrice) / trade.entryPrice);

    const fixedAlloc = 50000;
    const dynPnl = originalPctPnl * fixedAlloc;

    let fixedPnl = 0;
    let didHitHardStop = false;
    for (let i = 1; i <= defaultTimeLimit && (eIdx + i) < dailyC.length; i++) {
        const cToday = dailyC[eIdx + i];
        const currentPnlPct = trade.category.includes('DOWN')
            ? ((trade.entryPrice - cToday.high) / trade.entryPrice) * 100
            : ((cToday.low - trade.entryPrice) / trade.entryPrice) * 100;

        if (currentPnlPct <= -4.0) {
            fixedPnl = -4.0 / 100 * fixedAlloc;
            didHitHardStop = true;
            break;
        }
        if (i === defaultTimeLimit) {
            const exitP = cToday.close;
            fixedPnl = trade.category.includes('DOWN') ? ((trade.entryPrice - exitP) / trade.entryPrice) * fixedAlloc : ((exitP - trade.entryPrice) / trade.entryPrice) * fixedAlloc;
            break;
        }
    }

    if (fixedPnl === 0 && !didHitHardStop) {
        const lastC = dailyC[Math.min(dailyC.length - 1, eIdx + defaultTimeLimit)];
        fixedPnl = trade.category.includes('DOWN') ? ((trade.entryPrice - lastC.close) / trade.entryPrice) * fixedAlloc : ((lastC.close - trade.entryPrice) / trade.entryPrice) * fixedAlloc;
    }

    return {
        ...trade,
        dynPnl: isNaN(dynPnl) ? 0 : dynPnl,
        fixedPnl: isNaN(fixedPnl) ? 0 : fixedPnl,
        dynExitReason: exitReason
    };
}

function summarize(trades, name, defaultTimeLimit) {
    let fixW = 0, fixL = 0, fixPnl = 0;
    let dynW = 0, dynL = 0, dynPnl = 0;

    for (const t of trades) {
        const res = simulateExit(t, defaultTimeLimit);
        if (res.fixedPnl > 0) fixW++; else fixL++;
        fixPnl += res.fixedPnl;

        if (res.dynPnl > 0) dynW++; else dynL++;
        dynPnl += res.dynPnl;
    }

    const tCount = trades.length;
    console.log(`\n=== ${name} ===`);
    console.log(`FIXED EXIT   : ${tCount} trades | WR: ${tCount ? ((fixW / tCount) * 100).toFixed(1) : 0}% | P&L: ₹${fixPnl.toFixed(0)}`);
    console.log(`DYNAMIC EXIT : ${tCount} trades | WR: ${tCount ? ((dynW / tCount) * 100).toFixed(1) : 0}% | P&L: ₹${dynPnl.toFixed(0)}`);
    return { fixPnl, dynPnl };
}

function main() {
    console.log("=== STUDY 10: DYNAMIC EXITS VS FIXED TIME EXITS ===");
    const trades = getTrades();

    let totalFix = 0;
    let totalDyn = 0;

    let res = summarize(trades.stUp, 'ST_SWING_UP', 10);
    totalFix += res.fixPnl; totalDyn += res.dynPnl;

    res = summarize(trades.stDown, 'ST_SWING_DOWN', 5);
    totalFix += res.fixPnl; totalDyn += res.dynPnl;

    res = summarize(trades.ltUp, 'LT_SWING_UP', 13);
    totalFix += res.fixPnl; totalDyn += res.dynPnl;

    console.log(`\n=== GRAND TOTAL COMPARISON ===`);
    console.log(`Fixed Total P&L   : ₹${totalFix.toFixed(0)}`);
    console.log(`Dynamic Total P&L : ₹${totalDyn.toFixed(0)}`);
    const diff = totalDyn - totalFix;
    const diffPct = totalFix !== 0 ? (diff / Math.abs(totalFix)) * 100 : 0;
    console.log(`Improvement       : ₹${diff.toFixed(0)} (${diffPct > 0 ? '+' : ''}${diffPct.toFixed(1)}%)`);
}

main();
