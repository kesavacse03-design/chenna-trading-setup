/**
 * Category Logic Mapping
 * Maps each category to expected logic families based on trading intent
 * This prevents brute-force testing and ensures category-specific strategies
 */

const CATEGORY_LOGIC_MAP = {
    // ==================== SWING CATEGORIES (10-day tracking) ====================

    'DOWNSIDE_LOM_SWING': {
        intent: 'Mean reversion after sharp downside move with exhaustion',
        description: 'Stocks that have fallen sharply and showing reversal signs',
        expectedLogics: [
            'rsi_oversold',           // RSI < 30-40 oversold conditions
            'exhaustion_candles',     // Doji, hammer at lows
            'volume_exhaustion',      // Declining volume on sell-off
            'bb_lower_touch',         // Price near/below lower Bollinger Band
            'mean_reversion'          // Price far below SMA50/200
        ],
        avoidLogics: [
            'breakout_momentum',      // Not a breakout play
            'trend_following',        // Not trend following
            'resistance_break'        // Not resistance break
        ],
        minTrades: 10,
        maxWinRateIfFewTrades: 90,  // If < 20 trades, max 90% win rate allowed
        expectedHoldingDays: { min: 1, max: 10 },
        riskReward: { target: 2.5, stop: 1.5 }
    },

    'UPSIDE_LOM_SWING': {
        intent: 'Pullback entry in uptrending stocks after overbought exhaustion',
        description: 'Stocks that have risen sharply and may pull back before continuing',
        expectedLogics: [
            'rsi_overbought',         // RSI > 70 overbought
            'profit_booking_pattern', // Shooting star, bearish engulfing
            'trend_continuation',     // Still above key SMAs
            'volume_divergence'       // Price up but volume declining
        ],
        avoidLogics: [
            'base_breakout',
            'accumulation'
        ],
        minTrades: 10,
        maxWinRateIfFewTrades: 90,
        expectedHoldingDays: { min: 1, max: 10 },
        riskReward: { target: 2.5, stop: 1.5 }
    },

    'MULTI_RESISTANCE_BO': {
        intent: 'Breakout from multiple resistance tests with supply absorption',
        description: 'Stocks testing resistance multiple times, likely to break out',
        expectedLogics: [
            'resistance_test_count',  // Multiple touches at same level
            'volume_expansion',       // Volume spike on breakout
            'candle_strength',        // Strong bullish candle
            'compression_breakout',   // Volatility squeeze then expand
            'trap_detection'          // Avoid false breakouts
        ],
        avoidLogics: [
            'rsi_extreme',            // RSI extremes not relevant
            'mean_reversion',         // Opposite of breakout
            'exhaustion'              // Not exhaustion play
        ],
        minTrades: 15,
        maxWinRateIfFewTrades: 85,
        expectedHoldingDays: { min: 1, max: 10 },
        riskReward: { target: 3.0, stop: 1.5 }
    },

    'MULTI_SUPPORT_BO': {
        intent: 'Breakdown from multiple support tests',
        description: 'Stocks testing support multiple times, likely to break down',
        expectedLogics: [
            'support_test_count',
            'volume_expansion',
            'bearish_candle_strength',
            'breakdown_confirmation'
        ],
        avoidLogics: [
            'mean_reversion',
            'bounce_play'
        ],
        minTrades: 15,
        maxWinRateIfFewTrades: 85,
        expectedHoldingDays: { min: 1, max: 10 },
        riskReward: { target: 3.0, stop: 1.5 }
    },

    'SHORT_TERM_SWING_BO_UP': {
        intent: 'Short-term bullish breakout momentum',
        description: 'Quick upside breakouts for short holding period',
        expectedLogics: [
            'short_term_ma_crossover',
            'momentum_burst',
            'volume_confirmation',
            'breakout_retest'
        ],
        avoidLogics: [
            'long_term_trend',
            'slow_accumulation'
        ],
        minTrades: 12,
        maxWinRateIfFewTrades: 85,
        expectedHoldingDays: { min: 1, max: 5 },
        riskReward: { target: 2.0, stop: 1.0 }
    },

    'SHORT_TERM_SWING_BO_DOWN': {
        intent: 'Short-term bearish breakdown momentum',
        description: 'Quick downside breakdowns for short holding period',
        expectedLogics: [
            'short_term_ma_breakdown',
            'momentum_collapse',
            'breakdown_volume',
            'support_failure'
        ],
        avoidLogics: [
            'bounce_play',
            'oversold_reversal'
        ],
        minTrades: 12,
        maxWinRateIfFewTrades: 85,
        expectedHoldingDays: { min: 1, max: 5 },
        riskReward: { target: 2.0, stop: 1.0 }
    },

    'LONG_TERM_SWING_BO_UP': {
        intent: 'Long-term bullish trend breakout',
        description: 'Major breakouts from long consolidation',
        expectedLogics: [
            'long_term_base_breakout',
            'golden_cross',
            'major_resistance_break',
            'institutional_volume'
        ],
        avoidLogics: [
            'quick_scalp',
            'mean_reversion'
        ],
        minTrades: 10,
        maxWinRateIfFewTrades: 90,
        expectedHoldingDays: { min: 3, max: 10 },
        riskReward: { target: 4.0, stop: 2.0 }
    },

    'LONG_TERM_SWING_BO_DOWN': {
        intent: 'Long-term bearish breakdown',
        description: 'Major breakdowns from long distribution',
        expectedLogics: [
            'long_term_breakdown',
            'death_cross',
            'major_support_break',
            'distribution_volume'
        ],
        avoidLogics: [
            'bounce_play',
            'accumulation'
        ],
        minTrades: 10,
        maxWinRateIfFewTrades: 90,
        expectedHoldingDays: { min: 3, max: 10 },
        riskReward: { target: 4.0, stop: 2.0 }
    },

    // ==================== INTRADAY CATEGORIES (same-day tracking) ====================

    'HIGH_POWERED_STOCKS': {
        intent: 'High momentum intraday plays with strong volume',
        description: 'Stocks with explosive intraday moves',
        expectedLogics: [
            'gap_up_momentum',
            'volume_surge',
            'vwap_breakout',
            'range_expansion'
        ],
        avoidLogics: [
            'slow_grind',
            'consolidation'
        ],
        minTrades: 15,
        maxWinRateIfFewTrades: 80,
        expectedHoldingDays: { min: 0, max: 1 },
        riskReward: { target: 1.5, stop: 0.75 }
    },

    'INTRADAY_BOOST': {
        intent: 'Quick intraday momentum burst',
        description: 'Stocks ready for quick intraday moves',
        expectedLogics: [
            'opening_range_break',
            'vwap_reclaim',
            'momentum_continuation',
            'volume_spike'
        ],
        avoidLogics: [
            'swing_setup',
            'overnight_hold'
        ],
        minTrades: 15,
        maxWinRateIfFewTrades: 80,
        expectedHoldingDays: { min: 0, max: 1 },
        riskReward: { target: 1.5, stop: 0.75 }
    },

    'DOWNSIDE_LOM_INTRA': {
        intent: 'Intraday mean reversion from oversold',
        description: 'Same-day bounce from intraday lows',
        expectedLogics: [
            'intraday_oversold',
            'vwap_support',
            'reversal_candle_1min',
            'volume_exhaustion_intra'
        ],
        avoidLogics: [
            'trend_following',
            'breakdown_continuation'
        ],
        minTrades: 15,
        maxWinRateIfFewTrades: 80,
        expectedHoldingDays: { min: 0, max: 1 },
        riskReward: { target: 1.0, stop: 0.5 }
    },

    'UPSIDE_LOM_INTRA': {
        intent: 'Intraday fade from overbought',
        description: 'Same-day pullback from intraday highs',
        expectedLogics: [
            'intraday_overbought',
            'vwap_resistance',
            'shooting_star_1min',
            'profit_booking_intra'
        ],
        avoidLogics: [
            'breakout_continuation',
            'momentum_chase'
        ],
        minTrades: 15,
        maxWinRateIfFewTrades: 80,
        expectedHoldingDays: { min: 0, max: 1 },
        riskReward: { target: 1.0, stop: 0.5 }
    },

    'DAILY_CONTRACTION': {
        intent: 'Volatility squeeze ready to expand',
        description: 'Stocks with narrowing daily ranges about to move',
        expectedLogics: [
            'range_contraction',
            'bb_squeeze',
            'atr_decline',
            'breakout_anticipation'
        ],
        avoidLogics: [
            'trend_exhaustion',
            'momentum_fade'
        ],
        minTrades: 12,
        maxWinRateIfFewTrades: 85,
        expectedHoldingDays: { min: 0, max: 1 },
        riskReward: { target: 2.0, stop: 1.0 }
    },

    'PRE_MARKET': {
        intent: 'Pre-market gap and momentum plays',
        description: 'Stocks with pre-market activity signaling direction',
        expectedLogics: [
            'gap_analysis',
            'pre_market_volume',
            'opening_direction',
            'gap_fill_probability'
        ],
        avoidLogics: [
            'post_market',
            'overnight_drift'
        ],
        minTrades: 15,
        maxWinRateIfFewTrades: 80,
        expectedHoldingDays: { min: 0, max: 1 },
        riskReward: { target: 1.5, stop: 0.75 }
    }
};

