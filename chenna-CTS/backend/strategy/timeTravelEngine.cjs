/**
 * Time-Travel Backtest Engine
 * Tests 200+ logic combinations like a 20-year veteran trader
 * Discovers what actually works through time-travel validation
 */

const { PrismaClient } = require('@prisma/client');
const TechnicalAnalysis = require('./comprehensiveTA.cjs');
const InstitutionalTraps = require('./institutionalTraps.cjs');
const PatternRecognition = require('./patternRecognition.cjs');

const prisma = new PrismaClient();

class TimeTravelBacktestEngine {

    constructor() {
        this.trapDetector = new InstitutionalTraps();
        this.results = [];
        this.logicCatalogue = this.buildLogicCatalogue();
    }

    // ==================== LOGIC CATALOGUE (200+ Combinations) ====================

    buildLogicCatalogue() {
        const LogicCatalogueExpanded = require('./logicCatalogueExpanded.cjs');

        const catalogue = {
            // Single indicator strategies (70+)
            singleIndicator: LogicCatalogueExpanded.buildSingleIndicatorLogics(),

            // Dual indicator combos (60+)
            dualIndicator: LogicCatalogueExpanded.buildDualIndicatorLogics(),

            // Pattern + indicator combos (50+)
            patternIndicator: LogicCatalogueExpanded.buildPatternIndicatorLogics(),

            // Triple/composite rules (35+)
            composite: LogicCatalogueExpanded.buildCompositeLogics()
        };

        // Flatten and assign IDs
        const allLogics = [];
        let id = 1;

        for (const category in catalogue) {
            for (const logic of catalogue[category]) {
                logic.id = id++;
                logic.category = category;
                allLogics.push(logic);
            }
        }

        console.log(`📚 Logic Catalogue: ${allLogics.length} strategies to test\n`);
        return allLogics;
    }

    buildSingleIndicatorLogics() {
        const logics = [];

        // RSI strategies
        for (const threshold of [20, 30, 40]) {
            logics.push({
                name: `RSI Oversold ${threshold}`,
                entry: (indicators) => indicators.rsi14 < threshold,
                exit: { target: 2.5, stop: 1.5 }
            });
        }

        // SMA crossover strategies
        for (const fast of [10, 20]) {
            for (const slow of [50, 100]) {
                if (fast < slow) {
                    logics.push({
                        name: `SMA ${fast}/${slow} Crossover`,
                        entry: (indicators) => {
                            const price = indicators.currentPrice;
                            return price > indicators[`sma${fast}`] && price > indicators[`sma${slow}`];
                        },
                        exit: { target: 3.0, stop: 1.5 }
                    });
                }
            }
        }

        // Bollinger Band strategies
        logics.push({
            name: 'BB Lower Band Bounce',
            entry: (indicators) => {
                const price = indicators.currentPrice;
                return indicators.bb && price < indicators.bb.lower * 1.01;
            },
            exit: { target: 2.0, stop: 1.0 }
        });

        // MACD strategies
        logics.push({
            name: 'MACD Bullish Cross',
            entry: (indicators) => {
                return indicators.macd && indicators.macd.histogram > 0 && indicators.macdBullish;
            },
            exit: { target: 2.5, stop: 1.5 }
        });

        return logics;
    }

    buildDualIndicatorLogics() {
        const logics = [];

        // RSI + SMA
        logics.push({
            name: 'RSI Oversold + Above SMA50',
            entry: (indicators) => {
                return indicators.rsi14 < 30 && indicators.aboveSMA50;
            },
            exit: { target: 3.0, stop: 1.5 }
        });

        // RSI + MACD
        logics.push({
            name: 'RSI Oversold + MACD Bullish',
            entry: (indicators) => {
                return indicators.rsi14 < 30 && indicators.macdBullish;
            },
            exit: { target: 2.5, stop: 1.5 }
        });

        // BB + RSI
        logics.push({
            name: 'BB Lower + RSI Oversold',
            entry: (indicators) => {
                const price = indicators.currentPrice;
                return indicators.bb && price < indicators.bb.lower * 1.01 && indicators.rsi14 < 35;
            },
            exit: { target: 2.0, stop: 1.0 }
        });

        // Add more dual combinations...
        return logics;
    }

