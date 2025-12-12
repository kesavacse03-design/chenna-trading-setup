/**
 * Shadow Learner Service
 * Analyzes failed trades to identify common trap patterns
 * Generates "trap avoidance" rules to improve future strategies
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

class ShadowLearner {
    constructor() {
        this.failedTrades = [];
        this.successTrades = [];
        this.patterns = [];
    }

    /**
     * Analyze trades and separate winners from losers
     * @param {Array} trades - All trades from backtest
     */
    analyzeTrades(trades) {
        this.failedTrades = trades.filter(t => t.pnl < 0 || t.exitReason === 'STOP');
        this.successTrades = trades.filter(t => t.pnl > 0 || t.exitReason === 'TARGET');

        console.log(`\n🔍 Shadow Learner Analysis:`);
        console.log(`   Failed trades: ${this.failedTrades.length}`);
        console.log(`   Success trades: ${this.successTrades.length}`);

        return {
            failedCount: this.failedTrades.length,
            successCount: this.successTrades.length,
            failRate: trades.length > 0 ?
                (this.failedTrades.length / trades.length * 100).toFixed(1) : 0
        };
    }

    /**
     * Identify common patterns in failed trades
     * @returns {Array} Detected failure patterns
     */
    identifyFailurePatterns() {
        if (this.failedTrades.length === 0) {
            return { patterns: [], message: 'No failed trades to analyze' };
        }

        const patterns = [];

        // Pattern 1: Day-of-week analysis
        const dowPattern = this.analyzeDayOfWeek();
        if (dowPattern) patterns.push(dowPattern);

        // Pattern 2: Entry timing (early vs late in day)
        const timingPattern = this.analyzeEntryTiming();
        if (timingPattern) patterns.push(timingPattern);

        // Pattern 3: RSI at entry analysis
        const rsiPattern = this.analyzeRSIAtEntry();
        if (rsiPattern) patterns.push(rsiPattern);

        // Pattern 4: Volume analysis
        const volumePattern = this.analyzeVolumeAtEntry();
        if (volumePattern) patterns.push(volumePattern);

        // Pattern 5: Trend alignment
        const trendPattern = this.analyzeTrendAlignment();
        if (trendPattern) patterns.push(trendPattern);

        // Pattern 6: Holding period analysis
        const holdingPattern = this.analyzeHoldingPeriod();
        if (holdingPattern) patterns.push(holdingPattern);

        // Pattern 7: Stop-loss proximity
        const proximityPattern = this.analyzeStopProximity();
        if (proximityPattern) patterns.push(proximityPattern);

        this.patterns = patterns;

        console.log(`\n📊 Identified ${patterns.length} failure patterns:`);
        patterns.forEach((p, i) => {
            console.log(`   ${i + 1}. ${p.name}: ${p.observation}`);
        });

        return patterns;
    }

    /**
     * Analyze day-of-week failure concentration
     */
    analyzeDayOfWeek() {
        const dayCount = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 };
        const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

        for (const trade of this.failedTrades) {
            if (trade.entryDate) {
                const day = new Date(trade.entryDate).getDay();
                dayCount[day]++;
            }
        }

        // Find worst day
        let worstDay = 0;
        let maxFails = 0;
        for (const [day, count] of Object.entries(dayCount)) {
            if (count > maxFails) {
                maxFails = count;
                worstDay = parseInt(day);
            }
        }

        const failRate = maxFails / this.failedTrades.length;

        if (failRate > 0.3) { // More than 30% of failures on one day
            return {
                name: 'Day-of-Week Trap',
                type: 'dayOfWeek',
                observation: `${dayNames[worstDay]} has ${(failRate * 100).toFixed(0)}% of failures`,
                rule: `Avoid entries on ${dayNames[worstDay]}`,
                confidence: failRate,
                data: { worstDay, dayNames: dayNames[worstDay], count: maxFails }
            };
        }
        return null;
    }

    /**
     * Analyze entry timing patterns
     */
    analyzeEntryTiming() {
        // Count how many failures happen with small prior moves (false breakouts)
        let falseBreakouts = 0;

        for (const trade of this.failedTrades) {
            // If stopped out quickly (within 2 days), likely false breakout
            if (trade.holdingDays && trade.holdingDays <= 2) {
                falseBreakouts++;
            }
        }

        const rate = this.failedTrades.length > 0 ?
            falseBreakouts / this.failedTrades.length : 0;

        if (rate > 0.4) {
            return {
                name: 'False Breakout Trap',
                type: 'falseBreakout',
                observation: `${(rate * 100).toFixed(0)}% of failures stop out within 2 days`,
                rule: 'Wait for confirmation candle before entry',
                confidence: rate,
                data: { quickStops: falseBreakouts, total: this.failedTrades.length }
            };
        }
        return null;
    }

    /**
     * Analyze RSI levels at failed entries
     */
    analyzeRSIAtEntry() {
        // This requires indicator data at entry, which we may not have
        // Instead, analyze based on available trade data
        let extremeRSIFails = 0;

        // Check if entries with very low RSI (<20) fail more often
        // This would be detected via entry.indicators if available

        return null; // Placeholder - needs indicator data at entry
    }

    /**
     * Analyze volume patterns at failures
     */
    analyzeVolumeAtEntry() {
        // Check for low-volume entries that fail
        let lowVolumeCount = 0;

        // Placeholder - needs volume data
        return null;
    }

    /**
     * Analyze trend alignment at failures
     */
    analyzeTrendAlignment() {
        // Count failures where trade went against longer-term trend
        return null; // Placeholder - needs trend data
    }

    /**
     * Analyze holding period patterns
     */
    analyzeHoldingPeriod() {
        if (this.failedTrades.length === 0) return null;

        const holdingDays = this.failedTrades
            .filter(t => t.holdingDays)
            .map(t => t.holdingDays);

        if (holdingDays.length === 0) return null;

        const avgHolding = holdingDays.reduce((a, b) => a + b, 0) / holdingDays.length;
        const maxHolding = Math.max(...holdingDays);

        // If most failures happen after long holding (7+ days), need tighter time stop
        const longHoldFails = holdingDays.filter(h => h >= 7).length;
        const longHoldRate = longHoldFails / holdingDays.length;

        if (longHoldRate > 0.3) {
            return {
                name: 'Time Decay Trap',
                type: 'holdingPeriod',
                observation: `${(longHoldRate * 100).toFixed(0)}% of failures after 7+ days holding`,
                rule: 'Consider time-based exit after 5 days',
                confidence: longHoldRate,
                data: { avgHolding: avgHolding.toFixed(1), longHoldFails }
            };
        }

        return null;
    }

    /**
     * Analyze stop-loss proximity patterns
     */
    analyzeStopProximity() {
        // Check if stops are being hit very close to entry (too tight)
        let veryCloseStops = 0;

        for (const trade of this.failedTrades) {
            if (trade.pnlPercent && Math.abs(trade.pnlPercent) < 1.0) {
                veryCloseStops++;
            }
        }

        const rate = this.failedTrades.length > 0 ?
            veryCloseStops / this.failedTrades.length : 0;

        if (rate > 0.5) {
            return {
                name: 'Stop Too Tight',
                type: 'stopProximity',
                observation: `${(rate * 100).toFixed(0)}% of stops triggered within 1%`,
                rule: 'Widen stop loss to 2% or use ATR-based stops',
                confidence: rate,
                data: { tightStops: veryCloseStops }
            };
        }

        return null;
    }

    /**
     * Generate trap avoidance rules from identified patterns
     * @returns {Object} Rules configuration
     */
    generateTrapAvoidanceRules() {
        const rules = {
            filters: [],
            adjustments: [],
            warnings: []
        };

        for (const pattern of this.patterns) {
            switch (pattern.type) {
                case 'dayOfWeek':
                    rules.filters.push({
                        type: 'avoidDay',
                        day: pattern.data.worstDay,
                        dayName: pattern.data.dayNames,
                        confidence: pattern.confidence
                    });
                    break;

                case 'falseBreakout':
                    rules.filters.push({
                        type: 'requireConfirmation',
                        waitCandles: 1,
                        confidence: pattern.confidence
                    });
                    break;

                case 'holdingPeriod':
                    rules.adjustments.push({
                        type: 'addTimeStop',
                        maxDays: 5,
                        confidence: pattern.confidence
                    });
                    break;

                case 'stopProximity':
                    rules.adjustments.push({
                        type: 'widenStop',
                        minStop: 2.0,
                        useATR: true,
                        confidence: pattern.confidence
                    });
                    break;

                default:
                    rules.warnings.push({
                        pattern: pattern.name,
                        observation: pattern.observation,
                        suggestedRule: pattern.rule
                    });
            }
        }

        console.log(`\n✅ Generated ${rules.filters.length} filters, ${rules.adjustments.length} adjustments`);

        return rules;
    }

    /**
     * Create shadow insight summary for V1 strategy
     */
    createShadowInsight() {
        const analysis = this.analyzeTrades(this.failedTrades.concat(this.successTrades));
        const patterns = this.identifyFailurePatterns();
        const rules = this.generateTrapAvoidanceRules();

        return {
            analysis,
            patterns,
            rules,
            summary: {
                totalPatterns: patterns.length,
                highConfidencePatterns: patterns.filter(p => p.confidence > 0.5).length,
                recommendations: patterns.map(p => p.rule).filter(Boolean)
            },
            timestamp: new Date().toISOString()
        };
    }

    /**
     * Save shadow insights to database
     */
    async saveShadowInsights(categoryKey, insights) {
        try {
            // Store as JSON in a simple table or file
            const fs = require('fs');
            const path = require('path');

            const dir = path.join(__dirname, '../results/shadow');
            if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

            const filename = `shadow_${categoryKey}_${Date.now()}.json`;
            fs.writeFileSync(
                path.join(dir, filename),
                JSON.stringify(insights, null, 2)
            );

            console.log(`💾 Shadow insights saved: ${filename}`);
            return filename;
        } catch (error) {
            console.error('Failed to save shadow insights:', error);
            return null;
        }
    }

    /**
     * Apply shadow rules to filter potential entries
     * @param {Object} entryContext - Current entry opportunity
     * @param {Object} rules - Shadow avoidance rules
     * @returns {Object} Filter result
     */
    applyRules(entryContext, rules) {
        const blocks = [];
        const warnings = [];

        // Check day-of-week filters
        for (const filter of rules.filters) {
            if (filter.type === 'avoidDay') {
                const entryDay = new Date(entryContext.date).getDay();
                if (entryDay === filter.day) {
                    blocks.push({
                        reason: `Avoid ${filter.dayName} (${(filter.confidence * 100).toFixed(0)}% fail rate)`,
                        rule: filter
                    });
                }
            }

            if (filter.type === 'requireConfirmation' && !entryContext.hasConfirmation) {
                warnings.push({
                    reason: 'Entry should wait for confirmation candle',
                    rule: filter
                });
            }
        }

        return {
            allowed: blocks.length === 0,
            blocks,
            warnings
        };
    }
}

module.exports = ShadowLearner;
