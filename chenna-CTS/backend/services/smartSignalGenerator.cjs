/**
 * Smart Multi-Logic Signal Generator
 * 
 * PURPOSE: Generate HIGH-CONFIDENCE trading signals using MULTIPLE strategies
 * 
 * PROBLEM SOLVED:
 * - Single strategy = 50% accuracy
 * - User could pick from failing 50%
 * 
 * SOLUTION:
 * - Discover ALL winning strategies
 * - Profile each stock's characteristics
 * - Match stock to BEST strategy for its profile
 * - Only signal when confidence > threshold
 * - Skip low-confidence stocks (better to miss than lose)
 */

const { PrismaClient } = require('@prisma/client');
const labsDataService = require('./labsDataService.cjs');
const patternDiscoverer = require('./patternDiscoverer.cjs');
const TechnicalAnalysis = require('../strategy/comprehensiveTA.cjs');
const fs = require('fs');
const path = require('path');

const prisma = new PrismaClient();

class SmartSignalGenerator {

    constructor() {
        // Minimum confidence to generate a signal
        this.minConfidence = 60;

        // Strategy profiles discovered from backtest
        this.strategyProfiles = {};

        // Results directory
        this.resultsDir = path.join(__dirname, '../results/intelligent_labs');
    }

    /**
     * Generate smart signals for a category
     * Uses multiple strategies and picks the BEST one for each stock
     */
    async generateSignals(categoryKey, options = {}) {
        console.log('\n' + '═'.repeat(70));
        console.log('🎯 SMART MULTI-LOGIC SIGNAL GENERATOR');
        console.log('═'.repeat(70));
        console.log(`📌 Category: ${categoryKey}`);
        console.log(`📌 Min Confidence: ${options.minConfidence || this.minConfidence}%`);

        const minConfidence = options.minConfidence || this.minConfidence;

        // Step 1: Load discovered strategies for this category
        console.log('\n📊 Step 1: Loading discovered strategies...');
        const strategies = await this.loadDiscoveredStrategies(categoryKey);
        console.log(`   Found ${strategies.length} strategies`);

        if (strategies.length === 0) {
            console.log('   ⚠️ No strategies found! Run intelligent-backtest first.');
            return { signals: [], error: 'No strategies found' };
        }

        // Step 2: Load active stocks
        console.log('\n📦 Step 2: Loading active stocks...');
        const stocks = await this.loadActiveStocks(categoryKey);
        console.log(`   Found ${stocks.length} active stocks`);

        // Step 3: Fetch current data for each stock
        console.log('\n📈 Step 3: Fetching current market data...');
        const stockData = await labsDataService.getHistoricalData(
            stocks.map(s => ({ symbol: s.symbol })),
            { mode: 'auto', days: 50 }
        );

        // Step 4: Generate signals
        console.log('\n🎯 Step 4: Generating smart signals...');
        const signals = [];
        const skipped = [];

        for (const stock of stocks) {
            const candles = stockData[stock.symbol];
            if (!candles || candles.length < 30) {
                skipped.push({ symbol: stock.symbol, reason: 'Insufficient data' });
                continue;
            }

            // Transform candles
            const transformedCandles = candles.map(c => ({
                timestamp: c.date,
                open: c.open,
                high: c.high,
                low: c.low,
                close: c.close,
                volume: c.volume
            }));

            // Discover patterns on latest candle
            const latestIdx = transformedCandles.length - 1;
            const discovery = patternDiscoverer.discoverAll(transformedCandles, latestIdx);
            const foundPatterns = discovery.patterns.map(p => p.name);

            if (foundPatterns.length === 0) {
                skipped.push({ symbol: stock.symbol, reason: 'No patterns found' });
                continue;
            }

            // Find BEST matching strategy
            const bestMatch = this.findBestStrategy(
                stock,
                transformedCandles,
                foundPatterns,
                strategies
            );

            if (!bestMatch || bestMatch.confidence < minConfidence) {
                skipped.push({
                    symbol: stock.symbol,
                    reason: bestMatch
                        ? `Low confidence: ${bestMatch.confidence}%`
                        : 'No matching strategy',
                    patternsFound: foundPatterns
                });
                continue;
            }

            // Generate signal
            const signal = this.buildSignal(
                stock,
                transformedCandles,
                bestMatch,
                foundPatterns,
                strategies
            );

            signals.push(signal);
        }

        // Summary
        console.log('\n' + '─'.repeat(70));
        console.log('📊 SIGNAL GENERATION COMPLETE');
        console.log('─'.repeat(70));
        console.log(`   Signals Generated: ${signals.length}`);
        console.log(`   Stocks Skipped: ${skipped.length}`);
        console.log(`   Avg Confidence: ${signals.length > 0
            ? (signals.reduce((s, sig) => s + sig.confidence, 0) / signals.length).toFixed(1)
            : 0}%`);

        // Log top signals
        if (signals.length > 0) {
            console.log('\n🔥 Top Signals:');
            signals.sort((a, b) => b.confidence - a.confidence);
            signals.slice(0, 5).forEach((sig, i) => {
                console.log(`   ${i + 1}. ${sig.symbol} | ${sig.strategyUsed} | ${sig.confidence}% confidence`);
            });
        }

        return {
            category: categoryKey,
            timestamp: new Date().toISOString(),
            signals,
            skipped,
            summary: {
                totalStocks: stocks.length,
                signalsGenerated: signals.length,
                stocksSkipped: skipped.length,
                avgConfidence: signals.length > 0
                    ? (signals.reduce((s, sig) => s + sig.confidence, 0) / signals.length).toFixed(1)
                    : 0,
                strategiesUsed: [...new Set(signals.map(s => s.strategyUsed))]
            }
        };
    }

