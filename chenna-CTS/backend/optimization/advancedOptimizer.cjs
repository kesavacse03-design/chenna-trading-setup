// Advanced Strategy Optimizer
// Tests 50+ parameter combinations with multiple patterns
// Auto-generates optimized strategy code

const priceService = require('../services/priceService.cjs');
const { PrismaClient } = require('@prisma/client');
const EnhancedTA = require('../strategy/enhancedTA.cjs');
const fs = require('fs').promises;
const path = require('path');

const prisma = new PrismaClient();

class AdvancedOptimizer {
    constructor(category = 'LONGTERM SWING BO UP') {
        this.category = category;
        this.results = [];
        this.stocks = [];
        this.priceData = {};
        this.progressCallback = null;
    }

    // Generate 50+ parameter combinations
    generateParameterSets() {
        const sets = [];

        // Pattern combinations
        const patterns = [
            ['HAMMER', 'BULLISH_ENGULFING'],
            ['BREAKOUT', 'CONSOLIDATION_BREAKOUT'],
            ['MORNING_STAR', 'PIERCING_PATTERN'],
            ['BULLISH_HARAMI', 'TWEEZER_BOTTOM'],
            ['THREE_WHITE_SOLDIERS', 'HAMMER'],
            ['ALL_BULLISH'], // Test all patterns
        ];

        // Volume thresholds
        const volumeLevels = [1.2, 1.5, 2.0, 2.5];

        // RSI ranges
        const rsiRanges = [
            { min: 20, max: 60 },
            { min: 25, max: 65 },
            { min: 30, max: 70 },
            { min: 35, max: 75 },
        ];

        // EMA tolerances
        const emaTolerance = [0.90, 0.93, 0.95, 0.97, 0.99];

        // Risk/Reward ratios
        const rrRatios = [1.5, 2.0, 2.5, 3.0];

        // Generate combinations
        let id = 1;
        patterns.forEach(patternSet => {
            volumeLevels.forEach(vol => {
                rsiRanges.forEach(rsi => {
                    emaTolerance.forEach(ema => {
                        rrRatios.forEach(rr => {
                            sets.push({
                                id: id++,
                                name: `Config_${id}`,
                                patterns: patternSet,
                                rsiMin: rsi.min,
                                rsiMax: rsi.max,
                                volume: vol,
                                ema: ema,
                                rr: rr
                            });
                        });
                    });
                });
            });
        });

        // Limit to top 60 combinations (sample strategy)
        return sets.slice(0, 60);
    }

    // Load stocks and price data
    async loadData() {
        console.log(`Loading stocks from category: ${this.category}...\n`);

        const dbCategory = await prisma.category.findFirst({
            where: {
                OR: [
                    { key: this.category },
                    { name: { contains: this.category } }
                ]
            },
            include: {
                stocks: {
                    include: { stock: true }
                }
            }
        });

        if (!dbCategory) {
            throw new Error(`Category "${this.category}" not found`);
        }

        this.stocks = dbCategory.stocks;
        console.log(`Found ${this.stocks.length} stocks\n`);

        if (this.progressCallback) {
            this.progressCallback({
                phase: 'LOADING_DATA',
                progress: 0,
                total: this.stocks.length,
                message: 'Loading price data...'
            });
        }

        // Fetch all price data
        let loaded = 0;
        for (const stockCat of this.stocks) {
            const symbol = stockCat.stock.symbol;

            try {
                const candles = await priceService.fetchPrice(
                    symbol,
                    stockCat.stock.instrumentKey,
                    stockCat.addedDate,
                    new Date().toISOString().split('T')[0]
                );

                this.priceData[symbol] = candles;
                loaded++;
                console.log(`✓ ${symbol}: ${candles.length} candles (${loaded}/${this.stocks.length})`);

                if (this.progressCallback) {
                    this.progressCallback({
                        phase: 'LOADING_DATA',
                        progress: loaded,
                        total: this.stocks.length,
                        message: `Loaded ${symbol}`
                    });
                }
            } catch (error) {
                console.log(`✗ ${symbol}: ${error.message}`);
            }
        }

        console.log(`\nLoaded price data for ${Object.keys(this.priceData).length} stocks\n`);
    }

