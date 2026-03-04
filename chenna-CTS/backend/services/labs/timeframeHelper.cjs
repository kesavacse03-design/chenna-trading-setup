/**
 * Timeframe Helper - Dynamic timeframe selection based on TradeCode methodology
 * 
 * From Video: 
 * - 9:15 - 11:30 AM: Use 3-minute charts
 * - After 11:30 AM: Use 5-minute charts
 * - Gap plays: Use 1-minute charts
 * 
 * This utility helps all intraday strategies use the correct timeframe.
 */

/**
 * Get optimal timeframe based on current time (IST)
 * @param {Date|string} currentTime - Current timestamp
 * @param {string} tradeType - 'GAP' | 'ORB' | 'SWING' | 'DEFAULT'
 * @returns {string} - '1minute' | '3minute' | '5minute'
 */
function getOptimalTimeframe(currentTime, tradeType = 'DEFAULT') {
    // Gap plays always use 1-minute
    if (tradeType === 'GAP') {
        return '1minute';
    }

    const time = new Date(currentTime);
    const hours = time.getHours();
    const minutes = time.getMinutes();
    const timeValue = hours + (minutes / 60);

    // Before 11:30 AM → 3-minute
    // After 11:30 AM → 5-minute
    if (timeValue < 11.5) {
        return '3minute';
    } else {
        return '5minute';
    }
}

/**
 * Convert timeframe string to minutes
 */
function timeframeToMinutes(timeframe) {
    const mapping = {
        '1minute': 1,
        '3minute': 3,
        '5minute': 5,
        '15minute': 15,
        '30minute': 30,
        '60minute': 60,
        '1hour': 60,
        'day': 1440
    };
    return mapping[timeframe] || 5;
}

/**
 * Get trading session phase based on time
 * @returns 'OPENING' | 'MID_MORNING' | 'MIDDAY' | 'AFTERNOON' | 'CLOSING' | 'CLOSED'
 */
function getTradingPhase(timestamp) {
    const time = new Date(timestamp);
    const hours = time.getHours();
    const minutes = time.getMinutes();
    const timeValue = hours * 60 + minutes;

    if (timeValue < 9 * 60 + 15) return 'CLOSED';      // Before 9:15
    if (timeValue < 10 * 60) return 'OPENING';          // 9:15 - 10:00
    if (timeValue < 11 * 60 + 30) return 'MID_MORNING'; // 10:00 - 11:30
    if (timeValue < 13 * 60 + 30) return 'MIDDAY';      // 11:30 - 13:30
    if (timeValue < 15 * 60) return 'AFTERNOON';         // 13:30 - 15:00
    if (timeValue < 15 * 60 + 30) return 'CLOSING';     // 15:00 - 15:30
    return 'CLOSED';                                     // After 15:30
}

/**
 * Get recommended strategies for current phase
 */
function getRecommendedStrategies(phase) {
    const strategies = {
        'OPENING': ['GAP_SHORT', 'ORB', 'MOMENTUM'],
        'MID_MORNING': ['ORB', 'LEG', 'DIVERGENCE'],
        'MIDDAY': ['CONSOLIDATION', 'LEG', 'RANGE'],
        'AFTERNOON': ['DIVERGENCE', 'LEG', 'REVERSAL'],
        'CLOSING': ['NONE'],  // Avoid new entries
        'CLOSED': []
    };
    return strategies[phase] || [];
}

/**
 * Helper to check if market is open
 */
function isMarketOpen(timestamp) {
    const phase = getTradingPhase(timestamp);
    return !['CLOSED', 'CLOSING'].includes(phase);
}

/**
 * Get next market event time (open, close, etc.)
 */
function getNextMarketEvent(timestamp) {
    const time = new Date(timestamp);
    const hours = time.getHours();
    const minutes = time.getMinutes();
    const timeValue = hours * 60 + minutes;

    if (timeValue < 9 * 60 + 15) {
        return { event: 'MARKET_OPEN', time: '09:15' };
    }
    if (timeValue < 10 * 60 + 30) {
        return { event: 'GAP_WINDOW_CLOSE', time: '10:30' };
    }
    if (timeValue < 11 * 60 + 30) {
        return { event: 'TIMEFRAME_SWITCH', time: '11:30' };
    }
    if (timeValue < 15 * 60 + 15) {
        return { event: 'EOD_EXIT', time: '15:15' };
    }
    return { event: 'MARKET_CLOSE', time: '15:30' };
}

module.exports = {
    getOptimalTimeframe,
    timeframeToMinutes,
    getTradingPhase,
    getRecommendedStrategies,
    isMarketOpen,
    getNextMarketEvent
};
