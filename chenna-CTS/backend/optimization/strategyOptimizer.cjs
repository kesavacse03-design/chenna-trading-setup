// Strategy Optimizer
// Tests different parameter combinations to find best trading logic

const priceService = require('../services/priceService.cjs');
const { PrismaClient } = require('@prisma/client');
const TA = require('../strategy/technicalAnalysis.cjs');

const prisma = new PrismaClient();

class StrategyOptimizer {
    constructor() {
        this.results = [];
        this.stocks = [];
        this.priceData = {};
    }

    // Parameter combinations to test
    getParameterSets() {
        return [
            // Original strict
            { name: 'Strict', rsiMin: 25, rsiMax: 55, volume: 2.0, ema: 0.98, rr: 2.0 },

            // Relaxed (current)
            { name: 'Relaxed', rsiMin: 20, rsiMax: 60, volume: 1.5, ema: 0.95, rr: 2.0 },

            // Very relaxed
            { name: 'VeryRelaxed', rsiMin: 15, rsiMax: 65, volume: 1.2, ema: 0.92, rr: 2.0 },

            // High RSI focus
            { name: 'HighRSI', rsiMin: 30, rsiMax: 70, volume: 1.5, ema: 0.95, rr: 2.0 },

            // Low volume tolerance
            { name: 'LowVolume', rsiMin: 20, rsiMax: 60, volume: 1.2, ema: 0.95, rr: 2.0 },

            // Aggressive EMA
            { name: 'AggressiveEMA', rsiMin: 20, rsiMax: 60, volume: 1.5, ema: 0.90, rr: 2.0 },

            // Higher R/R
            { name: 'HighRR', rsiMin: 20, rsiMax: 60, volume: 1.5, ema: 0.95, rr: 3.0 },

            // Conservative R/R
            { name: 'LowRR', rsiMin: 20, rsiMax: 60, volume: 1.5, ema: 0.95, rr: 1.5 },

            // Balanced
            { name: 'Balanced', rsiMin: 25, rsiMax: 60, volume: 1.3, ema: 0.93, rr: 2.0 },

            // Ultra conservative
            { name: 'UltraConservative', rsiMin: 30, rsiMax: 50, volume: 2.5, ema: 0.99, rr: 2.5 },
        ];
    }

