const STRATEGY_REGISTRY = {
    // ════════════════════════════════════════════════════════
    // INTRADAY CATEGORIES (Exit same day)
    // ════════════════════════════════════════════════════════

    'INTRADAY_BOOST': {
        id: 'V2.1_NPATTERN',
        name: 'N-Pattern Breakout',
        description: 'Opening Range + Pullback + Breakout above OR High',
        type: 'INTRADAY',
        version: '2.1',
        status: 'PRODUCTION',

        // User-editable parameters
        parameters: {
            targetPercent: { value: 1.5, min: 0.5, max: 5, step: 0.1, label: 'Target %' },
            stopType: { value: 'DYNAMIC', options: ['DYNAMIC', 'FIXED'], label: 'Stop Type' },
            fixedStopPercent: { value: 1.0, min: 0.5, max: 3, step: 0.1, label: 'Fixed Stop %' },
            maxORWidth: { value: 2.0, min: 1.0, max: 4.0, step: 0.5, label: 'Max OR Width %' },
            volumeThreshold: { value: 1.5, min: 1.0, max: 3.0, step: 0.1, label: 'Volume Multiplier' },
            emaShort: { value: 9, min: 5, max: 20, step: 1, label: 'EMA Short' },
            emaLong: { value: 21, min: 10, max: 50, step: 1, label: 'EMA Long' },
            minBreakoutStrength: { value: 0.5, min: 0.1, max: 1.0, step: 0.1, label: 'Min Breakout %' },
            mode: { value: 'STRICT', options: ['STRICT', 'RELAXED'], label: 'Filter Mode' }
        },

        // Signal generation flow (for UI display)
        signalFlow: [
            { step: 1, time: '9:15-9:30', action: 'Detect Opening Range', filter: 'OR width < {maxORWidth}%' },
            { step: 2, time: '9:30-10:00', action: 'Wait for Pullback', filter: 'Higher low above OR low' },
            { step: 3, time: 'On Breakout', action: 'Entry Signal', filter: 'Price breaks OR high + volume' },
            { step: 4, time: 'After Entry', action: 'Monitor', filter: 'Target +{targetPercent}% | Stop at pullback low' },
            { step: 5, time: '3:15 PM', action: 'Force Exit', filter: 'Close any open position' }
        ],

        // Backtest performance
        backtestStats: {
            lastRun: '2026-02-05',
            winRate: 66.7,
            totalTrades: 21,
            avgPnL: 0.72
        },

        strategyFile: 'intradayStrategyV2_1.cjs',
        enabled: true
    },

    'HIGH_POWERED_STOCKS': {
        id: 'V2.1_NPATTERN',
        name: 'N-Pattern Breakout',
        description: 'High momentum stocks with N-Pattern setup',
        type: 'INTRADAY',
        version: '2.1',
        status: 'PRODUCTION',

        parameters: {
            targetPercent: { value: 1.5, min: 0.5, max: 5, step: 0.1, label: 'Target %' },
            stopType: { value: 'DYNAMIC', options: ['DYNAMIC', 'FIXED'], label: 'Stop Type' },
            fixedStopPercent: { value: 1.0, min: 0.5, max: 3, step: 0.1, label: 'Fixed Stop %' },
            maxORWidth: { value: 2.0, min: 1.0, max: 4.0, step: 0.5, label: 'Max OR Width %' },
            volumeThreshold: { value: 1.5, min: 1.0, max: 3.0, step: 0.1, label: 'Volume Multiplier' },
            emaShort: { value: 9, min: 5, max: 20, step: 1, label: 'EMA Short' },
            emaLong: { value: 21, min: 10, max: 50, step: 1, label: 'EMA Long' },
            minBreakoutStrength: { value: 0.5, min: 0.1, max: 1.0, step: 0.1, label: 'Min Breakout %' },
            mode: { value: 'STRICT', options: ['STRICT', 'RELAXED'], label: 'Filter Mode' }
        },

        signalFlow: [
            { step: 1, time: '9:15-9:30', action: 'Detect Opening Range', filter: 'OR width < {maxORWidth}%' },
            { step: 2, time: '9:30-10:00', action: 'Wait for Pullback', filter: 'Higher low above OR low' },
            { step: 3, time: 'On Breakout', action: 'Entry Signal', filter: 'Price breaks OR high + volume' },
            { step: 4, time: '3:15 PM', action: 'Force Exit', filter: 'Close' }
        ],

        backtestStats: {
            lastRun: null,
            winRate: 0,
            totalTrades: 0,
            avgPnL: 0
        },

        strategyFile: 'intradayStrategyV2_1.cjs',
        enabled: true
    },

    'UPSIDE_LOM_INTRA': {
        id: 'PENDING',
        name: 'Strategy TBD',
        description: 'Pending backtest analysis for Loss of Momentum patterns',
        type: 'INTRADAY',
        version: '0.0',
        status: 'BACKTEST_PENDING',
        parameters: {},
        signalFlow: [],
        backtestStats: null,
        strategyFile: null,
        enabled: false
    },

    'DOWNSIDE_LOM_INTRA': {
        id: 'PENDING',
        name: 'Strategy TBD',
        description: 'Pending backtest analysis for Loss of Momentum patterns',
        type: 'INTRADAY',
        version: '0.0',
        status: 'BACKTEST_PENDING',
        parameters: {},
        signalFlow: [],
        backtestStats: null,
        strategyFile: null,
        enabled: false
    },

    'PRE_MARKET': {
        id: 'PENDING',
        name: 'Strategy TBD',
        description: 'Pending backtest analysis for Pre-Market gaps',
        type: 'INTRADAY',
        version: '0.0',
        status: 'BACKTEST_PENDING',
        parameters: {},
        signalFlow: [],
        backtestStats: null,
        strategyFile: null,
        enabled: false
    },

    // ════════════════════════════════════════════════════════
    // SWING CATEGORIES (Hold 1-10 days)
    // ════════════════════════════════════════════════════════

    'DAILY_CONTRACTION': {
        id: 'PENDING',
        name: 'NR7 Breakout (Planned)',
        type: 'SWING',
        status: 'PLANNED',
        enabled: false
    },

    'SHORT_TERM_SWING_BO_UP': {
        id: 'PENDING',
        name: 'Swing Breakout Up (Planned)',
        type: 'SWING',
        status: 'PLANNED',
        enabled: false
    },

    'SHORT_TERM_SWING_BO_DOWN': {
        id: 'PENDING',
        name: 'Swing Breakout Down (Planned)',
        type: 'SWING',
        status: 'PLANNED',
        enabled: false
    }
};

module.exports = { STRATEGY_REGISTRY };
