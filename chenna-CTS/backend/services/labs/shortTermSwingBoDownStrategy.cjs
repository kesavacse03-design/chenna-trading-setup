/**
 * SHORT_TERM_SWING_BO_DOWN — Labs Backtest Wrapper
 * 
 * This file is a THIN WRAPPER around the source-of-truth strategy:
 *   strategies/swingBoDownLongStrategy.cjs
 * 
 * It provides the backtest() function expected by backtestRoutes.cjs,
 * but delegates ALL signal logic to the real strategy.
 * 
 * Direction: LONG (buy the dip / mean reversion)
 * Stops: ATR-based via calculateIntelligentStop()
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const realStrategy = require('../../strategies/swingBoDownLongStrategy.cjs');
const { calculateTrailingStop } = require('../stopLossCalculator.cjs');

const CONFIG = {
    name: 'SHORT_TERM_SWING_BO_DOWN',
    displayName: 'Short-Term Swing BO Down (Mean Reversion)',
    timeframe: 'daily',
    category: 'SHORT_TERM_SWING_BO_DOWN',
    direction: 'LONG',
    maxHoldDays: 10,
    trailPct: 0.03,
    trailActivation: 0.015,
    breakevenPct: 0.02
};

async function getDailyCandles(symbol) {
    const caches = await prisma.ohlcvCache.findMany({ where: { symbol, interval: 'day' } });
    if (!caches.length) return [];

    // Combine all cache records, deduplimate, sort
    const all = [];
    for (const c of caches) {
        const data = typeof c.data === 'string' ? JSON.parse(c.data) : c.data;
        all.push(...data);
    }

    // Deduplicate by date
    const unique = {};
    for (const c of all) {
        const dt = (c.timestamp || '').split('T')[0];
        if (dt) unique[dt] = {
            timestamp: c.timestamp,
            open: parseFloat(c.open),
            high: parseFloat(c.high),
            low: parseFloat(c.low),
            close: parseFloat(c.close),
            volume: parseInt(c.volume || 0)
        };
    }

    return Object.values(unique).sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
}

async function getCategoryStocks() {
    const cat = await prisma.category.findUnique({
        where: { key: 'SHORT_TERM_SWING_BO_DOWN' },
        include: { stocks: { include: { stock: true } } }
    });
    return cat ? cat.stocks.map(sc => ({ symbol: sc.stock.symbol })) : [];
}

function simulateTrade(signal, candles, entryIdx) {
    const entryCandle = candles[entryIdx + 1]; // Enter next day open
    if (!entryCandle) return null;

    const entryPrice = entryCandle.open;
    let currentStop = signal.stopPrice;
    let highestPrice = entryPrice;
    let exitPrice = null;
    let exitReason = null;
    let exitDate = null;
    let daysHeld = 0;

    const futureCandles = candles.slice(entryIdx + 1, entryIdx + 1 + CONFIG.maxHoldDays);

    for (let i = 0; i < futureCandles.length; i++) {
        const candle = futureCandles[i];
        daysHeld = i + 1;

        if (candle.high > highestPrice) highestPrice = candle.high;

        // Check stop loss
        if (candle.low <= currentStop) {
            exitPrice = currentStop;
            exitReason = currentStop > signal.stopPrice
                ? (currentStop >= entryPrice ? 'BREAKEVEN' : 'TRAILING_STOP')
                : 'STOP';
            exitDate = candle.timestamp;
            break;
        }

        // Check target
        if (candle.high >= signal.targetPrice) {
            exitPrice = signal.targetPrice;
            exitReason = 'TARGET';
            exitDate = candle.timestamp;
            break;
        }

        // Trail stop
        const trail = calculateTrailingStop({
            entryPrice,
            currentStop,
            highestPrice,
            trailPct: CONFIG.trailPct,
            activationPct: CONFIG.trailActivation,
            breakevenPct: CONFIG.breakevenPct
        });
        if (trail.newStop > currentStop) currentStop = trail.newStop;

        // Time exit
        if (daysHeld >= CONFIG.maxHoldDays) {
            exitPrice = candle.close;
            exitReason = 'MAX_HOLD';
            exitDate = candle.timestamp;
            break;
        }
    }

    if (!exitPrice) {
        const last = futureCandles[futureCandles.length - 1];
        exitPrice = last ? last.close : entryPrice;
        exitReason = 'OPEN';
        exitDate = last ? last.timestamp : entryCandle.timestamp;
    }

    const pnl = ((exitPrice - entryPrice) / entryPrice) * 100;

    return {
        symbol: signal.symbol,
        signalDate: (candles[entryIdx].timestamp || '').split('T')[0],
        entryDate: (entryCandle.timestamp || '').split('T')[0],
        timestamp: entryCandle.timestamp,
        date: (entryCandle.timestamp || '').split('T')[0],
        entryPrice: parseFloat(entryPrice.toFixed(2)),
        exitPrice: parseFloat(exitPrice.toFixed(2)),
        targetPrice: parseFloat(signal.targetPrice.toFixed(2)),
        stopPrice: parseFloat(signal.stopPrice.toFixed(2)),
        exitReason,
        holdDays: daysHeld,
        pnlPercent: parseFloat(pnl.toFixed(2)),
        outcome: exitReason === 'OPEN' ? 'OPEN' : (pnl > 0 ? 'WIN' : 'LOSS'),
        confidence: signal.tier === 1 ? 85 : 60,
        tier: signal.tier,
        reason: signal.reason,
        stopMethod: signal.stopMethod,
        strategy: CONFIG.name
    };
}

/**
 * backtest() — called by backtestRoutes.cjs
 * Returns { trades, stats } in the format the UI expects.
 */
