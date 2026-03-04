/**
 * Category Signature Builder
 * 
 * PURPOSE: Learn what each category ACTUALLY represents by observing
 * what stocks in that category had in common on their addedDates.
 * 
 * Core Philosophy:
 * - Categories are WEAK LABELS, not strict definitions
 * - The DATE is ground truth (something happened then)
 * - The SYSTEM learns what that "something" typically looks like
 * - New stocks are scored by SIMILARITY to learned signature
 * 
 * This is the "Stocks teach the category" paradigm.
 */

const { PrismaClient } = require('@prisma/client');
const behaviorExtractor = require('./behaviorExtractor.cjs');
const eventReconstructor = require('./eventReconstructor.cjs');

const prisma = new PrismaClient();

class CategorySignatureBuilder {

    constructor() {
        // Cache for learned signatures
        this.signatures = new Map();
        this.lastBuildTime = new Map();
    }

    /**
     * Build/Learn a category signature from historical data
     * 
     * @param {string} categoryKey - Category to learn
     * @param {Object} options - Build options
     * @returns {Object} Learned category signature
     */
    async buildSignature(categoryKey, options = {}) {
        const { maxStocks = 100, forceRebuild = false } = options;

        console.log(`\n🧠 [SignatureBuilder] Learning signature for ${categoryKey}...`);

        // Check cache (rebuild if older than 24 hours)
        const cachedSignature = this.signatures.get(categoryKey);
        const lastBuild = this.lastBuildTime.get(categoryKey);
        const cacheAge = lastBuild ? Date.now() - lastBuild : Infinity;

        if (cachedSignature && !forceRebuild && cacheAge < 24 * 60 * 60 * 1000) {
            console.log(`   Using cached signature (${Math.round(cacheAge / 3600000)}h old)`);
            return cachedSignature;
        }

        // 1. Get all stocks in this category with their addedDates
        const stockCategories = await prisma.stockCategory.findMany({
            where: { category: { key: categoryKey } },
            include: { stock: true },
            orderBy: { addedDate: 'desc' },
            take: maxStocks
        });

        if (stockCategories.length < 10) {
            console.log(`   ⚠️ Only ${stockCategories.length} stocks - signature may be unreliable`);
        }

        console.log(`   Analyzing ${stockCategories.length} stocks...`);

        // 2. Extract behaviors for each stock on its addedDate
        const allBehaviors = [];
        const validEvents = [];
        const invalidEvents = [];

        for (const sc of stockCategories) {
            const event = await eventReconstructor.reconstructEvent(
                sc.stock.symbol,
                sc.addedDate,
                categoryKey
            );

            if (event.valid && event.behaviors && Object.keys(event.behaviors).length > 0) {
                allBehaviors.push(event.behaviors);
                validEvents.push(event);
            } else {
                invalidEvents.push(event);
            }
        }

        console.log(`   Valid events: ${validEvents.length}, Invalid: ${invalidEvents.length}`);

        if (allBehaviors.length < 5) {
            return {
                categoryKey,
                valid: false,
                reason: 'insufficient_valid_events',
                stocksAnalyzed: stockCategories.length,
                validEvents: validEvents.length
            };
        }

        // 3. Aggregate behaviors to find common patterns
        const signature = this.aggregateBehaviors(allBehaviors, categoryKey);

        // 4. Calculate feature vector for similarity matching
        signature.featureVector = this.buildFeatureVector(signature);

        // 5. Store metadata
        signature.categoryKey = categoryKey;
        signature.stocksAnalyzed = stockCategories.length;
        signature.validEvents = validEvents.length;
        signature.invalidEvents = invalidEvents.length;
        signature.validRate = (validEvents.length / stockCategories.length * 100).toFixed(1) + '%';
        signature.builtAt = new Date().toISOString();
        signature.valid = true;

        // Cache it
        this.signatures.set(categoryKey, signature);
        this.lastBuildTime.set(categoryKey, Date.now());

        console.log(`   ✅ Signature built: ${validEvents.length} samples\n`);

        return signature;
    }

