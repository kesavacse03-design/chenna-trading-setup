/**
 * Failure Taxonomy - Structural Market-Based Failure Classification
 * 
 * For: DOWNSIDE LOM SWING Strategy
 * 
 * PURPOSE:
 * Every trade failure has a STRUCTURAL market cause.
 * This taxonomy maps failures to real market behavior, not symptoms.
 * 
 * CATEGORY DNA:
 * Downside LOM Swing trades work only when:
 * - Downside pressure is EXHAUSTING, not expanding
 * - Smart money is ABSORBING, not distributing
 * - The move is LATE-STAGE, not early-stage
 * - The trade is a REACTION, not anticipation
 * 
 * Every failure happens when one of these truths is violated.
 */

// ============================================
// LAYER A — STRUCTURAL CONTEXT FAILURES
// These kill the trade before entry even matters
// ============================================

const CONTEXT_FAILURES = {
    FAIL_CONTEXT_HTF_TREND: {
        tag: 'FAIL_CONTEXT_HTF_TREND',
        category: 'Context',
        severity: 'HIGH',
        description: 'Trade taken against dominant higher-timeframe trend',
        marketReality: 'LOM bounce works ONLY inside weakening trends. Strong trends do not exhaust cleanly.',
        detection: (trade, context) => {
            // HTF trend is bearish (lower lows, lower highs) and we went long
            return context.htfTrend === 'STRONG_DOWN' && trade.direction === 'LONG';
        }
    },

    FAIL_CONTEXT_PREMATURE_EXHAUSTION: {
        tag: 'FAIL_CONTEXT_PREMATURE_EXHAUSTION',
        category: 'Context',
        severity: 'HIGH',
        description: 'Entry on first downside push, no compression or slowdown',
        marketReality: 'Exhaustion is a PROCESS, not a candle. Needs multiple failed pushes or momentum decay.',
        detection: (trade, context) => {
            // Entry within first 2 candles of down move, no prior rejection
            return context.candlesSinceDownStart <= 2 && !context.priorRejection;
        }
    },

    FAIL_CONTEXT_VOLATILITY_EXPANSION: {
        tag: 'FAIL_CONTEXT_VOLATILITY_EXPANSION',
        category: 'Context',
        severity: 'MEDIUM',
        description: 'Entry during range expansion / ATR expanding rapidly',
        marketReality: 'Exhaustion setups fail during volatility expansion. They work during VOLATILITY DECAY.',
        detection: (trade, context) => {
            // ATR expanding vs 5-day average
            return context.atrRatio > 1.3; // 30% above average
        }
    }
};

// ============================================
// LAYER B — PRICE ACTION FAILURES
// Entry looked good, but structure said "no"
// ============================================

const PRICE_ACTION_FAILURES = {
    FAIL_PRICE_NO_ACCEPTANCE: {
        tag: 'FAIL_PRICE_NO_ACCEPTANCE',
        category: 'Price Action',
        severity: 'HIGH',
        description: 'Lower wick present but next candle closed below wick midpoint or low',
        marketReality: 'Wick ≠ buying. Acceptance = close above rejection zone.',
        detection: (trade, context) => {
            // Has wick but acceptance candle closed in lower half
            return context.hasLowerWick && context.acceptanceClosePosition < 0.5;
        }
    },

    FAIL_PRICE_MOMENTUM_WICK: {
        tag: 'FAIL_PRICE_MOMENTUM_WICK',
        category: 'Price Action',
        severity: 'MEDIUM',
        description: 'Wick formed inside large red momentum candle, no reduction in body size',
        marketReality: 'That wick is profit-taking, not absorption.',
        detection: (trade, context) => {
            // Large red body with wick, body still dominant
            return context.bodyToRangeRatio > 0.7 && context.candleColor === 'RED';
        }
    },

    FAIL_PRICE_NO_BASE: {
        tag: 'FAIL_PRICE_NO_BASE',
        category: 'Price Action',
        severity: 'MEDIUM',
        description: 'Price bounced but without forming a base / pause / sideways absorption',
        marketReality: 'Smart money builds positions sideways. V-bounces fail more often in swings.',
        detection: (trade, context) => {
            // Direct V-bounce without consolidation
            return context.isVBounce && !context.hasConsolidation;
        }
    }
};