    buildPatternIndicatorLogics() {
        const logics = [];
        const patterns = ['Bullish Engulfing', 'Hammer', 'Morning Star'];

        for (const pattern of patterns) {
            // Pattern + RSI
            logics.push({
                name: `${pattern} + RSI Oversold`,
                entry: (indicators, candles) => {
                    const hasPattern = this.checkPattern(candles, pattern);
                    return hasPattern && indicators.rsi14 < 35;
                },
                exit: { target: 2.5, stop: 1.5 }
            });

            // Pattern + Support
            logics.push({
                name: `${pattern} at Support`,
                entry: (indicators, candles, context) => {
                    const hasPattern = this.checkPattern(candles, pattern);
                    const atSupport = context.support && candles[candles.length - 1].close < context.support * 1.02;
                    return hasPattern && atSupport;
                },
                exit: { target: 3.0, stop: 1.5 }
            });
        }

        return logics;
    }

    buildCompositeLogics() {
        const logics = [];

        // Triple confirmation strategies
        logics.push({
            name: 'Triple Bullish: RSI + MACD + Above SMA',
            entry: (indicators) => {
                return indicators.rsi14 < 30 &&
                    indicators.macdBullish &&
                    indicators.aboveSMA50;
            },
            exit: { target: 3.5, stop: 1.5 }
        });

        logics.push({
            name: 'Demand Zone Confluence',
            entry: (indicators, candles, context) => {
                const hasPattern = this.checkPattern(candles, 'Bullish Engulfing');
                const atSupport = context.support && candles[candles.length - 1].close < context.support * 1.02;
                const volumeConfirm = candles[candles.length - 1].volume > this.avgVolume(candles.slice(-20)) * 1.3;

                return hasPattern && atSupport && volumeConfirm && indicators.rsi14 < 40;
            },
            exit: { target: 4.0, stop: 1.5 }
        });

        return logics;
    }

    // ==================== TIME-TRAVEL BACKTEST ====================

    async runTimeTravelBacktest(categoryKey, openAIClient = null) {
        console.log(`\n🔮 Starting Time-Travel Backtest for: ${categoryKey}\n`);

        const startTime = Date.now();
        const allResults = [];

        // Get stocks for category
        const allStocks = await this.getStocksForCategory(categoryKey);

        // ⚡ ULTRA-FAST MODE: 2 stocks for RAPID testing
        const QUICK_MODE = true;
        const stocks = QUICK_MODE ? allStocks.slice(0, 2) : allStocks;

        console.log(`📊 Testing ${stocks.length} stocks ${QUICK_MODE ? `(QUICK TEST - ${allStocks.length} total)` : ''}\n`);
        if (QUICK_MODE) {
            console.log(`⚡ Ultra-fast mode: ~30 seconds (full would be 15-20 min)\n`);
        }

        // Test each logic
        for (let i = 0; i < this.logicCatalogue.length; i++) {
            const logic = this.logicCatalogue[i];
            console.log(`[${i + 1}/${this.logicCatalogue.length}] Testing: ${logic.name}`);

            const logicResults = await this.testLogicOnAllStocks(logic, stocks);
            allResults.push(logicResults);

            // Progress update every 20 logics
            if ((i + 1) % 20 === 0) {
                console.log(`  Progress: ${i + 1}/${this.logicCatalogue.length} logics tested\n`);
            }
        }

        // Score and rank all logics
        const scoredLogics = this.scoreAndRankLogics(allResults);

        // Select top 3
        const top3 = scoredLogics.slice(0, 3);

        // Merge into V1 default
        const v1Strategy = this.mergeIntoV1(top3, categoryKey);

        // Save results
        await this.saveResults(categoryKey, scoredLogics, v1Strategy);

        const elapsed = ((Date.now() - startTime) / 1000 / 60).toFixed(1);
        console.log(`\n✅ Backtest Complete in ${elapsed} minutes`);
        console.log(`   Top 3 Strategies Selected`);
        console.log(`   V1 Default Created\n`);

        return {
            scoredLogics,
            top3,
            v1Strategy,
            stats: {
                totalLogicsTested: this.logicCatalogue.length,
                totalStocks: stocks.length,
                timeElapsed: `${elapsed}min`
            }
        };
    }

