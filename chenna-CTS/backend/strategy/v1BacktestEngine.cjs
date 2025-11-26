/**
 * V1 Strategy Backtest Engine
 * Tests the promoted V1 strategy on all stocks in a category
 */

const TechnicalAnalysis = require('../strategy/comprehensiveTA.cjs');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

class V1BacktestEngine {

    async runV1Backtest(categoryKey) {
        console.log(`\n🎯 Running V1 Backtest for: ${categoryKey}\n`);

        // 1. Load promoted V1 strategy
        const v1 = await this.loadV1Strategy(categoryKey);

        if (!v1) {
            throw new Error('No V1 strategy found. Please run Time-Travel backtest first to generate V1 strategy.');
        }

        console.log(`✅ Loaded V1: ${v1.description}`);
        console.log(`   Entry Logic: ${v1.rules.entry.logic}`);
        console.log(`   Exit Rules: Target ${v1.rules.exit.target}%, Stop ${v1.rules.exit.stop}%\n`);

        // 2. Load stocks for category
        const stocks = await this.getStocksForCategory(categoryKey);
        console.log(`📊 Testing on ${stocks.length} stocks\n`);

        // 3. Test V1 on each stock
        const allTrades = [];
        for (const stock of stocks) {
            const trades = await this.testV1OnStock(stock, v1);
            allTrades.push(...trades);
        }

        console.log(`\n✅ Generated ${allTrades.length} trades\n`);

        // 4. Calculate overall metrics
        const metrics = this.calculateMetrics(allTrades);

        return {
            v1Strategy: v1,
            trades: allTrades,
            metrics,
            categoryKey
        };
    }

    async loadV1Strategy(categoryKey) {
        const v1 = await prisma.strategy.findFirst({
            where: {
                category: { key: categoryKey },
                promoted: true,
                version: 'V1'
            },
            include: {
                category: true
            }
        });

        return v1;
    }

