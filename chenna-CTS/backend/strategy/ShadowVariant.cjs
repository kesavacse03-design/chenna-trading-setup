/**
 * Shadow Variant - Controlled Single-Rule Testing System
 * 
 * PURPOSE:
 * Test ONE rule change at a time against the same backtest period.
 * Measure real deltas. Accept only statistically meaningful improvements.
 * 
 * ARCHITECTURE:
 * 1. Take original trades as baseline
 * 2. Apply ONE rule change (from hypothesis)
 * 3. Simulate which trades would have been filtered
 * 4. Calculate deltas (trades removed, wins missed, losses avoided)
 * 5. Determine if improvement is statistically significant
 * 
 * PRINCIPLE:
 * If no improvement is proven, explicitly say so.
 * No forced optimism. No fake learning.
 */

/**
 * Test a hypothesis against baseline results
 * @param {Object} baseline - Original backtest results
 * @param {Object} hypothesis - Rule gap hypothesis to test
 * @param {Object} options - Testing options
 * @returns {Object} Variant test results
 */
function testHypothesis(baseline, hypothesis, options = {}) {
    const trades = baseline.executedTrades || [];
    const losses = trades.filter(t => t.result === 'LOSS');
    const wins = trades.filter(t => t.result === 'WIN');

    // Get the filter function for this hypothesis
    const filterFn = getHypothesisFilter(hypothesis);

    if (!filterFn) {
        return {
            hypothesisId: hypothesis.failureTag,
            status: 'NOT_TESTABLE',
            reason: 'No automated filter available for this hypothesis',
            recommendation: 'Implement manually and re-run backtest'
        };
    }

    // Apply filter to all trades
    const filteredTrades = trades.filter(trade => {
        const context = buildSimpleContext(trade);
        return filterFn(trade, context); // true = keep, false = filter out
    });

    const filteredLosses = filteredTrades.filter(t => t.result === 'LOSS');
    const filteredWins = filteredTrades.filter(t => t.result === 'WIN');

    // Calculate deltas
    const tradesRemoved = trades.length - filteredTrades.length;
    const lossesAvoided = losses.length - filteredLosses.length;
    const winsMissed = wins.length - filteredWins.length;

    // Calculate new metrics
    const newWinRate = filteredTrades.length > 0
        ? (filteredWins.length / filteredTrades.length * 100).toFixed(1)
        : '0';
    const oldWinRate = trades.length > 0
        ? (wins.length / trades.length * 100).toFixed(1)
        : '0';

    const winRateDelta = parseFloat(newWinRate) - parseFloat(oldWinRate);

    // Calculate PnL delta
    const removedLossPnl = losses
        .filter(t => !filteredTrades.includes(t))
        .reduce((sum, t) => sum + Math.abs(t.pnl || 0), 0);
    const missedWinPnl = wins
        .filter(t => !filteredTrades.includes(t))
        .reduce((sum, t) => sum + (t.pnl || 0), 0);
    const netPnlImprovement = removedLossPnl - missedWinPnl;

    // Determine statistical significance
    const isSignificant = evaluateSignificance({
        tradesRemoved,
        lossesAvoided,
        winsMissed,
        winRateDelta,
        netPnlImprovement,
        totalTrades: trades.length
    });

    return {
        hypothesisId: hypothesis.failureTag,
        variantName: `${baseline.category}-shadow-${hypothesis.failureTag.replace('FAIL_', '')}`,
        status: isSignificant.proven ? 'PROVEN' : 'NOT_PROVEN',

        baseline: {
            trades: trades.length,
            wins: wins.length,
            losses: losses.length,
            winRate: oldWinRate + '%'
        },

        variant: {
            trades: filteredTrades.length,
            wins: filteredWins.length,
            losses: filteredLosses.length,
            winRate: newWinRate + '%'
        },

        deltas: {
            tradesRemoved,
            lossesAvoided,
            winsMissed,
            winRateDelta: winRateDelta.toFixed(1) + '%',
            netPnlImprovement: netPnlImprovement.toFixed(2) + '%',
            lossToWinRatio: winsMissed > 0
                ? (lossesAvoided / winsMissed).toFixed(2)
                : 'Infinity'
        },

        significance: isSignificant,

        recommendation: isSignificant.proven
            ? `✅ PROVEN: Implement "${hypothesis.hypothesis}"`
            : `❌ NOT PROVEN: ${isSignificant.reason}`,

        implementation: hypothesis.implementation || null
    };
}

/**
 * Get filter function for a hypothesis
 */