// ============================================
// LAYER C — VOLUME & PARTICIPATION FAILURES
// This separates retail traps from real reversals
// ============================================

const VOLUME_FAILURES = {
    FAIL_VOLUME_NO_ABSORPTION: {
        tag: 'FAIL_VOLUME_NO_ABSORPTION',
        category: 'Volume',
        severity: 'HIGH',
        description: 'Wick present but volume flat or declining abnormally',
        marketReality: 'Exhaustion requires EFFORT vs RESULT. Price rejection without effort is meaningless.',
        detection: (trade, context) => {
            // Wick present but volume below average
            return context.hasLowerWick && context.volumeRatio < 0.8;
        }
    },

    FAIL_VOLUME_DISTRIBUTION_TRAP: {
        tag: 'FAIL_VOLUME_DISTRIBUTION_TRAP',
        category: 'Volume',
        severity: 'HIGH',
        description: 'High volume at lows but no follow-through, next candles fail immediately',
        marketReality: 'Institutions sell into retail "bottom buying".',
        detection: (trade, context) => {
            // High volume but immediate failure (stopped within 2 days)
            return context.volumeRatio > 1.5 && trade.holdingDays <= 2 && trade.result === 'LOSS';
        }
    }
};

// ============================================
// LAYER D — TIMING & ENTRY FAILURES
// Good idea, bad execution
// ============================================

const TIMING_FAILURES = {
    FAIL_ENTRY_NO_CONFIRM_CLOSE: {
        tag: 'FAIL_ENTRY_NO_CONFIRM_CLOSE',
        category: 'Entry Timing',
        severity: 'MEDIUM',
        description: 'Entry taken intra-candle, final close invalidated signal',
        marketReality: 'Swings demand CONFIRMED CLOSES, not anticipation.',
        detection: (trade, context) => {
            // Entry price above close price of signal candle
            return context.entryAboveSignalClose;
        }
    },

    FAIL_ENTRY_NO_RETEST: {
        tag: 'FAIL_ENTRY_NO_RETEST',
        category: 'Entry Timing',
        severity: 'MEDIUM',
        description: 'Entry on first bounce candle, no retest of low or range',
        marketReality: 'Best swing entries happen on ACCEPTANCE or RETEST.',
        detection: (trade, context) => {
            // Entry on first green candle without retest
            return context.isFirstBounce && !context.hasRetest;
        }
    },

    FAIL_ENTRY_LATE: {
        tag: 'FAIL_ENTRY_LATE',
        category: 'Entry Timing',
        severity: 'HIGH',
        description: 'Entry after 40-60% bounce already done, poor R:R',
        marketReality: 'Late entries die by math, not logic.',
        detection: (trade, context) => {
            // Entry after significant move from low
            return context.bouncePercentFromLow > 0.4;
        }
    }
};

// ============================================
// LAYER E — TRADE MANAGEMENT FAILURES
// Trade was right, handling was wrong
// ============================================

const MANAGEMENT_FAILURES = {
    FAIL_MANAGEMENT_TIGHT_STOP: {
        tag: 'FAIL_MANAGEMENT_TIGHT_STOP',
        category: 'Trade Management',
        severity: 'MEDIUM',
        description: 'Stop hit inside normal swing volatility',
        marketReality: 'Swings breathe; tight stops are structural errors.',
        detection: (trade, context) => {
            // Stop was within 1 ATR and trade would have worked
            return context.stopWithinATR && context.wouldHaveWorked;
        }
    },

    FAIL_MANAGEMENT_EARLY_TRAIL: {
        tag: 'FAIL_MANAGEMENT_EARLY_TRAIL',
        category: 'Trade Management',
        severity: 'LOW',
        description: 'Trailing stop activated before structure resolved',
        marketReality: 'Trail only after higher low forms.',
        detection: (trade, context) => {
            // Trailing activated before higher low
            return trade.exitReason === 'TRAILING_STOP' && !context.higherLowFormed;
        }
    },

    FAIL_MANAGEMENT_BAD_PARTIAL: {
        tag: 'FAIL_MANAGEMENT_BAD_PARTIAL',
        category: 'Trade Management',
        severity: 'LOW',
        description: 'Partial exit taken inside congestion, reduced ability to hold winners',
        marketReality: 'Partial exits belong at STRUCTURAL LEVELS, not emotions.',
        detection: (trade, context) => {
            // Partial exit in middle of range
            return trade.partialExitPrice && context.partialInCongestion;
        }
    }
};