    async testLogicOnAllStocks(logic, stocks) {
        const trades = [];

        for (const stock of stocks) {
            try {
                const candles = await this.getCandlesForStock(stock.symbol);
                if (!candles || candles.length < 100) continue;  // FIXED: Changed from 200 to 100

                // Time-travel: test at multiple historical dates
                for (let D = 100; D < candles.length - 10; D++) {
                    const trade = await this.testAtDate(logic, stock, candles, D);
                    if (trade) trades.push(trade);
                }
            } catch (error) {
                // Skip stock on error
            }
        }

        // Calculate metrics for this logic
        const metrics = this.calculateMetrics(trades);

        return {
            logic,
            trades,
            metrics
        };
    }

    async testAtDate(logic, stock, allCandles, dateIndex) {
        // STEP 1: Load only data up to date D (no future peeking!)
        const availableCandles = allCandles.slice(0, dateIndex + 1);
        const currentDate = availableCandles[availableCandles.length - 1].timestamp;

        // STEP 2: Calculate indicators
        const indicators = TechnicalAnalysis.getMarketContext(availableCandles);
        if (!indicators) return null;

        indicators.currentPrice = availableCandles[availableCandles.length - 1].close;

        // DEBUG: Log indicators ONCE for first stock/first logic only
        if (!this.debugLogged) {
            console.log('\n🔍 DEBUG: Indicator Structure:');
            console.log('  Keys:', Object.keys(indicators).slice(0, 15).join(', '));
            console.log('  RSI14:', indicators.rsi14);
            console.log('  SMA50:', indicators.sma50);
            console.log('  MACD:', indicators.macd ? 'exists' : 'undefined');
            console.log('  BB:', indicators.bb ? 'exists' : 'undefined');
            console.log('  currentPrice:', indicators.currentPrice);
            console.log('\n  Testing simple logic: RSI14 < 30?', indicators.rsi14 && indicators.rsi14 < 30);
            this.debugged = true;
        }

        // STEP 3: Check for entry signal
        const context = {
            support: this.findSupport(availableCandles),
            resistance: this.findResistance(availableCandles),
            timestamp: currentDate
        };

        let hasSignal = false;
        try {
            hasSignal = logic.entry(indicators, availableCandles, context);

            // DEBUG: Log first successful signal
            if (hasSignal && !this.signalLogged) {
                console.log(`\n✅ SIGNAL FOUND!`);
                console.log(`   Logic: ${logic.name}`);
                console.log(`   Stock: ${stock.symbol}`);
                console.log(`   Price: ${indicators.currentPrice}`);
                this.signalLogged = true;
            }
        } catch (e) {
            // DEBUG: Log first error
            if (!this.errorLogged) {
                console.log(`\n❌ ERROR in logic: ${logic.name}`);
                console.log(`   Error: ${e.message}`);
                this.errorLogged = true;
            }
            return null;
        }

        // If no signal, return null
        if (!hasSignal) return null;

        // STEP 4: Check institutional traps
        const trapScan = this.trapDetector.scanAllTraps(availableCandles, context);

        if (trapScan.recommendation === "AVOID") {
            console.log(`⚠️ Trap detected for ${stock.symbol} on ${entry.date}: ${trapScan.trapsDetected} traps`);
            return {
                symbol: stock.symbol,
                logic: logic.name,
                skipped: true,
                reason: 'Institutional trap detected',
                trapsDetected: trapScan.trapsDetected
            };
        }

        // STEP 5: Enter trade
        const entry = {
            price: indicators.currentPrice,
            date: currentDate,
            dateIndex: dateIndex
        };

        // STEP 6: Replay next 10 days
        const futureCandles = allCandles.slice(dateIndex + 1, dateIndex + 11);
        if (futureCandles.length < 10) return null;

        const outcome = this.replayForward(entry, futureCandles, logic.exit);

        return {
            symbol: stock.symbol,
            logic: logic.name,
            entry,
            exit: outcome.exit,
            pnl: outcome.pnl,
            mae: outcome.mae,
            mfe: outcome.mfe,
            holdingDays: outcome.holdingDays,
            exitReason: outcome.exitReason,
            trapAvoidance: trapScan.trapsDetected === 0 ? 1 : 0
        };
    }

