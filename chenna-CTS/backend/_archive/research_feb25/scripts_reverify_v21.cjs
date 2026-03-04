/**
 * V2.1 Re-verification Script - With Duplicate Prevention
 * 
 * This runs the backtest with proper deduplication to get accurate results
 */
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const CONFIG = {
    TARGET_PERCENT: 1.5,
    VOLUME_THRESHOLD: 1.5,
    EXIT_TIME: '15:15',
    MIN_CANDLES: 100,
    MAX_OR_WIDTH_PERCENT: 2.0,
    MIN_OR_CANDLES: 5,
    MAX_OR_CANDLES: 30,
    MIN_WAIT_AFTER_OR: 15,
    MAX_WAIT_AFTER_OR: 45,
    MAX_BODY_RATIO: 0.7,
    BREAKOUT_VOLUME_MULT: 2.0,
    MIN_BREAKOUT_STRENGTH: 0.005,
    EMA_PERIOD: 20,
    MAX_EMA_DEVIATION: 0.01
};

async function get1MinCandles(symbol, date) {
    const targetDateStr = typeof date === 'string' ? date.split('T')[0] : new Date(date).toISOString().split('T')[0];
    const cached = await prisma.ohlcvCache.findFirst({ where: { symbol, interval: '5m' } });
    if (!cached || !cached.data) return [];

    return cached.data
        .filter(c => c.timestamp && c.timestamp.split('T')[0] === targetDateStr)
        .filter(c => {
            const timePart = c.timestamp.split('T')[1];
            const hours = parseInt(timePart.substring(0, 2), 10);
            const minutes = parseInt(timePart.substring(3, 5), 10);
            const timeNum = hours * 100 + minutes;
            return timeNum >= 915 && timeNum <= 1530;
        })
        .sort((a, b) => a.timestamp.localeCompare(b.timestamp));
}

async function getAvgVolume(symbol, date) {
    const targetDateStr = typeof date === 'string' ? date.split('T')[0] : new Date(date).toISOString().split('T')[0];
    const cached = await prisma.ohlcvCache.findFirst({ where: { symbol, interval: 'day' } });
    if (!cached || !cached.data || cached.data.length < 10) return null;

    const priorCandles = cached.data
        .filter(c => {
            const candleDateStr = typeof c.timestamp === 'string' ? c.timestamp.split('T')[0] : new Date(c.timestamp).toISOString().split('T')[0];
            return candleDateStr < targetDateStr;
        })
        .slice(-20);

    if (priorCandles.length < 10) return null;
    return priorCandles.reduce((sum, c) => sum + (c.volume || 0), 0) / priorCandles.length;
}

async function getIntradayStocks(categoryName) {
    const category = await prisma.category.findFirst({
        where: { key: categoryName },
        include: { stocks: { include: { stock: true } } }
    });
    if (!category) return [];

    const symbolsWithData = await prisma.$queryRaw`SELECT DISTINCT symbol FROM ohlcv_cache WHERE interval = '5m'`;
    const validSymbols = new Set(symbolsWithData.map(r => r.symbol));

    return category.stocks
        .filter(sc => sc.stock && validSymbols.has(sc.stock.symbol))
        .map(sc => ({ symbol: sc.stock.symbol }));
}

function isGreen(c) { return c.close > c.open; }

function calculateEMA(candles, period) {
    if (candles.length < period) return null;
    const multiplier = 2 / (period + 1);
    let sum = 0;
    for (let i = 0; i < period; i++) sum += candles[i].close;
    let ema = sum / period;
    for (let i = period; i < candles.length; i++) ema = (candles[i].close - ema) * multiplier + ema;
    return ema;
}

