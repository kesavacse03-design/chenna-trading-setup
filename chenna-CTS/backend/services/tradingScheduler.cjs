/**
 * Trading System Scheduler
 * 
 * Automatic background jobs for:
 * - Signal generation at 3:30 PM
 * - Position monitoring (hourly for SWING)
 * - Daily summary at 3:45 PM
 * - Morning prep at 8:30 AM
 */

const prisma = require('../lib/prisma.cjs');
const signalGenerator = require('./labs/signalGeneratorV2.cjs');
const telegramService = require('./telegramService.cjs');
const { todayIST, startOfDayUTC } = require('../utils/istUtils.cjs');

class TradingScheduler {
    constructor() {
        this.intervals = {};
        this.isRunning = false;
    }

    /**
     * Start all scheduled jobs
     */
    start() {
        if (this.isRunning) {
            console.log('[Scheduler] Already running');
            return;
        }

        console.log('[Scheduler] Starting trading scheduler...');
        this.isRunning = true;

        // Check every minute for scheduled tasks
        this.intervals.main = setInterval(() => this.checkScheduledTasks(), 60000);

        // Run initial check
        this.checkScheduledTasks();

        console.log('[Scheduler] ✅ Scheduler started');
    }

    /**
     * Stop all scheduled jobs
     */
    stop() {
        console.log('[Scheduler] Stopping...');
        Object.values(this.intervals).forEach(interval => clearInterval(interval));
        this.intervals = {};
        this.isRunning = false;
        console.log('[Scheduler] ✅ Stopped');
    }

    /**
     * Check and run scheduled tasks based on current time
     */
    async checkScheduledTasks() {
        const now = new Date();
        const hours = now.getHours();
        const minutes = now.getMinutes();
        const dayOfWeek = now.getDay();

        // Skip weekends
        if (dayOfWeek === 0 || dayOfWeek === 6) {
            return;
        }

        // Morning Prep at 8:30 AM
        if (hours === 8 && minutes === 30) {
            await this.runMorningPrep();
        }

        // Signal Generation at 3:30 PM (15:30)
        if (hours === 15 && minutes === 30) {
            await this.runSignalGeneration();
        }

        // Daily Summary at 3:45 PM (15:45)
        if (hours === 15 && minutes === 45) {
            await this.runDailySummary();
        }

        // Position monitoring every hour from 9 AM to 3 PM
        if (minutes === 0 && hours >= 9 && hours <= 15) {
            await this.runPositionMonitoring();
        }
    }

    /**
     * Generate signals and send Telegram alerts
     */
    async runSignalGeneration() {
        console.log('[Scheduler] Running signal generation...');

        try {
            const result = await signalGenerator.generateAllSignals(new Date(), 500000);

            if (result.allSignals.length > 0) {
                // Save to database
                await signalGenerator.saveSignalsToDatabase(result.allSignals);

                // Send Telegram alerts for each signal
                for (const signal of result.allSignals) {
                    try {
                        await telegramService.sendTradeEntryAlert({
                            symbol: signal.symbol,
                            categoryKey: signal.categoryKey,
                            entryPrice: signal.entryPrice,
                            targetPrice: signal.targetPrice,
                            targetPercent: ((signal.targetPrice / signal.entryPrice - 1) * 100).toFixed(1),
                            stopLossPrice: signal.stopPrice,
                            stopLossPercent: ((signal.stopPrice / signal.entryPrice - 1) * 100).toFixed(1),
                            positionSize: signal.suggestedPositionSize,
                            strategyVersion: 'V1',
                            reason: `Tier ${signal.tier}: ${(signal.confidenceScore * 100).toFixed(0)}% confidence`
                        });
                    } catch (e) {
                        console.error('[Scheduler] Telegram send error:', e.message);
                    }
                }

                console.log(`[Scheduler] ✅ Generated ${result.allSignals.length} signals`);
            } else {
                console.log('[Scheduler] No signals generated');
            }
        } catch (error) {
            console.error('[Scheduler] Signal generation error:', error.message);
        }
    }

