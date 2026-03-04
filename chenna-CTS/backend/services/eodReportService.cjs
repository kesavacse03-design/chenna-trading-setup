/**
 * EOD Report Service — End-of-Day Performance Report Generator (V2)
 * 
 * Uses 1-minute candles from Upstox for precise outcome determination.
 * Fixes: stop-before-T1 check, intra-candle ambiguity, T2 tracking after T1.
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const path = require('path');
const fs = require('fs');
const { todayIST, startOfDayUTC, endOfDayUTC } = require('../utils/istUtils.cjs');
const upstoxClient = require('./upstoxClient.cjs');
const historicalDataService = require('./historicalDataService.cjs');
const { evaluateOutcome: sharedEvaluateOutcome } = require('./signalEngine.cjs');

/**
 * Fetch 1-minute candles for a symbol on a specific date from Upstox.
 * Returns candles sorted chronologically (oldest first).
 */
async function fetch1MinCandles(instrumentKey, dateStr) {
    const token = historicalDataService.getAccessToken();
    if (!token) {
        console.warn('[EODReport] No Upstox token available');
        return null;
    }

    const url = `/v2/historical-candle/${encodeURIComponent(instrumentKey)}/1minute/${dateStr}/${dateStr}`;
    const resp = await upstoxClient.callUpstox(url, token);

    if (resp.ok && resp.data && resp.data.data && resp.data.data.candles) {
        const raw = resp.data.data.candles;
        return raw.map(c => ({
            timestamp: c[0],
            open: parseFloat(c[1]),
            high: parseFloat(c[2]),
            low: parseFloat(c[3]),
            close: parseFloat(c[4]),
            volume: parseFloat(c[5] || 0)
        })).sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
    }

    return null;
}

/**
 * Determine signal outcome — delegates to shared signalEngine.evaluateOutcome().
 * This is a thin wrapper for backward compatibility.
 */
function determineOutcome(signal, candles) {
    return sharedEvaluateOutcome(signal, candles);
}

/**
 * Generate EOD report for a given date.
 * Fetches 1-min candles per signal from Upstox for precise outcome determination.
 */
