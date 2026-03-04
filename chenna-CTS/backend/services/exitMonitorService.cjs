/**
 * Exit Monitoring Service
 * 
 * PURPOSE: Track open positions and monitor for exit conditions
 * 
 * The Missing Loop:
 * Signal → Entry → [MONITOR] → Exit → Record Outcome → Learn
 * 
 * This service closes the loop by:
 * 1. Tracking all open positions in database
 * 2. Checking current prices against targets/stops
 * 3. Recording trade outcomes when exits occur
 * 4. Providing performance analytics
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

class ExitMonitorService {

    constructor() {
        this.monitoringInterval = null;
        this.isRunning = false;
    }

    // ============================================================
    // POSITION MANAGEMENT
    // ============================================================

    /**
     * Create a new position from a signal
     * Called when user decides to enter a trade
     */
    async createPosition(signal, options = {}) {
        const {
            entryPrice = signal.price,
            quantity = signal.quantity,
            capital = 100000
        } = options;

        // Calculate actual values
        const positionValue = entryPrice * quantity;
        const riskAmount = Math.abs(entryPrice - signal.stop) * quantity;

        const position = await prisma.position.create({
            data: {
                symbol: signal.symbol,
                name: signal.name || signal.symbol,
                categoryKey: signal.categoryKey || signal.category,

                // Entry details
                entryPrice: entryPrice,
                entryDate: new Date(),
                quantity: quantity,
                positionValue: positionValue,

                // Targets and stops
                targetPrice: signal.target,
                targetPercent: signal.targetPercent || ((signal.target - entryPrice) / entryPrice * 100),
                stopPrice: signal.stop,
                stopPercent: signal.stopPercent || ((entryPrice - signal.stop) / entryPrice * 100),

                // Risk metrics
                riskAmount: riskAmount,
                rewardRiskRatio: signal.rewardRiskRatio || ((signal.target - entryPrice) / (entryPrice - signal.stop)),

                // Status
                status: 'OPEN',

                // Original signal data
                signalData: signal,

                // Tracking
                daysRemaining: signal.daysRemaining || 10,
                expiryDate: new Date(Date.now() + (signal.daysRemaining || 10) * 24 * 60 * 60 * 1000)
            }
        });

        console.log(`[ExitMonitor] Position created: ${signal.symbol} @ ₹${entryPrice} | Qty: ${quantity}`);

        return position;
    }

    /**
     * Get all open positions
     */
    async getOpenPositions() {
        return await prisma.position.findMany({
            where: { status: 'OPEN' },
            orderBy: { entryDate: 'desc' }
        });
    }

    /**
     * Get position by ID
     */
    async getPosition(positionId) {
        return await prisma.position.findUnique({
            where: { id: positionId }
        });
    }

    /**
     * Get positions by category
     */
    async getPositionsByCategory(categoryKey) {
        return await prisma.position.findMany({
            where: { categoryKey, status: 'OPEN' },
            orderBy: { entryDate: 'desc' }
        });
    }

    // ============================================================
    // EXIT MONITORING
    // ============================================================

    /**
     * Check a position against current price
     * Returns exit signal if target/stop hit
     */
    checkExitCondition(position, currentPrice) {
        const { entryPrice, targetPrice, stopPrice, expiryDate } = position;

        // Calculate current P&L
        const unrealizedPnL = (currentPrice - entryPrice) * position.quantity;
        const unrealizedPnLPercent = ((currentPrice - entryPrice) / entryPrice) * 100;

        // Check target hit
        if (currentPrice >= targetPrice) {
            return {
                shouldExit: true,
                reason: 'TARGET_HIT',
                exitPrice: currentPrice,
                pnl: unrealizedPnL,
                pnlPercent: unrealizedPnLPercent,
                message: `🎯 TARGET HIT: ${position.symbol} @ ₹${currentPrice.toFixed(2)} (+${unrealizedPnLPercent.toFixed(1)}%)`
            };
        }

        // Check stop loss hit
        if (currentPrice <= stopPrice) {
            return {
                shouldExit: true,
                reason: 'STOP_HIT',
                exitPrice: currentPrice,
                pnl: unrealizedPnL,
                pnlPercent: unrealizedPnLPercent,
                message: `🛑 STOP HIT: ${position.symbol} @ ₹${currentPrice.toFixed(2)} (${unrealizedPnLPercent.toFixed(1)}%)`
            };
        }

        // Check time expiry
        if (expiryDate && new Date() > new Date(expiryDate)) {
            return {
                shouldExit: true,
                reason: 'TIME_EXPIRED',
                exitPrice: currentPrice,
                pnl: unrealizedPnL,
                pnlPercent: unrealizedPnLPercent,
                message: `⏰ EXPIRED: ${position.symbol} - idea expired @ ₹${currentPrice.toFixed(2)} (${unrealizedPnLPercent.toFixed(1)}%)`
            };
        }

        // Still open
        return {
            shouldExit: false,
            currentPrice,
            unrealizedPnL,
            unrealizedPnLPercent,
            distanceToTarget: ((targetPrice - currentPrice) / currentPrice * 100).toFixed(2) + '%',
            distanceToStop: ((currentPrice - stopPrice) / currentPrice * 100).toFixed(2) + '%'
        };
    }

    /**
     * Close a position (manual or automatic)
     */
    async closePosition(positionId, exitPrice, exitReason = 'MANUAL') {
        const position = await this.getPosition(positionId);
        if (!position || position.status !== 'OPEN') {
            return { error: 'Position not found or already closed' };
        }

        // Calculate final P&L
        const pnl = (exitPrice - position.entryPrice) * position.quantity;
        const pnlPercent = ((exitPrice - position.entryPrice) / position.entryPrice) * 100;
        const holdingDays = Math.floor((Date.now() - new Date(position.entryDate).getTime()) / (24 * 60 * 60 * 1000));

        // Update position
        const closedPosition = await prisma.position.update({
            where: { id: positionId },
            data: {
                status: 'CLOSED',
                exitPrice: exitPrice,
                exitDate: new Date(),
                exitReason: exitReason,
                realizedPnL: pnl,
                realizedPnLPercent: pnlPercent,
                holdingDays: holdingDays
            }
        });

        console.log(`[ExitMonitor] Position closed: ${position.symbol} | P&L: ₹${pnl.toFixed(0)} (${pnlPercent.toFixed(1)}%) | Reason: ${exitReason}`);

        // Record the trade outcome for learning
        await this.recordTradeOutcome(closedPosition);

        return {
            position: closedPosition,
            pnl,
            pnlPercent,
            holdingDays,
            isWinner: pnl > 0
        };
    }

    // ============================================================
    // BATCH MONITORING
    // ============================================================

    /**
     * Monitor all open positions against current prices
     * This should be called periodically (every few minutes during market hours)
     */
    async monitorAllPositions(priceProvider) {
        const openPositions = await this.getOpenPositions();

        if (openPositions.length === 0) {
            return { checked: 0, alerts: [], updates: [] };
        }

        console.log(`[ExitMonitor] Checking ${openPositions.length} open positions...`);

        const alerts = [];
        const updates = [];

        for (const position of openPositions) {
            // Get current price (from provider or cache)
            const currentPrice = await priceProvider(position.symbol);

            if (!currentPrice) {
                console.log(`[ExitMonitor] No price for ${position.symbol}, skipping`);
                continue;
            }

            // Check exit conditions
            const result = this.checkExitCondition(position, currentPrice);

            if (result.shouldExit) {
                alerts.push({
                    positionId: position.id,
                    symbol: position.symbol,
                    ...result
                });

                // Auto-close if target/stop hit
                if (result.reason === 'TARGET_HIT' || result.reason === 'STOP_HIT') {
                    await this.closePosition(position.id, result.exitPrice, result.reason);
                }
            } else {
                updates.push({
                    positionId: position.id,
                    symbol: position.symbol,
                    currentPrice,
                    unrealizedPnL: result.unrealizedPnL,
                    unrealizedPnLPercent: result.unrealizedPnLPercent,
                    distanceToTarget: result.distanceToTarget,
                    distanceToStop: result.distanceToStop
                });
            }
        }

        return {
            checked: openPositions.length,
            alerts,
            updates,
            summary: {
                openPositions: openPositions.length - alerts.filter(a => a.shouldExit).length,
                targetsHit: alerts.filter(a => a.reason === 'TARGET_HIT').length,
                stopsHit: alerts.filter(a => a.reason === 'STOP_HIT').length,
                expired: alerts.filter(a => a.reason === 'TIME_EXPIRED').length
            }
        };
    }

    // ============================================================
    // TRADE JOURNAL
    // ============================================================

    /**
     * Record trade outcome for future learning
     */
    async recordTradeOutcome(closedPosition) {
        try {
            await prisma.tradeJournal.create({
                data: {
                    positionId: closedPosition.id,
                    symbol: closedPosition.symbol,
                    categoryKey: closedPosition.categoryKey,

                    // Entry
                    entryPrice: closedPosition.entryPrice,
                    entryDate: closedPosition.entryDate,

                    // Exit
                    exitPrice: closedPosition.exitPrice,
                    exitDate: closedPosition.exitDate,
                    exitReason: closedPosition.exitReason,

                    // Outcome
                    quantity: closedPosition.quantity,
                    pnl: closedPosition.realizedPnL,
                    pnlPercent: closedPosition.realizedPnLPercent,
                    holdingDays: closedPosition.holdingDays,
                    isWinner: closedPosition.realizedPnL > 0,

                    // Original targets
                    targetPrice: closedPosition.targetPrice,
                    stopPrice: closedPosition.stopPrice,

                    // Signal quality metrics
                    eventScore: closedPosition.signalData?.eventScore || null,
                    similarityScore: closedPosition.signalData?.similarityScore || null,
                    confidence: closedPosition.signalData?.confidence || null
                }
            });

            console.log(`[ExitMonitor] Trade recorded in journal: ${closedPosition.symbol}`);
        } catch (error) {
            // Table might not exist yet - create it
            console.log(`[ExitMonitor] Journal record skipped: ${error.message}`);
        }
    }

    /**
     * Get trade history with performance stats
     */
    async getTradeHistory(options = {}) {
        const { categoryKey, limit = 50 } = options;

        const where = {};
        if (categoryKey) where.categoryKey = categoryKey;

        try {
            const trades = await prisma.tradeJournal.findMany({
                where,
                orderBy: { exitDate: 'desc' },
                take: limit
            });

            // Calculate stats
            const winners = trades.filter(t => t.isWinner);
            const losers = trades.filter(t => !t.isWinner);
            const totalPnL = trades.reduce((sum, t) => sum + (t.pnl || 0), 0);
            const avgWin = winners.length > 0 ? winners.reduce((sum, t) => sum + t.pnl, 0) / winners.length : 0;
            const avgLoss = losers.length > 0 ? losers.reduce((sum, t) => sum + t.pnl, 0) / losers.length : 0;

            return {
                trades,
                stats: {
                    totalTrades: trades.length,
                    winners: winners.length,
                    losers: losers.length,
                    winRate: trades.length > 0 ? (winners.length / trades.length * 100).toFixed(1) + '%' : '0%',
                    totalPnL: totalPnL.toFixed(0),
                    avgWin: avgWin.toFixed(0),
                    avgLoss: avgLoss.toFixed(0),
                    expectancy: trades.length > 0
                        ? ((winners.length / trades.length * avgWin) + (losers.length / trades.length * avgLoss)).toFixed(0)
                        : 0
                }
            };
        } catch (error) {
            return { trades: [], stats: {}, error: error.message };
        }
    }

    // ============================================================
    // PERFORMANCE ANALYTICS
    // ============================================================

    /**
     * Get performance by category
     */
    async getPerformanceByCategory() {
        try {
            const allTrades = await prisma.tradeJournal.findMany({
                orderBy: { exitDate: 'desc' }
            });

            const byCategory = {};
            for (const trade of allTrades) {
                const cat = trade.categoryKey || 'UNKNOWN';
                if (!byCategory[cat]) {
                    byCategory[cat] = { winners: 0, losers: 0, totalPnL: 0, trades: [] };
                }
                byCategory[cat].trades.push(trade);
                if (trade.isWinner) byCategory[cat].winners++;
                else byCategory[cat].losers++;
                byCategory[cat].totalPnL += trade.pnl || 0;
            }

            const summary = Object.entries(byCategory).map(([cat, data]) => ({
                categoryKey: cat,
                trades: data.trades.length,
                winRate: data.trades.length > 0 ? (data.winners / data.trades.length * 100).toFixed(1) + '%' : '0%',
                totalPnL: data.totalPnL.toFixed(0),
                avgPnL: data.trades.length > 0 ? (data.totalPnL / data.trades.length).toFixed(0) : 0
            }));

            return summary.sort((a, b) => parseFloat(b.totalPnL) - parseFloat(a.totalPnL));
        } catch (error) {
            return [];
        }
    }

    /**
     * Get portfolio summary
     */
    async getPortfolioSummary() {
        const openPositions = await this.getOpenPositions();

        const totalInvested = openPositions.reduce((sum, p) => sum + p.positionValue, 0);
        const totalRiskAmount = openPositions.reduce((sum, p) => sum + p.riskAmount, 0);
        const categoryBreakdown = {};

        for (const pos of openPositions) {
            const cat = pos.categoryKey || 'UNKNOWN';
            if (!categoryBreakdown[cat]) categoryBreakdown[cat] = 0;
            categoryBreakdown[cat]++;
        }

        return {
            openPositions: openPositions.length,
            totalInvested: totalInvested.toFixed(0),
            totalRiskAmount: totalRiskAmount.toFixed(0),
            categoryBreakdown,
            positions: openPositions.map(p => ({
                symbol: p.symbol,
                entryPrice: p.entryPrice,
                targetPrice: p.targetPrice,
                stopPrice: p.stopPrice,
                quantity: p.quantity,
                daysHeld: Math.floor((Date.now() - new Date(p.entryDate).getTime()) / (24 * 60 * 60 * 1000))
            }))
        };
    }
}

module.exports = new ExitMonitorService();