    // Test a single parameter set
    async testParameterSet(params) {
        let totalTrades = 0;
        let winningTrades = 0;
        let losingTrades = 0;
        let totalPnl = 0;
        const trades = [];

        for (const [symbol, candles] of Object.entries(this.priceData)) {
            if (candles.length < 50) continue;

            const stockTrades = this.simulateStock(symbol, candles, params);

            stockTrades.forEach(trade => {
                totalTrades++;
                if (trade.outcome === 'WIN') {
                    winningTrades++;
                    totalPnl += trade.pnlPercent;
                } else if (trade.outcome === 'LOSS') {
                    losingTrades++;
                    totalPnl += trade.pnlPercent;
                }
                trades.push(trade);
            });
        }

        const accuracy = totalTrades > 0 ? (winningTrades / totalTrades) * 100 : 0;
        const avgPnl = totalTrades > 0 ? totalPnl / totalTrades : 0;

        return {
            params,
            totalTrades,
            winningTrades,
            losingTrades,
            accuracy,
            avgPnl,
            totalPnl,
            trades
        };
    }

    // Simulate trades on a single stock
    simulateStock(symbol, candles, params) {
        const trades = [];
        let inTrade = null;
        let entryIdx = null;

        for (let i = 50; i < candles.length; i++) {
            if (!inTrade) {
                const signal = this.checkEntry(candles, i, params);

                if (signal) {
                    inTrade = {
                        symbol,
                        entryIdx: i,
                        entryDate: candles[i].timestamp,
                        entryPrice: signal.entry,
                        target: signal.target,
                        stopLoss: signal.stopLoss,
                        trailingStop: signal.trailingStop,
                        currentTrail: null,
                        pattern: signal.pattern
                    };
                    entryIdx = i;
                }
            } else {
                const exit = this.checkExit(inTrade, candles[i], candles, i, entryIdx);

                if (exit) {
                    trades.push({
                        symbol,
                        entryDate: inTrade.entryDate,
                        exitDate: candles[i].timestamp,
                        entryPrice: inTrade.entryPrice,
                        exitPrice: exit.exitPrice,
                        pnl: exit.pnl,
                        pnlPercent: exit.pnlPercent,
                        outcome: exit.outcome,
                        exitType: exit.type,
                        daysHeld: i - entryIdx,
                        pattern: inTrade.pattern
                    });

                    inTrade = null;
                    entryIdx = null;
                }
            }
        }

        return trades;
    }

    // Check entry with enhanced patterns
    checkEntry(candles, idx, params) {
        if (idx < 50) return null;

        const candle = candles[idx];
        const prevCandle = candles[idx - 1];

        // 1. Pattern check
        const detectedPatterns = EnhancedTA.getAllBullishPatterns(candles, idx);

        let hasPattern = false;
        let matchedPattern = null;

        if (params.patterns.includes('ALL_BULLISH')) {
            hasPattern = detectedPatterns.length > 0;
            matchedPattern = detectedPatterns[0] || null;
        } else {
            for (const pattern of params.patterns) {
                if (detectedPatterns.includes(pattern)) {
                    hasPattern = true;
                    matchedPattern = pattern;
                    break;
                }
            }
        }

        if (!hasPattern) return null;

        // 2. EMA check
        const ema20 = EnhancedTA.calculateEMA(candles.slice(0, idx + 1), 20);
        if (!ema20 || candle.close < ema20 * params.ema) return null;

        // 3. Volume check
        if (!EnhancedTA.isVolumeSpike(candle, candles.slice(0, idx), params.volume)) return null;

        // 4. RSI check
        const rsi = EnhancedTA.calculateRSI(candles.slice(0, idx + 1), 14);
        if (!rsi || rsi < params.rsiMin || rsi > params.rsiMax) return null;

        // 5. For breakout patterns, additional validation
        if (matchedPattern === 'BREAKOUT' || matchedPattern === 'CONSOLIDATION_BREAKOUT') {
            const breakoutData = EnhancedTA.isBreakout(candles, idx) ||
                EnhancedTA.isConsolidationBreakout(candles, idx);
            if (!breakoutData) return null;
        }

        // Calculate entry/target/SL
        const atr = EnhancedTA.calculateATR(candles.slice(0, idx + 1), 14);
        const swingLow = EnhancedTA.getSwingHighLow(candles.slice(0, idx), 10).low;

        const entry = candle.close;
        const stopLoss = swingLow || (entry - (atr * 1.5));
        const risk = entry - stopLoss;
        const target = entry + (risk * params.rr);

        if (risk / entry > 0.05) return null; // Max 5% risk

        return {
            entry,
            target,
            stopLoss,
            trailingStop: entry + (risk * 0.5),
            pattern: matchedPattern
        };
    }

