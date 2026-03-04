/**
 * Trade Rejection Brain
 * 
 * PURPOSE: Decide which trades to REJECT, not which to select
 * 
 * A real trader never asks: "Is this pattern valid?"
 * A real trader asks: "Should I take THIS trade?"
 * 
 * This brain scores RISK of failure, not probability of success.
 * 
 * Output Buckets:
 * - PRIMARY: Low risk, good setup
 * - SECONDARY: Conditional, needs caution
 * - AVOID: Explicitly reject, DO NOT TRADE
 */

class TradeRejectionBrain {

    constructor() {
        // Risk factors with weights
        this.riskFactors = {
            lowVolume: { weight: 20, condition: (ctx) => ctx.volumeRatio < 0.7 },
            highRSI: { weight: 25, condition: (ctx) => ctx.rsi > 60 },
            gapDown: { weight: 30, condition: (ctx) => ctx.isGapDown === true },
            weakClose: { weight: 15, condition: (ctx) => ctx.closePosition < 0.3 },
            wrongDirection: { weight: 25, condition: (ctx) => ctx.priorChange > 3 },
            highVolatility: { weight: 20, condition: (ctx) => ctx.atrPercent > 5 },
            noMomentum: { weight: 15, condition: (ctx) => ctx.priorChange >= 0 && ctx.priorChange < 1 }
        };

        // Conditional combinations (the key insight)
        // These are learned from failures vs successes comparison
        this.conditionalRejections = [
            {
                name: 'low_volume_hostile',
                conditions: ['lowVolume', 'gapDown'],
                action: 'AVOID',
                reason: 'Low volume entry during gap down - high failure rate'
            },
            {
                name: 'extended_no_pullback',
                conditions: ['highRSI', 'wrongDirection'],
                action: 'AVOID',
                reason: 'Extended RSI with prior up-move - likely reversal candidate gone too far'
            },
            {
                name: 'weak_setup',
                conditions: ['lowVolume', 'weakClose', 'noMomentum'],
                action: 'AVOID',
                reason: 'Weak setup: no volume, weak close, no prior momentum'
            },
            {
                name: 'volatile_gap',
                conditions: ['highVolatility', 'gapDown'],
                action: 'SECONDARY',
                reason: 'High volatility with gap - proceed with caution'
            }
        ];

        // Thresholds for buckets
        this.thresholds = {
            primary: 30,    // Risk score < 30 = PRIMARY
            secondary: 60,  // Risk score 30-60 = SECONDARY
            avoid: 100      // Risk score > 60 = AVOID
        };
    }

    /**
     * Evaluate a trade and return rejection decision
     * @param {object} trade - Trade object with context
     * @param {object} marketContext - Optional market conditions
     * @returns {object} { bucket, riskScore, reasons, action }
     */
    evaluateTrade(trade, marketContext = null) {
        const ctx = trade.context || {};
        let riskScore = 0;
        const reasons = [];
        const activeRisks = [];

        // Step 1: Calculate base risk score from individual factors
        for (const [factorName, factor] of Object.entries(this.riskFactors)) {
            if (factor.condition(ctx)) {
                riskScore += factor.weight;
                activeRisks.push(factorName);
                reasons.push(`${factorName}: +${factor.weight} risk`);
            }
        }

        // Step 2: Check conditional combinations
        // These override base score when matched
        for (const combo of this.conditionalRejections) {
            const allMatch = combo.conditions.every(c => activeRisks.includes(c));
            if (allMatch) {
                if (combo.action === 'AVOID') {
                    return {
                        bucket: 'AVOID',
                        riskScore: 100,
                        reasons: [combo.reason],
                        action: 'REJECT',
                        matchedRule: combo.name,
                        symbol: trade.symbol
                    };
                } else if (combo.action === 'SECONDARY') {
                    // Only downgrade if not already worse
                    riskScore = Math.max(riskScore, this.thresholds.secondary);
                    reasons.push(combo.reason);
                }
            }
        }

        // Step 3: Determine bucket based on risk score
        let bucket, action;
        if (riskScore < this.thresholds.primary) {
            bucket = 'PRIMARY';
            action = 'ALLOW';
        } else if (riskScore < this.thresholds.secondary) {
            bucket = 'SECONDARY';
            action = 'ALLOW_WITH_CAUTION';
        } else {
            bucket = 'AVOID';
            action = 'REJECT';
        }

        return {
            bucket,
            riskScore,
            reasons,
            action,
            activeRisks,
            symbol: trade.symbol
        };
    }