    async getStocksForCategory(categoryKey) {
        const categoryStocks = await prisma.stockCategory.findMany({
            where: {
                category: { key: categoryKey }
            },
            include: {
                stock: true
            }
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

    async testV1OnStock(stock, v1) {
        const trades = [];

        try {
            const candles = await this.getCandlesForStock(stock.symbol);
            if (!candles || candles.length < 50) return trades;

            // Test V1 entry logic on historical data
            for (let i = 50; i < candles.length - 10; i++) {
                const availableCandles = candles.slice(0, i + 1);
                const futureCandles = candles.slice(i + 1, i + 11);

                if (futureCandles.length < 10) continue;

                // Check if V1 entry signal is triggered
                const hasSignal = this.checkV1Entry(availableCandles, v1.rules.entry);

                if (hasSignal) {
                    const entry = {
                        date: availableCandles[availableCandles.length - 1].timestamp,
                        price: availableCandles[availableCandles.length - 1].close
                    };

                    // Simulate trade with V1 exit rules
                    const outcome = this.simulateTrade(entry, futureCandles, v1.rules.exit);

                    trades.push({
                        symbol: stock.symbol,
                        entryDate: entry.date,
                        entryPrice: entry.price,
                        exitDate: outcome.exit.date,
                        exitPrice: outcome.exit.price,
                        target: entry.price * (1 + v1.rules.exit.target / 100),
                        stopLoss: entry.price * (1 - v1.rules.exit.stop / 100),
                        pnl: outcome.pnl,
                        pnlPercent: ((outcome.exit.price - entry.price) / entry.price * 100),
                        holdingDays: outcome.holdingDays,
                        exitReason: outcome.exitReason,
                        result: outcome.pnl > 0 ? 'WIN' : 'LOSS',
                        targetHit: outcome.exitReason === 'TARGET',
                        stopHit: outcome.exitReason === 'STOP'
                    });
                }
            }
        } catch (error) {
            console.error(`Error testing ${stock.symbol}:`, error.message);
        }

        return trades;
    }

    checkV1Entry(candles, entryRules) {
        try {
            // Calculate indicators
            const indicators = TechnicalAnalysis.getMarketContext(candles);
            if (!indicators) return false;

            // Parse V1 entry logic
            // Example: "RSI<25 + Above SMA50"
            const logic = entryRules.logic;

            // RSI conditions
            if (logic.includes('RSI<25') && indicators.rsi14 >= 25) return false;
            if (logic.includes('RSI<30') && indicators.rsi14 >= 30) return false;
            if (logic.includes('RSI<35') && indicators.rsi14 >= 35) return false;

            // SMA conditions
            if (logic.includes('Above SMA50') && !indicators.aboveSMA50) return false;
            if (logic.includes('Above SMA200') && !indicators.aboveSMA200) return false;
            if (logic.includes('Between SMA20/50')) {
                const price = candles[candles.length - 1].close;
                if (!(indicators.sma20 && indicators.sma50 && price > indicators.sma20 && price < indicators.sma50)) {
                    return false;
                }
            }

            // BB conditions
            if (logic.includes('BB Upper Band Touch')) {
                const price = candles[candles.length - 1].close;
                if (!(indicators.bb && price >= indicators.bb.upper * 0.98)) return false;
            }
            if (logic.includes('BB Lower Band')) {
                const price = candles[candles.length - 1].close;
                if (!(indicators.bb && price <= indicators.bb.lower * 1.02)) return false;
            }

            // MACD conditions
            if (logic.includes('MACD Bullish') && !indicators.macdBullish) return false;

            // If all conditions pass
            return true;

        } catch (error) {
            return false;
        }
    }

    simulateTrade(entry, futureCandles, exitRules) {
        const targetPrice = entry.price * (1 + exitRules.target / 100);
        const stopPrice = entry.price * (1 - exitRules.stop / 100);

        let exit = null;

        for (let i = 0; i < futureCandles.length; i++) {
            const candle = futureCandles[i];

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
            holdingDays: exit.dayNum,
            exitReason: pnl >= exitRules.target ? 'TARGET' : pnl <= -exitRules.stop ? 'STOP' : 'TIME'
        };
    }

    calculateMetrics(trades) {
        if (trades.length === 0) {
            return {
                totalTrades: 0,
                winners: 0,
                losers: 0,
                winRate: 0,
                avgPnL: 0,
                totalPnL: 0,
                expectancy: 0,
                maxDrawdown: 0
            };
        }

        const winners = trades.filter(t => t.pnl > 0);
        const losers = trades.filter(t => t.pnl <= 0);

        const winRate = (winners.length / trades.length) * 100;
        const avgWin = winners.length > 0 ? winners.reduce((sum, t) => sum + t.pnl, 0) / winners.length : 0;
        const avgLoss = losers.length > 0 ? Math.abs(losers.reduce((sum, t) => sum + t.pnl, 0) / losers.length) : 0;
        const totalPnL = trades.reduce((sum, t) => sum + t.pnl, 0);
        const avgPnL = totalPnL / trades.length;
        const expectancy = (winRate / 100 * avgWin) - ((100 - winRate) / 100 * avgLoss);

        // Calculate max drawdown
        let peak = 0;
        let maxDD = 0;
        let cumulative = 0;

        for (const trade of trades) {
            cumulative += trade.pnl;
            if (cumulative > peak) peak = cumulative;
            const drawdown = peak - cumulative;
            if (drawdown > maxDD) maxDD = drawdown;
        }

        return {
            totalTrades: trades.length,
            winners: winners.length,
            losers: losers.length,
            winRate: parseFloat(winRate.toFixed(1)),
            avgPnL: parseFloat(avgPnL.toFixed(2)),
            totalPnL: parseFloat(totalPnL.toFixed(2)),
            expectancy: parseFloat(expectancy.toFixed(2)),
            maxDrawdown: parseFloat(maxDD.toFixed(2))
        };
    }
}

module.exports = V1BacktestEngine;
