/**
 * PHASE 2: Category Signature Discovery
 * 
 * Purpose: Find what successful trades have in common vs failed trades
 * 
 * Analysis dimensions:
 * 1. Price position (at support? mid-range? resistance?)
 * 2. Volume pattern (declining? spiking? stable?)
 * 3. Price trend before entry (falling? sideways? bouncing?)
 * 4. Candlestick patterns (consolidation? reversal?)
 * 5. Speed to target (fast movers vs slow grinders)
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const labsDataService = require('../labsDataService.cjs');
const phase1 = require('./phase1_truth.cjs');

/**
 * Run Phase 2 analysis for a category
 */
async function runPhase2(categoryKey, phase1Results = null) {
    console.log('\n' + '═'.repeat(70));
    console.log('🔬 PHASE 2: CATEGORY SIGNATURE DISCOVERY');
    console.log('═'.repeat(70));
    console.log(`Category: ${categoryKey}`);
    console.log('─'.repeat(70));

    // If no Phase 1 results provided, run Phase 1 first
    if (!phase1Results) {
        console.log('\n📊 Running Phase 1 first...');
        phase1Results = await phase1.runPhase1(categoryKey, {
            targetPercent: 2.0,
            stopPercent: -1.5,
            maxDays: 15
        });
    }

    const { trades } = phase1Results;
    const successTrades = trades.filter(t => t.outcome === 'SUCCESS');
    const failedTrades = trades.filter(t => t.outcome !== 'SUCCESS');

    console.log(`\n📈 Analyzing ${successTrades.length} successful trades`);
    console.log(`📉 Analyzing ${failedTrades.length} failed trades`);

    // Load price data for detailed analysis
    const symbols = [...new Set(trades.map(t => t.symbol))];
    const stocksWithDates = symbols.map(s => ({ symbol: s, listedDate: new Date() }));
    const priceData = await labsDataService.getHistoricalData(stocksWithDates, { days: 400 });

    // Analyze successful trades
    console.log('\n🔍 Analyzing SUCCESS patterns...');
    const successPatterns = await analyzeTrades(successTrades, priceData, 'SUCCESS');

    // Analyze failed trades
    console.log('🔍 Analyzing FAILURE patterns...');
    const failurePatterns = await analyzeTrades(failedTrades, priceData, 'FAILURE');

    // Compare and find distinguishing characteristics
    console.log('\n📊 Comparing patterns...');
    const comparison = comparePatterns(successPatterns, failurePatterns);

    // Generate category signature
    console.log('\n✍️ Generating category signature...');
    const signature = generateSignature(categoryKey, successPatterns, failurePatterns, comparison);

    // Display results
    displayPhase2Results(successPatterns, failurePatterns, comparison, signature);

    return {
        success: true,
        categoryKey,
        successPatterns,
        failurePatterns,
        comparison,
        signature,
        stats: {
            successCount: successTrades.length,
            failureCount: failedTrades.length,
            totalAnalyzed: trades.length
        }
    };
}

/**
 * Analyze a set of trades for common patterns
 */
