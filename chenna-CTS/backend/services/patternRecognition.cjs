/**
 * Pattern Recognition Service for Shadow Learner (Phase 3)
 * Analyzes outcomes to discover winning patterns and failure modes
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const outcomeTracker = require('./outcomeTracker.cjs');

class PatternRecognitionEngine {

    /**
     * Main analysis entry point
     * Analyzes all outcomes for a category and discovers patterns
     */
    async analyze(categoryKey, options = {}) {
        const { days = 30, minSampleSize = 20 } = options;

        console.log(`[Pattern] Analyzing patterns for ${categoryKey} (last ${days} days)`);

        // Get recent outcomes
        const outcomes = await outcomeTracker.getRecentOutcomes(categoryKey, days);

        if (outcomes.length < minSampleSize) {
            console.log(`[Pattern] Insufficient data: ${outcomes.length} outcomes (need ${minSampleSize})`);
            return { patterns: [], confidence: 0, reason: 'insufficient_data' };
        }

        // Run all pattern detection algorithms
        const patterns = [];

        // 1. Parameter clustering (winning parameter ranges)
        const parameterPatterns = await this.findWinningParameterRanges(outcomes);
        patterns.push(...parameterPatterns);

        // 2. Market regime detection
        const regimePattern = await this.detectMarketRegime(outcomes);
        if (regimePattern) patterns.push(regimePattern);

        // 3. Failure pattern detection
        const failurePatterns = await this.findFailurePatterns(outcomes);
        patterns.push(...failurePatterns);

        // 4. Time-based patterns (day of week, time of month)
        const timePatterns = await this.findTimeBasedPatterns(outcomes);
        patterns.push(...timePatterns);

        // Save patterns to database
        await this.savePatterns(categoryKey, patterns);

        console.log(`[Pattern] Discovered ${patterns.length} patterns`);

        return { patterns, sampleSize: outcomes.length };
    }

    /**
     * Find winning parameter ranges by clustering successful outcomes
     */
    async findWinningParameterRanges(outcomes) {
        const patterns = [];

        // Filter winning outcomes (accuracy >= 60%)
        const winners = outcomes.filter(o => o.accuracy && o.accuracy >= 0.6);

        if (winners.length < 5) return patterns;

        // Extract common parameters from strategy params
        const parameterValues = {
            rsi: [],
            ema: [],
            volumeMult: [],
            atr: [],
            target: [],
            stop: []
        };

        for (const outcome of winners) {
            try {
                const params = outcome.strategyParams;

                // Extract RSI values
                if (params.rsi || params.entryRules?.rsi) {
                    const rsi = params.rsi || params.entryRules?.rsi;
                    if (typeof rsi === 'number') parameterValues.rsi.push(rsi);
                }

                // Extract EMA values
                if (params.ema || params.entryRules?.ema) {
                    const ema = params.ema || params.entryRules?.ema;
                    if (typeof ema === 'number') parameterValues.ema.push(ema);
                }

                // Extract volume multiplier
                if (params.volumeMult || params.entryRules?.volumeMult) {
                    const vol = params.volumeMult || params.entryRules?.volumeMult;
                    if (typeof vol === 'number') parameterValues.volumeMult.push(vol);
                }

                // Extract ATR
                if (params.atr || params.entryRules?.atr) {
                    const atr = params.atr || params.entryRules?.atr;
                    if (typeof atr === 'number') parameterValues.atr.push(atr);
                }

                // Extract exit rules
                if (params.exitRules?.target) parameterValues.target.push(params.exitRules.target);
                if (params.exitRules?.stop) parameterValues.stop.push(params.exitRules.stop);

            } catch (error) {
                // Skip malformed params
            }
        }

        // Calculate optimal ranges for each parameter
        for (const [param, values] of Object.entries(parameterValues)) {
            if (values.length >= 3) {
                const range = this.calculateOptimalRange(values);
                const confidence = this.calculateConfidence(values, outcomes.length);

                patterns.push({
                    type: 'parameter_cluster',
                    parameter: param,
                    optimalRange: range,
                    confidence,
                    sampleSize: values.length,
                    details: {
                        min: range.min,
                        max: range.max,
                        median: range.median,
                        mean: range.mean
                    }
                });
            }
        }

        return patterns;
    }

    /**
     * Calculate optimal range from a set of values
     */
    calculateOptimalRange(values) {
        const sorted = values.sort((a, b) => a - b);
        const q1 = sorted[Math.floor(values.length * 0.25)];
        const q3 = sorted[Math.floor(values.length * 0.75)];
        const median = sorted[Math.floor(values.length * 0.5)];
        const mean = values.reduce((sum, v) => sum + v, 0) / values.length;

        // Use interquartile range (IQR) for robustness
        return {
            min: Math.max(Math.min(...values), q1 - 1.5 * (q3 - q1)),
            max: Math.min(Math.max(...values), q3 + 1.5 * (q3 - q1)),
            median,
            mean: parseFloat(mean.toFixed(2))
        };
    }

    /**
     * Detect current market regime based on recent behavior
     */
    async detectMarketRegime(outcomes) {
        // Analyze win rates over time to detect regime
        const recentOutcomes = outcomes.slice(-10); // Last 10 outcomes

        if (recentOutcomes.length < 5) return null;

        const avgWinRate = recentOutcomes.reduce((sum, o) => sum + (o.winRate || 0), 0) / recentOutcomes.length;
        const avgAccuracy = recentOutcomes.reduce((sum, o) => sum + (o.accuracy || 0), 0) / recentOutcomes.length;

        let regime;
        if (avgAccuracy >= 0.7) {
            regime = 'strong_trending';
        } else if (avgAccuracy >= 0.5) {
            regime = 'moderate_trending';
        } else if (avgAccuracy >= 0.35) {
            regime = 'choppy';
        } else {
            regime = 'high_volatility';
        }

        return {
            type: 'market_regime',
            regime,
            confidence: Math.min(recentOutcomes.length / 10, 1.0),
            sampleSize: recentOutcomes.length,
            details: {
                avgWinRate: parseFloat(avgWinRate.toFixed(3)),
                avgAccuracy: parseFloat(avgAccuracy.toFixed(3)),
                recommendation: this.getRegimeRecommendation(regime)
            }
        };
    }

    /**
     * Get trading recommendation based on market regime
     */
    getRegimeRecommendation(regime) {
        const recommendations = {
            strong_trending: 'Continue aggressive trading, strategies are working well',
            moderate_trending: 'Normal trading, monitor for changes',
            choppy: 'Reduce position sizes, tighten stops',
            high_volatility: 'Consider pausing new trades, review strategies'
        };

        return recommendations[regime] || 'Monitor closely';
    }

    /**
     * Find common failure patterns
     */
    async findFailurePatterns(outcomes) {
        const patterns = [];

        // Filter failing outcomes (accuracy < 40%)
        const failures = outcomes.filter(o => o.accuracy && o.accuracy < 0.4);

        if (failures.length < 3) return patterns;

        // Find common traits in failures
        const failureParams = {
            highRSI: 0,
            lowRSI: 0,
            tightStops: 0,
            wideTargets: 0
        };

        for (const failure of failures) {
            try {
                const params = failure.strategyParams;

                // Check for extreme RSI
                const rsi = params.rsi || params.entryRules?.rsi;
                if (rsi > 70) failureParams.highRSI++;
                if (rsi < 20) failureParams.lowRSI++;

                // Check for tight stops
                const stop = params.exitRules?.stop;
                if (stop && stop < 1.0) failureParams.tightStops++;

                // Check for wide targets
                const target = params.exitRules?.target;
                if (target && target > 5.0) failureParams.wideTargets++;

            } catch (error) {
                // Skip malformed params
            }
        }

        // Create failure patterns if significant
        const totalFailures = failures.length;
        const threshold = 0.5; // 50% occurrence rate

        if (failureParams.highRSI / totalFailures > threshold) {
            patterns.push({
                type: 'failure_pattern',
                pattern: 'high_rsi_entries',
                confidence: failureParams.highRSI / totalFailures,
                sampleSize: failureParams.highRSI,
                details: {
                    description: 'Entries with RSI > 70 tend to fail',
                    recommendation: 'Avoid entries when RSI is overbought'
                }
            });
        }

        if (failureParams.tightStops / totalFailures > threshold) {
            patterns.push({
                type: 'failure_pattern',
                pattern: 'tight_stops',
                confidence: failureParams.tightStops / totalFailures,
                sampleSize: failureParams.tightStops,
                details: {
                    description: 'Stops < 1% get hit too frequently',
                    recommendation: 'Use minimum 1.5% stop loss'
                }
            });
        }

        return patterns;
    }

    /**
     * Find time-based patterns (day of week, etc.)
     */
    async findTimeBasedPatterns(outcomes) {
        const patterns = [];

        // Group outcomes by day of week
        const dayGroups = {
            0: [], 1: [], 2: [], 3: [], 4: [], 5: [], 6: []
        };

        for (const outcome of outcomes) {
            const day = new Date(outcome.timestamp).getDay();
            dayGroups[day].push(outcome);
        }

        // Find days with consistently high/low performance
        const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

        for (const [day, outcomes] of Object.entries(dayGroups)) {
            if (outcomes.length < 3) continue;

            const avgAccuracy = outcomes.reduce((sum, o) => sum + (o.accuracy || 0), 0) / outcomes.length;

            if (avgAccuracy >= 0.7 || avgAccuracy <= 0.3) {
                patterns.push({
                    type: 'time_pattern',
                    pattern: `${dayNames[day]}_performance`,
                    confidence: Math.min(outcomes.length / 5, 0.8),
                    sampleSize: outcomes.length,
                    details: {
                        day: dayNames[day],
                        avgAccuracy: parseFloat(avgAccuracy.toFixed(3)),
                        recommendation: avgAccuracy >= 0.7
                            ? `${dayNames[day]} shows strong performance`
                            : `Avoid trading on ${dayNames[day]}`
                    }
                });
            }
        }

        return patterns;
    }

    /**
     * Calculate confidence score for a pattern
     */
    calculateConfidence(values, totalOutcomes) {
        // Confidence based on:
        // 1. Sample size (more samples = higher confidence)
        // 2. Consistency (lower variance = higher confidence)

        const sampleSizeScore = Math.min(values.length / 20, 1.0); // Max at 20 samples

        // Calculate variance
        const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
        const variance = values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / values.length;
        const stdDev = Math.sqrt(variance);
        const cv = stdDev / mean; // Coefficient of variation

        const consistencyScore = Math.max(0, 1 - cv); // Lower CV = higher consistency

        // Combined confidence
        return parseFloat((sampleSizeScore * 0.6 + consistencyScore * 0.4).toFixed(3));
    }

    /**
     * Save discovered patterns to database
     */
    async savePatterns(categoryKey, patterns) {
        for (const pattern of patterns) {
            try {
                await prisma.patternObservation.create({
                    data: {
                        categoryKey,
                        patternType: pattern.type,
                        pattern: pattern,
                        confidence: pattern.confidence,
                        sampleSize: pattern.sampleSize,
                        validUntil: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // Valid for 30 days
                    }
                });
            } catch (error) {
                console.error('[Pattern] Error saving pattern:', error.message);
            }
        }
    }

    /**
     * Get recent patterns for a category
     */
    async getPatterns(categoryKey, options = {}) {
        const { type, minConfidence = 0.5, limit = 10 } = options;

        const where = {
            categoryKey,
            confidence: { gte: minConfidence },
            validUntil: { gte: new Date() }
        };

        if (type) where.patternType = type;

        const patterns = await prisma.patternObservation.findMany({
            where,
            orderBy: { confidence: 'desc' },
            take: limit
        });

        return patterns;
    }

    /**
     * Generate improvement suggestions based on patterns
     */
    async generateSuggestions(categoryKey, patterns) {
        const suggestions = [];

        for (const pattern of patterns) {
            if (pattern.confidence < 0.6) continue; // Only high-confidence patterns

            const suggestion = this.patternToSuggestion(pattern);
            if (suggestion) suggestions.push(suggestion);
        }

        return suggestions;
    }

    /**
     * Convert a pattern to an actionable suggestion
     */
    patternToSuggestion(pattern) {
        const p = pattern.pattern || pattern;

        if (p.type === 'parameter_cluster') {
            return {
                type: 'adjust_parameter',
                parameter: p.parameter,
                currentValue: null, // Will be filled by adaptor
                suggestedValue: p.details.median,
                suggestedRange: [p.details.min, p.details.max],
                confidence: p.confidence,
                reason: `${p.parameter} performs best in range [${p.details.min.toFixed(2)}, ${p.details.max.toFixed(2)}]`
            };
        }

        if (p.type === 'failure_pattern') {
            return {
                type: 'avoid_condition',
                condition: p.pattern,
                confidence: p.confidence,
                reason: p.details.description,
                recommendation: p.details.recommendation
            };
        }

        if (p.type === 'market_regime') {
            return {
                type: 'regime_adaptation',
                regime: p.regime,
                confidence: p.confidence,
                recommendation: p.details.recommendation
            };
        }

        return null;
    }
}

module.exports = new PatternRecognitionEngine();
