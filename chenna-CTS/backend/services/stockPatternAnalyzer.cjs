/**
 * Stock Pattern Analyzer Service
 * 
 * TODAY'S APPROACH:
 * 1. Analyze actual stock behavior to find what patterns they exhibit
 * 2. Test which patterns lead to WINS vs LOSSES
 * 3. Report which patterns work best for this category
 * 
 * This is Step 1 of the new workflow:
 * Step 1: Discover what patterns stocks exhibit
 * Step 2: Test each pattern with intelligent backtesting
 * Step 3: Combine best strategies
 */

const prisma = require('../lib/prisma.cjs');
const labsDataService = require('./labsDataService.cjs');
const patternDiscoverer = require('./patternDiscoverer.cjs');
const TechnicalAnalysis = require('../strategy/comprehensiveTA.cjs');

class StockPatternAnalyzer {

    constructor() {
        // Patterns we are looking for
        this.patternTypes = [
            'VolumeSpike',
            'RSI_Oversold',
            'RSI_Overbought',
            'Stoch_Oversold',
            'MACD_BullishCross',
            'MACD_BearishCross',
            'HigherLow',
            'LowerHigh',
            'StrongClose',
            'Hammer',
            'MorningStar',
            'BullishEngulfing'
        ];
    }

    /**
     * Analyze all stocks in a category to find what patterns they exhibit
     * and which patterns led to actual wins
     */
    async analyzeCategory(categoryKey, options = {}) {
        console.log('\n' + '='.repeat(70));
        console.log('🔬 STOCK PATTERN ANALYZER - Learning from Actual Data');
        console.log('='.repeat(70));
        console.log(`📌 Category: ${categoryKey}`);
        console.log(`📌 Purpose: Find patterns that ACTUALLY work for these stocks\n`);

        // Load stocks
        const stocks = await this.loadStocks(categoryKey);
        console.log(`📦 Loaded ${stocks.length} stocks`);

        if (stocks.length === 0) {
            return { ok: false, error: 'No stocks found in category' };
        }

        // Limit for quick testing
        const testStocks = options.quickMode
            ? stocks.slice(0, options.stockCount || 20)
            : stocks;

        console.log(`📊 Analyzing ${testStocks.length} stocks...\n`);

        // Fetch historical data
        const allData = await labsDataService.getHistoricalData(
            testStocks.map(s => ({ symbol: s.symbol })),
            { mode: 'auto', days: 300 }
        );

        // Analyze each stock
        const stockAnalysis = [];
        const patternStats = {};

        // Initialize pattern stats
        for (const pattern of this.patternTypes) {
            patternStats[pattern] = {
                occurrences: 0,
                wins: 0,
                losses: 0,
                winRate: 0,
                avgPnL: 0,
                totalPnL: 0
            };
        }

        for (const stock of testStocks) {
            const candles = allData[stock.symbol];
            if (!candles || candles.length < 50) continue;

            // Transform candles
            const transformed = candles.map(c => ({
                timestamp: c.date || c.timestamp,
                open: c.open,
                high: c.high,
                low: c.low,
                close: c.close,
                volume: c.volume
            }));

            // Find entry point (addedDate)
            const entryIdx = this.findDateIndex(transformed, stock.addedDate);
            if (entryIdx < 20 || entryIdx >= transformed.length - 5) continue;

            // Discover patterns at entry
            const patternsAtEntry = patternDiscoverer.discoverAll(
                transformed.slice(0, entryIdx + 1),
                entryIdx
            );

            // Simulate trade outcome (walk forward 10 days)
            const outcome = this.simulateOutcome(transformed, entryIdx);

            // Record which patterns were present and their outcome
            const stockPatterns = [];
            for (const p of patternsAtEntry.patterns) {
                stockPatterns.push(p.name);

                if (patternStats[p.name]) {
                    patternStats[p.name].occurrences++;
                    patternStats[p.name].totalPnL += outcome.pnlPercent;

                    if (outcome.win) {
                        patternStats[p.name].wins++;
                    } else {
                        patternStats[p.name].losses++;
                    }
                }
            }

            stockAnalysis.push({
                symbol: stock.symbol,
                addedDate: stock.addedDate,
                patternsFound: stockPatterns,
                outcome: outcome.win ? 'WIN' : 'LOSS',
                pnlPercent: outcome.pnlPercent,
                daysHeld: outcome.daysHeld
            });
        }

        // Calculate win rates and sort
        const patternResults = [];
        for (const [name, stats] of Object.entries(patternStats)) {
            if (stats.occurrences > 0) {
                stats.winRate = (stats.wins / stats.occurrences) * 100;
                stats.avgPnL = stats.totalPnL / stats.occurrences;

                // Calculate confidence score (more trades = more confident)
                // Score = winRate * sqrt(trades) / 10 (diminishing returns for more trades)
                const confidenceScore = stats.winRate * Math.sqrt(stats.occurrences) / 10;

                patternResults.push({
                    pattern: name,
                    occurrences: stats.occurrences,
                    wins: stats.wins,
                    losses: stats.losses,
                    winRate: parseFloat(stats.winRate.toFixed(1)),
                    avgPnL: parseFloat(stats.avgPnL.toFixed(2)),
                    confidence: parseFloat(confidenceScore.toFixed(1)),
                    isSignificant: stats.occurrences >= 5 // Minimum 5 trades for significance
                });
            }
        }

        // Sort by CONFIDENCE SCORE (not just win rate) - balances win rate with trade count
        // This prevents 100% on 1 trade from ranking above 70% on 20 trades
        patternResults.sort((a, b) => b.confidence - a.confidence);

        // For top patterns, only include statistically significant ones (5+ trades)
        const significantPatterns = patternResults.filter(p => p.occurrences >= 5);
        const topPatterns = significantPatterns.slice(0, 5); // Top 5 significant patterns

        console.log('\n' + '='.repeat(50));
        console.log('📊 PATTERN ANALYSIS RESULTS');
        console.log('='.repeat(50));

        console.log('\n🏆 Top Patterns by Win Rate:');
        for (let i = 0; i < Math.min(5, patternResults.length); i++) {
            const p = patternResults[i];
            console.log(`   ${i + 1}. ${p.pattern}: ${p.winRate}% WR (${p.occurrences} trades, ${p.avgPnL}% avg)`);
        }

        // Summary
        const allWins = stockAnalysis.filter(s => s.outcome === 'WIN').length;
        const overallWinRate = stockAnalysis.length > 0
            ? ((allWins / stockAnalysis.length) * 100).toFixed(1)
            : 0;

        console.log(`\n📈 Overall: ${allWins}/${stockAnalysis.length} wins (${overallWinRate}%)`);

        return {
            ok: true,
            category: categoryKey,
            stocksAnalyzed: stockAnalysis.length,
            overallWinRate: parseFloat(overallWinRate),
            topPatterns,
            allPatterns: patternResults,
            stockDetails: stockAnalysis.slice(0, 20), // First 20 for display
            recommendations: this.generateRecommendations(topPatterns, patternResults)
        };
    }

