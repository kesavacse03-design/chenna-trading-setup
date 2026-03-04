/**
 * LONG_TERM_BO_UP Strategy - Major Weekly Breakout
 * Weekly 52-week high zone breakout, hold 2-4 weeks
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const CONFIG = {
    name: 'LONG_TERM_BO_UP', displayName: '52-Week High Breakout',
    category: 'LONG_TERM_BO_UP', direction: 'LONG',
    lookbackDays: 52 * 5, // ~52 weeks in trading days
    breakoutBuffer: 1.0, minVolumeFactor: 2.0,
    targetPercent: 8.0, stopPercent: 3.0, maxHoldDays: 20,
    entryDays: [4, 5],
};

async function getDailyCandles(symbol) {
    const cached = await prisma.ohlcvCache.findFirst({ where: { symbol, interval: 'day' }, orderBy: { createdAt: 'desc' } });
    if (!cached?.data) return [];
    let candles = typeof cached.data === 'string' ? JSON.parse(cached.data) : cached.data;
    return candles.map(c => Array.isArray(c) ? { timestamp: c[0], open: +c[1], high: +c[2], low: +c[3], close: +c[4], volume: +c[5] } :
        { ...c, open: +c.open, high: +c.high, low: +c.low, close: +c.close, volume: +c.volume }).sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
}

async function getCategoryStocks() {
    const cat = await prisma.category.findUnique({ where: { key: CONFIG.category }, include: { stocks: { include: { stock: true } } } });
    return cat ? cat.stocks.map(sc => ({ symbol: sc.stock.symbol })) : [];
}

async function generateSignal(symbol, candles, date) {
    // Use available data if less than full lookback
    const lookback = Math.min(CONFIG.lookbackDays, candles.length - 5);
    if (lookback < 20) return null;
    if (!CONFIG.entryDays.includes(new Date(date).getDay())) return null;

    const f = candles.filter(c => new Date(c.timestamp) <= new Date(date));
    const today = f[f.length - 1];
    const yearHigh = Math.max(...f.slice(-lookback - 1, -1).map(c => c.high));
    const breakout = ((today.close - yearHigh) / yearHigh) * 100;
    if (breakout < CONFIG.breakoutBuffer) return null;

    const avgVol = f.slice(-20).reduce((s, c) => s + c.volume, 0) / 20;
    if (today.volume < avgVol * CONFIG.minVolumeFactor) return null;

    return {
        symbol, category: CONFIG.category, strategy: CONFIG.name, direction: 'LONG',
        entryPrice: today.close, targetPrice: today.close * (1 + CONFIG.targetPercent / 100), stopPrice: yearHigh * (1 - CONFIG.stopPercent / 100),
        reason: `52-week high breakout +${breakout.toFixed(2)}%! Vol ${(today.volume / avgVol).toFixed(1)}x`, confidence: 70, timestamp: date, maxHoldDays: CONFIG.maxHoldDays
    };
}

async function simulateTrade(signal, candles, idx) {
    let exit = signal.entryPrice, reason = 'MAX_HOLD', days = 0;
    for (let i = idx + 1; i < candles.length && days < CONFIG.maxHoldDays; i++) {
        days++;
        if (candles[i].low <= signal.stopPrice) { exit = signal.stopPrice; reason = 'STOP'; break; }
        if (candles[i].high >= signal.targetPrice) { exit = signal.targetPrice; reason = 'TARGET'; break; }
        exit = candles[i].close;
    }
    return { ...signal, exitPrice: exit, exitReason: reason, holdDays: days, pnlPercent: ((exit - signal.entryPrice) / signal.entryPrice) * 100, outcome: exit > signal.entryPrice ? 'WIN' : 'LOSS' };
}

async function backtest(start, end) {
    const trades = [];
    for (const s of await getCategoryStocks()) {
        const candles = await getDailyCandles(s.symbol);
        for (let d = new Date(start); d <= new Date(end); d.setDate(d.getDate() + 1)) {
            if (d.getDay() === 0 || d.getDay() === 6) continue;
            const sig = await generateSignal(s.symbol, candles, d.toISOString().split('T')[0]);
            if (sig) { const idx = candles.findIndex(c => new Date(c.timestamp).toISOString().split('T')[0] === d.toISOString().split('T')[0]); if (idx >= 0) trades.push(await simulateTrade(sig, candles, idx)); }
        }
    }
    return { trades, stats: { totalTrades: trades.length, winRate: trades.length ? (trades.filter(t => t.outcome === 'WIN').length / trades.length) * 100 : 0 } };
}

module.exports = { CONFIG, generateSignal, simulateTrade, backtest, getCategoryStocks, getDailyCandles };