function detectOpeningRange(candles) {
    if (candles.length < CONFIG.MIN_OR_CANDLES) return null;
    const firstIsGreen = isGreen(candles[0]);
    let orHigh = candles[0].high, orLow = candles[0].low, endIndex = 0;

    for (let i = 1; i < Math.min(candles.length, CONFIG.MAX_OR_CANDLES); i++) {
        orHigh = Math.max(orHigh, candles[i].high);
        orLow = Math.min(orLow, candles[i].low);
        if ((firstIsGreen && !isGreen(candles[i])) || (!firstIsGreen && isGreen(candles[i]))) {
            endIndex = i;
            break;
        }
    }
    if (endIndex === 0) return null;

    const rangePercent = ((orHigh - orLow) / orLow) * 100;
    if (rangePercent > CONFIG.MAX_OR_WIDTH_PERCENT) return null;

    return { high: orHigh, low: orLow, endIndex, rangePercent };
}

function detectNPattern(candles, or) {
    let pullbackLow = Infinity, pullbackIdx = -1, breakoutIdx = -1, breakoutCandle = null;
    const maxIdx = Math.min(candles.length, or.endIndex + 1 + CONFIG.MAX_WAIT_AFTER_OR);

    for (let i = or.endIndex + 1; i < maxIdx; i++) {
        const c = candles[i];
        if (c.low < pullbackLow) { pullbackLow = c.low; pullbackIdx = i; }

        if (c.high > or.high) {
            const minsAfterOR = i - or.endIndex;
            if (minsAfterOR >= CONFIG.MIN_WAIT_AFTER_OR && pullbackLow > or.low) {
                breakoutIdx = i;
                breakoutCandle = c;
                return { breakoutIdx, pullbackLow, pullbackIdx, breakoutCandle };
            }
            return null;
        }
    }
    return null;
}

function applyEnhancedFilters(candles, or, nPattern, avgDailyVolume) {
    let checks = 0;

    // EMA check
    const emaCandles = candles.slice(0, nPattern.pullbackIdx + 1);
    const ema20 = calculateEMA(emaCandles, CONFIG.EMA_PERIOD);
    if (ema20) {
        const deviation = Math.abs(nPattern.pullbackLow - ema20) / ema20;
        if (deviation <= CONFIG.MAX_EMA_DEVIATION) checks++;
    }

    // Breakout strength
    const breakoutStrength = (nPattern.breakoutCandle.high - or.high) / or.high;
    if (breakoutStrength >= CONFIG.MIN_BREAKOUT_STRENGTH) checks++;

    // Volume at breakout
    const avgCandleVol = avgDailyVolume / 375;
    if ((nPattern.breakoutCandle.volume || 0) >= avgCandleVol * CONFIG.BREAKOUT_VOLUME_MULT) checks++;

    return checks >= 2;
}