    /**
     * Aggregate behaviors across all stocks to find patterns
     * Returns frequency counts and mean values for each behavior
     */
    aggregateBehaviors(behaviorsArray, categoryKey) {
        const aggregated = {
            // Frequency of boolean behaviors (how often did this occur?)
            frequencies: {},
            // Mean/std of numeric behaviors
            numerics: {},
            // Most common patterns
            patterns: {}
        };

        // List of boolean behaviors to track frequency
        const booleanBehaviors = [
            'nearRecentHigh', 'nearRecentLow', 'atNewHigh', 'atNewLow',
            'nearSupport', 'nearResistance', 'multipleResistanceTests', 'multipleSupportTests',
            'volumeExpansion', 'volumeExhaustion', 'volumeSpike', 'lowVolume',
            'bigDay', 'contractedDay', 'narrowRange', 'wideRange',
            'breakoutAttempt', 'brokeAbovePrior5', 'brokeBelowPrior5',
            'hasLongLowerWick', 'hasLongUpperWick', 'isHammer', 'isShootingStar',
            'showsBuyingPressure', 'showsSellingPressure',
            'momentumUp', 'momentumDown', 'extendedUp', 'extendedDown',
            'isBullish', 'isBearish', 'isDoji', 'isMarubozu',
            'nextDayFollowThrough', 'nextDayRejection',
            'isTightConsolidation', 'readyForBreakout'
        ];

        // List of numeric behaviors to track mean/std
        const numericBehaviors = [
            'distanceToRecentHigh', 'distanceToRecentLow', 'positionInRange',
            'upperWickPct', 'lowerWickPct', 'bodyPct',
            'volumeVsAvg', 'volumeTrend',
            'rangeVsAvg',
            'resistanceTests', 'supportTests',
            'consecutiveUpDays', 'consecutiveDownDays'
        ];

        // Initialize counters
        booleanBehaviors.forEach(b => {
            aggregated.frequencies[b] = { count: 0, total: 0 };
        });
        numericBehaviors.forEach(n => {
            aggregated.numerics[n] = { values: [], mean: 0, min: Infinity, max: -Infinity };
        });

        // Count and sum
        for (const behaviors of behaviorsArray) {
            for (const b of booleanBehaviors) {
                if (behaviors[b] !== undefined) {
                    aggregated.frequencies[b].total++;
                    if (behaviors[b] === true) {
                        aggregated.frequencies[b].count++;
                    }
                }
            }

            for (const n of numericBehaviors) {
                if (typeof behaviors[n] === 'number' && !isNaN(behaviors[n])) {
                    aggregated.numerics[n].values.push(behaviors[n]);
                    aggregated.numerics[n].min = Math.min(aggregated.numerics[n].min, behaviors[n]);
                    aggregated.numerics[n].max = Math.max(aggregated.numerics[n].max, behaviors[n]);
                }
            }
        }

        // Calculate frequencies and means
        for (const b of booleanBehaviors) {
            const total = aggregated.frequencies[b].total;
            aggregated.frequencies[b].frequency = total > 0
                ? aggregated.frequencies[b].count / total
                : 0;
            // Mark as "required" if occurs in > 60% of cases
            aggregated.frequencies[b].required = aggregated.frequencies[b].frequency > 0.6;
        }

        for (const n of numericBehaviors) {
            const values = aggregated.numerics[n].values;
            if (values.length > 0) {
                aggregated.numerics[n].mean = values.reduce((a, b) => a + b, 0) / values.length;
                aggregated.numerics[n].count = values.length;
            }
            delete aggregated.numerics[n].values; // Don't store raw values
        }

        // Extract dominant patterns
        aggregated.patterns = this.extractDominantPatterns(aggregated.frequencies);

        return aggregated;
    }

    /**
     * Extract the most common patterns from frequencies
     */
    extractDominantPatterns(frequencies) {
        const patterns = {
            dominant: [],     // Frequency > 60%
            common: [],       // Frequency > 40%
            rare: []          // Frequency < 20%
        };

        for (const [behavior, data] of Object.entries(frequencies)) {
            if (data.frequency > 0.6) {
                patterns.dominant.push({ behavior, frequency: data.frequency });
            } else if (data.frequency > 0.4) {
                patterns.common.push({ behavior, frequency: data.frequency });
            } else if (data.frequency < 0.2 && data.total > 10) {
                patterns.rare.push({ behavior, frequency: data.frequency });
            }
        }

        // Sort by frequency
        patterns.dominant.sort((a, b) => b.frequency - a.frequency);
        patterns.common.sort((a, b) => b.frequency - a.frequency);

        return patterns;
    }

