/**
 * Technical Validation Module
 * 
 * CRITICAL: These checks are what differentiate 40% success rate from 80%!
 * Based on Phase 2 analysis findings for SHORT_TERM_SWING_BO_DOWN
 * 
 * Key findings:
 * - 88% of winners were at support level (within 2% of 10-day low)
 * - 98% of winning stocks were below 20-day MA (downtrend)
 * - Most winners had recent breakdown (>2% decline in last 3 days)
 * - Normal volume (not spike) preferred
 * 
 * IMPORTANT: All functions are DATE-AWARE to prevent future data leakage
 * When backtesting for Jan 2, only data up to Jan 2 is visible!
 */

const priceService = require('../priceService.cjs');

/**
 * Get historical OHLC data for a stock AS OF a specific date
 * @param {string} symbol - Stock symbol
 * @param {string} instrumentKey - Upstox instrument key
 * @param {number} days - Number of days of history to fetch
 * @param {Date} asOfDate - The date to fetch data as of (NO FUTURE DATA!)
 * @returns {Array} Array of OHLC candle data
 */
async function getHistoricalData(symbol, instrumentKey, days = 20, asOfDate = new Date()) {
    try {
        // CRITICAL: Use asOfDate, NOT current date!
        const endDate = new Date(asOfDate);
        const startDate = new Date(asOfDate);
        startDate.setDate(startDate.getDate() - days - 5); // Extra buffer for weekends/holidays

        const fromDate = startDate.toISOString().split('T')[0];
        const toDate = endDate.toISOString().split('T')[0];

        console.log(`[TechValid] Fetching ${symbol} data: ${fromDate} → ${toDate} (as of ${toDate})`);

        const data = await priceService.fetchPrice(symbol, instrumentKey, fromDate, toDate);

        if (!data || data.length === 0) {
            console.log(`[TechValid] ${symbol}: No data found for date range`);
            return [];
        }

        // VALIDATION: Ensure no future data leaked in
        // Note: Cached data uses 'timestamp' field, not 'date'
        const filteredData = data.filter(d => {
            const candleDate = new Date(d.timestamp || d.date);
            return candleDate <= endDate;
        });

        if (filteredData.length !== data.length) {
            console.log(`[TechValid] ⚠️ ${symbol}: Filtered out ${data.length - filteredData.length} future candles!`);
        }

        // Return last N days of data
        return filteredData.slice(-days);
    } catch (error) {
        console.log(`[TechnicalValidation] Error fetching history for ${symbol}: ${error.message}`);
        return [];
    }
}

/**
 * CHECK 1: Is stock at support level?
 * 88% of winners were at support (within 2% of 10-day low)
 * 
 * @param {number} currentPrice - Current stock price
 * @param {Array} historicalData - Last 10+ days of OHLC data
 * @returns {object} { isValid: boolean, details: string }
 */
function isAtSupport(currentPrice, historicalData) {
    if (!historicalData || historicalData.length < 5) {
        return { isValid: false, details: 'Insufficient historical data' };
    }

    // Find 10-day low (or available days low)
    const lows = historicalData.slice(-10).map(d => d.low);
    const low10d = Math.min(...lows);

    // Check if current price within 2% of 10-day low
    const supportRange = low10d * 1.02; // 2% above low = support zone
    const isValid = currentPrice <= supportRange;

    const distanceFromLow = ((currentPrice - low10d) / low10d * 100).toFixed(2);

    return {
        isValid,
        low10d: low10d.toFixed(2),
        distanceFromLow: `${distanceFromLow}%`,
        details: isValid
            ? `At support (${distanceFromLow}% from 10d low ₹${low10d.toFixed(2)})`
            : `NOT at support (${distanceFromLow}% above 10d low ₹${low10d.toFixed(2)})`
    };
}

/**
 * CHECK 2: Is stock below 20-day Moving Average?
 * 98% of winning stocks were in downtrend (below 20MA)
 * 
 * @param {number} currentPrice - Current stock price
 * @param {Array} historicalData - Last 20+ days of OHLC data
 * @returns {object} { isValid: boolean, details: string }
 */
function isBelowMA(currentPrice, historicalData) {
    if (!historicalData || historicalData.length < 10) {
        return { isValid: false, details: 'Insufficient data for MA calculation' };
    }

    // Calculate 20-day moving average (or available data)
    const closes = historicalData.slice(-20).map(d => d.close);
    const ma20 = closes.reduce((a, b) => a + b, 0) / closes.length;

    const isValid = currentPrice < ma20;
    const distanceFromMA = ((currentPrice - ma20) / ma20 * 100).toFixed(2);

    return {
        isValid,
        ma20: ma20.toFixed(2),
        distanceFromMA: `${distanceFromMA}%`,
        details: isValid
            ? `In downtrend (${distanceFromMA}% below ${closes.length}MA ₹${ma20.toFixed(2)})`
            : `NOT in downtrend (${distanceFromMA}% above ${closes.length}MA ₹${ma20.toFixed(2)})`
    };
}

/**
 * CHECK 3: Has stock had recent breakdown?
 * Looking for >2% decline in last 3 days (sharp selling pressure)
 * 
 * @param {Array} historicalData - Last 5+ days of OHLC data
 * @returns {object} { isValid: boolean, details: string }
 */