async function runCleanBacktest() {
    console.log('═'.repeat(70));
    console.log('V2.1 RE-VERIFICATION (WITH DUPLICATE FIX)');
    console.log('═'.repeat(70));

    const dates = [
        '2026-01-02', '2026-01-05', '2026-01-06', '2026-01-07', '2026-01-08', '2026-01-09',
        '2026-01-12', '2026-01-13', '2026-01-14', '2026-01-16', '2026-01-19'
    ];

    const allTrades = [];
    const seenSignals = new Set();

    for (const dateStr of dates) {
        const date = new Date(dateStr);
        if (date.getDay() === 0 || date.getDay() === 6) continue;

        console.log(`\nProcessing ${dateStr}...`);

        const stocks = await getIntradayStocks('INTRADAY_BOOST');
        let daySignals = 0;

        for (const stock of stocks) {
            const candles = await get1MinCandles(stock.symbol, dateStr);
            if (candles.length < CONFIG.MIN_CANDLES) continue;

            // Volume check
            const first5 = candles.slice(0, 5);
            const openingVol = first5.reduce((s, c) => s + (c.volume || 0), 0);
            const avgDailyVol = await getAvgVolume(stock.symbol, dateStr);
            if (!avgDailyVol) continue;

            const volRatio = openingVol / (avgDailyVol * 0.03);
            if (volRatio < CONFIG.VOLUME_THRESHOLD) continue;

            // Opening Range
            const or = detectOpeningRange(candles);
            if (!or) continue;

            // N-Pattern
            const nPattern = detectNPattern(candles, or);
            if (!nPattern) continue;

            // Enhanced Filters
            if (!applyEnhancedFilters(candles, or, nPattern, avgDailyVol)) continue;

            // Create signal key for deduplication
            const entryTime = nPattern.breakoutCandle.timestamp.split('T')[1].substring(0, 5);
            const signalKey = `${dateStr}-${stock.symbol}-${entryTime}`;

            if (seenSignals.has(signalKey)) continue;
            seenSignals.add(signalKey);

            daySignals++;

            // Trade simulation
            const entryPrice = or.high;
            const targetPrice = entryPrice * 1.015;
            const stopPrice = nPattern.pullbackLow;

            let exitPrice = entryPrice, exitReason = 'EOD_EXIT', outcome = 'LOSS';

            for (let i = nPattern.breakoutIdx; i < candles.length; i++) {
                const c = candles[i];
                if (c.high >= targetPrice) {
                    exitPrice = targetPrice;
                    exitReason = 'TARGET_HIT';
                    outcome = 'WIN';
                    break;
                }
                if (c.low <= stopPrice) {
                    exitPrice = stopPrice;
                    exitReason = 'STOP_HIT';
                    outcome = 'LOSS';
                    break;
                }
            }

            if (exitReason === 'EOD_EXIT') {
                exitPrice = candles[candles.length - 1].close;
                outcome = exitPrice > entryPrice ? 'WIN' : 'LOSS';
            }

            const pnl = ((exitPrice - entryPrice) / entryPrice * 100);

            allTrades.push({
                date: dateStr,
                symbol: stock.symbol,
                entryTime,
                outcome,
                exitReason,
                pnl
            });
        }

        console.log(`  Unique signals: ${daySignals}`);
    }

    // Calculate results
    const winners = allTrades.filter(t => t.outcome === 'WIN');
    const losers = allTrades.filter(t => t.outcome === 'LOSS');
    const winRate = allTrades.length > 0 ? (winners.length / allTrades.length * 100) : 0;
    const totalPnL = allTrades.reduce((s, t) => s + t.pnl, 0);
    const avgPnL = allTrades.length > 0 ? totalPnL / allTrades.length : 0;

    const targetHits = allTrades.filter(t => t.exitReason === 'TARGET_HIT').length;
    const stopHits = allTrades.filter(t => t.exitReason === 'STOP_HIT').length;
    const eodExits = allTrades.filter(t => t.exitReason === 'EOD_EXIT').length;

    console.log('\n' + '═'.repeat(70));
    console.log('CLEAN RESULTS (NO DUPLICATES)');
    console.log('═'.repeat(70));
    console.log(`\nTotal Unique Trades: ${allTrades.length}`);
    console.log(`Winners: ${winners.length} (${winRate.toFixed(1)}%)`);
    console.log(`Losers: ${losers.length} (${(100 - winRate).toFixed(1)}%)`);
    console.log(`\nTotal P&L: ${totalPnL >= 0 ? '+' : ''}${totalPnL.toFixed(2)}%`);
    console.log(`Avg P&L per trade: ${avgPnL >= 0 ? '+' : ''}${avgPnL.toFixed(3)}%`);
    console.log(`\nExit Breakdown:`);
    console.log(`  TARGET_HIT: ${targetHits} (${(targetHits / allTrades.length * 100).toFixed(1)}%)`);
    console.log(`  STOP_HIT: ${stopHits} (${(stopHits / allTrades.length * 100).toFixed(1)}%)`);
    console.log(`  EOD_EXIT: ${eodExits} (${(eodExits / allTrades.length * 100).toFixed(1)}%)`);
    console.log('\n' + '═'.repeat(70));
}

runCleanBacktest().finally(() => prisma.$disconnect());