    /**
     * Monitor open positions for target/stop/day3
     */
    async runPositionMonitoring() {
        console.log('[Scheduler] Running position monitoring...');

        try {
            const openPositions = await prisma.position.findMany({
                where: { status: 'OPEN' }
            });

            if (openPositions.length === 0) {
                console.log('[Scheduler] No open positions');
                return;
            }

            for (const position of openPositions) {
                const daysHeld = Math.ceil((new Date() - new Date(position.entryDate)) / (1000 * 60 * 60 * 24));

                // TODO: Fetch current price from Upstox
                const currentPrice = position.entryPrice; // Placeholder

                // Check Day 3 exit
                if (daysHeld >= 3) {
                    await telegramService.sendTimeExitAlert({
                        symbol: position.symbol,
                        entryPrice: position.entryPrice,
                        exitPrice: currentPrice,
                        pnlPercent: ((currentPrice - position.entryPrice) / position.entryPrice * 100),
                        pnlAmount: (currentPrice - position.entryPrice) * position.quantity,
                        daysHeld,
                        maxDays: 3
                    });
                }

                // Check target approaching (within 0.3%)
                const distanceToTarget = (position.targetPrice - currentPrice) / position.targetPrice;
                if (distanceToTarget <= 0.003 && distanceToTarget > 0) {
                    // Would send target approaching alert
                    console.log(`[Scheduler] ${position.symbol} approaching target`);
                }

                // Check stop approaching (within 0.3%)
                const distanceToStop = (currentPrice - position.stopPrice) / position.stopPrice;
                if (distanceToStop <= 0.003 && distanceToStop > 0) {
                    // Would send stop approaching alert
                    console.log(`[Scheduler] ${position.symbol} approaching stop`);
                }
            }

            console.log(`[Scheduler] ✅ Monitored ${openPositions.length} positions`);
        } catch (error) {
            console.error('[Scheduler] Position monitoring error:', error.message);
        }
    }

    /**
     * Send daily summary
     */
    async runDailySummary() {
        console.log('[Scheduler] Running daily summary...');

        try {
            // Get today's stats
            const todayStart = startOfDayUTC(todayIST());

            const signals = await prisma.tradingSignal.findMany({
                where: { signalDate: { gte: todayStart } }
            });

            const openPositions = await prisma.position.findMany({
                where: { status: 'OPEN' }
            });

            const closedToday = await prisma.position.findMany({
                where: {
                    status: 'CLOSED',
                    exitDate: { gte: todayStart }
                }
            });

            const wins = closedToday.filter(p => p.realizedPnL > 0).length;
            const losses = closedToday.filter(p => p.realizedPnL <= 0).length;
            const totalPnl = closedToday.reduce((s, p) => s + (p.realizedPnL || 0), 0);

            await telegramService.sendDailySummary({
                totalTrades: closedToday.length,
                wins,
                losses,
                winRate: closedToday.length > 0 ? (wins / closedToday.length * 100) : 0,
                totalPnl,
                bestTrade: closedToday.length > 0 ? closedToday.sort((a, b) => b.realizedPnL - a.realizedPnL)[0]?.symbol : 'N/A',
                worstTrade: closedToday.length > 0 ? closedToday.sort((a, b) => a.realizedPnL - b.realizedPnL)[0]?.symbol : 'N/A',
                activeTrades: openPositions.length
            });

            console.log('[Scheduler] ✅ Daily summary sent');
        } catch (error) {
            console.error('[Scheduler] Daily summary error:', error.message);
        }
    }

    /**
     * Send morning prep
     */
    async runMorningPrep() {
        console.log('[Scheduler] Running morning prep...');

        try {
            const openPositions = await prisma.position.findMany({
                where: { status: 'OPEN' }
            });

            const day3Positions = openPositions.filter(p => {
                const daysHeld = Math.ceil((new Date() - new Date(p.entryDate)) / (1000 * 60 * 60 * 24));
                return daysHeld >= 3;
            });

            const now = new Date();
            const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
            const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

            const message = `
☀️ *GOOD MORNING - ${dayNames[now.getDay()]}, ${monthNames[now.getMonth()]} ${now.getDate()}*

*Open Positions:* ${openPositions.length}
${openPositions.map(p => {
                const daysHeld = Math.ceil((new Date() - new Date(p.entryDate)) / (1000 * 60 * 60 * 24));
                return `├─ ${p.symbol} (Day ${daysHeld})${daysHeld >= 3 ? ' ⚠️ EXIT TODAY' : ''}`;
            }).join('\n') || '└─ None'}

*Today's Plan:*
${day3Positions.length > 0 ? `✅ Force exit ${day3Positions.map(p => p.symbol).join(', ')} (Day 3 rule)` : '✅ Monitor positions for target/stop'}
✅ Check new signals at 3:30 PM

_Status: All systems operational_
            `.trim();

            await telegramService.sendTelegramMessage(message);
            console.log('[Scheduler] ✅ Morning prep sent');
        } catch (error) {
            console.error('[Scheduler] Morning prep error:', error.message);
        }
    }

    /**
     * Run signal generation immediately (for testing/manual trigger)
     */
    async generateNow() {
        return this.runSignalGeneration();
    }
}

// Singleton instance
const scheduler = new TradingScheduler();

module.exports = scheduler;