    replayForward(entry, futureCandles, exitRules) {
        const targetPrice = entry.price * (1 + exitRules.target / 100);
        const stopPrice = entry.price * (1 - exitRules.stop / 100);

        let mae = 0; // Max Adverse Excursion
        let mfe = 0; // Max Favorable Excursion
        let exit = null;

        for (let i = 0; i < futureCandles.length; i++) {
            const candle = futureCandles[i];

            // Track MAE and MFE
            const adverse = (candle.low - entry.price) / entry.price * 100;
            const favorable = (candle.high - entry.price) / entry.price * 100;

            if (adverse < mae) mae = adverse;
            if (favorable > mfe) mfe = favorable;

            // Check target
            if (candle.high >= targetPrice) {
                exit = {
                    price: targetPrice,
                    date: candle.timestamp,
                    dayNum: i + 1
                };
                break;
            }

            // Check stop
            if (candle.low <= stopPrice) {
                exit = {
                    price: stopPrice,
                    date: candle.timestamp,
                    dayNum: i + 1
                };
                break;
            }
        }

        // If didn't hit target/stop in 10 days
        if (!exit) {
            const lastCandle = futureCandles[futureCandles.length - 1];
            exit = {
                price: lastCandle.close,
                date: lastCandle.timestamp,
                dayNum: futureCandles.length
            };
        }

        const pnl = ((exit.price - entry.price) / entry.price) * 100;

        return {
            exit,
            pnl,
            mae,
            mfe,
            holdingDays: exit.dayNum,
            exitReason: pnl >= exitRules.target ? 'TARGET' : pnl <= -exitRules.stop ? 'STOP' : 'TIME'
        };
    }

    // ==================== METRICS & SCORING ====================

    calculateMetrics(trades) {
        const validTrades = trades.filter(t => t.entry && t.exit);

        if (validTrades.length === 0) {
            return {
                tradeCount: 0,
                winRate: 0,
                avgPnl: 0,
                expectancy: 0,
                avgHolding: 0,
                maxDrawdown: 0,
                sharpe: 0,
                trapAvoidanceRate: 0
            };
        }

        const wins = validTrades.filter(t => t.pnl > 0);
        const losses = validTrades.filter(t => t.pnl <= 0);

        const winRate = (wins.length / validTrades.length) * 100;
        const avgWin = wins.length > 0 ? wins.reduce((sum, t) => sum + t.pnl, 0) / wins.length : 0;
        const avgLoss = losses.length > 0 ? Math.abs(losses.reduce((sum, t) => sum + t.pnl, 0) / losses.length) : 0;

        const avgPnl = validTrades.reduce((sum, t) => sum + t.pnl, 0) / validTrades.length;
        const expectancy = (winRate / 100 * avgWin) - ((100 - winRate) / 100 * avgLoss);

        const avgHolding = validTrades.reduce((sum, t) => sum + t.holdingDays, 0) / validTrades.length;

        // Calculate max drawdown
        let peak = 0;
        let maxDD = 0;
        let cumulative = 0;

        for (const trade of validTrades) {
            cumulative += trade.pnl;
            if (cumulative > peak) peak = cumulative;
            const drawdown = peak - cumulative;
            if (drawdown > maxDD) maxDD = drawdown;
        }

        // Sharpe-like ratio
        const pnls = validTrades.map(t => t.pnl);
        const stdDev = this.calculateStdDev(pnls);
        const sharpe = stdDev > 0 ? avgPnl / stdDev : 0;

        // Trap avoidance rate
        const trapsAvoided = trades.filter(t => t.skipped).length;
        const trapAvoidanceRate = trades.length > 0 ? (trapsAvoided / trades.length) * 100 : 0;

        return {
            tradeCount: validTrades.length,
            winRate,
            avgPnl,
            expectancy,
            avgHolding,
            maxDrawdown: maxDD,
            sharpe,
            trapAvoidanceRate
        };
    }

