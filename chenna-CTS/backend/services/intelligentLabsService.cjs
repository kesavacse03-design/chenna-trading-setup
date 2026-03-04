/**
 * Intelligent Labs Service
 * 
 * PURPOSE: Orchestrate the complete pattern discovery and testing workflow
 * 
 * FLOW:
 * 1. Load all stocks in a category
 * 2. Verify each stock fits the category definition
 * 3. For valid stocks → Discover all patterns on addedDate
 * 4. For each pattern → Simulate trade → Record WIN/LOSS
 * 5. Build pattern × stock matrix
 * 6. Test pattern combinations
 * 7. Rank by expectancy → Output best strategy
 */

const { PrismaClient } = require('@prisma/client');
const labsDataService = require('../services/labsDataService.cjs');
const categoryVerifier = require('../services/categoryVerifier.cjs');
const patternDiscoverer = require('../services/patternDiscoverer.cjs');
const patternTester = require('../services/patternTester.cjs');
const combinationTester = require('../services/combinationTester.cjs');


const prisma = new PrismaClient();

class IntelligentLabsService {

    constructor() {
        this.results = {};
    }

    /**
     * Run complete intelligent analysis for a category
     */
    async analyzeCategory(categoryKey, options = {}) {
        console.log(`\n${'='.repeat(60)}`);
        console.log(`🧪 INTELLIGENT LABS: ${categoryKey}`);
        console.log('='.repeat(60));

        const startTime = Date.now();

        const result = {
            category: categoryKey,
            timestamp: new Date().toISOString(),
            phases: {},
            summary: null,
            bestStrategy: null,
            error: null
        };

        try {
            // ============================================================
            // PHASE 1: Load Stocks
            // ============================================================
            console.log('\n📦 Phase 1: Loading stocks...');
            const stocks = await this.loadCategoryStocks(categoryKey);
            console.log(`   Found ${stocks.length} stocks`);

            if (stocks.length === 0) {
                result.error = 'No stocks found in category';
                return result;
            }

            result.phases.loaded = { count: stocks.length };

            // ============================================================
            // PHASE 2: Verify Category Fit
            // ============================================================
            console.log('\n🔍 Phase 2: Verifying category fit...');
            const verified = await this.verifyStocks(stocks, categoryKey);
            console.log(`   Valid: ${verified.valid.length} | Invalid: ${verified.invalid.length}`);

            result.phases.verification = {
                valid: verified.valid.length,
                invalid: verified.invalid.length,
                invalidReasons: verified.invalidReasons
            };

            if (verified.valid.length === 0) {
                result.error = 'No stocks pass category verification';
                return result;
            }

            // ============================================================
            // PHASE 3: Discover Patterns
            // ============================================================
            console.log('\n🔬 Phase 3: Discovering patterns...');
            const discovered = await this.discoverPatterns(verified.valid);
            console.log(`   Total patterns found: ${discovered.totalPatterns}`);
            console.log(`   Unique pattern types: ${discovered.uniquePatterns.length}`);

            result.phases.discovery = {
                stocksAnalyzed: discovered.stockResults.length,
                totalPatterns: discovered.totalPatterns,
                uniquePatterns: discovered.uniquePatterns
            };

            // ============================================================
            // PHASE 4: Test Patterns
            // ============================================================
            console.log('\n🧪 Phase 4: Testing patterns...');
            const tested = await this.testPatterns(discovered.stockResults);
            console.log(`   Trades simulated: ${tested.totalTrades}`);
            console.log(`   Win rate: ${tested.overallWinRate}`);

            result.phases.testing = {
                totalTrades: tested.totalTrades,
                wins: tested.wins,
                losses: tested.losses,
                winRate: tested.overallWinRate,
                avgPnl: tested.avgPnl
            };

            // ============================================================
            // PHASE 5: Build Pattern Matrix
            // ============================================================
            console.log('\n📊 Phase 5: Building pattern matrix...');
            const matrix = patternTester.buildPatternMatrix(tested.stockResults);
            console.log(`   Patterns ranked: ${matrix.ranked.length}`);

            result.phases.matrix = {
                patternsRanked: matrix.ranked.length,
                top5: matrix.ranked.slice(0, 5).map(p => ({
                    pattern: p.pattern,
                    winRate: p.winRate,
                    expectancy: p.expectancy.toFixed(2)
                }))
            };

            // ============================================================
            // PHASE 6: Test Combinations
            // ============================================================
            console.log('\n🔗 Phase 6: Testing combinations...');
            const combos = combinationTester.testAllCombinations(tested.stockResults);
            console.log(`   Combos tested: ${combos.totalCombos}`);
            console.log(`   Valid combos: ${combos.validCombos}`);

            result.phases.combinations = {
                testedCount: combos.totalCombos,
                validCount: combos.validCombos,
                top5: combos.top5
            };

            // ============================================================
            // PHASE 7: Find Best Strategy
            // ============================================================
            console.log('\n🏆 Phase 7: Finding best strategy...');
            const best = combinationTester.findBestStrategy(matrix.ranked, combos);
            console.log(`   Best: ${best.best?.name || 'None found'}`);
            console.log(`   Win Rate: ${best.best?.winRate?.toFixed(1) || 0}%`);
            console.log(`   Expectancy: ${best.best?.expectancy?.toFixed(2) || 0}%`);

            result.bestStrategy = best.best;
            result.recommendation = best.recommendation;
            result.entryRules = combinationTester.generateEntryRules(best.best, categoryKey);

            // ============================================================
            // SUMMARY
            // ============================================================
            const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
            console.log(`\n${'='.repeat(60)}`);
            console.log(`✅ ANALYSIS COMPLETE in ${elapsed}s`);
            console.log('='.repeat(60));

            result.summary = {
                elapsedSeconds: elapsed,
                stocksAnalyzed: verified.valid.length,
                patternsDiscovered: discovered.totalPatterns,
                tradesTested: tested.totalTrades,
                bestWinRate: best.best?.winRate || 0,
                bestExpectancy: best.best?.expectancy || 0
            };

            // Save results
            await this.saveResults(categoryKey, result);

            return result;

        } catch (error) {
            console.error(`\n❌ Error in Labs analysis:`, error);
            result.error = error.message;
            return result;
        }
    }

