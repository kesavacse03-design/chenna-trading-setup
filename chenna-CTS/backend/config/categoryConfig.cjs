/**
 * Category Configuration
 * Defines tracking behavior for each category type
 */

// Category type constants
const CATEGORY_TYPE = {
    SWING: 'SWING',
    INTRADAY: 'INTRADAY'
};

/**
 * Category Configuration Map
 * Each category has:
 * - type: SWING or INTRADAY
 * - trackingDays: How many days to track from upload date
 * - scanIntervalMin: How often to scan (in minutes)
 */
const CATEGORY_CONFIG = {
    // ===== SWING CATEGORIES (10 days, 15 min) =====
    'DOWNSIDE_LOM_SWING': {
        type: CATEGORY_TYPE.SWING,
        trackingDays: 10,
        scanIntervalMin: 15,
        description: 'Downside LOM Swing trades'
    },
    'UPSIDE_LOM_SWING': {
        type: CATEGORY_TYPE.SWING,
        trackingDays: 10,
        scanIntervalMin: 15,
        description: 'Upside LOM Swing trades'
    },
    'MULTI_RESISTANCE_BO': {
        type: CATEGORY_TYPE.SWING,
        trackingDays: 10,
        scanIntervalMin: 15,
        description: 'Multi Resistance Breakout'
    },
    'MULTI_SUPPORT_BO': {
        type: CATEGORY_TYPE.SWING,
        trackingDays: 10,
        scanIntervalMin: 15,
        description: 'Multi Support Breakout'
    },
    'SHORT_TERM_SWING_BO_UP': {
        type: CATEGORY_TYPE.SWING,
        trackingDays: 10,
        scanIntervalMin: 15,
        description: 'Short Term Swing Breakout Up'
    },
    'SHORT_TERM_SWING_BO_DOWN': {
        type: CATEGORY_TYPE.SWING,
        trackingDays: 10,
        scanIntervalMin: 15,
        description: 'Short Term Swing Breakout Down'
    },
    'LONG_TERM_SWING_BO_UP': {
        type: CATEGORY_TYPE.SWING,
        trackingDays: 10,
        scanIntervalMin: 15,
        description: 'Long Term Swing Breakout Up'
    },
    'LONG_TERM_SWING_BO_DOWN': {
        type: CATEGORY_TYPE.SWING,
        trackingDays: 10,
        scanIntervalMin: 15,
        description: 'Long Term Swing Breakout Down'
    },

    // ===== INTRADAY CATEGORIES (1 day, 1 min) =====
    'HIGH_POWERED_STOCKS': {
        type: CATEGORY_TYPE.INTRADAY,
        trackingDays: 1,
        scanIntervalMin: 1,
        description: 'High Powered Intraday Stocks'
    },
    'INTRADAY_BOOST': {
        type: CATEGORY_TYPE.INTRADAY,
        trackingDays: 1,
        scanIntervalMin: 1,
        description: 'Intraday Boost candidates'
    },
    'DOWNSIDE_LOM_INTRA': {
        type: CATEGORY_TYPE.INTRADAY,
        trackingDays: 1,
        scanIntervalMin: 1,
        description: 'Downside LOM Intraday'
    },
    'UPSIDE_LOM_INTRA': {
        type: CATEGORY_TYPE.INTRADAY,
        trackingDays: 1,
        scanIntervalMin: 1,
        description: 'Upside LOM Intraday'
    },
    'DAILY_CONTRACTION': {
        type: CATEGORY_TYPE.INTRADAY,
        trackingDays: 1,
        scanIntervalMin: 1,
        description: 'Daily Contraction patterns'
    },
    'PRE_MARKET': {
        type: CATEGORY_TYPE.INTRADAY,
        trackingDays: 1,
        scanIntervalMin: 1,
        description: 'Pre-Market setup stocks'
    }
};

// Default config for unknown categories (treat as Swing)
const DEFAULT_CONFIG = {
    type: CATEGORY_TYPE.SWING,
    trackingDays: 10,
    scanIntervalMin: 15,
    description: 'Unknown category - default Swing'
};

/**
 * Get configuration for a category
 */
function getCategoryConfig(categoryKey) {
    // Normalize key (uppercase, underscores)
    const normalizedKey = categoryKey?.toUpperCase().replace(/\s+/g, '_') || '';
    return CATEGORY_CONFIG[normalizedKey] || DEFAULT_CONFIG;
}

/**
 * Check if category is Swing type
 */
function isSwingCategory(categoryKey) {
    return getCategoryConfig(categoryKey).type === CATEGORY_TYPE.SWING;
}

/**
 * Check if category is Intraday type
 */
function isIntradayCategory(categoryKey) {
    return getCategoryConfig(categoryKey).type === CATEGORY_TYPE.INTRADAY;
}

/**
 * Get tracking window in days for a category
 */
function getTrackingWindow(categoryKey) {
    return getCategoryConfig(categoryKey).trackingDays;
}

/**
 * Get scan interval in minutes for a category
 */
function getScanInterval(categoryKey) {
    return getCategoryConfig(categoryKey).scanIntervalMin;
}

/**
 * Check if a stock is still within its tracking window
 * @param {Date} addedDate - Date when stock was added to category
 * @param {string} categoryKey - Category key
 * @returns {boolean} - True if stock should still be tracked
 */
function isWithinTrackingWindow(addedDate, categoryKey) {
    if (!addedDate) return false;

    const config = getCategoryConfig(categoryKey);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const added = new Date(addedDate);
    added.setHours(0, 0, 0, 0);

    // Calculate expiry date
    const expiryDate = new Date(added);
    expiryDate.setDate(expiryDate.getDate() + config.trackingDays);

    return today < expiryDate;
}

/**
 * Get tracking expiry date for a stock
 */
function getTrackingExpiryDate(addedDate, categoryKey) {
    if (!addedDate) return null;

    const config = getCategoryConfig(categoryKey);
    const added = new Date(addedDate);
    const expiry = new Date(added);
    expiry.setDate(expiry.getDate() + config.trackingDays);

    return expiry;
}

/**
 * Get all SWING category keys
 */
function getSwingCategories() {
    return Object.entries(CATEGORY_CONFIG)
        .filter(([_, config]) => config.type === CATEGORY_TYPE.SWING)
        .map(([key, _]) => key);
}

/**
 * Get all INTRADAY category keys
 */
function getIntradayCategories() {
    return Object.entries(CATEGORY_CONFIG)
        .filter(([_, config]) => config.type === CATEGORY_TYPE.INTRADAY)
        .map(([key, _]) => key);
}

/**
 * Get all category keys
 */
function getAllCategories() {
    return Object.keys(CATEGORY_CONFIG);
}

module.exports = {
    CATEGORY_TYPE,
    CATEGORY_CONFIG,
    DEFAULT_CONFIG,
    getCategoryConfig,
    isSwingCategory,
    isIntradayCategory,
    getTrackingWindow,
    getScanInterval,
    isWithinTrackingWindow,
    getTrackingExpiryDate,
    getSwingCategories,
    getIntradayCategories,
    getAllCategories
};