    // Load stocks and price data
    async loadData() {
        console.log('Loading stocks and price data...\n');

        const category = await prisma.category.findUnique({
            where: { key: 'DOWNSIDE_LOM_SWING' },
            include: {
                stocks: {
                    include: { stock: true }
                }
            }
        });

        this.stocks = category.stocks;
        console.log(`Found ${this.stocks.length} stocks\n`);

        // Fetch all price data
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
                console.log(`✓ ${symbol}: ${candles.length} candles`);
            } catch (error) {
                console.log(`✗ ${symbol}: ${error.message}`);
            }
        }

        console.log(`\nLoaded price data for ${Object.keys(this.priceData).length} stocks\n`);
    }

    // Test a parameter set
    async testParameters(params) {
        console.log(`\n--- Testing: ${params.name} ---`);
        console.log(`RSI: ${params.rsiMin}-${params.rsiMax}, Volume: ${params.volume}x, EMA: ${params.ema * 100}%, R:R: 1:${params.rr}`);

        let totalTrades = 0;
        let winningTrades = 0;
        let losingTrades = 0;
        let totalPnl = 0;
        const trades = [];

        for (const [symbol, candles] of Object.entries(this.priceData)) {
            if (candles.length < 50) continue;

            // Simulate trades with these parameters
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

        const result = {
            params,
            totalTrades,
            winningTrades,
            losingTrades,
            accuracy: accuracy.toFixed(2),
            avgPnl: avgPnl.toFixed(2),
            totalPnl: totalPnl.toFixed(2),
            trades
        };

        console.log(`Trades: ${totalTrades}, Wins: ${winningTrades}, Losses: ${losingTrades}`);
        console.log(`Accuracy: ${result.accuracy}%, Avg P&L: ${result.avgPnl}%`);

        this.results.push(result);
        return result;
    }

    // Simulate trades on a single stock with given parameters
    simulateStock(symbol, candles, params) {
        const trades = [];
        let inTrade = null;
        let entryIdx = null;

        for (let i = 50; i < candles.length; i++) {
            if (!inTrade) {
                // Check for entry
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
                // Check for exit
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

    // Check entry signal with custom parameters
    checkEntry(candles, idx, params) {
        if (idx < 50) return null;

        const candle = candles[idx];
        const prevCandle = candles[idx - 1];

        // 1. Pattern check
        const hasHammer = TA.isHammer(candle, candles.slice(0, idx));
        const hasEngulfing = TA.isEngulfing(candle, prevCandle, true);

        if (!hasHammer && !hasEngulfing) return null;

        // 2. EMA check
        const ema20 = TA.calculateEMA(candles.slice(0, idx + 1), 20);
        if (!ema20 || candle.close < ema20 * params.ema) return null;

        // 3. Volume check
        if (!TA.isVolumeSpike(candle, candles.slice(0, idx), params.volume)) return null;

        // 4. RSI check
        const rsi = TA.calculateRSI(candles.slice(0, idx + 1), 14);
        if (!rsi || rsi < params.rsiMin || rsi > params.rsiMax) return null;

        // 5. Trend check
        const trend = TA.getTrend(candles.slice(0, idx), 20);
        if (trend !== 'DOWNTREND' && trend !== 'SIDEWAYS') return null;

        // Calculate entry/target/SL
        const atr = TA.calculateATR(candles.slice(0, idx + 1), 14);
        const swingLow = TA.getSwingHighLow(candles.slice(0, idx), 10).low;

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
            pattern: hasHammer ? 'HAMMER' : 'BULLISH_ENGULFING'
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

        // Trailing SL hit
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

    // Generate report
    generateReport() {
        console.log('\n\n╔════════════════════════════════════════════════════════╗');
        console.log('║          STRATEGY OPTIMIZATION REPORT                  ║');
        console.log('╚════════════════════════════════════════════════════════╝\n');

        // Sort by accuracy
        const sorted = [...this.results].sort((a, b) => parseFloat(b.accuracy) - parseFloat(a.accuracy));

        console.log('RESULTS (sorted by accuracy):\n');
        console.log('Rank | Config          | Trades | Wins | Losses | Accuracy | Avg P&L | Total P&L');
        console.log('-----|-----------------|--------|------|--------|----------|---------|----------');

        sorted.forEach((r, i) => {
            const rank = (i + 1).toString().padStart(2);
            const name = r.params.name.padEnd(15);
            const trades = r.totalTrades.toString().padStart(6);
            const wins = r.winningTrades.toString().padStart(4);
            const losses = r.losingTrades.toString().padStart(6);
            const acc = (r.accuracy + '%').padStart(8);
            const avg = (r.avgPnl + '%').padStart(7);
            const total = (r.totalPnl + '%').padStart(9);

            console.log(`${rank}   | ${name} | ${trades} | ${wins} | ${losses} | ${acc} | ${avg} | ${total}`);
        });

        // Best strategy
        const best = sorted[0];
        console.log('\n\n🏆 BEST STRATEGY: ' + best.params.name);
        console.log('Parameters:');
        console.log(`  RSI Range: ${best.params.rsiMin}-${best.params.rsiMax}`);
        console.log(`  Volume: ${best.params.volume}x average`);
        console.log(`  EMA Tolerance: ${(best.params.ema * 100).toFixed(0)}%`);
        console.log(`  Risk:Reward: 1:${best.params.rr}`);
        console.log('\nPerformance:');
        console.log(`  Trades: ${best.totalTrades}`);
        console.log(`  Accuracy: ${best.accuracy}%`);
        console.log(`  Avg P&L per trade: ${best.avgPnl}%`);
        console.log(`  Total P&L: ${best.totalPnl}%`);

        return best;
    }

    // Run full optimization
    async optimize() {
        console.log('════════════════════════════════════════');
        console.log('   STRATEGY OPTIMIZATION ENGINE');
        console.log('   Finding Best Trading Logic');
        console.log('════════════════════════════════════════\n');

        await this.loadData();

        const paramSets = this.getParameterSets();
        console.log(`\nTesting ${paramSets.length} parameter combinations...\n`);

        for (const params of paramSets) {
            await this.testParameters(params);
        }

        const best = this.generateReport();

        await prisma.$disconnect();
        return best;
    }
}

module.exports = StrategyOptimizer;

// Run if executed directly
if (require.main === module) {
    const optimizer = new StrategyOptimizer();
    optimizer.optimize()
        .then(best => {
            console.log('\n✅ Optimization complete!\n');
            process.exit(0);
        })
        .catch(err => {
            console.error('\n❌ Error:', err.message);
            process.exit(1);
        });
}
