// Live Tracking Worker
// Monitors stocks in real-time for entry signals and manages active trades

const priceService = require('../services/priceService.cjs');
const { PrismaClient } = require('@prisma/client');
const DownsideLomSwingStrategy = require('../strategy/downsideLomSwingStrategy.cjs');
const config = require('../config/trading.config.json');

const prisma = new PrismaClient();

class LiveTracker {
    constructor() {
        this.strategy = new DownsideLomSwingStrategy();
        this.isRunning = false;
        this.checkInterval = config.pilot.checkInterval * 60 * 1000; // Convert minutes to ms
    }

    // Main loop
    async start() {
        console.log(`\n🚀 Starting Live Tracker for ${config.pilot.category}`);
        console.log(`Check interval: ${config.pilot.checkInterval} minutes\n`);

        this.isRunning = true;

        // Run first check immediately
        await this.checkForSignals();

        // Then run on interval
        this.intervalId = setInterval(() => {
            if (this.isRunning) {
                this.checkForSignals().catch(err => {
                    console.error('[LiveTracker] Error:', err.message);
                });
            }
        }, this.checkInterval);
    }

    // Stop the tracker
    stop() {
        console.log('\n⏹️  Stopping Live Tracker...');
        this.isRunning = false;
        if (this.intervalId) {
            clearInterval(this.intervalId);
        }
    }

    // Check for new signals and update active trades
    async checkForSignals() {
        const timestamp = new Date().toISOString();
        console.log(`\n[${timestamp}] 🔍 Checking for signals...`);

        try {
            // 1. Update active trades
            await this.updateActiveTrades();

            // 2. Check for new entry signals
            await this.scanForEntries();

        } catch (error) {
            console.error('[LiveTracker] Check failed:', error.message);
        }
    }

    // Update all active trades
    async updateActiveTrades() {
        const activeTrades = await prisma.trade.findMany({
            where: {
                status: { in: ['WAITING', 'ACTIVE'] },
                category: config.pilot.category
            }
        });

        if (activeTrades.length === 0) {
            console.log('No active trades to update');
            return;
        }

        console.log(`Updating ${activeTrades.length} active trades...`);

        for (const trade of activeTrades) {
            try {
                await this.updateTrade(trade);
            } catch (error) {
                console.error(`Failed to update ${trade.stockSymbol}:`, error.message);
            }
        }
    }

    // Update a single trade
    async updateTrade(trade) {
        // Fetch latest candle
        const candles = await this.getLatestCandles(trade.stockSymbol, 1);
        if (!candles || candles.length === 0) {
            console.log(`⚠️  ${trade.stockSymbol}: No candle data`);
            return;
        }

        const currentCandle = candles[0];

        // Check if entry conditions met (for WAITING trades)
        if (trade.status === 'WAITING') {
            if (currentCandle.close >= trade.entryPrice * 0.99) {
                // Entry triggered
                await prisma.trade.update({
                    where: { id: trade.id },
                    data: {
                        status: 'ACTIVE',
                        entryDate: new Date(),
                        entryPrice: currentCandle.close
                    }
                });
                console.log(`✓ ${trade.stockSymbol}: Entry triggered @ ${currentCandle.close.toFixed(2)}`);
                return;
            }
        }

        // Check exits for ACTIVE trades
        if (trade.status === 'ACTIVE') {
            // Check target hit
            if (currentCandle.high >= trade.targetPrice) {
                await prisma.trade.update({
                    where: { id: trade.id },
                    data: {
                        status: 'TARGET_HIT',
                        exitDate: new Date(),
                        exitPrice: trade.targetPrice,
                        pnl: trade.targetPrice - trade.entryPrice,
                        pnlPercent: ((trade.targetPrice - trade.entryPrice) / trade.entryPrice) * 100
                    }
                });
                console.log(`🎯 ${trade.stockSymbol}: TARGET HIT! P&L: ${((trade.targetPrice - trade.entryPrice) / trade.entryPrice * 100).toFixed(2)}%`);
                return;
            }

            // Check stop loss hit
            if (currentCandle.low <= trade.stopLoss) {
                await prisma.trade.update({
                    where: { id: trade.id },
                    data: {
                        status: 'SL_HIT',
                        exitDate: new Date(),
                        exitPrice: trade.stopLoss,
                        pnl: trade.stopLoss - trade.entryPrice,
                        pnlPercent: ((trade.stopLoss - trade.entryPrice) / trade.entryPrice) * 100
                    }
                });
                console.log(`🛑 ${trade.stockSymbol}: Stop Loss Hit. P&L: ${((trade.stopLoss - trade.entryPrice) / trade.entryPrice * 100).toFixed(2)}%`);
                return;
            }

            // Check trailing stop
            if (trade.currentTrail && currentCandle.low <= trade.currentTrail) {
                await prisma.trade.update({
                    where: { id: trade.id },
                    data: {
                        status: 'TRAILING_SL_HIT',
                        exitDate: new Date(),
                        exitPrice: trade.currentTrail,
                        pnl: trade.currentTrail - trade.entryPrice,
                        pnlPercent: ((trade.currentTrail - trade.entryPrice) / trade.entryPrice) * 100
                    }
                });
                console.log(`📈 ${trade.stockSymbol}: Trailing Stop Hit. P&L: ${((trade.currentTrail - trade.entryPrice) / trade.entryPrice * 100).toFixed(2)}%`);
                return;
            }

            // Update trailing stop if price moved favorably
            const profitPercent = (currentCandle.close - trade.entryPrice) / (trade.targetPrice - trade.entryPrice);
            let newTrail = trade.currentTrail;

            if (profitPercent > 0.5 && currentCandle.close > trade.trailingStop) {
                newTrail = trade.entryPrice; // Move to breakeven
            } else if (profitPercent > 0.75) {
                newTrail = trade.entryPrice + ((trade.targetPrice - trade.entryPrice) * 0.5);
            }

            if (newTrail !== trade.currentTrail) {
                await prisma.trade.update({
                    where: { id: trade.id },
                    data: { currentTrail: newTrail }
                });
                console.log(`📊 ${trade.stockSymbol}: Trailing updated to ${newTrail.toFixed(2)}`);
            }

            // Check max tracking days
            const daysInTrade = Math.floor((Date.now() - new Date(trade.createdAt).getTime()) / (1000 * 60 * 60 * 24));
            if (daysInTrade >= trade.maxTrackingDays) {
                await prisma.trade.update({
                    where: { id: trade.id },
                    data: {
                        status: 'EXPIRED',
                        exitDate: new Date(),
                        exitPrice: currentCandle.close,
                        pnl: currentCandle.close - trade.entryPrice,
                        pnlPercent: ((currentCandle.close - trade.entryPrice) / trade.entryPrice) * 100
                    }
                });
                console.log(`⏱️  ${trade.stockSymbol}: Max tracking days reached (${trade.maxTrackingDays})`);
            }
        }
    }

