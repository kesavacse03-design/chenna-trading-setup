// Backtesting Engine
// Simulates trading strategy on historical data with time-travel

const priceService = require('../services/priceService.cjs');
const { PrismaClient } = require('@prisma/client');
const DownsideLomSwingStrategy = require('./downsideLomSwingStrategy.cjs');

const prisma = new PrismaClient();

class BacktestEngine {
    constructor() {
        this.strategy = new DownsideLomSwingStrategy();
    }

    // Main backtest function for a category
    async backtestCategory(categoryKey, options = {}) {
        console.log(`\n=== Backtesting ${categoryKey} ===\n`);

        const progressCallback = options.progressCallback || ((p) => {
            console.log(`[${p.processed}/${p.total}] ${p.symbol} (${Math.round(p.progress * 100)}%)`);
        });

        // 1. Get stocks from database
        const stocks = await this.getStocksForCategory(categoryKey);
        console.log(`Found ${stocks.length} stocks in ${categoryKey}\n`);

        if (stocks.length === 0) {
            return {
                category: categoryKey,
                totalStocks: 0,
                error: 'No stocks found in category'
            };
        }

        // 2. Fetch historical prices for all stocks
        console.log('Fetching historical prices...\n');
        const priceData = await priceService.fetchBulk(
            stocks.map(s => ({
                symbol: s.stock.symbol,
                instrumentKey: s.stock.instrumentKey,
                fromDate: s.addedDate,
                toDate: new Date().toISOString().split('T')[0]
            })),
            progressCallback
        );

        // 3. Run backtest simulation on each stock
        const results = [];
        let totalTrades = 0;
        let winningTrades = 0;
        let losingTrades = 0;
        let sidewaysTrades = 0;

        for (const stock of stocks) {
            const symbol = stock.stock.symbol;
            const prices = priceData[symbol];

            if (!prices || !prices.success) {
                console.log(`⚠️ Skipping ${symbol}: ${prices?.error || 'No price data'}`);
                continue;
            }

            // Time-travel simulation
            const tradeResult = this.simulateTrade(
                symbol,
                prices.data,
                stock.addedDate
            );

            if (tradeResult) {
                results.push(tradeResult);
                totalTrades++;

                if (tradeResult.outcome === 'WIN') winningTrades++;
                else if (tradeResult.outcome === 'LOSS') losingTrades++;
                else if (tradeResult.outcome === 'SIDEWAYS') sidewaysTrades++;
            }
        }

        // 4. Calculate metrics
        const accuracy = totalTrades > 0 ? winningTrades / totalTrades : 0;
        const avgProfit = results.length > 0
            ? results.reduce((sum, r) => sum + (r.pnlPercent || 0), 0) / results.length
            : 0;

        const summary = {
            category: categoryKey,
            strategy: this.strategy.name,
            totalStocks: stocks.length,
            totalTrades,
            winningTrades,
            losingTrades,
            sidewaysTrades,
            accuracy: (accuracy * 100).toFixed(2) + '%',
            avgProfit: avgProfit.toFixed(2) + '%',
            passedTarget: accuracy >= this.strategy.targetAccuracy,
            trades: results
        };

        console.log(`\n=== Backtest Complete ===`);
        console.log(`Accuracy: ${summary.accuracy}`);
        console.log(`Total Trades: ${totalTrades}`);
        console.log(`Wins: ${winningTrades} | Losses: ${losingTrades} | Sideways: ${sidewaysTrades}`);
        console.log(`Average Profit: ${summary.avgProfit}\n`);

        return summary;
    }

    // Simulate a single trade (time-travel through candles)
    simulateTrade(symbol, candles, addedDate) {
        if (!candles || candles.length < 50) {
            return null; // Not enough data
        }

        let entrySignal = null;
        let entryIdx = null;
        let trade = null;

        // Replay candles day by day
        for (let i = 50; i < candles.length; i++) {
            // Not in trade - check for entry
            if (!trade) {
                entrySignal = this.strategy.getEntrySignal(candles, i);

                if (entrySignal) {
                    entryIdx = i;
                    trade = {
                        symbol,
                        entry: entrySignal.entry,
                        target: entrySignal.target,
                        stopLoss: entrySignal.stopLoss,
                        trailingStop: entrySignal.trailingStop,
                        currentTrail: null,
                        pattern: entrySignal.pattern,
                        entryDate: candles[i].timestamp,
                        entryIdx: i
                    };
                    console.log(`  ✓ Entry signal: ${symbol} @ ${entrySignal.entry} (${entrySignal.pattern})`);
                }
                continue;
            }

            // In trade - check for exit
            const exitResult = this.strategy.checkExit(trade, candles[i], candles, i);

            if (exitResult) {
                console.log(`  → Exit: ${symbol} | ${exitResult.type} | P&L: ${exitResult.pnlPercent.toFixed(2)}%`);

                return {
                    symbol,
                    entryDate: trade.entryDate,
                    exitDate: candles[i].timestamp,
                    entryPrice: trade.entry,
                    exitPrice: exitResult.exitPrice,
                    target: trade.target,
                    stopLoss: trade.stopLoss,
                    pnl: exitResult.pnl,
                    pnlPercent: exitResult.pnlPercent,
                    outcome: exitResult.type === 'TARGET_HIT' || exitResult.type === 'TRAILING_SL_HIT' ? 'WIN' : 'LOSS',
                    exitType: exitResult.type,
                    daysHeld: i - entryIdx,
                    pattern: trade.pattern
                };
            }

            // Check sideways (max 10 days for swing)
            if (this.strategy.isSideways(candles, entryIdx, i, 10)) {
                console.log(`  → Sideways: ${symbol} | No movement in 10 days`);

                return {
                    symbol,
                    entryDate: trade.entryDate,
                    exitDate: candles[i].timestamp,
                    entryPrice: trade.entry,
                    exitPrice: candles[i].close,
                    target: trade.target,
                    stopLoss: trade.stopLoss,
                    pnl: candles[i].close - trade.entry,
                    pnlPercent: ((candles[i].close - trade.entry) / trade.entry) * 100,
                    outcome: 'SIDEWAYS',
                    exitType: 'SIDEWAYS',
                    daysHeld: i - entryIdx,
                    pattern: trade.pattern
                };
            }
        }

        // Trade never completed
        if (trade) {
            console.log(`  ⚠️ ${symbol}: Trade never completed (end of data)`);
            return null;
        }

        // No entry signal found
        return null;
    }

    // Get stocks from database for a category
    async getStocksForCategory(categoryKey) {
        const category = await prisma.category.findUnique({
            where: { key: categoryKey },
            include: {
                stocks: {
                    include: {
                        stock: true
                    }
                }
            }
        });

        if (!category) {
            throw new Error(`Category "${categoryKey}" not found`);
        }

        return category.stocks;
    }

    // Save backtest results to database
    async saveResults(results, jobId) {
        await prisma.backtestResult.create({
            data: {
                jobId,
                categoryId: results.categoryId || null,
                strategyId: results.strategyId || null,
                status: 'completed',
                metrics: {
                    accuracy: results.accuracy,
                    totalTrades: results.totalTrades,
                    winningTrades: results.winningTrades,
                    losingTrades: results.losingTrades,
                    avgProfit: results.avgProfit
                },
                trades: results.trades,
                config: {
                    strategy: this.strategy.getDescription()
                },
                completedAt: new Date()
            }
        });

        console.log(`✓ Backtest results saved (Job ID: ${jobId})`);
    }
}

module.exports = BacktestEngine;