    /**
     * Build a normalized feature vector for similarity matching
     */
    buildFeatureVector(signature) {
        const frequencies = signature.frequencies || {};
        const numerics = signature.numerics || {};

        // Key features for similarity (normalized to 0-1)
        return [
            frequencies.nearResistance?.frequency || 0,
            frequencies.nearSupport?.frequency || 0,
            frequencies.multipleResistanceTests?.frequency || 0,
            frequencies.multipleSupportTests?.frequency || 0,
            frequencies.volumeExpansion?.frequency || 0,
            frequencies.volumeExhaustion?.frequency || 0,
            frequencies.bigDay?.frequency || 0,
            frequencies.contractedDay?.frequency || 0,
            frequencies.breakoutAttempt?.frequency || 0,
            frequencies.hasLongLowerWick?.frequency || 0,
            frequencies.hasLongUpperWick?.frequency || 0,
            frequencies.showsBuyingPressure?.frequency || 0,
            frequencies.showsSellingPressure?.frequency || 0,
            frequencies.momentumUp?.frequency || 0,
            frequencies.momentumDown?.frequency || 0,
            frequencies.nextDayFollowThrough?.frequency || 0
        ];
    }

    /**
     * Score how similar a new stock's event is to the category signature
     * 
     * @param {string} symbol - Stock symbol
     * @param {Date} eventDate - Event date
     * @param {string} categoryKey - Category to compare against
     * @returns {Object} Similarity score and details
     */
    async scoreSimilarity(symbol, eventDate, categoryKey) {
        // Get category signature
        const signature = await this.buildSignature(categoryKey);

        if (!signature.valid) {
            return {
                symbol,
                categoryKey,
                similarity: 0.5, // Neutral if no signature
                confidence: 'low',
                reason: 'no_valid_signature'
            };
        }

        // Reconstruct this stock's event
        const event = await eventReconstructor.reconstructEvent(symbol, eventDate, categoryKey);

        if (!event.valid) {
            return {
                symbol,
                categoryKey,
                similarity: 0,
                confidence: 'high',
                reason: 'invalid_event',
                eventReason: event.reason
            };
        }

        // Calculate similarity by comparing behaviors to signature frequencies
        const similarities = [];
        const mismatches = [];

        for (const [behavior, data] of Object.entries(signature.frequencies)) {
            if (data.total < 5) continue; // Skip behaviors with too few samples

            const stockHasBehavior = event.behaviors[behavior] === true;
            const signatureFrequency = data.frequency;

            // How well does this match?
            if (signatureFrequency > 0.6) {
                // Dominant behavior - stock should have it
                if (stockHasBehavior) {
                    similarities.push({ behavior, match: 1.0 });
                } else {
                    mismatches.push({ behavior, expected: signatureFrequency, actual: false });
                    similarities.push({ behavior, match: 0.2 });
                }
            } else if (signatureFrequency < 0.2) {
                // Rare behavior - stock shouldn't have it
                if (!stockHasBehavior) {
                    similarities.push({ behavior, match: 1.0 });
                } else {
                    similarities.push({ behavior, match: 0.5 });
                }
            } else {
                // Common/neutral behavior
                similarities.push({ behavior, match: 0.7 });
            }
        }

        // Calculate overall similarity (0-100)
        const avgSimilarity = similarities.length > 0
            ? similarities.reduce((sum, s) => sum + s.match, 0) / similarities.length
            : 0.5;

        const similarityScore = Math.round(avgSimilarity * 100);

        return {
            symbol,
            categoryKey,
            similarity: similarityScore,
            confidence: similarityScore > 70 ? 'high' : (similarityScore > 50 ? 'medium' : 'low'),
            matchedBehaviors: similarities.filter(s => s.match === 1.0).length,
            totalBehaviors: similarities.length,
            mismatches: mismatches.slice(0, 5), // Top 5 mismatches
            eventScore: event.eventScore,
            recommendation: this.getSimilarityRecommendation(similarityScore)
        };
    }

    /**
     * Get recommendation based on similarity score
     */
    getSimilarityRecommendation(score) {
        if (score >= 80) return 'excellent_match';
        if (score >= 65) return 'good_match';
        if (score >= 50) return 'moderate_match';
        if (score >= 35) return 'weak_match';
        return 'poor_match';
    }