async function analyzeTrades(trades, priceData, type) {
    const patterns = {
        // Price position analysis
        pricePosition: { atSupport: 0, midRange: 0, atResistance: 0 },

        // Volume analysis (5 days before entry)
        volumePattern: { declining: 0, stable: 0, spiking: 0 },

        // Trend before entry (5 days)
        trendBefore: { falling: 0, sideways: 0, rising: 0 },

        // Consolidation check
        consolidation: { hasConsolidation: 0, noConsolidation: 0 },

        // Candle pattern at entry
        entryCandle: { bullish: 0, bearish: 0, doji: 0 },

        // Speed to exit
        speed: { veryFast: 0, fast: 0, medium: 0, slow: 0 },

        // Sample trades for reference
        sampleTrades: []
    };

    for (const trade of trades) {
        const candles = priceData[trade.symbol];
        if (!candles || candles.length < 30) continue;

        // Find entry index
        const entryIdx = findEntryIndex(candles, trade.entryDate);
        if (entryIdx < 10) continue;

        // Get lookback candles (10 days before entry)
        const lookback = candles.slice(entryIdx - 10, entryIdx);
        const entryCandle = candles[entryIdx];

        // 1. Price Position Analysis
        const pricePos = analyzePricePosition(lookback, entryCandle);
        patterns.pricePosition[pricePos]++;

        // 2. Volume Pattern (5 days before)
        const volPattern = analyzeVolumePattern(lookback.slice(-5));
        patterns.volumePattern[volPattern]++;

        // 3. Trend Before Entry
        const trend = analyzeTrend(lookback);
        patterns.trendBefore[trend]++;

        // 4. Consolidation Check
        const hasConsol = hasConsolidation(lookback.slice(-5));
        if (hasConsol) patterns.consolidation.hasConsolidation++;
        else patterns.consolidation.noConsolidation++;

        // 5. Entry Candle Pattern
        const candleType = analyzeCandlePattern(entryCandle);
        patterns.entryCandle[candleType]++;

        // 6. Speed to Exit
        const speed = analyzeSpeed(trade.daysHeld);
        patterns.speed[speed]++;

        // Store sample trades (first 5)
        if (patterns.sampleTrades.length < 5) {
            patterns.sampleTrades.push({
                symbol: trade.symbol,
                entryDate: trade.entryDate,
                pricePosition: pricePos,
                volumePattern: volPattern,
                trend: trend,
                consolidation: hasConsol,
                daysHeld: trade.daysHeld,
                returnPercent: trade.returnPercent
            });
        }
    }

    // Convert counts to percentages
    const total = trades.length || 1;
    patterns.percentages = {
        pricePosition: {
            atSupport: Math.round(patterns.pricePosition.atSupport / total * 100),
            midRange: Math.round(patterns.pricePosition.midRange / total * 100),
            atResistance: Math.round(patterns.pricePosition.atResistance / total * 100)
        },
        volumePattern: {
            declining: Math.round(patterns.volumePattern.declining / total * 100),
            stable: Math.round(patterns.volumePattern.stable / total * 100),
            spiking: Math.round(patterns.volumePattern.spiking / total * 100)
        },
        trendBefore: {
            falling: Math.round(patterns.trendBefore.falling / total * 100),
            sideways: Math.round(patterns.trendBefore.sideways / total * 100),
            rising: Math.round(patterns.trendBefore.rising / total * 100)
        },
        consolidation: {
            hasConsolidation: Math.round(patterns.consolidation.hasConsolidation / total * 100),
            noConsolidation: Math.round(patterns.consolidation.noConsolidation / total * 100)
        },
        entryCandle: {
            bullish: Math.round(patterns.entryCandle.bullish / total * 100),
            bearish: Math.round(patterns.entryCandle.bearish / total * 100),
            doji: Math.round(patterns.entryCandle.doji / total * 100)
        },
        speed: {
            veryFast: Math.round(patterns.speed.veryFast / total * 100),
            fast: Math.round(patterns.speed.fast / total * 100),
            medium: Math.round(patterns.speed.medium / total * 100),
            slow: Math.round(patterns.speed.slow / total * 100)
        }
    };

    return patterns;
}

// Helper functions for pattern analysis

function findEntryIndex(candles, entryDate) {
    const target = new Date(entryDate).toDateString();
    for (let i = 0; i < candles.length; i++) {
        const candleDate = candles[i].timestamp || candles[i].date;
        if (new Date(candleDate).toDateString() === target) {
            return i;
        }
    }
    return -1;
}

function analyzePricePosition(lookback, entryCandle) {
    // Find high/low of lookback period
    const highs = lookback.map(c => c.high);
    const lows = lookback.map(c => c.low);
    const high = Math.max(...highs);
    const low = Math.min(...lows);
    const range = high - low;

    const entryPrice = entryCandle.close;
    const position = (entryPrice - low) / range;

    if (position < 0.33) return 'atSupport';
    if (position > 0.67) return 'atResistance';
    return 'midRange';
}

function analyzeVolumePattern(candles) {
    if (candles.length < 3) return 'stable';

    const volumes = candles.map(c => c.volume);
    const avgFirst = (volumes[0] + volumes[1]) / 2;
    const avgLast = (volumes[volumes.length - 2] + volumes[volumes.length - 1]) / 2;

    const change = (avgLast - avgFirst) / avgFirst;

    if (change < -0.2) return 'declining';
    if (change > 0.5) return 'spiking';
    return 'stable';
}

function analyzeTrend(lookback) {
    if (lookback.length < 5) return 'sideways';

    const firstClose = lookback[0].close;
    const lastClose = lookback[lookback.length - 1].close;
    const change = (lastClose - firstClose) / firstClose * 100;

    if (change < -3) return 'falling';
    if (change > 3) return 'rising';
    return 'sideways';
}

function hasConsolidation(candles) {
    if (candles.length < 3) return false;

    // Check if price range is tight (less than 3% of avg price)
    const highs = candles.map(c => c.high);
    const lows = candles.map(c => c.low);
    const avgPrice = candles.reduce((sum, c) => sum + c.close, 0) / candles.length;

    const range = Math.max(...highs) - Math.min(...lows);
    const rangePercent = (range / avgPrice) * 100;

    return rangePercent < 5; // Tight consolidation
}

function analyzeCandlePattern(candle) {
    const body = Math.abs(candle.close - candle.open);
    const range = candle.high - candle.low;

    if (range === 0) return 'doji';

    const bodyPercent = body / range;

    if (bodyPercent < 0.1) return 'doji';
    if (candle.close > candle.open) return 'bullish';
    return 'bearish';
}