    // Check exit
    checkExit(trade, candle, candles, idx, entryIdx) {
        // Target hit
        if (candle.high >= trade.target) {
            return {
                type: 'TARGET_HIT',
                exitPrice: trade.target,
                pnl: trade.target - trade.entryPrice,
                pnlPercent: ((trade.target - trade.entryPrice) / trade.entryPrice) * 100,
                outcome: 'WIN'
            };
        }

        // SL hit
        if (candle.low <= trade.stopLoss) {
            return {
                type: 'SL_HIT',
                exitPrice: trade.stopLoss,
                pnl: trade.stopLoss - trade.entryPrice,
                pnlPercent: ((trade.stopLoss - trade.entryPrice) / trade.entryPrice) * 100,
                outcome: 'LOSS'
            };
        }

        // Trailing SL
        if (trade.currentTrail && candle.low <= trade.currentTrail) {
            return {
                type: 'TRAILING_SL_HIT',
                exitPrice: trade.currentTrail,
                pnl: trade.currentTrail - trade.entryPrice,
                pnlPercent: ((trade.currentTrail - trade.entryPrice) / trade.entryPrice) * 100,
                outcome: trade.currentTrail > trade.entryPrice ? 'WIN' : 'LOSS'
            };
        }

        // Update trailing
        const profitPercent = (candle.close - trade.entryPrice) / (trade.target - trade.entryPrice);
        if (profitPercent > 0.5 && candle.close > trade.trailingStop) {
            trade.currentTrail = trade.entryPrice;
        } else if (profitPercent > 0.75) {
            trade.currentTrail = trade.entryPrice + ((trade.target - trade.entryPrice) * 0.5);
        }

        // Max days (10 for swing)
        if (idx - entryIdx >= 10) {
            return {
                type: 'EXPIRED',
                exitPrice: candle.close,
                pnl: candle.close - trade.entryPrice,
                pnlPercent: ((candle.close - trade.entryPrice) / trade.entryPrice) * 100,
                outcome: candle.close > trade.entryPrice ? 'WIN' : 'LOSS'
            };
        }

        return null;
    }

    // Run full optimization
    async optimize() {
        console.log('╔══════════════════════════════════════════════════╗');
        console.log('║   ADVANCED STRATEGY OPTIMIZATION ENGINE          ║');
        console.log('║   Category: ' + this.category.padEnd(32) + '║');
        console.log('╚══════════════════════════════════════════════════╝\n');

        await this.loadData();

        const paramSets = this.generateParameterSets();
        console.log(`\nTesting ${paramSets.length} parameter combinations...\n`);

        if (this.progressCallback) {
            this.progressCallback({
                phase: 'OPTIMIZING',
                progress: 0,
                total: paramSets.length,
                message: 'Starting optimization...'
            });
        }

        let completed = 0;
        for (const params of paramSets) {
            const result = await this.testParameterSet(params);
            this.results.push(result);
            completed++;

            if (completed % 10 === 0) {
                console.log(`Progress: ${completed}/${paramSets.length} (${Math.round(completed / paramSets.length * 100)}%)`);
            }

            if (this.progressCallback) {
                this.progressCallback({
                    phase: 'OPTIMIZING',
                    progress: completed,
                    total: paramSets.length,
                    message: `Tested ${completed}/${paramSets.length} combinations`
                });
            }
        }

        const best = this.findBestStrategy();

        if (this.progressCallback) {
            this.progressCallback({
                phase: 'COMPLETE',
                progress: paramSets.length,
                total: paramSets.length,
                message: 'Optimization complete!',
                bestStrategy: best
            });
        }

        await prisma.$disconnect();
        return best;
    }

