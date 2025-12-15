/**
 * LABS CATEGORY RULES - INSTITUTIONAL DESIGN
 * 
 * CORE PRINCIPLE: Labs is NOT an entry generator.
 * It's a CONFIRMATION & INVALIDATION discovery engine.
 * 
 * Entry already exists implicitly because stocks are pre-filtered.
 * Labs answers: 
 * 1. Why do winners work?
 * 2. Why do losers fail?
 * 3. Which confirmations separate winners from losers?
 */

const CATEGORY_CONFIRMATION_RULES = {

    // ==================== SWING TRADE CATEGORIES (10-day window, 15-min eval) ====================

    'DOWNSIDE_LOM_SWING': {
        intent: 'Late-stage selling → exhaustion → bounce',
        behavior: 'Panic selling happened, weak hands exiting, institutions absorbing',

        mustDiscover: 'Exhaustion + Stabilization signals',

        shouldAnalyze: [
            'Volatility expansion followed by contraction',
            'Selling pressure exhaustion',
            'Base formation',
            'Failed breakdowns'
        ],

        confirmationsToTest: [
            { name: 'rsi_exhaustion_zone', desc: 'RSI in exhaustion zone (not fixed value)' },
            { name: 'atr_spike_contraction', desc: 'ATR peaks then contracts' },
            { name: 'lower_wick_dominance', desc: 'Lower wicks show buying' },
            { name: 'volume_drying', desc: 'Volume declines after sell-off' },
            { name: 'holding_above_low', desc: 'Price holds above recent low for 2 sessions' }
        ],

        shouldAvoid: [
            'trend_continuation',
            'momentum_chasing',
            'breakout_logic'
        ],

        exampleOutput: `Trades succeed when:
            - RSI below exhaustion zone
            - ATR peaks and contracts
            - Price does not make new lows for 2 sessions
            - Volume declines after sell-off`
    },

    'UPSIDE_LOM_SWING': {
        intent: 'Late-stage buying → exhaustion → pullback continuation',
        behavior: 'Strong prior rally, profit booking phase, healthy pullback',

        mustDiscover: 'Pullback quality & continuation confirmation',

        shouldAnalyze: [
            'Depth of pullback',
            'Volume during pullback',
            'Trend structure integrity'
        ],

        confirmationsToTest: [
            { name: 'ema_support_holding', desc: 'EMA support holding on pullback' },
            { name: 'pullback_volume_low', desc: 'Pullback volume < rally volume' },
            { name: 'higher_low_formation', desc: 'Higher-low formed' },
            { name: 'no_distribution', desc: 'No distribution candles' }
        ],

        shouldAvoid: [
            'mean_reversion_entries',
            'oversold_logic'
        ]
    },

    'MULTI_RESISTANCE_BO': {
        intent: 'Supply absorption → breakout',
        behavior: 'Multiple resistance tests, sellers exhausted, breakout likely but fake breakouts common',

        mustDiscover: 'Breakout confirmation quality',

        shouldAnalyze: [
            'Resistance compression',
            'Pre-breakout volatility contraction',
            'Volume behavior near resistance',
            'Candle body strength'
        ],

        confirmationsToTest: [
            { name: 'range_tightening', desc: 'Range tightening near resistance' },
            { name: 'volume_contraction_pre', desc: 'Volume contraction before breakout' },
            { name: 'breakout_close_strong', desc: 'Breakout candle close > 70% of range' },
            { name: 'volume_expansion_on_break', desc: 'Volume expansion on breakout' },
            { name: 'no_rejection_candle', desc: 'No immediate rejection candle' }
        ],

        shouldAvoid: [
            'rsi_oversold_logic',
            'mean_reversion_tools'
        ],

        fakeBreakoutRules: `Fake breakouts occur when:
            - Volume spike without follow-through
            - Breakout candle closes mid-range
            - Market regime is choppy`
    },

    'MULTI_SUPPORT_BO': {
        intent: 'Demand absorption → breakdown',
        behavior: 'Same as MULTI_RESISTANCE_BO but inverted for downside',

        mustDiscover: 'Breakdown confirmation quality',

        confirmationsToTest: [
            { name: 'support_weakening', desc: 'Support getting weaker with each test' },
            { name: 'failed_bounces', desc: 'Bounces getting weaker' },
            { name: 'distribution_candles', desc: 'Distribution candles appearing' },
            { name: 'breakdown_followthrough', desc: 'Breakdown with follow-through' }
        ],

        shouldAvoid: ['bounce_logic', 'mean_reversion']
    },

    'SHORT_TERM_SWING_BO_UP': {
        intent: 'Fast continuation after compression',
        behavior: 'Short-term energy build-up, momentum expansion expected',

        mustDiscover: 'Compression → expansion triggers',

        confirmationsToTest: [
            { name: 'bb_width_contraction', desc: 'Bollinger Band width contraction' },
            { name: 'narrow_range', desc: 'Range < X% of ATR' },
            { name: 'expansion_volume', desc: 'Expansion candle volume > average' },
            { name: 'followthrough_session', desc: 'Follow-through next session' }
        ]
    },

    'SHORT_TERM_SWING_BO_DOWN': {
        intent: 'Fast breakdown after compression',
        behavior: 'Same as UP but inverted'
    },

    'LONG_TERM_SWING_BO_UP': {
        intent: 'Large base → structural breakout',
        behavior: 'Multi-week accumulation, structural trend change',

        mustDiscover: 'Structural breakout confirmation',

        shouldFocusOn: [
            'Higher timeframe structure',
            'Weekly levels',
            'Long consolidation zones'
        ],

        note: 'Labs must IGNORE intraday noise here'
    },

    'LONG_TERM_SWING_BO_DOWN': {
        intent: 'Large top → structural breakdown',
        behavior: 'Same as UP but inverted'
    },

    // ==================== INTRADAY CATEGORIES (same-day, 1-min eval) ====================

    'HIGH_POWERED_STOCKS': {
        intent: 'Momentum day candidates',
        behavior: 'High relative strength, news/sector momentum, strong institutional participation',

        mustDiscover: 'Continuation reliability',

        confirmationsToTest: [
            { name: 'opening_range_behavior', desc: 'Opening range behavior' },
            { name: 'vwap_acceptance', desc: 'Price accepting VWAP' },
            { name: 'shallow_pullbacks', desc: 'Shallow pullback depth' },
            { name: 'volume_on_push', desc: 'Volume confirmation on push' },
            { name: 'time_of_day', desc: 'Time-of-day effects' }
        ]
    },

    'INTRADAY_BOOST': {
        intent: 'Late-session acceleration',

        confirmationsToTest: [
            { name: 'afternoon_momentum', desc: 'Afternoon momentum build' },
            { name: 'failed_pullbacks', desc: 'Failed pullbacks as fuel' },
            { name: 'volume_ramp', desc: 'Volume ramping up' }
        ]
    },

    'DOWNSIDE_LOM_INTRA': {
        intent: 'Intraday capitulation → bounce',

        confirmationsToTest: [
            { name: 'sharp_selloff_exhaustion', desc: 'Sharp sell-off exhaustion' },
            { name: 'panic_volume', desc: 'Panic volume spike' },
            { name: 'reversal_candles_at_lows', desc: 'Reversal candles near lows' }
        ]
    },

    'UPSIDE_LOM_INTRA': {
        intent: 'Intraday profit booking → continuation',

        confirmationsToTest: [
            { name: 'controlled_pullback', desc: 'Controlled, shallow pullback' },
            { name: 'vwap_defense', desc: 'Buyers defending VWAP' },
            { name: 'no_heavy_sells', desc: 'No heavy sell candles' }
        ]
    },

    'DAILY_CONTRACTION': {
        intent: 'Volatility squeeze',

        confirmationsToTest: [
            { name: 'atr_contraction', desc: 'ATR contracting' },
            { name: 'narrow_candles', desc: 'Narrow body candles' },
            { name: 'expansion_probability', desc: 'Expansion probability rising' }
        ]
    },

    'PRE_MARKET': {
        intent: 'Gap behavior analysis',

        confirmationsToTest: [
            { name: 'gap_acceptance_rejection', desc: 'Gap acceptance vs rejection' },
            { name: 'opening_volume', desc: 'Opening volume analysis' },
            { name: 'first_15min_structure', desc: 'First 15-minute structure' }
        ]
    }
};

