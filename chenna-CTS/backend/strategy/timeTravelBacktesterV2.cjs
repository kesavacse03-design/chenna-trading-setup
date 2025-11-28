/**
 * Time-Travel Backtester V2 - PROFESSIONAL GRADE
 * 
 * Tests 20-40 systematic strategy variants across historical data
 * Deterministic, reproducible, anti-trap
 * 
 * ENHANCEMENTS (TOP 1%):
 * - Out-of-sample validation (prevents overfitting)
 * - Quality threshold filtering (only best strategies)
 * - Enhanced CSV export (professional audit trail)
 * 
 * CRITICAL: Candle-by-candle replay to simulate real trading
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const InstitutionalTrapDetector = require('./institutionalTrapDetector.cjs');
const ComprehensiveTA = require('./comprehensiveTA.cjs');
const V1StrategySchema = require('../models/strategySchema.cjs');
const OutOfSampleValidator = require('./outOfSampleValidator.cjs');
const QualityThresholdFilter = require('./qualityThresholdFilter.cjs');

class TimeTravelBacktesterV2 {

    constructor() {
        this.trapDetector = new InstitutionalTrapDetector();
        this.validator = new OutOfSampleValidator();
        this.qualityFilter = new QualityThresholdFilter();
        this.strategyVariants = this.buildStrategyVariants();
    }

    /**
     * Build 20-40 well-designed strategy variants
     * Systematic, not random!
     */
    buildStrategyVariants() {
        const variants = [];

        // Systematic parameters
        const rsiLevels = [25, 30, 35];
        const volumeFactors = [1.5, 2.0];
        const targets = [2.0, 2.5, 3.0];
        const stops = [1.0, 1.5];

        for (const rsi of rsiLevels) {
            for (const vol of volumeFactors) {
                for (const target of targets) {
                    for (const stop of stops) {
                        // Min reward:risk ratio 1.5:1
                        if (target / stop >= 1.5) {
                            variants.push({
                                name: `RSI${rsi}_VOL${vol}_T${target}_S${stop}`,
                                rsiThreshold: rsi,
                                volumeFactor: vol,
                                targetPct: target,
                                stopPct: stop,
                                maxSessions: 10,
                                reversalExitEnabled: true
                            });
                        }
    async run(categoryKey, options = {}) {
                            console.log(`\n🚀 Starting Time-Travel Backtest V2 for ${categoryKey}`);

                            // SMART AUTO-CACHE: Ensure data is available
                            if (options.autoCache !== false) {
                                try {
                                    const SmartOHLCVCacheManager = require('../services/smartOHLCVCacheManager.cjs');
                                    const cacheManager = new SmartOHLCVCacheManager();

                                    const cacheResult = await cacheManager.ensureDataForCategory(categoryKey);

                                    if (!cacheResult.sufficient) {
                                        console.warn(`⚠️ Only ${cacheResult.ready}/${cacheResult.total} stocks have sufficient data`);
                                    } else {
                                        console.log(`✅ Data check passed: ${cacheResult.ready} stocks ready`);
                                    }
                                } catch (cacheError) {
                                    console.warn(`⚠️ Auto-cache check failed: ${cacheError.message}`);
                                    console.warn(`   Continuing with available data...`);
                                }
                            }

                            console.log(`📊 Testing ${this.strategyVariants.length} strategy variants\n`);

                            const stocks = await this.getStocksForCategory(categoryKey);
                            const results = [];

                            for (let i = 0; i < this.strategyVariants.length; i++) {
                                const variant = this.strategyVariants[i];
                                console.log(`\n[${i + 1}/${this.strategyVariants.length}] Testing: ${variant.name}`);

                                const trades = [];

                                for (const stock of stocks) {
                                    const candles = await this.getCandlesForStock(stock.symbol);

                                    if (!candles || candles.length < 100) {
                                        console.log(`  ⚠️ ${stock.symbol}: Insufficient data`);
                                        continue;
                                    }

                                    const stockTrades = await this.simulateStock(stock, candles, variant);
                                    trades.push(...stockTrades);
                                }

                                console.log(`  📈 Total trades: ${trades.length}`);

                                // Compute metrics
                                const metrics = this.computeMetrics(trades);

                                // Quality score
                                const qualityScore = this.computeQualityScore(metrics);

                                results.push({
                                    variant,
                                    trades,
                                    metrics,
                                    qualityScore
                                });

                                console.log(`  🎯 Quality Score: ${qualityScore.toFixed(2)}`);
                                console.log(`  📊 Win Rate: ${metrics.winRate.toFixed(1)}%`);
                            }

                            // Sort by quality score
                            results.sort((a, b) => b.qualityScore - a.qualityScore);

                            console.log(`\n🎯 Applying quality threshold filter...`);
                            const filterResult = this.qualityFilter.filterStrategies(results);

                            if (filterResult.passing.length === 0) {
                                console.log(`\n❌ No strategies passed quality threshold!`);
                                console.log(`   Recommendation: Adjust thresholds or expand variant testing`);
                                return {
                                    allResults: results,
                                    top3: [],
                                    v1Candidate: null,
                                    summary: {
                                        stocksProcessed: stocks.length,
                                        variantsTested: this.strategyVariants.length,
                                        qualityPassed: 0,
                                        totalTrades: results.reduce((sum, r) => sum + r.trades.length, 0)
                                    }
                                };
                            }

                            const qualifiedResults = filterResult.passing;

                            console.log(`\n✅ Time-Travel Complete!`);
                            console.log(`📊 Qualified Strategies (${qualifiedResults.length}):`);
                            qualifiedResults.slice(0, 3).forEach((r, i) => {
                                console.log(`  ${i + 1}. ${r.variant.name} - Score: ${r.qualityScore.toFixed(2)}, WR: ${r.metrics.winRate.toFixed(1)}%`);
                            });

                            return {
                                allResults: results,
                                top3: qualifiedResults.slice(0, 3),
                                v1Candidate: qualifiedResults[0],
                                qualifiedCount: qualifiedResults.length,
                                rejectedCount: filterResult.failing.length,
                                summary: {
                                    stocksProcessed: stocks.length,
                                    variantsTested: this.strategyVariants.length,
                                    qualityPassed: qualifiedResults.length,
                                    passRate: filterResult.passRate,
                                    totalTrades: results.reduce((sum, r) => sum + r.trades.length, 0),
                                    timeElapsed: 'N/A'
                                }
                            };
                        }

    /**
     * Simulate one stock with one strategy variant
     */
    async simulateStock(stock, candles, variant) {
                            const trades = [];

                            // Need at least 50 candles for indicators + maxSessions for forward replay
                            for (let i = 50; i < candles.length - variant.maxSessions; i++) {
                                const today = candles[i];
                                const historicalCandles = candles.slice(0, i + 1);

                                // Check entry conditions
                                const signal = await this.checkEntryConditions(historicalCandles, variant);

                                if (signal.valid) {
                                    // Check traps
                                    const trapScan = await this.trapDetector.scanAll(historicalCandles, signal);

                                    if (trapScan.allClear) {
                                        // Simulate forward
                                        const trade = await this.replayForward({
                                            symbol: stock.symbol,
                                            entry: {
                                                date: today.timestamp,
                                                price: today.close,
                                                candle: {
                                                    open: today.open,
                                                    high: today.high,
                                                    low: today.low,
                                                    close: today.close,
                                                    volume: today.volume
                                                }
                                            },
                                            futureCandles: candles.slice(i + 1, i + 1 + variant.maxSessions),
                                            exitRules: variant,
                                            trapFlags: trapScan.flags
                                        });


                                        // Debug: Check what trade object contains
                                        if (!trade.exit?.reason || !trade.result) {
                                            console.log('⚠️ Trade missing fields!', {
                                                hasExitReason: !!trade.exit?.reason,
                                                hasResult: !!trade.result,
                                                tradeKeys: Object.keys(trade),
                                                exitKeys: trade.exit ? Object.keys(trade.exit) : [],
                                                symbol: stock.symbol
                                            });
                                        }

                                        trades.push({
                                            symbol: stock.symbol,
                                            variantName: variant.name,
                                            ...trade  // Spread ALL fields including exit.reason, result, trapFlags
                                        });
                                    }
                                }
                            }

                            return trades;
                        }

    /**
     * Check if entry conditions are met
     */
    async checkEntryConditions(candles, variant) {
                            try {
                                const indicators = ComprehensiveTA.getAllIndicators(candles);
                                const current = candles[candles.length - 1];

                                // RSI check
                                const rsiMet = variant.rsiThreshold > 50
                                    ? indicators.rsi > variant.rsiThreshold
                                    : indicators.rsi < variant.rsiThreshold;

                                // MACD check
                                const macdMet = indicators.macd && indicators.macd.histogram > 0;

                                // Volume check
                                const avgVol = candles.slice(-20).reduce((sum, c) => sum + (c.volume || 0), 0) / 20;
                                const volMet = avgVol > 0 && (current.volume / avgVol) >= variant.volumeFactor;

                                // Price vs SMA check
                                const sma20Met = current.close > indicators.sma20;

                                const allMet = rsiMet && macdMet && volMet && sma20Met;

                                return {
                                    valid: allMet,
                                    rsiMet,
                                    macdMet,
                                    volMet,
                                    sma20Met
                                };
                            } catch (error) {
                                return { valid: false, error: error.message };
                            }
                        }

    /**
     * Replay forward - simulate trade execution
     */
    async replayForward({ symbol, entry, futureCandles, exitRules, trapFlags }) {
                            const targetPrice = entry.price * (1 + exitRules.targetPct / 100);
                            const stopPrice = entry.price * (1 - exitRules.stopPct / 100);

                            let exitReason = null;
                            let exitCandle = null;
                            let exitPrice = null;
                            let sessionNum = 0;

                            for (let i = 0; i < futureCandles.length; i++) {
                                const candle = futureCandles[i];
                                sessionNum = i + 1;

                                // Check STOP first (conservative)
                                if (candle.low <= stopPrice) {
                                    exitReason = `STOP: Price hit -${exitRules.stopPct}% stop on session ${sessionNum}`;
                                    exitPrice = stopPrice;
                                    exitCandle = candle;
                                    break;
                                }

                                // Check TARGET
                                if (candle.high >= targetPrice) {
                                    exitReason = `TARGET: Price hit +${exitRules.targetPct}% target on session ${sessionNum}`;
                                    exitPrice = targetPrice;
                                    exitCandle = candle;
                                    break;
                                }

                                // Check REVERSAL (session 3+)
                                if (exitRules.reversalExitEnabled && sessionNum >= 3) {
                                    const reversal = this.detectReversal(candle, futureCandles.slice(0, i));
                                    if (reversal.detected && reversal.strength > 0.8) {
                                        exitReason = `REVERSAL: ${reversal.type} pattern on session ${sessionNum}`;
                                        exitPrice = candle.close;
                                        exitCandle = candle;
                                        break;
                                    }
                                }

                                // Check TIME limit
                                if (sessionNum === exitRules.maxSessions) {
                                    exitReason = `TIME: Reached ${exitRules.maxSessions}th session without target`;
                                    exitPrice = candle.close;
                                    exitCandle = candle;
                                    break;
                                }
                            }

                            // Fallback
                            if (!exitCandle) {
                                const last = futureCandles[futureCandles.length - 1];
                                exitReason = "TIME: Insufficient future data";
                                exitPrice = last.close;
                                computeMetrics(trades) {
                                    if (trades.length === 0) {
                                        return {
                                            tradeCount: 0,
                                            winRate: 0,
                                            expectancy: 0,
                                            avgProfit: 0,
                                            maxDrawdown: 0,
                                            profitFactor: 0,
                                            sharpeRatio: 0,
                                            trapAvoidanceRate: 1.0
                                        };
                                    }

                                    const wins = trades.filter(t => t.pnlPct > 0);
                                    const losses = trades.filter(t => t.pnlPct <= 0);

                                    const winRate = (wins.length / trades.length) * 100;
                                    const avgWin = wins.length > 0 ? wins.reduce((sum, t) => sum + t.pnlPct, 0) / wins.length : 0;
                                    const avgLoss = losses.length > 0 ? losses.reduce((sum, t) => sum + Math.abs(t.pnlPct), 0) / losses.length : 0;

                                    const expectancy = (winRate / 100) * avgWin - ((100 - winRate) / 100) * avgLoss;
                                    const profitFactor = avgLoss === 0 ? avgWin : avgWin / avgLoss;

                                    const avgProfit = trades.reduce((sum, t) => sum + t.pnlPct, 0) / trades.length;

                                    return {
                                        tradeCount: trades.length,
                                        winRate,
                                        expectancy,
                                        avgProfit,
                                        maxDrawdown: Math.min(...trades.map(t => t.pnlPct)),
                                        profitFactor,
                                        sharpeRatio: this.calculateSharpe(trades),
                                        trapAvoidanceRate: 1.0  // All trades already passed trap filter
                                    };
                                }

                                /**
                                 * Compute deterministic quality score
                                 */
                                computeQualityScore(metrics) {
                                    const winRateScore = metrics.winRate * 0.4;
                                    const expectancyScore = Math.min(Math.max(metrics.expectancy * 10, 0), 100) * 0.3;
                                    const trapScore = metrics.trapAvoidanceRate * 100 * 0.2;
                                    const drawdownScore = Math.max(0, 100 + metrics.maxDrawdown * 10) * 0.1;


                                    // Shooting Star
                                    if (body < range * 0.3 && upperWick > body * 2) {
                                        return {
                                            detected: true,
                                            type: 'Shooting Star',
                                            strength: Math.min(upperWick / body / 2, 1.0)
                                        };
                                    }

                                    // Bearish Engulfing
                                    if (currentCandle.close < currentCandle.open &&
                                        prevCandle.close > prevCandle.open &&
                                        currentCandle.open > prevCandle.close &&
                                        currentCandle.close < prevCandle.open) {
                                        return {
                                            detected: true,
                                            type: 'Bearish Engulfing',
                                            strength: 0.85
                                        };
                                    }

                                    return { detected: false };
                                }

                                calculateSharpe(trades) {
                                    if (trades.length < 2) return 0;

                                    const returns = trades.map(t => t.pnlPct);
                                    const mean = returns.reduce((sum, r) => sum + r, 0) / returns.length;
                                    const variance = returns.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) / returns.length;
                                    const stdDev = Math.sqrt(variance);

                                    return stdDev === 0 ? 0 : mean / stdDev;
                                }
                            }

                            module.exports = TimeTravelBacktesterV2;
