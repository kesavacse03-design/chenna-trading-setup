/**
 * Backtest Replay Service (V2)
 * 
 * Replays signals against 1-minute candles with proper ambiguity resolution.
 * Fixes: stop-before-T1, intra-candle ambiguity, T2 tracking, IST date handling.
 * Added: checkBacktestData() for data availability before running.
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const upstoxClient = require('./upstoxClient.cjs');
const historicalDataService = require('./historicalDataService.cjs');
const { startOfDayUTC, endOfDayUTC } = require('../utils/istUtils.cjs');
const { evaluateOutcome } = require('./signalEngine.cjs');

/**
 * Check data availability before running a backtest.
 */
async function checkBacktestData(category, startDateStr, endDateStr) {
    // Check signals
    const signals = await prisma.v5Signal.findMany({
        where: {
            category,
            signalDate: {
                gte: startOfDayUTC(startDateStr),
                lte: endOfDayUTC(endDateStr)
            }
        },
        select: { signalDate: true }
    });

    // Get unique dates
    const signalDays = [...new Set(signals.map(s => s.signalDate.toISOString().split('T')[0]))];

    // Check candle data availability
    const candleData = await prisma.ohlcvCache.findMany({
        where: {
            interval: '1minute',
            fromDate: {
                gte: new Date(startDateStr),
                lte: new Date(endDateStr)
            }
        },
        select: { fromDate: true },
        distinct: ['fromDate']
    });

    const candleDays = [...new Set(candleData.map(c => c.fromDate.toISOString().split('T')[0]))];

    return {
        signalDays,
        candleDays,
        canReplay: signalDays.length > 0,
        canTimeTravel: candleDays.length > 0,
        message: signalDays.length === 0 && candleDays.length === 0
            ? 'No data available for this range. Generate signals and/or fetch 1-min candle data first.'
            : `${signalDays.length} days with signals, ${candleDays.length} days with cached candle data`
    };
}

/**
 * Replays signals against 1-minute historical data to determine exact outcomes.
 * Uses the fixed determineOutcome() with proper ambiguity resolution.
 */
async function replaySignals(category, startDateStr, endDateStr) {
    console.log(`[BacktestReplay V2] Replaying ${category} from ${startDateStr} to ${endDateStr}...`);

    // Use IST-aware date range for signal query
    const signals = await prisma.v5Signal.findMany({
        where: {
            category,
            signalDate: {
                gte: startOfDayUTC(startDateStr),
                lte: endOfDayUTC(endDateStr)
            }
        },
        orderBy: { signalDate: 'asc' }
    });

    if (!signals.length) {
        console.log('[BacktestReplay V2] No signals found in date range.');
        return { signals: [], summary: { total: 0, message: 'No signals found. Check if signals exist for this date range.' } };
    }

    console.log(`[BacktestReplay V2] Found ${signals.length} signals. Fetching 1-min candle data...`);

    const token = historicalDataService.getAccessToken();
    if (!token) {
        throw new Error("Missing Upstox Access Token for 1-minute data fetch.");
    }

    const summary = {
        total: signals.length,
        t1Hits: 0,
        t2Hits: 0,
        stopHits: 0,
        eodClose: 0,
        expired: 0,
        noData: 0,
        totalR: 0,
        winRate: 0
    };

    const replayedSignals = [];

    for (const signal of signals) {
        const dateStr = signal.signalDate.toISOString().split('T')[0];
        const dir = signal.direction || 'LONG';
        const entryPrice = parseFloat(signal.entryPrice);
        const stopPrice = parseFloat(signal.stopPrice);
        const t1Price = signal.t1Price ? parseFloat(signal.t1Price) : null;
        const t2Price = signal.t2Price ? parseFloat(signal.t2Price) : null;

        // Fetch 1-min data for that specific day
        const url = `/v2/historical-candle/${encodeURIComponent(signal.instrumentKey)}/1minute/${dateStr}/${dateStr}`;
        const resp = await upstoxClient.callUpstox(url, token);

        let result = { outcome: 'NO_DATA', exitPrice: entryPrice, rMultiple: 0, exitTime: null };
        let maxFavorable = entryPrice;
        let maxAdverse = entryPrice;
        let entered = false;

        if (resp.ok && resp.data && resp.data.data && resp.data.data.candles) {
            const rawCandles = resp.data.data.candles;
            const candles = rawCandles.map(c => ({
                timestamp: c[0],
                open: parseFloat(c[1]),
                high: parseFloat(c[2]),
                low: parseFloat(c[3]),
                close: parseFloat(c[4])
            })).sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

            // Pass full candles to evaluateOutcome which handles fill phase internally
            // (it skips candles until entry price is touched, modeling a limit order)
            result = evaluateOutcome(signal, candles);
            entered = result.outcome !== 'NOT_FILLED' && result.outcome !== 'NO_DATA';

            // Track MFE/MAE (only for candles after fill)
            if (entered) {
                for (const c of candles) {
                    if (dir === 'LONG') {
                        if (c.high > maxFavorable) maxFavorable = c.high;
                        if (c.low < maxAdverse) maxAdverse = c.low;
                    } else {
                        if (c.low < maxFavorable) maxFavorable = c.low;
                        if (c.high > maxAdverse) maxAdverse = c.high;
                    }
                }
            }
        } else {
            console.warn(`[BacktestReplay V2] No 1-min data for ${signal.symbol} on ${dateStr}`);
            result = { outcome: 'NO_DATA', exitPrice: entryPrice, rMultiple: 0, exitTime: null };
        }

        // Update summary
        switch (result.outcome) {
            case 'T1_HIT': summary.t1Hits++; break;
            case 'T2_HIT': summary.t2Hits++; break;
            case 'STOP_HIT': summary.stopHits++; break;
            case 'EOD_CLOSE': summary.eodClose++; break;
            case 'EXPIRED': summary.expired++; break;
            case 'NO_DATA': summary.noData++; break;
        }
        summary.totalR += result.rMultiple;

        replayedSignals.push({
            id: signal.id,
            symbol: signal.symbol,
            direction: dir,
            entryType: signal.entryType || 'RETEST',
            entryPrice,
            stopPrice,
            t1Price,
            t2Price,
            score: signal.confidenceScore,
            tier: signal.confidenceTier,
            signalDate: dateStr,
            replayOutcome: result.outcome,
            replayExitPrice: result.exitPrice,
            replayExitTime: result.exitTime,
            replayRMultiple: result.rMultiple,
            hitT1: result.hitT1 || false,
            hitT2: result.hitT2 || false,
            maxFavorable,
            maxAdverse,
            entered
        });

        // Respect Upstox rate limit
        await new Promise(res => setTimeout(res, 350));
    }

    // Calculate final stats
    const tradeable = replayedSignals.filter(s => s.entered);
    const winners = tradeable.filter(s => s.replayRMultiple > 0);
    summary.winRate = tradeable.length > 0 ? Math.round((winners.length / tradeable.length) * 100) : 0;
    summary.totalR = Math.round(summary.totalR * 100) / 100;

    console.log(`[BacktestReplay V2] ✅ Done: ${tradeable.length} traded, ${winners.length}W, Net ${summary.totalR}R, WR ${summary.winRate}%`);

    return { params: { category, startDateStr, endDateStr }, summary, signals: replayedSignals };
}

module.exports = {
    replaySignals,
    checkBacktestData
};