/**
 * STANDARDIZED LABS OUTPUT FORMAT
 * Every Labs run must output these sections
 */
const LABS_OUTPUT_FORMAT = {
    // 1. Category-Specific Thesis
    thesis: 'Plain English: "This category works when..."',

    // 2. Confirmation Rules (Top 5, ranked by importance)
    confirmations: [
        { rank: 1, rule: 'description', importance: 'score' }
    ],

    // 3. Invalidation Rules (what kills trades early)
    invalidations: [
        { rule: 'description', impact: 'how it kills the trade' }
    ],

    // 4. Scoring Model
    scoringModel: {
        howConfidenceIsCalculated: 'description',
        whyLowScoresAreSkipped: 'description'
    },

    // 5. Expected Trade Behavior
    expectedBehavior: {
        avgHoldingTime: 'X days',
        avgDrawdown: 'X%',
        avgMove: 'X%'
    }
};

/**
 * WHAT LABS MUST NEVER DO
 */
const LABS_PROHIBITED = [
    'Never optimize for win rate alone',
    'Never output fixed indicator values without context',
    'Never override strategy automatically',
    'Never assume categories are random',
    'Never ignore market regime'
];

module.exports = {
    CATEGORY_CONFIRMATION_RULES,
    LABS_OUTPUT_FORMAT,
    LABS_PROHIBITED
};