// ============================================
// LAYER F — SIGNAL QUALITY FAILURES
// System-level discipline issues
// ============================================

const SIGNAL_FAILURES = {
    FAIL_SIGNAL_OVERTRADING: {
        tag: 'FAIL_SIGNAL_OVERTRADING',
        category: 'Signal Quality',
        severity: 'MEDIUM',
        description: 'Multiple entries during same down leg',
        marketReality: 'One exhaustion per phase, not many.',
        detection: (trade, context) => {
            // Multiple entries on same symbol in short period
            return context.entriesThisPhase > 1;
        }
    },

    FAIL_SIGNAL_LOW_QUALITY: {
        tag: 'FAIL_SIGNAL_LOW_QUALITY',
        category: 'Signal Quality',
        severity: 'MEDIUM',
        description: 'Signal met minimum rule but lacked confluence',
        marketReality: 'Swings require stacked evidence.',
        detection: (trade, context) => {
            // Quality score below threshold
            return context.qualityScore < 3;
        }
    }
};

// ============================================
// COMBINED TAXONOMY
// ============================================

const FAILURE_TAXONOMY = {
    ...CONTEXT_FAILURES,
    ...PRICE_ACTION_FAILURES,
    ...VOLUME_FAILURES,
    ...TIMING_FAILURES,
    ...MANAGEMENT_FAILURES,
    ...SIGNAL_FAILURES
};

// Get all tags as array
const ALL_FAILURE_TAGS = Object.keys(FAILURE_TAXONOMY);

// Severity weights for impact calculation
const SEVERITY_WEIGHTS = {
    HIGH: 3,
    MEDIUM: 2,
    LOW: 1
};

/**
 * Analyze a trade and return all applicable failure tags
 * @param {Object} trade - The trade to analyze
 * @param {Object} context - Market context at time of trade
 * @returns {Array} Array of failure tag objects
 */
function analyzeTradeFailures(trade, context) {
    const failures = [];

    // Only analyze losing trades
    if (trade.result !== 'LOSS') {
        return failures;
    }

    for (const [tag, config] of Object.entries(FAILURE_TAXONOMY)) {
        try {
            if (config.detection(trade, context)) {
                failures.push({
                    tag,
                    category: config.category,
                    severity: config.severity,
                    description: config.description,
                    marketReality: config.marketReality
                });
            }
        } catch (e) {
            // Skip if detection function fails (missing data)
        }
    }

    return failures;
}

/**
 * Aggregate failures and calculate impact
 * @param {Array} taggedTrades - Trades with failure tags
 * @returns {Object} Aggregated failure analysis
 */
function aggregateFailures(taggedTrades) {
    const aggregation = {};

    for (const trade of taggedTrades) {
        if (!trade.failureTags) continue;

        for (const failure of trade.failureTags) {
            if (!aggregation[failure.tag]) {
                aggregation[failure.tag] = {
                    ...failure,
                    count: 0,
                    totalLoss: 0,
                    trades: []
                };
            }

            aggregation[failure.tag].count++;
            aggregation[failure.tag].totalLoss += Math.abs(trade.pnl || 0);
            aggregation[failure.tag].trades.push({
                symbol: trade.symbol,
                date: trade.entryDate,
                pnl: trade.pnl
            });
        }
    }

    // Calculate impact score
    const totalLosses = taggedTrades.filter(t => t.result === 'LOSS').length;
    for (const tag of Object.keys(aggregation)) {
        const item = aggregation[tag];
        item.impactPct = ((item.count / totalLosses) * 100).toFixed(1);
        item.impactScore = item.count * SEVERITY_WEIGHTS[item.severity];
    }

    // Sort by impact score
    return Object.values(aggregation)
        .sort((a, b) => b.impactScore - a.impactScore);
}

module.exports = {
    FAILURE_TAXONOMY,
    ALL_FAILURE_TAGS,
    SEVERITY_WEIGHTS,
    analyzeTradeFailures,
    aggregateFailures,
    // Export categories for reference
    CONTEXT_FAILURES,
    PRICE_ACTION_FAILURES,
    VOLUME_FAILURES,
    TIMING_FAILURES,
    MANAGEMENT_FAILURES,
    SIGNAL_FAILURES
};
