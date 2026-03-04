/**
 * Strategy Manager
 * 
 * Maps categories to strategies and provides strategy info to frontend.
 * This enables different categories to use different trading strategies.
 * 
 * Current Strategies:
 * - N-Pattern Detection (V2.1) - Used by INTRADAY_BOOST, HIGH_POWERED_STOCKS
 * - Future: LOM Reversal, Breakout strategies, etc.
 */

// Strategy configuration map
const STRATEGY_CONFIG = {
    // ============================================================
    // ACTIVE STRATEGIES (Validated and ready for live trading)
    // ============================================================

    'INTRADAY_BOOST': {
        name: 'Intraday Momentum Boost',
        description: 'High momentum intraday strategy targeting 2% moves',
        file: './intradayBoostStrategy.cjs',
        type: 'INTRADAY',
        status: 'active',
        active: true,
        analyzed: true,
        version: 'V1.0',
        direction: 'LONG',
        targetPercent: 2.0,
        stopPercent: -1.0,
        maxHoldDays: 1,
        validDays: [1, 2, 3, 4, 5],
        avoidMonths: [],
        primeMonths: [],
        expectedSuccessRate: 0.6,
        priceTiers: {
            tier1: { minPrice: 0, maxPrice: 200, positionMultiplier: 1.5, candlePattern: 'ANY' },
            tier2: { minPrice: 200, maxPrice: 1000, positionMultiplier: 1.0, candlePattern: 'RED_ONLY' },
            tier3: { minPrice: 1000, maxPrice: 999999, positionMultiplier: 0.75, candlePattern: 'RED_ONLY' }
        },
        // UI Display Rules
        rules: [
            'Identify stocks with strong momentum > 2%',
            'Wait for pullback to VWAP or 20MA',
            'Enter on reversal candle confirmation',
            'Target 2% from entry',
            'Stop loss at 1% or recent swing low',
            'Exit by 3:15 PM'
        ],
        filters: {
            minVolume: 1.0, // 1M
            minPrice: 50,
            maxPrice: 5000
        }
    },

    'HIGH_POWERED_STOCKS': {
        name: 'High Powered Swing Trades',
        description: 'Multi-day swing strategy for high relative strength stocks',
        file: './highPoweredStrategy.cjs',
        type: 'SWING',
        status: 'active',
        active: true,
        analyzed: true,
        version: 'V1.0',
        direction: 'LONG',
        targetPercent: 5.0,
        stopPercent: -3.0,
        maxHoldDays: 5,
        validDays: [1, 2, 3, 4, 5],
        avoidMonths: [],
        primeMonths: [],
        expectedSuccessRate: 0.6,
        priceTiers: {
            tier1: { minPrice: 0, maxPrice: 200, positionMultiplier: 1.5, candlePattern: 'ANY' },
            tier2: { minPrice: 200, maxPrice: 1000, positionMultiplier: 1.0, candlePattern: 'RED_ONLY' },
            tier3: { minPrice: 1000, maxPrice: 999999, positionMultiplier: 0.75, candlePattern: 'RED_ONLY' }
        },
        // UI Display Rules
        rules: [
            'Select stocks with RS rating > 80',
            'Look for consolidation breakout or pullback to 50MA',
            'Enter on breakout with volume > 1.5x average',
            'Target 5-10% move over 3-5 days',
            'Stop loss at 3% or below 50MA',
            'Hold for max 5 days'
        ],
        filters: {
            minRS: 80,
            minVolume: 0.5,
            minPrice: 100
        }
    },

    // ============================================================
    // INACTIVE STRATEGIES (Not yet developed)
    // ============================================================

    'UPSIDE_LOM_INTRA': {
        name: 'Bullish Divergence Reversal',
        description: 'RSI divergence + support bounce reversal entry',
        file: './upsideLomIntraStrategy.cjs',
        type: 'intraday',
        status: 'active',
        active: true,
        analyzed: true,
        version: 'V2.2',
        target: 1.5,
        stopLoss: 1.0,
        holdingPeriod: 'Same day',
        direction: 'LONG',
        backtestedWinRate: null, // Pending validation
        backtestedPeriod: 'Pending'
    },

    'DOWNSIDE_LOM_INTRA': {
        name: 'Bearish Divergence Reversal',
        description: 'RSI divergence + resistance rejection SHORT entry',
        file: './downsideLomIntraStrategy.cjs',
        type: 'intraday',
        status: 'active',
        active: true,
        analyzed: true,
        version: 'V2.3',
        target: 1.5,
        stopLoss: 1.0,
        holdingPeriod: 'Same day',
        direction: 'SHORT',
        backtestedWinRate: null,
        backtestedPeriod: 'Pending'
    },

    'MULTI_RESISTANCE_BO': {
        name: 'Multi-Day Resistance Breakout',
        description: 'Breakout above 5-day high with volume',
        file: './multiResistanceBoStrategy.cjs',
        type: 'swing',
        status: 'active',
        active: true,
        analyzed: true,
        version: 'V3.0',
        target: 'ATR-based',
        targetApprox: '8-12%',
        stopLoss: 'ATR × 2',
        stopApprox: '5-8%',
        stopMethod: 'ATR',
        maxHoldDays: 20,
        holdingPeriod: '5-20 days',
        direction: 'LONG',
        backtestedWinRate: null,
        backtestedPeriod: 'Pending'
    },

    'MULTI_SUPPORT_BO': {
        name: 'Multi-Day Support Bounce (Bear Trap)',
        description: 'Bounce from 5-day low — mean reversion LONG',
        file: './multiSupportBoStrategy.cjs',
        type: 'swing',
        status: 'active',
        active: true,
        analyzed: true,
        version: 'V3.0',
        target: 'ATR-based',
        targetApprox: '8-12%',
        stopLoss: 'ATR × 2',
        stopApprox: '5-8%',
        stopMethod: 'ATR',
        maxHoldDays: 20,
        holdingPeriod: '5-20 days',
        direction: 'LONG',
        backtestedWinRate: null,
        backtestedPeriod: 'Pending'
    },

    'UPSIDE_LOM_SWING': {
        name: 'Swing Bullish Divergence',
        description: 'Daily RSI divergence swing entry',
        file: './upsideLomSwingStrategy.cjs',
        type: 'swing',
        status: 'active',
        active: true,
        analyzed: true,
        version: 'V3.1',
        target: 4.0,
        stopLoss: 2.0,
        holdingPeriod: '5-7 days',
        direction: 'LONG',
        backtestedWinRate: null,
        backtestedPeriod: 'Pending'
    },

    'DOWNSIDE_LOM_SWING': {
        name: 'Swing Bearish Divergence',
        description: 'Daily RSI divergence swing SHORT',
        file: './downsideLomSwingStrategy.cjs',
        type: 'swing',
        status: 'active',
        active: true,
        analyzed: true,
        version: 'V3.1',
        target: 4.0,
        stopLoss: 2.0,
        holdingPeriod: '5-7 days',
        direction: 'SHORT',
        backtestedWinRate: null,
        backtestedPeriod: 'Pending'
    },

    'DAILY_CONTRACTION': {
        name: 'Insider NR7 Breakout',
        description: 'Insider NR7 contraction pattern with directional filters. SHORT-biased with strict LONG filters.',
        file: '../../strategy/dailyContractionStrategy.cjs',
        type: 'SWING',
        status: 'active',
        active: true,
        analyzed: true,
        version: 'V1.0',
        direction: 'BOTH',
        targetPercent: 1.5,   // 1.5R target
        stopPercent: -1.0,    // 1R stop
        maxHoldDays: 10,
        validDays: [1, 2, 3, 4, 5],
        avoidMonths: [],
        primeMonths: [],
        expectedSuccessRate: 0.65,
        priceTiers: {
            tier1: { minPrice: 0, maxPrice: 500, positionMultiplier: 1.0, candlePattern: 'ANY' },
            tier2: { minPrice: 500, maxPrice: 2000, positionMultiplier: 1.0, candlePattern: 'ANY' },
            tier3: { minPrice: 2000, maxPrice: 999999, positionMultiplier: 0.75, candlePattern: 'ANY' }
        },
        target: '1.5R (Risk-Reward)',
        stopLoss: 'Opposite NR7 extreme + 0.5%',
        holdingPeriod: '2-10 days',
        backtestedWinRate: 64.7,
        backtestedPeriod: 'Oct 2025 - Feb 2026',
        // UI Display Rules
        rules: [
            'Detect Insider NR7 pattern (NR7 + Inside Day)',
            'Wait for next day CLOSE confirmation',
            'SHORT: Close below NR7 Low + Downtrend required',
            'LONG: Close above NR7 High + Uptrend + High Quality only',
            'Stop Loss: Opposite extreme of NR7 range + 0.5% buffer',
            'Target: 1.5x Risk (1.5R)',
            'Max hold: 10 trading days',
            'Proven: LONG 100% WR | SHORT with Downtrend filter'
        ],
        filters: {
            minPrice: 50,
            maxPrice: 10000,
            insiderOnly: true,
            qualityScoreMin: 1
        }
    },

    'SHORT_TERM_SWING_BO_UP': {
        name: 'Short-Term Breakout Up',
        description: '5-day high breakout, quick swing',
        file: './shortTermSwingBoUpStrategy.cjs',
        type: 'swing',
        status: 'active',
        active: true,
        analyzed: true,
        version: 'V3.2',
        target: 'ATR-based',
        targetApprox: '5-8%',
        stopLoss: 'ATR × 1.5',
        stopApprox: '3-5%',
        stopMethod: 'ATR',
        maxHoldDays: 8,
        holdingPeriod: '3-8 days',
        direction: 'LONG',
        backtestedWinRate: null,
        backtestedPeriod: 'Pending'
    },

    'SHORT_TERM_SWING_BO_DOWN': {
        name: 'Swing Reversal (RSI oversold)',
        description: 'Buying the dip on short-term breakdown using RSI',
        file: '../../strategies/swingBoDownLongStrategy.cjs',
        type: 'swing',
        status: 'active',
        active: true,
        analyzed: true,
        version: 'V3.2',
        target: 'ATR-based',
        targetApprox: '5-8%',
        stopLoss: 'ATR × 1.5',
        stopApprox: '3-5%',
        stopMethod: 'ATR',
        maxHoldDays: 8,
        holdingPeriod: '3-8 days',
        direction: 'LONG',
        backtestedWinRate: null,
        backtestedPeriod: 'Pending'
    },

    'LONG_TERM_SWING_BO_UP': {
        name: 'Long-Term Breakout Up',
        description: '20-day high breakout, extended swing',
        file: './longTermSwingBoUpStrategy.cjs',
        type: 'swing',
        status: 'active',
        active: true,
        analyzed: true,
        version: 'V3.3',
        target: 'ATR-based',
        targetApprox: '8-12%',
        stopLoss: 'ATR × 2',
        stopApprox: '5-8%',
        stopMethod: 'ATR',
        maxHoldDays: 20,
        holdingPeriod: '5-20 days',
        direction: 'LONG',
        backtestedWinRate: null,
        backtestedPeriod: 'Pending'
    },

    'LONG_TERM_SWING_BO_DOWN': {
        name: 'Long-Term Mean Reversion (Oversold Bounce)',
        description: '20-day low bounce — mean reversion LONG',
        file: './longTermSwingBoDownStrategy.cjs',
        type: 'swing',
        status: 'active',
        active: true,
        analyzed: true,
        version: 'V3.3',
        target: 'ATR-based',
        targetApprox: '8-12%',
        stopLoss: 'ATR × 2',
        stopApprox: '5-8%',
        stopMethod: 'ATR',
        maxHoldDays: 20,
        holdingPeriod: '5-20 days',
        direction: 'LONG',
        backtestedWinRate: null,
        backtestedPeriod: 'Pending'
    },

    'LONG_TERM_BO_UP': {
        name: '52-Week High Breakout',
        description: 'Major yearly high breakout',
        file: './longTermBoUpStrategy.cjs',
        type: 'swing',
        status: 'active',
        active: true,
        analyzed: true,
        version: 'V3.4',
        target: 8.0,
        stopLoss: 3.0,
        holdingPeriod: '2-4 weeks',
        direction: 'LONG',
        backtestedWinRate: null,
        backtestedPeriod: 'Pending'
    },

    'PRE_MARKET': {
        name: 'Gap Up Short (Gap Fill)',
        description: 'SHORT stocks gapping up 3%+, target = gap fill at previous close',
        file: './preMarketStrategy.cjs',
        type: 'INTRADAY',
        status: 'active',
        active: true,          // Required by signal generator
        analyzed: true,        // Required by signal generator
        version: 'V3.0',
        direction: 'SHORT', // SHORT strategy - profit when price goes DOWN
        targetPercent: -3.0, // SHORT: Gap fill target (negative = price decrease)
        stopPercent: 2.0,    // Stop above OR high (positive = price increase is bad)
        maxHoldDays: 1,
        validDays: [1, 2, 3, 4, 5],
        avoidMonths: [],
        primeMonths: [],
        expectedSuccessRate: 0.85,
        priceTiers: {
            tier1: { minPrice: 0, maxPrice: 500, positionMultiplier: 1.5, candlePattern: 'ANY' },
            tier2: { minPrice: 500, maxPrice: 2000, positionMultiplier: 1.0, candlePattern: 'RED_ONLY' },
            tier3: { minPrice: 2000, maxPrice: 999999, positionMultiplier: 0.75, candlePattern: 'RED_ONLY' }
        },
        target: 'Gap Fill (Previous Close)',
        stopLoss: 'Above OR High',
        holdingPeriod: 'Same day (exit by 10:30 AM)',
        backtestedWinRate: 85.7,
        backtestedPeriod: 'Jan 15-21, 2026',
        // UI Display Rules
        rules: [
            'Detect stocks gapping UP ≥3% at market open',
            'Wait for Opening Range (OR) formation on 1-min chart',
            'Enter SHORT when price breaks OR low with conviction',
            'Target = Previous day close (gap fill)',
            'Stop = Above Opening Range high + 0.3%',
            'Exit by 10:30 AM if target/stop not hit'
        ],
        // Filter criteria
        filters: {
            minGap: 3.0,
            maxGap: 7.0,
            minVolume: 2.0,
            minBodyPercent: 50
        }
    }
};