    // Find best strategy
    findBestStrategy() {
        // Sort by accuracy first, then by total trades
        const sorted = [...this.results].sort((a, b) => {
            if (Math.abs(b.accuracy - a.accuracy) > 1) {
                return b.accuracy - a.accuracy;
            }
            return b.totalTrades - a.totalTrades;
        });

        return sorted[0];
    }

    // Auto-generate strategy code from best parameters
    async generateStrategyCode(bestResult) {
        const params = bestResult.params;

        const code = `
// Auto-Generated Strategy for ${this.category}
// Generated: ${new Date().toISOString()}
// Accuracy: ${bestResult.accuracy.toFixed(2)}%
// Total Trades: ${bestResult.totalTrades}

const EnhancedTA = require('./enhancedTA.cjs');

class OptimizedStrategy {
  constructor() {
    this.name = '${this.category}_OPTIMIZED';
    this.version = 'V1_AUTO';
    this.category = '${this.category}';
    this.targetAccuracy = ${(params.rr * 10).toFixed(1)};
    this.riskRewardRatio = ${params.rr};
    
    // Optimized parameters
    this.patterns = ${JSON.stringify(params.patterns)};
    this.rsiMin = ${params.rsiMin};
    this.rsiMax = ${params.rsiMax};
    this.volumeMultiplier = ${params.volume};
    this.emaTolerance = ${params.ema};
  }

  getEntrySignal(candles, idx) {
    if (idx < 50) return null;

    const candle = candles[idx];
    const prevCandle = candles[idx - 1];

    // Pattern check
    const detectedPatterns = EnhancedTA.getAllBullishPatterns(candles, idx);
    let hasPattern = false;
    let matchedPattern = null;

    for (const pattern of this.patterns) {
      if (pattern === 'ALL_BULLISH' && detectedPatterns.length > 0) {
        hasPattern = true;
        matchedPattern = detectedPatterns[0];
        break;
      } else if (detectedPatterns.includes(pattern)) {
        hasPattern = true;
        matchedPattern = pattern;
        break;
      }
    }

    if (!hasPattern) return null;

    // EMA check
    const ema20 = EnhancedTA.calculateEMA(candles.slice(0, idx + 1), 20);
    if (!ema20 || candle.close < ema20 * this.emaTolerance) return null;

    // Volume check
    if (!EnhancedTA.isVolumeSpike(candle, candles.slice(0, idx), this.volumeMultiplier)) return null;

    // RSI check
    const rsi = EnhancedTA.calculateRSI(candles.slice(0, idx + 1), 14);
    if (!rsi || rsi < this.rsiMin || rsi > this.rsiMax) return null;

    // Calculate entry/target/SL
    const atr = EnhancedTA.calculateATR(candles.slice(0, idx + 1), 14);
   const swingLow = EnhancedTA.getSwingHighLow(candles.slice(0, idx), 10).low;

    const entry = candle.close;
    const stopLoss = swingLow || (entry - (atr * 1.5));
    const risk = entry - stopLoss;
    const target = entry + (risk * this.riskRewardRatio);

    if (risk / entry > 0.05) return null;

    return {
      type: 'BUY',
      entry,
      target,
      stopLoss,
      trailingStop: entry + (risk * 0.5),
      pattern: matchedPattern,
      rsi,
      ema20
    };
  }
}

module.exports = OptimizedStrategy;
`;

        // Save to file
        const filename = path.join(__dirname, `optimized_${this.category.replace(/ /g, '_')}_strategy.cjs`);
        await fs.writeFile(filename, code);

        console.log(`\n✓ Auto-generated strategy saved to: ${filename}\n`);

        return filename;
    }

    // Set progress callback
    setProgressCallback(callback) {
        this.progressCallback = callback;
    }
}

module.exports = AdvancedOptimizer;