/**
 * Get category configuration
 */
function getCategoryLogicConfig(categoryKey) {
    return CATEGORY_LOGIC_MAP[categoryKey] || null;
}

/**
 * Get all category keys
 */
function getAllCategoryKeys() {
    return Object.keys(CATEGORY_LOGIC_MAP);
}

/**
 * Check if a logic family is expected for this category
 */
function isLogicExpectedForCategory(categoryKey, logicFamily) {
    const config = CATEGORY_LOGIC_MAP[categoryKey];
    if (!config) return true; // Allow if no config
    return config.expectedLogics.includes(logicFamily);
}

/**
 * Check if a logic family should be avoided for this category
 */
function isLogicAvoidedForCategory(categoryKey, logicFamily) {
    const config = CATEGORY_LOGIC_MAP[categoryKey];
    if (!config) return false; // Don't avoid if no config
    return config.avoidLogics.includes(logicFamily);
}

/**
 * Validate strategy metrics against category requirements
 */
function validateStrategyForCategory(categoryKey, metrics) {
    const config = CATEGORY_LOGIC_MAP[categoryKey];
    if (!config) return { valid: true };

    const issues = [];

    // Check minimum trades
    if (metrics.tradeCount < config.minTrades) {
        issues.push(`Insufficient trades: ${metrics.tradeCount} < ${config.minTrades} required`);
    }

    // Check suspicious 100% win rate with few trades
    if (metrics.winRate >= 100 && metrics.tradeCount < 20) {
        issues.push(`Suspicious 100% win rate with only ${metrics.tradeCount} trades`);
    }

    // Check max win rate for few trades
    if (metrics.tradeCount < 20 && metrics.winRate > config.maxWinRateIfFewTrades) {
        issues.push(`Win rate ${metrics.winRate}% too high for ${metrics.tradeCount} trades`);
    }

    // Check expectancy
    if (metrics.expectancy !== undefined && metrics.expectancy <= 0) {
        issues.push(`Negative expectancy: ${metrics.expectancy.toFixed(2)}`);
    }

    return {
        valid: issues.length === 0,
        issues,
        config
    };
}

module.exports = {
    CATEGORY_LOGIC_MAP,
    getCategoryLogicConfig,
    getAllCategoryKeys,
    isLogicExpectedForCategory,
    isLogicAvoidedForCategory,
    validateStrategyForCategory
};