class StrategyManager {

    /**
     * Get strategy configuration for a category
     */
    getStrategy(category) {
        const config = STRATEGY_CONFIG[category];

        if (!config) {
            throw new Error(`No strategy configured for category: ${category}`);
        }

        if (config.status === 'inactive') {
            throw new Error(`Strategy for ${category} is not active yet. ${config.reason || 'Coming soon!'}`);
        }

        // Load strategy module
        try {
            const strategyModule = require(config.file);
            return {
                config: config,
                backtest: strategyModule.backtestIntradayV21 || strategyModule.runBacktest,
                generateSignals: strategyModule.generateSignals
            };
        } catch (e) {
            throw new Error(`Failed to load strategy for ${category}: ${e.message}`);
        }
    }

    /**
     * Get raw strategy config object (for backtesting/signals)
     */
    getStrategyConfig(category) {
        const config = STRATEGY_CONFIG[category];
        if (!config) {
            throw new Error(`No strategy config found for: ${category}`);
        }
        return {
            ...config,
            categoryKey: category // Ensure categoryKey is present
        };
    }

    /**
     * Get raw strategy config object (for backtesting/signals)
     */
    getStrategyConfig(category) {
        const config = STRATEGY_CONFIG[category];
        if (!config) {
            throw new Error(`No strategy config found for: ${category}`);
        }
        return {
            ...config,
            categoryKey: category // Ensure categoryKey is present
        };
    }