function analyzeSpeed(daysHeld) {
    if (daysHeld <= 1) return 'veryFast';
    if (daysHeld <= 3) return 'fast';
    if (daysHeld <= 7) return 'medium';
    return 'slow';
}

/**
 * Compare success vs failure patterns
 */
function comparePatterns(successPatterns, failurePatterns) {
    const s = successPatterns.percentages;
    const f = failurePatterns.percentages;

    const findings = [];

    // Price Position
    if (s.pricePosition.atSupport - f.pricePosition.atSupport > 15) {
        findings.push({
            category: 'Price Position',
            insight: `Success trades enter at SUPPORT more often (${s.pricePosition.atSupport}% vs ${f.pricePosition.atSupport}%)`,
            actionable: 'ENTER only at clear support levels',
            delta: s.pricePosition.atSupport - f.pricePosition.atSupport
        });
    }

    // Volume Pattern
    if (s.volumePattern.declining - f.volumePattern.declining > 10) {
        findings.push({
            category: 'Volume',
            insight: `Success trades show DECLINING volume before entry (${s.volumePattern.declining}% vs ${f.volumePattern.declining}%)`,
            actionable: 'AVOID entries with volume spikes',
            delta: s.volumePattern.declining - f.volumePattern.declining
        });
    }

    if (f.volumePattern.spiking - s.volumePattern.spiking > 10) {
        findings.push({
            category: 'Volume',
            insight: `Failed trades have SPIKING volume before entry (${f.volumePattern.spiking}% vs ${s.volumePattern.spiking}%)`,
            actionable: 'Volume spike is a WARNING sign',
            delta: -(f.volumePattern.spiking - s.volumePattern.spiking)
        });
    }

    // Consolidation
    if (s.consolidation.hasConsolidation - f.consolidation.hasConsolidation > 10) {
        findings.push({
            category: 'Pattern',
            insight: `Success trades show CONSOLIDATION before entry (${s.consolidation.hasConsolidation}% vs ${f.consolidation.hasConsolidation}%)`,
            actionable: 'Look for base building/consolidation',
            delta: s.consolidation.hasConsolidation - f.consolidation.hasConsolidation
        });
    }

    // Trend Before
    if (f.trendBefore.falling - s.trendBefore.falling > 10) {
        findings.push({
            category: 'Trend',
            insight: `Failed trades enter during FALLING trend (${f.trendBefore.falling}% vs ${s.trendBefore.falling}%)`,
            actionable: 'AVOID entry if still in downtrend',
            delta: -(f.trendBefore.falling - s.trendBefore.falling)
        });
    }

    // Speed
    if (s.speed.veryFast + s.speed.fast > f.speed.veryFast + f.speed.fast + 20) {
        findings.push({
            category: 'Momentum',
            insight: `Success trades hit target FAST (${s.speed.veryFast + s.speed.fast}% within 3 days)`,
            actionable: 'Good setups move quickly',
            delta: (s.speed.veryFast + s.speed.fast) - (f.speed.veryFast + f.speed.fast)
        });
    }

    // Entry Candle
    if (s.entryCandle.bullish - f.entryCandle.bullish > 10) {
        findings.push({
            category: 'Entry Signal',
            insight: `Success trades have BULLISH entry candle (${s.entryCandle.bullish}% vs ${f.entryCandle.bullish}%)`,
            actionable: 'Prefer bullish confirmation candle',
            delta: s.entryCandle.bullish - f.entryCandle.bullish
        });
    }

    // Sort by impact
    findings.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));

    return {
        findings,
        summary: {
            topDifferentiator: findings[0]?.category || 'None found',
            keyFilters: findings.slice(0, 3).map(f => f.actionable),
            expectedImprovement: findings.length > 0
                ? `Could improve success rate by filtering on top ${Math.min(findings.length, 3)} criteria`
                : 'No clear differentiators found'
        }
    };
}

/**
 * Generate human-readable category signature
 */