    /**
     * Get a human-readable summary of what a category looks like
     */
    async getCategorySummary(categoryKey) {
        const signature = await this.buildSignature(categoryKey);

        if (!signature.valid) {
            return {
                categoryKey,
                summary: 'Insufficient data to learn category pattern',
                ...signature
            };
        }

        const dominant = signature.patterns?.dominant || [];
        const numerics = signature.numerics || {};

        // Build human-readable summary
        const summary = {
            categoryKey,
            sampleSize: signature.validEvents,
            validRate: signature.validRate,

            // Key characteristics
            characteristics: dominant.map(d => ({
                behavior: d.behavior,
                frequency: Math.round(d.frequency * 100) + '%',
                description: this.describeBehavior(d.behavior)
            })).slice(0, 8),

            // Numeric profiles
            typicalValues: {
                volumeVsAvg: numerics.volumeVsAvg?.mean?.toFixed(2) || 'N/A',
                rangeVsAvg: numerics.rangeVsAvg?.mean?.toFixed(2) || 'N/A',
                positionInRange: numerics.positionInRange?.mean?.toFixed(2) || 'N/A'
            },

            // What this category looks like
            profile: this.generateCategoryProfile(signature)
        };

        return summary;
    }

    /**
     * Generate a textual profile of what the category represents
     */
    generateCategoryProfile(signature) {
        const dominant = signature.patterns?.dominant || [];
        const numerics = signature.numerics || {};

        const traits = [];

        // Check for key traits
        if (dominant.some(d => d.behavior === 'nearResistance' && d.frequency > 0.5)) {
            traits.push('typically near resistance levels');
        }
        if (dominant.some(d => d.behavior === 'nearSupport' && d.frequency > 0.5)) {
            traits.push('typically near support levels');
        }
        if (dominant.some(d => d.behavior === 'volumeExpansion' && d.frequency > 0.4)) {
            traits.push('usually with expanding volume');
        }
        if (dominant.some(d => d.behavior === 'volumeExhaustion' && d.frequency > 0.4)) {
            traits.push('often with exhausting volume');
        }
        if (dominant.some(d => d.behavior === 'bigDay' && d.frequency > 0.4)) {
            traits.push('tends to have large range days');
        }
        if (dominant.some(d => d.behavior === 'contractedDay' && d.frequency > 0.4)) {
            traits.push('often shows contracted/tight ranges');
        }
        if (dominant.some(d => d.behavior === 'showsBuyingPressure' && d.frequency > 0.4)) {
            traits.push('shows buying pressure via lower wicks');
        }
        if (dominant.some(d => d.behavior === 'showsSellingPressure' && d.frequency > 0.4)) {
            traits.push('shows selling pressure via upper wicks');
        }
        if (dominant.some(d => d.behavior === 'breakoutAttempt' && d.frequency > 0.4)) {
            traits.push('often attempting breakouts');
        }

        return traits.length > 0
            ? `Stocks in this category: ${traits.join(', ')}`
            : 'Pattern not yet distinguished from noise';
    }

    /**
     * Get human-readable description for a behavior
     */
    describeBehavior(behavior) {
        const descriptions = {
            nearResistance: 'Price near resistance level',
            nearSupport: 'Price near support level',
            multipleResistanceTests: 'Multiple tests of resistance',
            multipleSupportTests: 'Multiple tests of support',
            volumeExpansion: 'Volume above average',
            volumeExhaustion: 'Volume drying up',
            volumeSpike: 'Significant volume spike',
            bigDay: 'Large range day',
            contractedDay: 'Tight/contracted day',
            narrowRange: 'Narrow price range',
            breakoutAttempt: 'Breakout attempt',
            hasLongLowerWick: 'Long lower wick (buying)',
            hasLongUpperWick: 'Long upper wick (selling)',
            showsBuyingPressure: 'Buying pressure visible',
            showsSellingPressure: 'Selling pressure visible',
            momentumUp: 'Upward momentum',
            momentumDown: 'Downward momentum',
            nextDayFollowThrough: 'Next day follow-through',
            isBullish: 'Bullish candle',
            isBearish: 'Bearish candle',
            isHammer: 'Hammer pattern',
            isShootingStar: 'Shooting star pattern',
            isTightConsolidation: 'Tight consolidation'
        };
        return descriptions[behavior] || behavior;
    }

    /**
     * Get all category signatures (for comparison)
     */
    async getAllSignatures() {
        const categories = await prisma.category.findMany();
        const signatures = {};

        for (const cat of categories) {
            signatures[cat.key] = await this.buildSignature(cat.key);
        }

        return signatures;
    }
}

module.exports = new CategorySignatureBuilder();