    /**
     * Load stocks for a category
     */
    async loadCategoryStocks(categoryKey) {
        // First get categoryId from key
        const category = await prisma.category.findUnique({
            where: { key: categoryKey }
        });

        if (!category) {
            console.log(`   Category not found: ${categoryKey}`);
            return [];
        }

        // Then get stocks in this category
        const stockCategories = await prisma.stockCategory.findMany({
            where: { categoryId: category.id },
            include: {
                stock: true
            }
        });

        // Transform to expected format
        return stockCategories.map(sc => ({
            symbol: sc.stock.symbol,
            name: sc.stock.name,
            addedDate: sc.addedDate,
            addedDate2: sc.addedDate // Use same date for addedDate2
        }));
    }

    /**
     * Verify stocks fit category definition
     */
    async verifyStocks(stocks, categoryKey) {
        const valid = [];
        const invalid = [];
        const invalidReasons = {};

        // Batch fetch all historical data first using labsDataService
        console.log(`   Fetching historical data for ${stocks.length} stocks...`);
        const allHistoricalData = await labsDataService.getHistoricalData(
            stocks.map(s => ({ symbol: s.symbol })),
            { mode: 'auto', days: 200 }
        );

        for (const stock of stocks) {
            try {
                // Get candles from pre-fetched data
                const targetDate = stock.addedDate2 || stock.addedDate;
                const candles = allHistoricalData[stock.symbol];

                if (!candles || candles.length < 50) {
                    invalid.push(stock);
                    invalidReasons[stock.symbol] = 'Insufficient candle data';
                    continue;
                }

                // Transform candles to expected format (with timestamp)
                const transformedCandles = candles.map(c => ({
                    timestamp: c.date,
                    open: c.open,
                    high: c.high,
                    low: c.low,
                    close: c.close,
                    volume: c.volume
                }));

                // Find event day index
                const eventDayIdx = this.findEventDayIndex(transformedCandles, targetDate);
                if (eventDayIdx < 20) {
                    invalid.push(stock);
                    invalidReasons[stock.symbol] = 'Event day too early in data';
                    continue;
                }

                // Verify category fit
                const verification = await categoryVerifier.verify(stock, transformedCandles.slice(0, eventDayIdx + 1), categoryKey);

                if (verification.isValid) {
                    valid.push({
                        ...stock,
                        candles: transformedCandles,
                        eventDayIdx,
                        verification
                    });
                    console.log(`   ✓ ${stock.symbol}: ${verification.reason}`);

                } else {
                    invalid.push(stock);
                    invalidReasons[stock.symbol] = verification.reason;
                    console.log(`   ✗ ${stock.symbol}: ${verification.reason}`);
                }

            } catch (error) {
                invalid.push(stock);
                invalidReasons[stock.symbol] = error.message;
            }
        }

        return { valid, invalid, invalidReasons };
    }