    /**
     * Get all active strategies
     */
    getActiveStrategies() {
        return Object.entries(STRATEGY_CONFIG)
            .filter(([_, config]) => config.status === 'active')
            .map(([category, config]) => ({
                category,
                name: config.name,
                description: config.description,
                type: config.type,
                target: config.target,
                holdingPeriod: config.holdingPeriod,
                backtestedWinRate: config.backtestedWinRate
            }));
    }

    /**
     * Get all inactive strategies
     */
    getInactiveStrategies() {
        return Object.entries(STRATEGY_CONFIG)
            .filter(([_, config]) => config.status === 'inactive')
            .map(([category, config]) => ({
                category,
                name: config.name,
                description: config.description,
                type: config.type,
                status: config.status,
                reason: config.reason
            }));
    }

    /**
     * Get strategy info for a category (for UI display)
     */
    getStrategyInfo(category) {
        const config = STRATEGY_CONFIG[category];
        if (!config) return null;

        return {
            category,
            name: config.name,
            description: config.description,
            type: config.type,
            status: config.status,
            version: config.version,
            direction: config.direction,
            target: config.target,
            stopLoss: config.stopLoss,
            holdingPeriod: config.holdingPeriod,
            backtestedWinRate: config.backtestedWinRate,
            backtestedPeriod: config.backtestedPeriod,
            rules: config.rules || [],
            filters: config.filters || {},
            reason: config.reason
        };
    }

    /**
     * Get all strategy info (for UI dropdown/list)
     */
    getAllStrategyInfo() {
        return Object.keys(STRATEGY_CONFIG).map(category =>
            this.getStrategyInfo(category)
        );
    }

    /**
     * Check if a category has an active strategy
     */
    isStrategyActive(category) {
        const config = STRATEGY_CONFIG[category];
        return config && config.status === 'active';
    }

    /**
     * Get strategy name for a category (for UI display)
     * Returns name instead of version number
     */
    getStrategyName(category) {
        const config = STRATEGY_CONFIG[category];
        return config ? config.name : 'Unknown';
    }
}

// Export singleton
module.exports = new StrategyManager();
