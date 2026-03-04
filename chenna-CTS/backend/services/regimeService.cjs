/**
 * Market Regime Service
 * Calculates market regime context (NIFTY trend, breadth, volatility) for any historical date
 * Used by Labs and Backtest to think "like a real trader on that date"
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// Simple Moving Average calculation
function calculateSMA(prices, period) {
    if (prices.length < period) return null;
    const slice = prices.slice(-period);
    return slice.reduce((sum, p) => sum + p, 0) / period;
}

// Exponential Moving Average calculation
function calculateEMA(prices, period) {
    if (prices.length < period) return null;

    // Initial EMA is just an SMA of the first `period` limits
    const k = 2 / (period + 1);
    let ema = prices.slice(0, period).reduce((sum, p) => sum + p, 0) / period;

    for (let i = period; i < prices.length; i++) {
        ema = (prices[i] - ema) * k + ema;
    }

    return ema;
}

// Average True Range for volatility
function calculateATR(candles, period = 14) {
    if (candles.length < period + 1) return null;

    const trueRanges = [];
    for (let i = 1; i < candles.length; i++) {
        const high = candles[i].high;
        const low = candles[i].low;
        const prevClose = candles[i - 1].close;

        const tr = Math.max(
            high - low,
            Math.abs(high - prevClose),
            Math.abs(low - prevClose)
        );
        trueRanges.push(tr);
    }

    if (trueRanges.length < period) return null;
    const atr = trueRanges.slice(-period).reduce((sum, tr) => sum + tr, 0) / period;
    return atr;
}

/**
 * Get market regime for a specific date
 * This calculates regime using ONLY data available up to that date (no future leakage)
 * 
 * @param {Date|string} targetDate - The historical date to calculate regime for
 * @param {string} categoryKey - Optional: category for breadth calculation
 * @returns {Object} Market regime context
 */
async function getMarketRegime(targetDate, categoryKey = null) {
    const date = new Date(targetDate);

    try {
        // Try to get NIFTY50 index data (symbol: "NIFTY 50" or "NIFTY50")
        let niftyCandles = await getNiftyCandles(date);
        let niftyTrend = 'neutral';
        let niftyPrice = 0;
        let niftySMA50 = 0;
        let niftyEMA20 = 0;

        if (niftyCandles && niftyCandles.length >= 50) {
            const closes = niftyCandles.map(c => c.close);
            niftyPrice = closes[closes.length - 1];
            niftySMA50 = calculateSMA(closes, 50);
            niftyEMA20 = calculateEMA(closes, 20);

            if (niftySMA50) {
                const diff = ((niftyPrice - niftySMA50) / niftySMA50) * 100;
                if (diff > 2) niftyTrend = 'bullish';
                else if (diff < -2) niftyTrend = 'bearish';
                else niftyTrend = 'neutral';
            }
        } else {
            // Fallback: estimate from category stocks if no NIFTY data
            const breadthResult = await calculateMarketBreadth(date, categoryKey);
            if (breadthResult.breadth > 0.6) niftyTrend = 'bullish';
            else if (breadthResult.breadth < 0.4) niftyTrend = 'bearish';
            else niftyTrend = 'neutral';
        }

        // Calculate market breadth (% of stocks above their SMA200)
        const breadthResult = await calculateMarketBreadth(date, categoryKey);

        // Calculate volatility state from NIFTY ATR or estimate
        let volatilityState = 'medium';
        if (niftyCandles && niftyCandles.length >= 20) {
            const atr = calculateATR(niftyCandles, 14);
            const avgPrice = niftyCandles[niftyCandles.length - 1].close;
            const atrPercent = atr ? (atr / avgPrice) * 100 : 1;

            if (atrPercent > 2) volatilityState = 'high';
            else if (atrPercent < 1) volatilityState = 'low';
            else volatilityState = 'medium';
        }

        return {
            date: date.toISOString().split('T')[0],
            niftyTrend,
            niftyPrice,
            niftySMA50,
            niftyEMA20,
            breadth: breadthResult.breadth,
            breadthStocksAbove: breadthResult.stocksAbove,
            breadthTotal: breadthResult.totalStocks,
            volatilityState,
            regimeScore: calculateRegimeScore(niftyTrend, breadthResult.breadth, volatilityState),
            recommendation: getRegimeRecommendation(niftyTrend, breadthResult.breadth, volatilityState)
        };
    } catch (error) {
        console.error('[RegimeService] Error calculating regime:', error);
        return {
            date: date.toISOString().split('T')[0],
            niftyTrend: 'unknown',
            breadth: 0.5,
            volatilityState: 'medium',
            regimeScore: 0,
            recommendation: 'neutral',
            error: error.message
        };
    }
}

/**
 * Get NIFTY candles up to target date
 */
