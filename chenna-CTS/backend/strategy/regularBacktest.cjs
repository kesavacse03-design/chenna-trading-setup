/**
 * Regular Backtest Engine
 * 
 * Uses frozen V1 strategy to backtest current watchlist
 * Deterministic: Same input → same output
 * 
 * CRITICAL: This is for forward testing V1 discovered via time-travel
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const InstitutionalTrapDetector = require('./institutionalTrapDetector.cjs');
const ComprehensiveTA = require('./comprehensiveTA.cjs');
const V1StrategyGenerator = require('./v1Generator.cjs');

class RegularBacktestEngine {

    constructor() {
        this.trapDetector = new InstitutionalTrapDetector();
    }

    /**
     * Run regular backtest using V1 strategy
     */
    async run(categoryKey, options = {}) {
        console.log(`\n🔄 Running Regular Backtest for ${categoryKey}`);
        console.log(`===================================================\n`);

        // Step 1: Load V1 strategy
        const generator = new V1StrategyGenerator();
        let v1Strategy;

        try {
            v1Strategy = await generator.loadV1FromDatabase(categoryKey);
            console.log(`✅ Loaded V1 Strategy: ${v1Strategy.id}`);
            console.log(`📊 Historical Performance:`);
            console.log(`   Win Rate: ${v1Strategy.backtestMetrics.winRate.toFixed(1)}%`);
            console.log(`   Expectancy: ${v1Strategy.backtestMetrics.expectancy.toFixed(2)}%`);
            console.log(`   Trades: ${v1Strategy.backtestMetrics.tradeCount}\n`);
        } catch (error) {
            throw new Error(`Failed to load V1 strategy: ${error.message}`);
        }

        // Step 2: Get stocks for category
        const stocks = await this.getStocksForCategory(categoryKey);
        console.log(`📈 Testing ${stocks.length} stocks from ${categoryKey}\n`);

        if (stocks.length === 0) {
            throw new Error(`No stocks found for category: ${categoryKey}`);
        }

        // Step 3: Run backtest on each stock
        const allTrades = [];
        let stocksProcessed = 0;
        let stocksSkipped = 0;

        for (const stock of stocks) {
            console.log(`  [${stocksProcessed + stocksSkipped + 1}/${stocks.length}] ${stock.symbol}...`);

            const candles = await this.getCandlesForStock(stock.symbol);

            if (!candles || candles.length < 100) {
                console.log(`    ⚠️ Insufficient data (${candles ? candles.length : 0} candles)`);
                stocksSkipped++;
                continue;
            }

            const trades = await this.backtestStock(stock, candles, v1Strategy);
            allTrades.push(...trades);
            stocksProcessed++;

            const winners = trades.filter(t => t.result === 'WIN').length;
            const losers = trades.filter(t => t.result === 'LOSS').length;
            const rejected = trades.filter(t => t.result === 'REJECTED').length;

            console.log(`    ✅ ${trades.length} signals (${winners}W ${losers}L ${rejected}R)`);
        }

        // Step 4: Compute results
        const metrics = this.computeMetrics(allTrades);

        console.log(`\n===================================================`);
        console.log(`📊 REGULAR BACKTEST RESULTS:\n`);
        console.log(`  Stocks Processed: ${stocksProcessed}/${stocks.length}`);
        console.log(`  Total Signals: ${allTrades.length}`);
        console.log(`  Accepted Trades: ${allTrades.filter(t => t.result !== 'REJECTED').length}`);
        console.log(`  Rejected (Traps): ${allTrades.filter(t => t.result === 'REJECTED').length}`);
        console.log(`  Win Rate: ${metrics.winRate.toFixed(1)}%`);
        console.log(`  Avg Profit: ${metrics.avgProfit.toFixed(2)}%`);
        console.log(`  Max Drawdown: ${metrics.maxDrawdown.toFixed(2)}%`);
        console.log(`===================================================\n`);

        return {
            strategy: v1Strategy,
            trades: allTrades,
            metrics,
            summary: {
                stocksProcessed,
                stocksSkipped,
                totalSignals: allTrades.length,
                acceptedTrades: allTrades.filter(t => t.result !== 'REJECTED').length,
                rejectedSignals: allTrades.filter(t => t.result === 'REJECTED').length
            }
        };
    }

    /**
     * Backtest single stock with V1 strategy
     */
    async backtestStock(stock, candles, v1Strategy) {
        const trades = [];
        const v1Logic = v1Strategy.logic;

        // Scan through candles for entry signals
        for (let i = 50; i < candles.length - v1Logic.exit.maxSessions; i++) {
            const today = candles[i];
            const historicalCandles = candles.slice(0, i + 1);

            // Check entry conditions (using V1 rules)
            const signal = await this.checkV1EntryConditions(historicalCandles, v1Logic.entry);

            if (!signal.valid) continue;

            // Check traps
            const trapScan = await this.trapDetector.scanAll(historicalCandles);

            if (!trapScan.allClear) {
                // Log rejected signal (for transparency)
                trades.push({
                    symbol: stock.symbol,
                    entryDate: today.timestamp,
                    entryPrice: today.close,
                    result: 'REJECTED',
                    reason: trapScan.reason,
                    trapFlags: trapScan.flags,
                    trapDetected: true,
                    trapType: trapScan.detectedTraps.join(', ')
                });
                continue;
            }

            // Execute trade
            const trade = await this.executeV1Trade({
                symbol: stock.symbol,
                entryCandle: today,
                futureCandles: candles.slice(i + 1, i + 1 + v1Logic.exit.maxSessions),
                exitRules: v1Logic.exit,
                trapFlags: trapScan.flags
            });

            trades.push(trade);
        }

        return trades;
    }

    /**
     * Check V1 entry conditions
     */
    async checkV1EntryConditions(candles, entryRules) {
        try {
            const indicators = ComprehensiveTA.getAllIndicators(candles);
            const current = candles[candles.length - 1];

            // RSI check
            const rsiMet = entryRules.rsiOperator === '<'
                ? indicators.rsi < entryRules.rsiThreshold
                : indicators.rsi > entryRules.rsiThreshold;

            // MACD check
            const macdMet = indicators.macd && indicators.macd.histogram > 0;

            // Volume check
            const avgVol = candles.slice(-20).reduce((sum, c) => sum + (c.volume || 0), 0) / 20;
            const volMet = avgVol > 0 && (current.volume / avgVol) >= entryRules.volumeFactor;

            // SMA check
            const smaMet = current.close > indicators.sma20;

            const allMet = entryRules.requireAllConditions
                ? (rsiMet && macdMet && volMet && smaMet)
                : (rsiMet || macdMet || volMet || smaMet);

            return { valid: allMet, rsiMet, macdMet, volMet, smaMet };
        } catch (error) {
            return { valid: false, error: error.message };
        }
    }

    /**
     * Execute V1 trade (similar to time-travel replay)
     */
    async executeV1Trade({ symbol, entryCandle, futureCandles, exitRules, trapFlags }) {
        const entryPrice = entryCandle.close;
        const targetPrice = entryPrice * (1 + exitRules.targetPct / 100);
        const stopPrice = entryPrice * (1 - exitRules.stopPct / 100);

        let exitReason = null;
        let exitCandle = null;
        let exitPrice = null;
        let sessionNum = 0;

        for (let i = 0; i < futureCandles.length; i++) {
            const candle = futureCandles[i];
            sessionNum = i + 1;

            // Check STOP first
            if (candle.low <= stopPrice) {
                exitReason = 'STOP';
                exitPrice = stopPrice;
                exitCandle = candle;
                break;
            }

            // Check TARGET
            if (candle.high >= targetPrice) {
                exitReason = 'TARGET';
                exitPrice = targetPrice;
                exitCandle = candle;
                break;
            }

            // Check TIME limit
            if (sessionNum === exitRules.maxSessions) {
                exitReason = 'TIME';
                exitPrice = candle.close;
                exitCandle = candle;
                break;
            }
        }

        // Fallback
        if (!exitCandle) {
            const last = futureCandles[futureCandles.length - 1];
            exitReason = "TIME";
            exitPrice = last.close;
            exitCandle = last;
            sessionNum = futureCandles.length;
        }

        const pnlPct = ((exitPrice - entryPrice) / entryPrice) * 100;

        return {
            symbol,
            entryDate: entryCandle.timestamp,
            exitDate: exitCandle.timestamp,
            entry: {
                price: entryPrice,
                candle: {
                    open: entryCandle.open,
                    high: entryCandle.high,
                    low: entryCandle.low,
                    close: entryCandle.close,
                    volume: entryCandle.volume
                }
            },
            exit: {
                price: exitPrice,
                reason: exitReason,
                session: sessionNum,
                candle: {
                    open: exitCandle.open,
                    high: exitCandle.high,
                    low: exitCandle.low,
                    close: exitCandle.close,
                    volume: exitCandle.volume
                },
                detail: `${exitReason}: ${exitReason === 'TARGET' ? 'Hit target' : exitReason === 'STOP' ? 'Hit stop loss' : `Reached ${sessionNum}th session`} @ ${exitPrice.toFixed(2)}`
            },
            targetPrice,
            stopPrice,
            pnlPct: parseFloat(pnlPct.toFixed(2)),
            holdingDays: sessionNum,
            trapDetected: false,
            trapFlags,
            result: pnlPct > 0 ? 'WIN' : 'LOSS'
        };
    }

    /**
     * Compute metrics
     */
    computeMetrics(trades) {
        const executedTrades = trades.filter(t => t.result !== 'REJECTED');

        if (executedTrades.length === 0) {
            return {
                tradeCount: 0,
                winRate: 0,
                avgProfit: 0,
                maxDrawdown: 0,
                expectancy: 0
            };
        }

        const wins = executedTrades.filter(t => t.result === 'WIN');
        const losses = executedTrades.filter(t => t.result === 'LOSS');

        const winRate = (wins.length / executedTrades.length) * 100;
        const avgProfit = executedTrades.reduce((sum, t) => sum + t.pnlPct, 0) / executedTrades.length;
        const maxDrawdown = Math.min(...executedTrades.map(t => t.pnlPct));

        const avgWin = wins.length > 0 ? wins.reduce((sum, t) => sum + t.pnlPct, 0) / wins.length : 0;
        const avgLoss = losses.length > 0 ? losses.reduce((sum, t) => sum + Math.abs(t.pnlPct), 0) / losses.length : 0;
        const expectancy = (winRate / 100) * avgWin - ((100 - winRate) / 100) * avgLoss;

        return {
            tradeCount: executedTrades.length,
            winRate,
            avgProfit,
            maxDrawdown,
            expectancy,
            winners: wins.length,
            losers: losses.length
        };
    }

    // ==================== HELPERS ====================

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
}

module.exports = RegularBacktestEngine;