async function backtest(startDate, endDate) {
    const stocks = await getCategoryStocks();
    console.log(`[ST_SWING_BO_DOWN] Backtesting ${stocks.length} stocks from ${startDate} to ${endDate}`);

    const allTrades = [];
    const start = new Date(startDate);
    const end = new Date(endDate);

    for (const s of stocks) {
        const candles = await getDailyCandles(s.symbol);
        if (candles.length < 30) continue; // Need enough data for RSI + ATR

        for (let i = 20; i < candles.length - 1; i++) {
            const candleDate = new Date(candles[i].timestamp);
            if (candleDate < start || candleDate > end) continue;
            if (candleDate.getDay() === 0 || candleDate.getDay() === 6) continue;

            // Delegate to the REAL strategy
            const pastCandles = candles.slice(0, i + 1);
            const signal = await realStrategy.checkSignal(s.symbol, pastCandles, [], []);

            if (signal && signal.signal === 'BUY' && signal.tier === 1) {
                const trade = simulateTrade(
                    { ...signal, symbol: s.symbol },
                    candles,
                    i
                );
                if (trade) {
                    allTrades.push(trade);
                    i += trade.holdDays; // Skip forward to avoid overlapping trades
                }
            }
        }
    }

    // Calculate stats
    const wins = allTrades.filter(t => t.outcome === 'WIN');
    const totalPnl = allTrades.reduce((sum, t) => sum + t.pnlPercent, 0);

    const stats = {
        totalTrades: allTrades.length,
        winners: wins.length,
        losers: allTrades.length - wins.length,
        winRate: allTrades.length > 0 ? (wins.length / allTrades.length) * 100 : 0,
        totalPnl: parseFloat(totalPnl.toFixed(2)),
        avgPnl: allTrades.length > 0 ? parseFloat((totalPnl / allTrades.length).toFixed(2)) : 0
    };

    console.log(`[ST_SWING_BO_DOWN] Done: ${stats.totalTrades} trades, WR: ${stats.winRate.toFixed(1)}%, P&L: ${stats.totalPnl.toFixed(2)}%`);
    return { trades: allTrades, stats };
}

module.exports = { CONFIG, backtest, getCategoryStocks, getDailyCandles };