    /**
     * Load discovered strategies from backtest results
     */
    async loadDiscoveredStrategies(categoryKey) {
        const strategies = [];

        // Load from intelligent_labs results
        try {
            const files = fs.readdirSync(this.resultsDir)
                .filter(f => f.startsWith(categoryKey) && f.endsWith('.json'))
                .sort()
                .reverse(); // Most recent first

            if (files.length > 0) {
                const latestFile = path.join(this.resultsDir, files[0]);
                const data = JSON.parse(fs.readFileSync(latestFile, 'utf8'));

                // Extract single patterns
                if (data.phases?.matrix?.top5) {
                    for (const pattern of data.phases.matrix.top5) {
                        strategies.push({
                            type: 'single',
                            name: pattern.pattern,
                            patterns: [pattern.pattern],
                            winRate: parseFloat(pattern.winRate),
                            expectancy: parseFloat(pattern.expectancy),
                            trades: pattern.trades || 0
                        });
                    }
                }

                // Extract combo patterns
                if (data.phases?.combinations?.top5) {
                    for (const combo of data.phases.combinations.top5) {
                        strategies.push({
                            type: 'combo',
                            name: combo.combo,
                            patterns: combo.patterns,
                            winRate: parseFloat(combo.winRate),
                            expectancy: combo.expectancy,
                            trades: combo.trades || 0
                        });
                    }
                }
            }
        } catch (err) {
            console.error('   Error loading strategies:', err.message);
        }

        // Sort by win rate
        strategies.sort((a, b) => b.winRate - a.winRate);

        return strategies;
    }

    /**
     * Load active stocks (not expired) from category
     */
    async loadActiveStocks(categoryKey) {
        const category = await prisma.category.findUnique({
            where: { key: categoryKey }
        });

        if (!category) return [];

        const stockCategories = await prisma.stockCategory.findMany({
            where: {
                categoryId: category.id,
                status: 'active'
            },
            include: { stock: true },
            orderBy: { addedDate: 'desc' }
        });

        return stockCategories.map(sc => ({
            symbol: sc.stock.symbol,
            name: sc.stock.name,
            addedDate: sc.addedDate
        }));
    }

    /**
     * Find the BEST strategy for this stock
     */
    findBestStrategy(stock, candles, foundPatterns, strategies) {
        let bestMatch = null;
        let bestScore = 0;

        for (const strategy of strategies) {
            // Check if stock has ALL required patterns
            const hasAllPatterns = strategy.patterns.every(p => foundPatterns.includes(p));
            if (!hasAllPatterns) continue;

            // Calculate confidence score
            const confidence = this.calculateConfidence(stock, candles, strategy);

            if (confidence > bestScore) {
                bestScore = confidence;
                bestMatch = {
                    strategy,
                    confidence: Math.round(confidence),
                    matchedPatterns: strategy.patterns
                };
            }
        }

        return bestMatch;
    }

    /**
     * Calculate confidence score for a strategy on this stock
     */
    calculateConfidence(stock, candles, strategy) {
        let confidence = strategy.winRate; // Base confidence = historical win rate

        const current = candles[candles.length - 1];
        const prev = candles[candles.length - 2];
        const lookback20 = candles.slice(-20);

        // Volume factor
        const avgVolume = lookback20.reduce((s, c) => s + c.volume, 0) / 20;
        const volumeRatio = avgVolume > 0 ? current.volume / avgVolume : 1;
        if (volumeRatio > 1.5) {
            confidence += 5; // Higher volume = more confidence
        } else if (volumeRatio < 0.5) {
            confidence -= 10; // Low volume = less confidence
        }

        // RSI factor
        const rsi = TechnicalAnalysis.RSI(candles, 14);
        if (rsi !== null) {
            if (rsi < 30) {
                confidence += 5; // Oversold = more confidence for reversal
            } else if (rsi > 70) {
                confidence -= 5; // Overbought = less confidence
            }
        }

        // Trade count factor (more trades = more reliable)
        if (strategy.trades >= 20) {
            confidence += 5;
        } else if (strategy.trades < 5) {
            confidence -= 10;
        }

        // Expectancy factor
        if (strategy.expectancy > 1.5) {
            confidence += 5;
        } else if (strategy.expectancy < 0.5) {
            confidence -= 5;
        }

        return Math.max(0, Math.min(100, confidence));
    }

    /**
     * Build signal object
     */
    buildSignal(stock, candles, bestMatch, foundPatterns, allStrategies) {
        const current = candles[candles.length - 1];
        const atr = TechnicalAnalysis.ATR(candles) || (current.close * 0.02);

        // Find alternate strategies
        const alternates = allStrategies
            .filter(s => s.name !== bestMatch.strategy.name)
            .filter(s => s.patterns.some(p => foundPatterns.includes(p)))
            .slice(0, 3)
            .map(s => s.name);

        return {
            symbol: stock.symbol,
            stockName: stock.name,
            signal: 'BUY',
            strategyUsed: bestMatch.strategy.name,
            strategyType: bestMatch.strategy.type,
            confidence: bestMatch.confidence,
            matchedPatterns: bestMatch.matchedPatterns,
            historicalWinRate: bestMatch.strategy.winRate,
            historicalTrades: bestMatch.strategy.trades,
            reason: `${bestMatch.strategy.name} pattern with ${bestMatch.strategy.winRate}% historical win rate`,
            entry: {
                price: parseFloat(current.close.toFixed(2)),
                timestamp: current.timestamp
            },
            stopLoss: parseFloat((current.close - atr * 2).toFixed(2)),
            target: parseFloat((current.close + atr * 3).toFixed(2)),
            riskReward: '1:1.5',
            alternateStrategies: alternates,
            allPatternsFound: foundPatterns
        };
    }
}

module.exports = new SmartSignalGenerator();