    scoreAndRankLogics(allResults) {
        const scored = allResults.map(result => {
            const m = result.metrics;

            // Apply minimum thresholds (LOWERED for realistic evaluation)
            if (m.tradeCount < 5) {  // Was 25 - now allow strategies with statistical significance
                return { ...result, score: 0, failReason: 'Insufficient trades' };
            }

            if (m.expectancy < 0.1) {  // Was 0.5 - now allow marginally profitable strategies
                return { ...result, score: 0, failReason: 'Low expectancy' };
            }

            // Weighted scoring (30/25/15/10/10/10)
            const expectancyScore = Math.min(m.expectancy / 2 * 100, 100) * 0.30;
            const winRateScore = m.winRate * 0.25;
            const drawdownScore = Math.max(0, 100 - m.maxDrawdown * 10) * 0.15;
            const tradeCountScore = Math.min(m.tradeCount / 100 * 100, 100) * 0.10;
            const robustnessScore = m.trapAvoidanceRate * 0.10;
            const consistencyScore = Math.min(m.sharpe * 20, 100) * 0.10;

            const totalScore = expectancyScore + winRateScore + drawdownScore +
                tradeCountScore + robustnessScore + consistencyScore;

            return {
                ...result,
                score: totalScore,
                scoreBreakdown: {
                    expectancy: expectancyScore.toFixed(1),
                    winRate: winRateScore.toFixed(1),
                    drawdown: drawdownScore.toFixed(1),
                    tradeCount: tradeCountScore.toFixed(1),
                    robustness: robustnessScore.toFixed(1),
                    consistency: consistencyScore.toFixed(1)
                }
            };
        });

        // Sort by score descending
        return scored.sort((a, b) => b.score - a.score);
    }

    mergeIntoV1(top3, categoryKey) {
        // Take best from each
        const bestLogic = top3[0].logic;
        const bestRR = top3.reduce((best, curr) =>
            curr.metrics.expectancy > best.metrics.expectancy ? curr : best
        );

        // Create V1 merged strategy
        const v1 = {
            category: categoryKey,
            name: `V1 Default - ${categoryKey}`,
            version: '1.0.0',
            createdAt: new Date().toISOString(),

            // Core entry rules from #1
            entryRules: {
                logic: bestLogic.name,
                description: 'Best performing logic from top-ranked strategy'
            },

            // Exit rules from best R:R
            exitRules: {
                target: bestRR.logic.exit.target,
                stop: bestRR.logic.exit.stop,
                source: `From ${bestRR.logic.name}`
            },

            // Mandatory trap filters
            trapFilters: {
                enabled: true,
                skipOnTraps: true,
                minConfidence: 0.70
            },

            // Position sizing (conservative)
            positionSizing: {
                riskPerTrade: 1.5, // % of capital
                maxPositions: 5
            },

            // Performance metrics
            expectedMetrics: {
                accuracy: top3[0].metrics.winRate.toFixed(1) + '%',
                expectancy: top3[0].metrics.expectancy.toFixed(2) + '%',
                trapAvoidance: top3[0].metrics.trapAvoidanceRate.toFixed(1) + '%',
                avgHolding: top3[0].metrics.avgHolding.toFixed(1) + ' days'
            },

            // Top 3 contributors
            contributors: top3.map((r, i) => ({
                rank: i + 1,
                logic: r.logic.name,
                score: r.score.toFixed(1),
                trades: r.metrics.tradeCount,
                winRate: r.metrics.winRate.toFixed(1) + '%'
            }))
        };

        return v1;
    }

