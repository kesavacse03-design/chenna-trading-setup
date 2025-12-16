/**
 * CATEGORY → LOGIC FAMILY MAPPING
 * 
 * CORE PRINCIPLE: Each category has specific logic families that make sense.
 * Labs must ONLY test strategies from allowed families.
 * 
 * Logic Families:
 * - EXHAUSTION: RSI divergence, volume dry-up, wick rejection, failed breakdown
 * - REVERSAL: Pattern reversals, support/resistance bounce
 * - BREAKOUT: Compression → expansion, range break, volume expansion
 * - MOMENTUM: Trend continuation, moving average alignment
 * - CONTRACTION: Volatility squeeze, range narrowing
 */

const LOGIC_FAMILIES = {
    EXHAUSTION: 'exhaustion',
    REVERSAL: 'reversal',
    BREAKOUT: 'breakout',
    MOMENTUM: 'momentum',
    CONTRACTION: 'contraction',
    MEAN_REVERSION: 'mean_reversion'
};

/**
 * CATEGORY → ALLOWED LOGIC FAMILIES
 * Labs will ONLY test strategies from allowed families
 */
const CATEGORY_LOGIC_FILTER = {

    // ==================== DOWNSIDE CATEGORIES (Need EXHAUSTION/REVERSAL) ====================

    'DOWNSIDE_LOM_SWING': {
        description: 'Late-stage selling → exhaustion → bounce',
        allowed: [LOGIC_FAMILIES.EXHAUSTION, LOGIC_FAMILIES.REVERSAL],
        disallowed: [LOGIC_FAMILIES.BREAKOUT, LOGIC_FAMILIES.MOMENTUM],
        rationale: 'Looking for panic exhaustion, NOT trend continuation'
    },

    'DOWNSIDE_LOM_INTRA': {
        description: 'Intraday capitulation → bounce',
        allowed: [LOGIC_FAMILIES.EXHAUSTION, LOGIC_FAMILIES.REVERSAL],
        disallowed: [LOGIC_FAMILIES.BREAKOUT, LOGIC_FAMILIES.MOMENTUM],
        rationale: 'Same as swing but faster timeframe'
    },

    // ==================== UPSIDE CATEGORIES (Need CONTINUATION/MOMENTUM) ====================

    'UPSIDE_LOM_SWING': {
        description: 'Pullback in uptrend → continuation',
        allowed: [LOGIC_FAMILIES.MOMENTUM, LOGIC_FAMILIES.MEAN_REVERSION],
        disallowed: [LOGIC_FAMILIES.EXHAUSTION],
        rationale: 'Trend is intact, looking for pullback entry'
    },

    'UPSIDE_LOM_INTRA': {
        description: 'Intraday pullback → continuation',
        allowed: [LOGIC_FAMILIES.MOMENTUM, LOGIC_FAMILIES.MEAN_REVERSION],
        disallowed: [LOGIC_FAMILIES.EXHAUSTION],
        rationale: 'Same as swing but faster timeframe'
    },

    // ==================== BREAKOUT CATEGORIES (Need BREAKOUT logic) ====================

    'MULTI_RESISTANCE_BO': {
        description: 'Multiple resistance tests → breakout',
        allowed: [LOGIC_FAMILIES.BREAKOUT, LOGIC_FAMILIES.MOMENTUM],
        disallowed: [LOGIC_FAMILIES.EXHAUSTION, LOGIC_FAMILIES.MEAN_REVERSION],
        rationale: 'Supply absorbed, looking for expansion'
    },

    'MULTI_SUPPORT_BO': {
        description: 'Multiple support tests → breakdown',
        allowed: [LOGIC_FAMILIES.BREAKOUT],
        disallowed: [LOGIC_FAMILIES.REVERSAL, LOGIC_FAMILIES.MEAN_REVERSION],
        rationale: 'Demand exhausted, looking for breakdown'
    },

    'SHORT_TERM_SWING_BO_UP': {
        description: 'Compression → expansion up',
        allowed: [LOGIC_FAMILIES.BREAKOUT, LOGIC_FAMILIES.CONTRACTION],
        disallowed: [LOGIC_FAMILIES.EXHAUSTION],
        rationale: 'Energy building for expansion'
    },

    'SHORT_TERM_SWING_BO_DOWN': {
        description: 'Compression → expansion down',
        allowed: [LOGIC_FAMILIES.BREAKOUT, LOGIC_FAMILIES.CONTRACTION],
        disallowed: [LOGIC_FAMILIES.REVERSAL],
        rationale: 'Energy building for breakdown'
    },

    'LONG_TERM_SWING_BO_UP': {
        description: 'Large base → structural breakout',
        allowed: [LOGIC_FAMILIES.BREAKOUT, LOGIC_FAMILIES.MOMENTUM],
        disallowed: [LOGIC_FAMILIES.EXHAUSTION],
        rationale: 'Accumulation complete, trend change'
    },

    'LONG_TERM_SWING_BO_DOWN': {
        description: 'Large top → structural breakdown',
        allowed: [LOGIC_FAMILIES.BREAKOUT],
        disallowed: [LOGIC_FAMILIES.REVERSAL],
        rationale: 'Distribution complete, trend change'
    },

    // ==================== INTRADAY MOMENTUM CATEGORIES ====================

    'HIGH_POWERED_STOCKS': {
        description: 'Momentum day candidates',
        allowed: [LOGIC_FAMILIES.MOMENTUM, LOGIC_FAMILIES.BREAKOUT],
        disallowed: [LOGIC_FAMILIES.EXHAUSTION, LOGIC_FAMILIES.MEAN_REVERSION],
        rationale: 'Strong momentum, ride the move'
    },

    'INTRADAY_BOOST': {
        description: 'Late session acceleration',
        allowed: [LOGIC_FAMILIES.MOMENTUM],
        disallowed: [LOGIC_FAMILIES.EXHAUSTION],
        rationale: 'Continuation into close'
    },

    // ==================== CONTRACTION CATEGORY ====================

    'DAILY_CONTRACTION': {
        description: 'Volatility squeeze',
        allowed: [LOGIC_FAMILIES.CONTRACTION, LOGIC_FAMILIES.BREAKOUT],
        disallowed: [LOGIC_FAMILIES.EXHAUSTION],
        rationale: 'Energy building, direction unknown'
    },

    'PRE_MARKET': {
        description: 'Gap behavior',
        allowed: [LOGIC_FAMILIES.BREAKOUT, LOGIC_FAMILIES.MOMENTUM],
        disallowed: [],
        rationale: 'Gap analysis'
    }
};

/**
 * Get allowed logic families for a category
 */
function getAllowedFamilies(categoryKey) {
    const config = CATEGORY_LOGIC_FILTER[categoryKey];
    if (!config) {
        console.warn(`[CategoryFilter] Unknown category: ${categoryKey}, allowing all`);
        return Object.values(LOGIC_FAMILIES);
    }
    return config.allowed;
}

/**
 * Check if a logic family is allowed for a category
 */
function isFamilyAllowed(categoryKey, family) {
    const allowed = getAllowedFamilies(categoryKey);
    return allowed.includes(family);
}

/**
 * Get filter info for logging/debugging
 */
function getFilterInfo(categoryKey) {
    return CATEGORY_LOGIC_FILTER[categoryKey] || null;
}

module.exports = {
    LOGIC_FAMILIES,
    CATEGORY_LOGIC_FILTER,
    getAllowedFamilies,
    isFamilyAllowed,
    getFilterInfo
};
