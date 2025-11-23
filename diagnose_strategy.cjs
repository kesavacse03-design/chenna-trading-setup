// Diagnostic Tool - Analyze Why No Trades
// Shows which filters each stock fails

const BacktestEngine = require('./strategy/backtestEngine.cjs');
const priceService = require('../services/priceService.cjs');
const { PrismaClient } = require('@prisma/client');
const TA = require('./technicalAnalysis.cjs');
const DownsideLomSwingStrategy = require('./downsideLomSwingStrategy.cjs');

const prisma = new PrismaClient();

async function diagnose() {
    console.log('\n=== STRATEGY DIAGNOSTIC ===\n');

    const category = await prisma.category.findUnique({
        where: { key: 'DOWNSIDE_LOM_SWING' },
        include: {
            stocks: {
                include: { stock: true },
                take: 5 // Analyze first 5 stocks
            }
        }
    });

    const strategy = new DownsideLomSwingStrategy();

    for (const stockCat of category.stocks) {
        const symbol = stockCat.stock.symbol;
        console.log(`\n--- ${symbol} ---`);

        try {
            const candles = await priceService.fetchPrice(
                symbol,
                stockCat.stock.instrumentKey,
                stockCat.addedDate,
                new Date().toISOString().split('T')[0]
            );

            console.log(`Candles: ${candles.length}`);

            // Check each candle for signals
            let signalCount = 0;
            let patternCount = 0;
            const failReasons = { pattern: 0, ema: 0, volume: 0, trend: 0, rsi: 0, fakeBreakout: 0 };

            for (let i = 50; i < candles.length; i++) {
                const candle = candles[i];
                const prevCandle = candles[i - 1];

                // Check pattern
                const hasHammer = TA.isHammer(candle, candles.slice(0, i));
                const hasEngulfing = TA.isEngulfing(candle, prevCandle, true);

                if (hasHammer || hasEngulfing) {
                    patternCount++;

                    // Check EMA
                    const ema20 = TA.calculateEMA(candles.slice(0, i + 1), 20);
                    if (!ema20 || candle.close < ema20 * 0.95) {
                        failReasons.ema++;
                        continue;
                    }

                    // Check filters
                    const filters = strategy.checkAntiTrapFilters(candles, candle, i);

                    if (!filters.volumeConfirmation) failReasons.volume++;
                    if (!filters.noRecentFakeBreakout) failReasons.fakeBreakout++;
                    if (!filters.trendAlignment) failReasons.trend++;
                    if (!filters.strongMomentum) failReasons.rsi++;

                    if (Object.values(filters).every(v => v)) {
                        signalCount++;
                    }
                } else {
                    failReasons.pattern++;
                }
            }

            console.log(`Patterns found: ${patternCount}`);
            console.log(`Clean signals: ${signalCount}`);
            console.log('Fail reasons:');
            Object.entries(failReasons).forEach(([key, count]) => {
                if (count > 0) console.log(`  - ${key}: ${count}`);
            });

        } catch (error) {
            console.log(`Error: ${error.message}`);
        }
    }

    await prisma.$disconnect();
}

diagnose();