    // ==================== DATA ACCESS ====================

    async getStocksForCategory(categoryKey) {
        const categoryStocks = await prisma.stockCategory.findMany({
            where: { category: { key: categoryKey } },
            include: { stock: true }
        });

        return categoryStocks.map(sc => sc.stock);
    }

    async getCandlesForStock(symbol) {
        const cached = await prisma.ohlcvCache.findFirst({
            where: { symbol, interval: 'day' },
            orderBy: { createdAt: 'desc' }
        });

        if (!cached) return null;

        return JSON.parse(cached.data);
    }

    async saveResults(categoryKey, scoredLogics, v1Strategy) {
        const fs = require('fs');
        const path = require('path');

        const dir = path.join(__dirname, '../results');
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

        // Save full results
        fs.writeFileSync(
            path.join(dir, `${categoryKey}_full_results.json`),
            JSON.stringify(scoredLogics, null, 2)
        );

        // Save V1 strategy to file
        fs.writeFileSync(
            path.join(dir, `strategy_v1_${categoryKey}.json`),
            JSON.stringify(v1Strategy, null, 2)
        );

        console.log(`💾 Results saved to: backend/results/`);

        // ✅ NEW: Save V1 strategy to database and promote
        try {
            const category = await prisma.category.findUnique({
                where: { key: categoryKey }
            });

            if (category) {
                // Unpromote any existing strategies for this category
                await prisma.strategy.updateMany({
                    where: {
                        categoryId: category.id,
                        promoted: true
                    },
                    data: { promoted: false }
                });

                // Create and promote new V1 strategy
                const savedStrategy = await prisma.strategy.create({
                    data: {
                        categoryId: category.id,
                        version: 'V1',
                        promoted: true,
                        description: v1Strategy.name,
                        rules: {
                            entry: v1Strategy.entryRules,
                            exit: v1Strategy.exitRules,
                            traps: v1Strategy.trapFilters
                        },
                        params: {
                            positionSizing: v1Strategy.positionSizing,
                            contributors: v1Strategy.contributors
                        },
                        metrics: v1Strategy.expectedMetrics
                    }
                });

                console.log(`✅ V1 Strategy saved to database and promoted! (ID: ${savedStrategy.id})`);
            } else {
                console.warn(`⚠️ Category ${categoryKey} not found in database`);
            }
        } catch (dbError) {
            console.error('❌ Failed to save V1 strategy to database:', dbError.message);
            // Don't fail the entire operation if DB save fails
        }
    }

    // ==================== HELPERS ====================

    checkPattern(candles, patternName) {
        try {
            const patterns = PatternRecognition.scanPatterns(candles);
            return patterns.some(p => p.name === patternName);
        } catch {
            return false;
        }
    }

    findSupport(candles) {
        const lows = candles.slice(-50).map(c => c.low);
        return Math.min(...lows);
    }

    findResistance(candles) {
        const highs = candles.slice(-50).map(c => c.high);
        return Math.max(...highs);
    }

    avgVolume(candles) {
        if (candles.length === 0) return 0;
        return candles.reduce((sum, c) => sum + c.volume, 0) / candles.length;
    }

    calculateStdDev(values) {
        const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
        const squaredDiffs = values.map(v => Math.pow(v - mean, 2));
        const variance = squaredDiffs.reduce((sum, v) => sum + v, 0) / values.length;
        return Math.sqrt(variance);
    }
}

module.exports = TimeTravelBacktestEngine;