function getHypothesisFilter(hypothesis) {
    const filters = {
        'FAIL_CONTEXT_PREMATURE_EXHAUSTION': (trade, ctx) => {
            // Keep trades that had proper momentum decay
            return ctx.holdingDays > 2 || ctx.qualityScore >= 3;
        },

        'FAIL_PRICE_NO_ACCEPTANCE': (trade, ctx) => {
            // Keep trades where price closed in upper half
            return ctx.acceptancePosition >= 0.5;
        },

        'FAIL_VOLUME_NO_ABSORPTION': (trade, ctx) => {
            // Keep trades with volume confirmation
            return ctx.volumeRatio >= 1.0;
        },

        'FAIL_ENTRY_LATE': (trade, ctx) => {
            // Keep trades entered early in bounce
            return ctx.bouncePercent < 0.4;
        },

        'FAIL_MANAGEMENT_TIGHT_STOP': (trade, ctx) => {
            // Let all trades through (management fix doesn't filter)
            return true;
        },

        'FAIL_SIGNAL_LOW_QUALITY': (trade, ctx) => {
            // Keep only high quality signals
            return ctx.qualityScore >= 3;
        },

        'FAIL_SIGNAL_OVERTRADING': (trade, ctx) => {
            // Would need symbol tracking - simplified version
            return true;
        }
    };

    return filters[hypothesis.failureTag];
}

/**
 * Build simple context from trade data
 */
function buildSimpleContext(trade) {
    let qualityScore = 2;
    if (trade.lifecycle && trade.lifecycle.length > 1) {
        const match = trade.lifecycle[1]?.reason?.match(/Quality: (\d)\/4/);
        if (match) qualityScore = parseInt(match[1]);
    }

    return {
        holdingDays: trade.holdingDays || 0,
        qualityScore,
        acceptancePosition: 0.5, // Default, would need candle data
        volumeRatio: 1.0, // Default, would need volume data
        bouncePercent: 0.2 // Default, would need price data
    };
}

/**
 * Evaluate if improvement is statistically significant
 */
function evaluateSignificance(metrics) {
    const { tradesRemoved, lossesAvoided, winsMissed, winRateDelta, netPnlImprovement, totalTrades } = metrics;

    // Criteria for significance:
    // 1. Must remove at least some trades
    if (tradesRemoved === 0) {
        return {
            proven: false,
            reason: 'No trades filtered by this rule'
        };
    }

    // 2. Must avoid more losses than wins missed (good selectivity)
    if (winsMissed >= lossesAvoided) {
        return {
            proven: false,
            reason: `Filter caught ${winsMissed} wins but only ${lossesAvoided} losses (poor selectivity)`
        };
    }

    // 3. Win rate must improve
    if (winRateDelta <= 0) {
        return {
            proven: false,
            reason: `Win rate did not improve (delta: ${winRateDelta.toFixed(1)}%)`
        };
    }

    // 4. Net PnL must improve
    if (netPnlImprovement <= 0) {
        return {
            proven: false,
            reason: `Net PnL did not improve (missed wins > avoided losses)`
        };
    }

    // 5. Must have statistical power (not based on 1-2 trades)
    if (tradesRemoved < 3) {
        return {
            proven: false,
            reason: `Too few trades affected (${tradesRemoved}) for statistical confidence`
        };
    }

    // Passed all criteria
    return {
        proven: true,
        confidence: calculateConfidence(metrics),
        reason: `Avoids ${lossesAvoided} losses, misses only ${winsMissed} wins (${(lossesAvoided / winsMissed).toFixed(1)}:1 ratio)`
    };
}

/**
 * Calculate confidence level based on metrics
 */
function calculateConfidence(metrics) {
    const { lossesAvoided, winsMissed, tradesRemoved, totalTrades } = metrics;

    // Higher confidence with:
    // - Better loss:win ratio
    // - More trades affected
    // - Higher % of losses avoided

    const selectivityRatio = winsMissed > 0 ? lossesAvoided / winsMissed : 5;
    const coverageRatio = tradesRemoved / totalTrades;

    let confidence = 0.5; // Base

    if (selectivityRatio >= 3) confidence += 0.2;
    else if (selectivityRatio >= 2) confidence += 0.1;

    if (tradesRemoved >= 5) confidence += 0.1;
    if (coverageRatio >= 0.1) confidence += 0.1;

    return Math.min(confidence, 0.95);
}

/**
 * Test all hypotheses against baseline
 */
function testAllHypotheses(baseline, hypotheses) {
    const results = [];

    for (const hypothesis of hypotheses) {
        if (hypothesis.testable !== false) {
            results.push(testHypothesis(baseline, hypothesis));
        }
    }

    // Sort by proven status and improvement
    results.sort((a, b) => {
        if (a.status === 'PROVEN' && b.status !== 'PROVEN') return -1;
        if (b.status === 'PROVEN' && a.status !== 'PROVEN') return 1;

        const aImprovement = parseFloat(a.deltas?.winRateDelta) || 0;
        const bImprovement = parseFloat(b.deltas?.winRateDelta) || 0;
        return bImprovement - aImprovement;
    });

    return {
        totalTested: results.length,
        proven: results.filter(r => r.status === 'PROVEN').length,
        notProven: results.filter(r => r.status === 'NOT_PROVEN').length,
        notTestable: results.filter(r => r.status === 'NOT_TESTABLE').length,
        results
    };
}

module.exports = {
    testHypothesis,
    testAllHypotheses,
    getHypothesisFilter,
    evaluateSignificance
};
