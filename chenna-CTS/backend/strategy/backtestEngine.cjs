// Backtesting Engine
// Simulates trading strategy on historical data with time-travel

const priceService = require('../services/priceService.cjs');
const { PrismaClient } = require('@prisma/client');
const DownsideLomSwingStrategy = require('./downsideLomSwingStrategy.cjs');
const DailyContractionStrategy = require('./dailyContractionStrategy.cjs');

const prisma = new PrismaClient();

class BacktestEngine {
    constructor(category) {
        this.category = category;
        if (category === 'DAILY_CONTRACTION') {
            this.strategy = new DailyContractionStrategy();
        } else {
            this.strategy = new DownsideLomSwingStrategy();
        }
    }

    // Main entry point for running backtest
    async run(options = {}) {
        return await this.backtestCategory(this.category, options);
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
                toDate: new Date().toISOString().split('T')[0] // To today
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

            // Sanity Check: If requesting DAILY data (implied), check for excessive candles
            // Typical year = 252 candles. If we have > 1000 for < 2 years, it's likely 1-min data.
            // Rough check: > 500 candles for a stock added recently is suspicious if we expect daily.
            // For now, let's just log a warning if it looks huge, but for DAILY_CONTRACTION we know we want daily.
            // Better check: simulateTrade will check it.

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

        // CORRUPTION CHECK for Daily Strategies
        // If strategy is DAILY_CONTRACTION, we expect roughly 1 candle per day.
        // If we have 375 candles per day (1 min), then 50 days = 18,000 candles.
        // Let's say if we have > 2000 candles, it's suspicious for a swing strategy on recent stocks.
        if (this.category === 'DAILY_CONTRACTION' && candles.length > 1000) {
            // Check time difference between first two candles
            const t1 = new Date(candles[0].timestamp).getTime();
            const t2 = new Date(candles[1].timestamp).getTime();
            const diff = Math.abs(t2 - t1);
            // 1 day = 86400000 ms. 1 minute = 60000 ms.
            if (diff < 3600000) { // Less than 1 hour diff -> Intraday data
                console.log(`⚠️ Skipping ${symbol}: Detected Intraday data in cache (${candles.length} candles, diff ${diff / 1000}s)`);
                return null;
            }
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

        // Deduplicate by symbol — keep earliest addedDate per symbol
        const seen = new Map();
        for (const entry of category.stocks) {
            const sym = entry.stock.symbol;
            if (!seen.has(sym) || new Date(entry.addedDate) < new Date(seen.get(sym).addedDate)) {
                seen.set(sym, entry);
            }
        }
        const deduped = Array.from(seen.values());
        if (deduped.length < category.stocks.length) {
            console.log(`[Engine] Deduplicated: ${category.stocks.length} → ${deduped.length} unique stocks`);
        }
        return deduped;
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