async function generateEODReport(dateStr) {
    const date = dateStr || todayIST();
    console.log(`[EODReport] Generating report for ${date} (V2 — 1-min candle precision)...`);

    const dayStart = startOfDayUTC(date);
    const dayEnd = endOfDayUTC(date);

    // 1. Get all signals for the day
    const signals = await prisma.v5Signal.findMany({
        where: {
            signalDate: { gte: dayStart, lte: dayEnd },
            category: 'INTRADAY_BOOST'
        },
        orderBy: { createdAt: 'asc' }
    });

    // 2. Get actual positions
    const positions = await prisma.v5Position.findMany({
        where: {
            entryDate: { gte: dayStart, lte: dayEnd }
        },
        include: { signal: true }
    });

    // 3. Get scan log for scanner stats
    const logPath = path.join(__dirname, `../scan_logs/${date}.json`);
    let scanStats = { totalStocks: 0, breakoutsDetected: 0, validSignals: 0 };
    if (fs.existsSync(logPath)) {
        try {
            const scans = JSON.parse(fs.readFileSync(logPath, 'utf8'));
            if (scans.length > 0) {
                const allResults = scans.flatMap(s => s.results || []);
                scanStats.totalStocks = scans[scans.length - 1]?.totalStocks || 0;
                scanStats.breakoutsDetected = allResults.filter(r => r.passed || r.reason?.includes('NO_BREAKOUT')).length;
                scanStats.validSignals = allResults.filter(r => r.passed).length;
            }
        } catch (e) { }
    }

    // 4. Analyze each signal's outcome using 1-min candles
    const tradeDetails = [];
    const skippedSignals = [];

    console.log(`[EODReport] Fetching 1-min candles for ${signals.length} signals...`);

    for (const sig of signals) {
        const candles = await fetch1MinCandles(sig.instrumentKey, date);
        const result = determineOutcome(sig, candles);

        const detail = {
            symbol: sig.symbol,
            direction: sig.direction,
            entryType: sig.entryType || 'RETEST',
            entryPrice: parseFloat(sig.entryPrice),
            stopPrice: parseFloat(sig.stopPrice),
            t1Price: sig.t1Price ? parseFloat(sig.t1Price) : null,
            t2Price: sig.t2Price ? parseFloat(sig.t2Price) : null,
            score: sig.confidenceScore,
            tier: sig.confidenceTier,
            status: sig.status,
            ...result
        };

        // ── Update signal status in DB (Bug 3 fix) ──
        // Map outcome to a status string the dashboard understands
        const outcomeToStatus = {
            'T1_HIT': 'T1_HIT',
            'T2_HIT': 'T2_HIT',
            'STOP_HIT': 'STOPPED',
            'EOD_CLOSE': 'EOD_CLOSE',
            'NOT_FILLED': 'EXPIRED',
            'NO_DATA': sig.status, // Keep current status if no data
            'INVALID': sig.status
        };
        const newStatus = outcomeToStatus[result.outcome] || sig.status;

        try {
            await prisma.v5Signal.update({
                where: { id: sig.id },
                data: {
                    status: newStatus,
                    meta: {
                        ...(sig.meta || {}),
                        eodOutcome: result.outcome,
                        eodExitPrice: result.exitPrice,
                        eodExitTime: result.exitTime,
                        eodRMultiple: result.rMultiple,
                        eodFillTime: result.fillTime,
                        eodEvaluatedAt: new Date().toISOString()
                    }
                }
            });
        } catch (updateErr) {
            console.warn(`[EODReport] Failed to update signal ${sig.id}:`, updateErr.message);
        }

        // Classify: GONE/EXPIRED signals go to "skipped"
        if (sig.status === 'EXPIRED' || sig.userAction === 'SKIPPED') {
            skippedSignals.push(detail);
        } else {
            tradeDetails.push(detail);
        }

        // Respect Upstox rate limit (~3 req/sec)
        await new Promise(r => setTimeout(r, 350));
    }

    // 5. Aggregate stats
    const tradeable = tradeDetails.filter(t => t.score >= 25);
    const winners = tradeable.filter(t => t.rMultiple > 0);
    const losers = tradeable.filter(t => t.rMultiple < 0);
    const breakeven = tradeable.filter(t => t.rMultiple === 0);

    const totalR = tradeable.reduce((sum, t) => sum + t.rMultiple, 0);
    const avgWin = winners.length > 0 ? winners.reduce((s, t) => s + t.rMultiple, 0) / winners.length : 0;
    const avgLoss = losers.length > 0 ? losers.reduce((s, t) => s + t.rMultiple, 0) / losers.length : 0;

    // Estimate P&L (assuming ₹2000 risk per trade)
    const riskPerTrade = 2000;
    const netPnl = totalR * riskPerTrade;

    const report = {
        date,
        generatedAt: new Date().toISOString(),
        version: 'V2_1MIN_PRECISION',
        signalsSummary: {
            total: signals.length,
            tradeable: tradeable.length,
            skipped: skippedSignals.length
        },
        performance: {
            winners: winners.length,
            losers: losers.length,
            breakeven: breakeven.length,
            winRate: tradeable.length > 0 ? Math.round((winners.length / tradeable.length) * 100) : 0,
            totalR: Math.round(totalR * 100) / 100,
            avgWinR: Math.round(avgWin * 100) / 100,
            avgLossR: Math.round(avgLoss * 100) / 100,
            netPnl: Math.round(netPnl),
            riskPerTrade
        },
        tradeDetails,
        skippedSignals,
        actualPositions: positions.map(p => ({
            symbol: p.symbol,
            direction: p.direction,
            entryPrice: parseFloat(p.entryPrice),
            exitPrice: p.exitPrice ? parseFloat(p.exitPrice) : null,
            pnl: p.realizedPnL ? parseFloat(p.realizedPnL) : null,
            exitReason: p.exitReason,
            status: p.status
        })),
        scannerStats: scanStats
    };

    // 6. Persist report to file
    const reportDir = path.join(__dirname, '../reports');
    if (!fs.existsSync(reportDir)) fs.mkdirSync(reportDir, { recursive: true });
    fs.writeFileSync(
        path.join(reportDir, `eod_${date}.json`),
        JSON.stringify(report, null, 2)
    );

    console.log(`[EODReport] ✅ Report generated (V2): ${tradeable.length} tradeable signals, ${winners.length}W/${losers.length}L, Net: ${totalR.toFixed(2)}R (₹${netPnl.toFixed(0)})`);
    return report;
}

/**
 * Get previously generated report for a date.
 */
function getReport(dateStr) {
    const reportPath = path.join(__dirname, `../reports/eod_${dateStr}.json`);
    if (fs.existsSync(reportPath)) {
        try { return JSON.parse(fs.readFileSync(reportPath, 'utf8')); } catch (e) { return null; }
    }
    return null;
}

module.exports = {
    generateEODReport,
    getReport,
    determineOutcome,
    fetch1MinCandles
};