    /**
     * Simulate trade outcome by walking forward from entry
     */
    simulateOutcome(candles, entryIdx) {
        const entryPrice = candles[entryIdx].close;
        const target = entryPrice * 1.05; // 5% target
        const stop = entryPrice * 0.97;   // 3% stop

        for (let i = entryIdx + 1; i < Math.min(entryIdx + 11, candles.length); i++) {
            const c = candles[i];

            // Target hit
            if (c.high >= target) {
                return {
                    win: true,
                    pnlPercent: ((target - entryPrice) / entryPrice) * 100,
                    daysHeld: i - entryIdx
                };
            }

            // Stop hit
            if (c.low <= stop) {
                return {
                    win: false,
                    pnlPercent: ((stop - entryPrice) / entryPrice) * 100,
                    daysHeld: i - entryIdx
                };
            }
        }

        // Time expired - check final position
        const exitIdx = Math.min(entryIdx + 10, candles.length - 1);
        const exitPrice = candles[exitIdx].close;
        const pnl = ((exitPrice - entryPrice) / entryPrice) * 100;

        return {
            win: exitPrice > entryPrice,
            pnlPercent: pnl,
            daysHeld: exitIdx - entryIdx
        };
    }

    /**
     * Load stocks from category
     */
    async loadStocks(categoryKey) {
        const category = await prisma.category.findUnique({
            where: { key: categoryKey }
        });

        if (!category) return [];

        const stockCategories = await prisma.stockCategory.findMany({
            where: { categoryId: category.id },
            include: { stock: true }
        });

        return stockCategories.map(sc => ({
            symbol: sc.stock.symbol,
            name: sc.stock.name,
            addedDate: sc.addedDate
        }));
    }

    /**
     * Find index of date in candles
     */
    findDateIndex(candles, targetDate) {
        const target = new Date(targetDate).toDateString();

        for (let i = 0; i < candles.length; i++) {
            const candleDate = new Date(candles[i].timestamp).toDateString();
            if (candleDate === target) return i;
        }

        // Find closest
        const targetTime = new Date(targetDate).getTime();
        let closestIdx = candles.length - 1;
        let closestDiff = Infinity;

        for (let i = 0; i < candles.length; i++) {
            const diff = Math.abs(new Date(candles[i].timestamp).getTime() - targetTime);
            if (diff < closestDiff) {
                closestDiff = diff;
                closestIdx = i;
            }
        }

        return closestIdx;
    }

    /**
     * Generate actionable recommendations
     */
    generateRecommendations(topPatterns, allPatterns) {
        const recommendations = [];

        if (topPatterns.length >= 1 && topPatterns[0].winRate >= 60) {
            recommendations.push(
                `Use ${topPatterns[0].pattern} as PRIMARY entry signal (${topPatterns[0].winRate}% win rate)`
            );
        }

        if (topPatterns.length >= 2 && topPatterns[1].winRate >= 50) {
            recommendations.push(
                `Combine with ${topPatterns[1].pattern} for confirmation`
            );
        }

        // Find patterns to AVOID
        const worstPatterns = allPatterns.filter(p => p.occurrences >= 3 && p.winRate < 40);
        if (worstPatterns.length > 0) {
            recommendations.push(
                `AVOID entries when ${worstPatterns[0].pattern} is the only signal`
            );
        }

        if (recommendations.length === 0) {
            recommendations.push('Need more data to generate reliable recommendations');
        }

        return recommendations;
    }
}

module.exports = new StockPatternAnalyzer();