function hasRecentBreakdown(historicalData) {
    if (!historicalData || historicalData.length < 4) {
        return { isValid: false, details: 'Insufficient data for breakdown check' };
    }

    // Get prices: 3 days ago vs today
    const recentData = historicalData.slice(-5);
    const price3daysAgo = recentData[recentData.length - 4]?.close;
    const priceToday = recentData[recentData.length - 1]?.close;

    if (!price3daysAgo || !priceToday) {
        return { isValid: false, details: 'Missing price data' };
    }

    const declinePercent = ((priceToday - price3daysAgo) / price3daysAgo) * 100;
    const isValid = declinePercent < -2; // More than 2% decline

    return {
        isValid,
        declinePercent: declinePercent.toFixed(2),
        details: isValid
            ? `Recent breakdown (${declinePercent.toFixed(2)}% in 3 days)`
            : `No breakdown (${declinePercent.toFixed(2)}% in 3 days, need <-2%)`
    };
}

/**
 * CHECK 4: Is volume normal (not spiking)?
 * Low/normal volume preferred - no panic selling or news-driven moves
 * 
 * @param {number} todayVolume - Today's trading volume
 * @param {Array} historicalData - Last 20+ days of OHLC data
 * @returns {object} { isValid: boolean, details: string }
 */
function hasNormalVolume(todayVolume, historicalData) {
    if (!historicalData || historicalData.length < 5 || !todayVolume) {
        // If no volume data, pass the check (conservative approach)
        return { isValid: true, details: 'Volume data unavailable - skipping check' };
    }

    // Calculate average volume (last 20 days)
    const volumes = historicalData.slice(-20).map(d => d.volume).filter(v => v > 0);

    if (volumes.length === 0) {
        return { isValid: true, details: 'No volume history - skipping check' };
    }

    const avgVolume = volumes.reduce((a, b) => a + b, 0) / volumes.length;

    // Check if today's volume < 1.5x average (not a spike)
    const isValid = todayVolume < (avgVolume * 1.5);
    const volumeRatio = (todayVolume / avgVolume).toFixed(2);

    return {
        isValid,
        avgVolume: Math.round(avgVolume),
        todayVolume: Math.round(todayVolume),
        volumeRatio: `${volumeRatio}x`,
        details: isValid
            ? `Normal volume (${volumeRatio}x average)`
            : `Volume spike (${volumeRatio}x average, limit 1.5x)`
    };
}

/**
 * Run ALL technical validations for a stock
 * Returns combined result with pass/fail for each check
 * 
 * @param {string} symbol - Stock symbol
 * @param {string} instrumentKey - Upstox instrument key  
 * @param {number} currentPrice - Current stock price
 * @param {number} todayVolume - Today's volume (optional)
 * @param {Date} asOfDate - Date to validate as of (for backtesting, prevents future data leakage)
 * @returns {object} Combined validation results
 */
async function validateTechnicalConditions(symbol, instrumentKey, currentPrice, todayVolume = 0, asOfDate = new Date()) {
    const dateStr = asOfDate.toISOString().split('T')[0];
    console.log(`[TechValid] Validating ${symbol} at ₹${currentPrice} as of ${dateStr}...`);

    // Fetch historical data (25 days covers all checks) - CRITICAL: Pass asOfDate!
    const historicalData = await getHistoricalData(symbol, instrumentKey, 25, asOfDate);

    if (historicalData.length < 5) {
        console.log(`[TechValid] ${symbol} @ ${dateStr}: Insufficient historical data (${historicalData.length} days)`);
        return {
            isValid: false,
            passedChecks: 0,
            totalChecks: 4,
            reason: 'Insufficient historical data',
            checks: {
                support: { isValid: false, details: 'No data' },
                belowMA: { isValid: false, details: 'No data' },
                breakdown: { isValid: false, details: 'No data' },
                volume: { isValid: true, details: 'Skipped' }
            }
        };
    }

    console.log(`[TechValid] ${symbol} @ ${dateStr}: Got ${historicalData.length} days of data`);

    // Run all checks
    const supportCheck = isAtSupport(currentPrice, historicalData);
    const maCheck = isBelowMA(currentPrice, historicalData);
    const breakdownCheck = hasRecentBreakdown(historicalData);
    const volumeCheck = hasNormalVolume(todayVolume, historicalData);

    // Count passed checks
    const checks = {
        support: supportCheck,
        belowMA: maCheck,
        breakdown: breakdownCheck,
        volume: volumeCheck
    };

    // Support and MA are CRITICAL (must pass)
    // Breakdown and Volume are PREFERRED (nice to have)
    const criticalPassed = supportCheck.isValid && maCheck.isValid;
    const passedCount = Object.values(checks).filter(c => c.isValid).length;

    const isValid = criticalPassed && passedCount >= 3; // Critical + at least 1 more

    const reason = isValid
        ? `Technical validation PASSED (${passedCount}/4 checks)`
        : `Technical validation FAILED: ` +
        (!supportCheck.isValid ? 'Not at support. ' : '') +
        (!maCheck.isValid ? 'Not in downtrend. ' : '') +
        (!breakdownCheck.isValid ? 'No recent breakdown. ' : '') +
        (!volumeCheck.isValid ? 'Volume spike. ' : '');

    console.log(`[TechValid] ${symbol}: ${reason}`);

    return {
        isValid,
        passedChecks: passedCount,
        totalChecks: 4,
        criticalPassed,
        reason,
        checks
    };
}

module.exports = {
    getHistoricalData,
    isAtSupport,
    isBelowMA,
    hasRecentBreakdown,
    hasNormalVolume,
    validateTechnicalConditions
};