    // Scan for new entry signals
    async scanForEntries() {
        // Get stocks added today or recently
        const stocks = await prisma.stockCategory.findMany({
            where: {
                category: {
                    key: config.pilot.category
                }
            },
            include: {
                stock: true
            }
        });

        console.log(`Scanning ${stocks.length} stocks for entry signals...`);

        let newSignals = 0;

        for (const stockCat of stocks) {
            // Check if already have an active trade for this stock
            const existingTrade = await prisma.trade.findFirst({
                where: {
                    stockSymbol: stockCat.stock.symbol,
                    category: config.pilot.category,
                    status: { in: ['WAITING', 'ACTIVE'] }
                }
            });

            if (existingTrade) {
                continue; // Skip if already tracking
            }

            try {
                const signal = await this.checkForEntrySignal(stockCat);
                if (signal) {
                    await this.createTrade(stockCat.stock.symbol, signal);
                    newSignals++;
                }
            } catch (error) {
                console.error(`Error checking ${stockCat.stock.symbol}:`, error.message);
            }
        }

        console.log(`Found ${newSignals} new signals`);
    }

    // Check if a stock has an entry signal
    async checkForEntrySignal(stockCat) {
        const candles = await this.getLatestCandles(stockCat.stock.symbol, 60);
        if (!candles || candles.length < 50) {
            return null;
        }

        // Check for entry signal on latest candle
        const signal = this.strategy.getEntrySignal(candles, candles.length - 1);
        return signal;
    }

    // Get latest candles for a stock
    async getLatestCandles(symbol, count = 60) {
        // Try to find stock's instrument key  
        const stock = await prisma.stock.findUnique({
            where: { symbol }
        });

        if (!stock || !stock.instrumentKey) {
            return null;
        }

        const toDate = new Date().toISOString().split('T')[0];
        const fromDate = new Date(Date.now() - count * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

        const candles = await priceService.fetchPrice(
            symbol,
            stock.instrumentKey,
            fromDate,
            toDate
        );

        return candles;
    }

    // Create a new trade entry
    async createTrade(symbol, signal) {
        const trade = await prisma.trade.create({
            data: {
                stockSymbol: symbol,
                category: config.pilot.category,
                strategyVersion: this.strategy.version,
                direction: signal.type,
                entryPrice: signal.entry,
                targetPrice: signal.target,
                stopLoss: signal.stopLoss,
                trailingStop: signal.trailingStop,
                status: 'WAITING',
                maxTrackingDays: config.swing.trackingDays,
                signalData: {
                    pattern: signal.pattern,
                    rsi: signal.rsi,
                    ema20: signal.ema20,
                    filters: signal.filters
                }
            }
        });

        console.log(`\n🔔 NEW SIGNAL: ${symbol}`);
        console.log(`   Pattern: ${signal.pattern}`);
        console.log(`   Entry: ${signal.entry.toFixed(2)}`);
        console.log(`   Target: ${signal.target.toFixed(2)} (+${((signal.target - signal.entry) / signal.entry * 100).toFixed(2)}%)`);
        console.log(`   Stop Loss: ${signal.stopLoss.toFixed(2)} (-${((signal.entry - signal.stopLoss) / signal.entry * 100).toFixed(2)}%)`);
        console.log(`   Risk/Reward: 1:${((signal.target - signal.entry) / (signal.entry - signal.stopLoss)).toFixed(1)}\n`);

        return trade;
    }

    // Get summary stats
    async getStats() {
        const trades = await prisma.trade.findMany({
            where: { category: config.pilot.category }
        });

        const active = trades.filter(t => ['WAITING', 'ACTIVE'].includes(t.status));
        const completed = trades.filter(t => ['TARGET_HIT', 'SL_HIT', 'TRAILING_SL_HIT'].includes(t.status));
        const wins = completed.filter(t => t.pnl > 0);

        return {
            total: trades.length,
            active: active.length,
            completed: completed.length,
            wins: wins.length,
            losses: completed.length - wins.length,
            accuracy: completed.length > 0 ? (wins.length / completed.length * 100).toFixed(2) + '%' : '0%'
        };
    }
}

module.exports = LiveTracker;