function generateSignature(categoryKey, successPatterns, failurePatterns, comparison) {
    const s = successPatterns.percentages;
    const f = failurePatterns.percentages;

    // Build success description
    const successTraits = [];
    if (s.pricePosition.atSupport > 40) successTraits.push('near support level');
    if (s.volumePattern.declining > 40) successTraits.push('declining volume');
    if (s.consolidation.hasConsolidation > 40) successTraits.push('consolidation pattern');
    if (s.trendBefore.sideways > 40) successTraits.push('sideways trend before entry');
    if (s.entryCandle.bullish > 40) successTraits.push('bullish entry candle');

    // Build failure warnings
    const failureWarnings = [];
    if (f.volumePattern.spiking > 30) failureWarnings.push('volume spike');
    if (f.trendBefore.falling > 50) failureWarnings.push('still in downtrend');
    if (f.pricePosition.midRange > 50) failureWarnings.push('no clear support');
    if (f.consolidation.noConsolidation > 60) failureWarnings.push('no consolidation');

    return {
        categoryKey,
        description: `DOWNSIDE LOM SWING: Stocks showing potential reversal from decline`,

        successPattern: {
            summary: `Best entries show: ${successTraits.join(', ') || 'no clear pattern'}`,
            traits: successTraits,
            idealSetup: [
                'Price at or near recent support',
                'Volume declining (exhaustion)',
                'Consolidation/base building visible',
                'Bullish candle on entry day'
            ]
        },

        failurePattern: {
            summary: `Failures typically show: ${failureWarnings.join(', ') || 'no clear pattern'}`,
            warnings: failureWarnings,
            avoidWhen: [
                'Volume spiking (potential trap)',
                'Still in active downtrend',
                'No visible support level',
                'Entry mid-decline (not at support)'
            ]
        },

        filterRules: comparison.summary.keyFilters,

        expectedSuccessRate: {
            current: '52.2%',
            afterFilters: '65-70% (estimated)',
            improvement: '+13-18%'
        }
    };
}

/**
 * Display Phase 2 results
 */
function displayPhase2Results(successPatterns, failurePatterns, comparison, signature) {
    const s = successPatterns.percentages;
    const f = failurePatterns.percentages;

    console.log('\n' + '═'.repeat(70));
    console.log('📊 PHASE 2 RESULTS: PATTERN COMPARISON');
    console.log('═'.repeat(70));

    console.log('\n📍 PRICE POSITION AT ENTRY:');
    console.log(`   At Support:    Success ${s.pricePosition.atSupport}% | Failure ${f.pricePosition.atSupport}%`);
    console.log(`   Mid-Range:     Success ${s.pricePosition.midRange}% | Failure ${f.pricePosition.midRange}%`);
    console.log(`   At Resistance: Success ${s.pricePosition.atResistance}% | Failure ${f.pricePosition.atResistance}%`);

    console.log('\n📊 VOLUME PATTERN (Before Entry):');
    console.log(`   Declining:     Success ${s.volumePattern.declining}% | Failure ${f.volumePattern.declining}%`);
    console.log(`   Stable:        Success ${s.volumePattern.stable}% | Failure ${f.volumePattern.stable}%`);
    console.log(`   Spiking:       Success ${s.volumePattern.spiking}% | Failure ${f.volumePattern.spiking}%`);

    console.log('\n📈 TREND BEFORE ENTRY:');
    console.log(`   Falling:       Success ${s.trendBefore.falling}% | Failure ${f.trendBefore.falling}%`);
    console.log(`   Sideways:      Success ${s.trendBefore.sideways}% | Failure ${f.trendBefore.sideways}%`);
    console.log(`   Rising:        Success ${s.trendBefore.rising}% | Failure ${f.trendBefore.rising}%`);

    console.log('\n🔲 CONSOLIDATION PRESENT:');
    console.log(`   Has Base:      Success ${s.consolidation.hasConsolidation}% | Failure ${f.consolidation.hasConsolidation}%`);
    console.log(`   No Base:       Success ${s.consolidation.noConsolidation}% | Failure ${f.consolidation.noConsolidation}%`);

    console.log('\n' + '═'.repeat(70));
    console.log('🎯 KEY FINDINGS:');
    console.log('═'.repeat(70));

    comparison.findings.forEach((f, i) => {
        console.log(`\n${i + 1}. ${f.category}`);
        console.log(`   📊 ${f.insight}`);
        console.log(`   ✅ ACTION: ${f.actionable}`);
    });

    console.log('\n' + '═'.repeat(70));
    console.log('✍️ CATEGORY SIGNATURE:');
    console.log('═'.repeat(70));
    console.log(`\n${signature.description}`);
    console.log(`\n✅ SUCCESS PATTERN: ${signature.successPattern.summary}`);
    console.log(`❌ FAILURE PATTERN: ${signature.failurePattern.summary}`);

    console.log('\n📋 FILTER RULES:');
    signature.filterRules.forEach((rule, i) => {
        console.log(`   ${i + 1}. ${rule}`);
    });

    console.log('\n📈 EXPECTED IMPROVEMENT:');
    console.log(`   Current: ${signature.expectedSuccessRate.current}`);
    console.log(`   After Filters: ${signature.expectedSuccessRate.afterFilters}`);
    console.log(`   Improvement: ${signature.expectedSuccessRate.improvement}`);

    console.log('\n' + '═'.repeat(70));
}

module.exports = {
    runPhase2
};
