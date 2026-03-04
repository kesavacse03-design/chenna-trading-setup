/**
 * LONG_TERM_SWING_BO_UP — Labs Backtest Wrapper
 * 
 * This file is a THIN WRAPPER around the source-of-truth strategy:
 *   strategies/ltSwingBoUpLongStrategy.cjs
 * 
 * It provides the backtest() function expected by backtestRoutes.cjs,
 * but delegates ALL signal logic to the real strategy.
 * 
 * Direction: LONG (trend continuation)
 * Filter: Pre-trend return > +5%
 * Stops: ATR-based via calculateIntelligentStop()
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const realStrategy = require('../../strategies/ltSwingBoUpLongStrategy.cjs');
const { calculateTrailingStop } = require('../stopLossCalculator.cjs');

const CONFIG = {
    name: 'LONG_TERM_SWING_BO_UP',
    displayName: 'Long-Term Swing BO Up (Trend Continuation)',
    timeframe: 'daily',
    category: 'LONG_TERM_SWING_BO_UP',
    direction: 'LONG',
    maxHoldDays: 20, // LT hold period
    trailPct: 0.05,  // Wider trail for LT
    trailActivation: 0.03, // Activate trail later
    breakevenPct: 0.04
};

async function getDailyCandles(symbol) {
    const caches = await prisma.ohlcvCache.findMany({ where: { symbol, interval: 'day' } });
    if (!caches.length) return [];

    const all = [];
    for (const c of caches) {
        const data = typeof c.data === 'string' ? JSON.parse(c.data) : c.data;
        all.push(...data);
    }

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
        where: { key: 'LONG_TERM_SWING_BO_UP' },
        include: { stocks: { include: { stock: true } } }
    });
    if (!cat) return [];
    // Deduplicate by symbol
    const seen = new Set();
    return cat.stocks.filter(sc => {
        if (seen.has(sc.stock.symbol)) return false;
        seen.add(sc.stock.symbol);
        return true;
    }).map(sc => ({ symbol: sc.stock.symbol }));
}

function simulateTrade(signal, candles, entryIdx) {
    const entryCandle = candles[entryIdx + 1];
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

        if (candle.low <= currentStop) {
            exitPrice = currentStop;
            exitReason = currentStop > signal.stopPrice
                ? (currentStop >= entryPrice ? 'BREAKEVEN' : 'TRAILING_STOP')
                : 'STOP';
            exitDate = candle.timestamp;
            break;
        }

        if (candle.high >= signal.targetPrice) {
            exitPrice = signal.targetPrice;
            exitReason = 'TARGET';
            exitDate = candle.timestamp;
            break;
        }

        const trail = calculateTrailingStop({
            entryPrice,
            currentStop,
            highestPrice,
            trailPct: CONFIG.trailPct,
            activationPct: CONFIG.trailActivation,
            breakevenPct: CONFIG.breakevenPct
        });
        if (trail.newStop > currentStop) currentStop = trail.newStop;

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

async function backtest(startDate, endDate) {
    const stocks = await getCategoryStocks();
    console.log(`[LT_SWING_BO_UP] Backtesting ${stocks.length} unique stocks from ${startDate} to ${endDate}`);

    const allTrades = [];
    const start = new Date(startDate);
    const end = new Date(endDate);

    for (const s of stocks) {
        const candles = await getDailyCandles(s.symbol);
        if (candles.length < 40) continue;

        for (let i = 30; i < candles.length - 1; i++) {
            const candleDate = new Date(candles[i].timestamp);
            if (candleDate < start || candleDate > end) continue;
            if (candleDate.getDay() === 0 || candleDate.getDay() === 6) continue;

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
                    i += trade.holdDays;
                }
            }
        }
    }

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

    console.log(`[LT_SWING_BO_UP] Done: ${stats.totalTrades} trades, WR: ${stats.winRate.toFixed(1)}%, P&L: ${stats.totalPnl.toFixed(2)}%`);
    return { trades: allTrades, stats };
}

module.exports = { CONFIG, backtest, getCategoryStocks, getDailyCandles };
