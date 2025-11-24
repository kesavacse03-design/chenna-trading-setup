// Walk-Forward Optimization
// Performs rolling window optimization with out-of-sample validation

const { PrismaClient } = require('@prisma/client');
const priceService = require('../services/priceService.cjs');
const EnhancedTA = require('../strategy/enhancedTA.cjs');
const logger = require('../utils/logger.cjs');

const prisma = new PrismaClient();

class WalkForwardOptimizer {
    constructor(category, windowSize = 90, testSize = 30, stepSize = 30) {
        this.category = category;
        this.windowSize = windowSize; // Training window in days
        this.testSize = testSize;     // Testing window in days
        this.stepSize = stepSize;     // Days to move forward each iteration
        this.results = [];
        this.progressCallback = null;
    }

    setProgressCallback(callback) {
        this.progressCallback = callback;
    }

    // ========== LOAD DATA ==========

    async loadData() {
        logger.info(`Loading stocks from category: ${this.category}`);

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
        this.priceData = {};

        logger.info(`Found ${this.stocks.length} stocks`);

        // Load price data for all stocks
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
                logger.info(`✓ ${symbol}: ${candles.length} candles loaded`);
            } catch (error) {
                logger.warn(`✗ ${symbol}: ${error.message}`);
            }
        }

        logger.info(`Loaded price data for ${Object.keys(this.priceData).length} stocks`);
    }

    // ========== SPLIT DATA INTO WINDOWS ==========

    splitIntoWindows() {
        const windows = [];

        // Find the longest price series to determine max windows
        const maxCandles = Math.max(...Object.values(this.priceData).map(candles => candles.length));

        let startIdx = 0;

        while (startIdx + this.windowSize + this.testSize <= maxCandles) {
            const trainEnd = startIdx + this.windowSize;
            const testEnd = trainEnd + this.testSize;

            windows.push({
                id: windows.length + 1,
                trainStart: startIdx,
                trainEnd: trainEnd,
                testStart: trainEnd,
                testEnd: test End,
            });

            startIdx += this.stepSize;
        }

        logger.info(`Created ${windows.length} walk-forward windows`);
        return windows;
    }

    // ========== OPTIMIZE ON TRAINING WINDOW ==========

    async optimizeWindow(window, stocks) {
        // Simple parameter optimization for the training period
        const parameters = [
            { rsi: [25, 35], volume: 1.5, rr: 2.0 },
            { rsi: [30, 40], volume: 2.0, rr: 2.5 },
            { rsi: [20, 30], volume: 1.8, rr: 1.5 },
        ];

        let bestParams = null;
        let bestAccuracy = 0;

        for (const params of parameters) {
            let wins = 0;
            let total = 0;

            // Test on training window
            for (const [symbol, candles] of Object.entries(stocks)) {
                const trainCandles = candles.slice(window.trainStart, window.trainEnd);

                if (trainCandles.length < 50) continue;

                // Backtest with these parameters
                const trades = this.simulateTrades(trainCandles, params);

                wins += trades.filter(t => t.outcome === 'WIN').length;
                total += trades.length;
            }

            const accuracy = total > 0 ? wins / total : 0;

            if (accuracy > bestAccuracy) {
                bestAccuracy = accuracy;
                bestParams = params;
            }
        }

        return { params: bestParams, trainAccuracy: bestAccuracy };
    }

    // ========== VALIDATE ON TEST WINDOW ==========

    async validateWindow(window, stocks, params) {
        let wins = 0;
        let total = 0;
        let totalPnL = 0;

        for (const [symbol, candles] of Object.entries(stocks)) {
            const testCandles = candles.slice(window.testStart, window.testEnd);

            if (testCandles.length < 20) continue;

            // Backtest with optimized parameters
            const trades = this.simulateTrades(testCandles, params);

            wins += trades.filter(t => t.outcome === 'WIN').length;
            total += trades.length;
            totalPnL += trades.reduce((sum, t) => sum + (t.pnl || 0), 0);
        }

        const accuracy = total > 0 ? wins / total : 0;

        return { testAccuracy: accuracy, trades: total, pnl: totalPnL };
    }

    // ========== SIMULATE TRADES (Simplified) ==========

    simulateTrades(candles, params) {
        const trades = [];

        for (let i = 50; i < candles.length; i++) {
            const rsi = EnhancedTA.calculateRSI(candles.slice(0, i + 1), 14);
            const volume = candles[i].volume;
            const avgVolume = EnhancedTA.getAverageVolume(candles.slice(0, i), 20);

            if (!rsi || !avgVolume) continue;

            // Entry conditions
            if (rsi >= params.rsi[0] && rsi <= params.rsi[1] && volume > avgVolume * params.volume) {
                const entry = candles[i].close;
                const atr = EnhancedTA.calculateATR(candles.slice(0, i + 1), 14);
                const stopLoss = entry - atr * 1.5;
                const target = entry + (entry - stopLoss) * params.rr;

                // Simulate outcome (simplified - check next 5 candles)
                let outcome = 'PENDING';
                let pnl = 0;

                for (let j = i + 1; j < Math.min(i + 6, candles.length); j++) {
                    if (candles[j].high >= target) {
                        outcome = 'WIN';
                        pnl = target - entry;
                        break;
                    } else if (candles[j].low <= stopLoss) {
                        outcome = 'LOSS';
                        pnl = stopLoss - entry;
                        break;
                    }
                }

                trades.push({ entry, target, stopLoss, outcome, pnl });
            }
        }

        return trades;
    }

    // ========== RUN WALK-FORWARD OPTIMIZATION ==========

    async optimize() {
        logger.info('╔══════════════════════════════════════════════════╗');
        logger.info('║   WALK-FORWARD OPTIMIZATION ENGINE               ║');
        logger.info(`║   Category: ${this.category.padEnd(32)} ║`);
        logger.info('╚══════════════════════════════════════════════════╝\n');

        await this.loadData();

        const windows = this.splitIntoWindows();

        logger.info(`Testing ${windows.length} walk-forward windows...\n`);

        for (const window of windows) {
            logger.info(`Window ${window.id}: Train[${window.trainStart}-${window.trainEnd}], Test[${window.testStart}-${window.testEnd}]`);

            // Optimize on training set
            const optimization = await this.optimizeWindow(window, this.priceData);
            logger.info(`  Training accuracy: ${(optimization.trainAccuracy * 100).toFixed(2)}%`);

            // Validate on test set
            const validation = await this.validateWindow(window, this.priceData, optimization.params);
            logger.info(`  Test accuracy: ${(validation.testAccuracy * 100).toFixed(2)}%`);
            logger.info(`  Test trades: ${validation.trades}, PnL: ${validation.pnl.toFixed(2)}\n`);

            this.results.push({
                window: window.id,
                trainAccuracy: optimization.trainAccuracy,
                testAccuracy: validation.testAccuracy,
                trades: validation.trades,
                pnl: validation.pnl,
                params: optimization.params,
            });

            if (this.progressCallback) {
                this.progressCallback({
                    window: window.id,
                    total: windows.length,
                    trainAccuracy: optimization.trainAccuracy,
                    testAccuracy: validation.testAccuracy,
                });
            }
        }

        // Calculate overall performance
        const avgTestAccuracy = this.results.reduce((sum, r) => sum + r.testAccuracy, 0) / this.results.length;
        const totalPnL = this.results.reduce((sum, r) => sum + r.pnl, 0);

        logger.info('╔══════════════════════════════════════════════════╗');
        logger.info('║   WALK-FORWARD RESULTS                            ║');
        logger.info('╚══════════════════════════════════════════════════╝');
        logger.info(`Average test accuracy: ${(avgTestAccuracy * 100).toFixed(2)}%`);
        logger.info(`Total PnL across windows: ${totalPnL.toFixed(2)}`);
        logger.info(`Windows tested: ${this.results.length}\n`);

        await prisma.$disconnect();

        return {
            avgTestAccuracy,
            totalPnL,
            windows: this.results,
        };
    }
}

module.exports = WalkForwardOptimizer;