    /**
     * Discover patterns for all valid stocks
     */
    async discoverPatterns(validStocks) {
        const stockResults = [];
        let totalPatterns = 0;
        const patternCounts = {};

        for (const stock of validStocks) {
            const discovered = patternDiscoverer.discoverAll(stock.candles, stock.eventDayIdx);

            stockResults.push({
                symbol: stock.symbol,
                eventDayIdx: stock.eventDayIdx,
                candles: stock.candles,
                patterns: discovered.patterns,
                summary: discovered.summary
            });

            totalPatterns += discovered.patterns.length;

            // Count unique patterns
            for (const pattern of discovered.patterns) {
                patternCounts[pattern.name] = (patternCounts[pattern.name] || 0) + 1;
            }
        }

        const uniquePatterns = Object.keys(patternCounts).sort((a, b) => patternCounts[b] - patternCounts[a]);

        return {
            stockResults,
            totalPatterns,
            uniquePatterns,
            patternCounts
        };
    }

    /**
     * Test all patterns for all stocks
     */
    async testPatterns(stockResults) {
        const testedStockResults = [];
        let totalTrades = 0;
        let wins = 0;
        let losses = 0;
        let totalPnl = 0;

        for (const stock of stockResults) {
            const testResults = patternTester.testAllPatterns(
                stock.patterns,
                stock.candles,
                stock.eventDayIdx
            );

            testedStockResults.push({
                symbol: stock.symbol,
                eventDayIdx: stock.eventDayIdx,
                tested: testResults.tested,
                skipped: testResults.skipped,
                summary: testResults.summary
            });

            totalTrades += testResults.tested.length;
            wins += testResults.summary.wins;
            losses += testResults.summary.losses;
            totalPnl += testResults.tested.reduce((s, t) => s + t.pnlPercent, 0);
        }

        return {
            stockResults: testedStockResults,
            totalTrades,
            wins,
            losses,
            overallWinRate: totalTrades > 0 ? (wins / totalTrades * 100).toFixed(1) + '%' : '0%',
            avgPnl: totalTrades > 0 ? (totalPnl / totalTrades).toFixed(2) + '%' : '0%'
        };
    }

    /**
     * Find the index of the event day in candles
     */
    findEventDayIndex(candles, targetDate) {
        const target = new Date(targetDate).toDateString();

        for (let i = 0; i < candles.length; i++) {
            const candleDate = new Date(candles[i].timestamp).toDateString();
            if (candleDate === target) {
                return i;
            }
        }

        // If exact date not found, find closest
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
     * Save results to database/file
     */
    async saveResults(categoryKey, result) {
        const fs = require('fs');
        const path = require('path');

        const resultsDir = path.join(__dirname, '..', 'results', 'intelligent_labs');
        if (!fs.existsSync(resultsDir)) {
            fs.mkdirSync(resultsDir, { recursive: true });
        }

        const filename = `${categoryKey}_${Date.now()}.json`;
        const filepath = path.join(resultsDir, filename);

        fs.writeFileSync(filepath, JSON.stringify(result, null, 2));
        console.log(`📁 Results saved to: ${filename}`);

        // Also save to database if there's a best strategy
        if (result.bestStrategy) {
            await this.promoteToBestStrategy(categoryKey, result);
        }
    }

    /**
     * Promote best strategy to database
     */
    async promoteToBestStrategy(categoryKey, result) {
        try {
            await prisma.$executeRaw`
                INSERT INTO best_strategies (category_key, strategy_name, patterns, win_rate, expectancy, updated_at)
                VALUES (${categoryKey}, ${result.bestStrategy.name}, ${JSON.stringify(result.bestStrategy.patterns || [result.bestStrategy.name])}, ${result.bestStrategy.winRate}, ${result.bestStrategy.expectancy}, NOW())
                ON CONFLICT (category_key) 
                DO UPDATE SET 
                    strategy_name = EXCLUDED.strategy_name,
                    patterns = EXCLUDED.patterns,
                    win_rate = EXCLUDED.win_rate,
                    expectancy = EXCLUDED.expectancy,
                    updated_at = NOW()
            `;
            console.log(`🏆 Best strategy promoted to database`);
        } catch (error) {
            // Table might not exist, log but don't fail
            console.log(`⚠️ Could not save to database: ${error.message}`);
        }
    }

    /**
     * Run analysis for all categories
     */
    async analyzeAllCategories() {
        const categories = [
            'DOWNSIDE_LOM_SWING',
            'DOWNSIDE_LOM_INTRA',
            'UPSIDE_LOM_SWING',
            'UPSIDE_LOM_INTRA',
            'MULTI_RESISTANCE_BO',
            'SHORT_TERM_SWING_BO_UP',
            'LONG_TERM_SWING_BO_UP',
            'HIGH_POWERED_STOCKS',
            'DAILY_CONTRACTION'
        ];

        const results = {};

        for (const category of categories) {
            console.log(`\n\n${'#'.repeat(70)}`);
            console.log(`# CATEGORY: ${category}`);
            console.log('#'.repeat(70));

            results[category] = await this.analyzeCategory(category);
        }

        return results;
    }
}

module.exports = new IntelligentLabsService();