async function getNiftyCandles(targetDate) {
    // Try different NIFTY symbol variations
    const niftySymbols = ['NIFTY 50', 'NIFTY50', 'NIFTY', '^NSEI'];

    for (const symbol of niftySymbols) {
        const cached = await prisma.ohlcvCache.findFirst({
            where: { symbol, interval: 'day' },
            orderBy: { createdAt: 'desc' }
        });

        if (cached && cached.data) {
            let candles = cached.data;
            if (typeof candles === 'string') {
                candles = JSON.parse(candles);
            }

            // Filter candles up to target date
            const filteredCandles = candles.filter(c => {
                const candleDate = new Date(c.timestamp || c.date);
                return candleDate <= targetDate;
            });

            if (filteredCandles.length > 0) {
                return filteredCandles;
            }
        }
    }

    return null;
}

/**
 * Calculate market breadth (% of stocks above SMA200) for a date
 */
async function calculateMarketBreadth(targetDate, categoryKey = null) {
    try {
        // Get stocks to analyze
        let stocks = [];

        if (categoryKey) {
            // Get stocks from specific category
            const categoryStocks = await prisma.stockCategory.findMany({
                where: { category: { key: categoryKey } },
                include: { stock: true }
            });
            stocks = categoryStocks.map(sc => sc.stock.symbol);
        } else {
            // Get all category stocks (no enabled filter - field doesn't exist)
            const allCategories = await prisma.category.findMany({
                include: {
                    stocks: { include: { stock: true } }
                }
            });
            stocks = allCategories.flatMap(c =>
                c.stocks.map(sc => sc.stock.symbol)
            );
            stocks = [...new Set(stocks)]; // Unique symbols
        }

        if (stocks.length === 0) {
            return { breadth: 0.5, stocksAbove: 0, totalStocks: 0 };
        }

        let stocksAbove = 0;
        let analyzedCount = 0;

        for (const symbol of stocks.slice(0, 50)) { // Limit to 50 for performance
            const cached = await prisma.ohlcvCache.findFirst({
                where: { symbol, interval: 'day' }
            });

            if (!cached || !cached.data) continue;

            let candles = cached.data;
            if (typeof candles === 'string') {
                candles = JSON.parse(candles);
            }

            // Filter candles up to target date
            const historical = candles.filter(c => {
                const candleDate = new Date(c.timestamp || c.date);
                return candleDate <= targetDate;
            });

            if (historical.length < 200) continue;

            // Check if current price is above SMA200
            const closes = historical.map(c => parseFloat(c.close) || 0);
            const currentPrice = closes[closes.length - 1];
            const sma200 = calculateSMA(closes, 200);

            if (sma200 && currentPrice > sma200) {
                stocksAbove++;
            }
            analyzedCount++;
        }

        const breadth = analyzedCount > 0 ? stocksAbove / analyzedCount : 0.5;

        return {
            breadth,
            stocksAbove,
            totalStocks: analyzedCount
        };
    } catch (error) {
        console.error('[RegimeService] Breadth calculation error:', error);
        return { breadth: 0.5, stocksAbove: 0, totalStocks: 0 };
    }
}

/**
 * Calculate overall regime score (0-100)
 */
function calculateRegimeScore(trend, breadth, volatility) {
    let score = 50;

    // Trend contribution (+/- 30 points)
    if (trend === 'bullish') score += 30;
    else if (trend === 'bearish') score -= 30;

    // Breadth contribution (+/- 20 points)
    score += (breadth - 0.5) * 40; // -20 to +20

    // Volatility adjustment
    if (volatility === 'high') score -= 10; // High vol = cautious
    else if (volatility === 'low') score += 5; // Low vol = stable

    return Math.max(0, Math.min(100, Math.round(score)));
}

/**
 * Get trading recommendation based on regime
 */
function getRegimeRecommendation(trend, breadth, volatility) {
    if (trend === 'bullish' && breadth > 0.6) {
        return 'aggressive_long';
    } else if (trend === 'bullish' && breadth > 0.4) {
        return 'moderate_long';
    } else if (trend === 'bearish' && breadth < 0.4) {
        return 'defensive';
    } else if (volatility === 'high') {
        return 'cautious';
    } else {
        return 'neutral';
    }
}

/**
 * Check if regime allows entries (used by Labs)
 */
function shouldAllowEntry(regime, entryType = 'swing') {
    // For swing trades, avoid high volatility bearish markets
    if (entryType === 'swing') {
        if (regime.niftyTrend === 'bearish' && regime.volatilityState === 'high') {
            return false;
        }
        if (regime.regimeScore < 30) {
            return false;
        }
    }
    return true;
}

module.exports = {
    getMarketRegime,
    calculateMarketBreadth,
    shouldAllowEntry,
    calculateSMA,
    calculateATR
};