    /**
     * Process a batch of trades and categorize into buckets
     * @param {array} trades - Array of trade objects
     * @param {object} marketContext - Optional market conditions
     * @returns {object} { primary, secondary, avoid, stats }
     */
    processTrades(trades, marketContext = null) {
        const primary = [];
        const secondary = [];
        const avoid = [];

        for (const trade of trades) {
            const result = this.evaluateTrade(trade, marketContext);
            trade.rejectionResult = result; // Attach to trade for reference

            switch (result.bucket) {
                case 'PRIMARY':
                    primary.push(trade);
                    break;
                case 'SECONDARY':
                    secondary.push(trade);
                    break;
                case 'AVOID':
                    avoid.push(trade);
                    break;
            }
        }

        // Log summary
        console.log(`\n🧠 Trade Rejection Brain Results:`);
        console.log(`   ✅ PRIMARY (Low Risk): ${primary.length} trades`);
        console.log(`   ⚠️ SECONDARY (Caution): ${secondary.length} trades`);
        console.log(`   ❌ AVOID (Rejected): ${avoid.length} trades`);

        // Log why trades were rejected
        if (avoid.length > 0 && avoid.length <= 10) {
            console.log(`\n   🚫 Rejected Trades:`);
            for (const trade of avoid.slice(0, 5)) {
                console.log(`      ${trade.symbol}: ${trade.rejectionResult.reasons[0]}`);
            }
        }

        return {
            primary,
            secondary,
            avoid,
            stats: {
                total: trades.length,
                primaryCount: primary.length,
                secondaryCount: secondary.length,
                avoidCount: avoid.length,
                rejectionRate: ((avoid.length / trades.length) * 100).toFixed(1) + '%'
            }
        };
    }

    /**
     * Learn new conditional rejection rules from failure analysis
     * @param {array} failedTrades - Trades that resulted in loss
     * @param {array} successfulTrades - Trades that resulted in profit
     */
    learnFromFailures(failedTrades, successfulTrades) {
        // Find conditions common in failures but not in successes
        const failurePatterns = {};
        const successPatterns = {};

        // Count risk factor occurrences in failures
        for (const trade of failedTrades) {
            const ctx = trade.context || {};
            for (const [factorName, factor] of Object.entries(this.riskFactors)) {
                if (factor.condition(ctx)) {
                    failurePatterns[factorName] = (failurePatterns[factorName] || 0) + 1;
                }
            }
        }

        // Count risk factor occurrences in successes
        for (const trade of successfulTrades) {
            const ctx = trade.context || {};
            for (const [factorName, factor] of Object.entries(this.riskFactors)) {
                if (factor.condition(ctx)) {
                    successPatterns[factorName] = (successPatterns[factorName] || 0) + 1;
                }
            }
        }

        // Find factors more common in failures
        const newRules = [];
        const totalFails = failedTrades.length || 1;
        const totalWins = successfulTrades.length || 1;

        console.log(`\n🎓 Learning from ${totalFails} failures vs ${totalWins} successes:`);

        for (const [factor, failCount] of Object.entries(failurePatterns)) {
            const failRate = (failCount / totalFails) * 100;
            const successCount = successPatterns[factor] || 0;
            const successRate = (successCount / totalWins) * 100;
            const lift = failRate - successRate;

            if (lift > 15) {
                console.log(`   📌 ${factor}: ${failRate.toFixed(0)}% of failures vs ${successRate.toFixed(0)}% of wins (lift: +${lift.toFixed(0)}%)`);

                // Increase weight for this factor
                if (this.riskFactors[factor]) {
                    const oldWeight = this.riskFactors[factor].weight;
                    this.riskFactors[factor].weight = Math.min(50, oldWeight + 10);
                    newRules.push({
                        factor,
                        oldWeight,
                        newWeight: this.riskFactors[factor].weight
                    });
                }
            }
        }

        return { learnedRules: newRules };
    }
}

module.exports = new TradeRejectionBrain();
