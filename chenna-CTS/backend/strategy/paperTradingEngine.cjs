/**
 * Paper Trading Engine
 * 
 * Risk-free simulation of live trading
 * Builds confidence before deploying real capital
 * 
 * Features:
 * - Real-time signal monitoring
 * - Simulated order execution
 * - Position tracking
 * - P&L calculation
 * - Performance metrics
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const DailySimulation = require('./dailySimulation.cjs');
const V1StrategyGenerator = require('./v1Generator.cjs');

class PaperTradingEngine {

    constructor(initialCapital = 100000) {
        this.initialCapital = initialCapital;
        this.currentCapital = initialCapital;
        this.simulator = new DailySimulation();
    }

    /**
     * Run paper trading session
     * Simulates what would happen if trading V1 live
     */
    async runSession(categoryKey, date = new Date()) {
        console.log(`\n📄 Running Paper Trading Session - ${categoryKey}`);
        console.log(`💰 Capital: ₹${this.currentCapital.toLocaleString()}`);
        console.log(`===================================================\n`);

        const dateStr = date.toISOString().split('T')[0];

        // Step 1: Run daily simulation to get signals
        const dailyReport = await this.simulator.runToday(categoryKey, { date });

        // Step 2: Process accepted signals (simulate entries)
        const newPositions = [];

        for (const signal of dailyReport.acceptedSignals) {
            // Check if we have capital and position slots
            const canTrade = await this.validatePositionEntry(signal);

            if (!canTrade.allowed) {
                console.log(`⚠️ ${signal.symbol}: ${canTrade.reason}`);
                continue;
            }

            // Calculate position size
            const positionSize = this.calculatePositionSize(signal);

            // Simulate entry
            const position = {
                symbol: signal.symbol,
                mode: 'PAPER',
                categoryKey,
                entryDate: dateStr,
                entryPrice: signal.currentPrice,
                targetPrice: parseFloat(signal.projectedTarget),
                stopPrice: parseFloat(signal.projectedStop),
                quantity: positionSize.quantity,
                capital: positionSize.capital,
                status: 'OPEN',
                signalConfidence: signal.confidence
            };

            await this.savePosition(position);
            newPositions.push(position);

            // Deduct capital
            this.currentCapital -= positionSize.capital;

            console.log(`✅ ENTRY: ${signal.symbol} @ ₹${signal.currentPrice}`);
            console.log(`   Qty: ${positionSize.quantity}, Capital: ₹${positionSize.capital}`);
            console.log(`   Target: ₹${position.targetPrice}, Stop: ₹${position.stopPrice}`);
        }

        // Step 3: Monitor and update open positions
        const closedPositions = await this.updateOpenPositions(dateStr);

        // Step 4: Calculate session performance
        const performance = {
            date: dateStr,
            category: categoryKey,
            signalsAnalyzed: dailyReport.analysis.signalsGenerated,
            signalsAccepted: dailyReport.analysis.signalsAccepted,
            newPositions: newPositions.length,
            closedPositions: closedPositions.length,
            openPositions: await this.getOpenPositionsCount(),
            currentCapital: this.currentCapital,
            capitalDeployed: this.initialCapital - this.currentCapital,
            totalPnL: await this.calculateTotalPnL()
        };

        console.log(`\n===================================================`);
        console.log(`📊 SESSION SUMMARY:`);
        console.log(`   New Entries: ${newPositions.length}`);
        console.log(`   Exits: ${closedPositions.length}`);
        console.log(`   Open Positions: ${performance.openPositions}`);
        console.log(`   Capital Available: ₹${this.currentCapital.toLocaleString()}`);
        console.log(`   Total P&L: ₹${performance.totalPnL.toLocaleString()}`);
        console.log(`===================================================\n`);

        return performance;
    }

    /**
     * Update open positions (check exits)
     */
    async updateOpenPositions(currentDate) {
        const openPositions = await prisma.paperPosition.findMany({
            where: {
                mode: 'PAPER',
                status: 'OPEN'
            }
        });

        const closedPositions = [];

        for (const position of openPositions) {
            // Get current price (in real implementation, fetch from market)
            // For paper trading, simulate price movement
            const currentPrice = await this.getCurrentPrice(position.symbol);

            let shouldClose = false;
            let exitReason = null;
            let exitPrice = currentPrice;

            // Check exit conditions
            if (currentPrice >= position.targetPrice) {
                shouldClose = true;
                exitReason = 'TARGET';
                exitPrice = position.targetPrice;
            } else if (currentPrice <= position.stopPrice) {
                shouldClose = true;
                exitReason = 'STOP';
                exitPrice = position.stopPrice;
            } else if (this.isMaxSession(position, currentDate)) {
                shouldClose = true;
                exitReason = 'TIME';
                exitPrice = currentPrice;
            }

            if (shouldClose) {
                const pnl = (exitPrice - position.entryPrice) * position.quantity;

                await prisma.paperPosition.update({
                    where: { id: position.id },
                    data: {
                        status: 'CLOSED',
                        exitDate: currentDate,
                        exitPrice,
                        exitReason,
                        pnl
                    }
                });

                // Return capital
                this.currentCapital += position.capital + pnl;

                closedPositions.push({
                    ...position,
                    exitPrice,
                    exitReason,
                    pnl
                });

                const pnlSign = pnl >= 0 ? '✅' : '❌';
                console.log(`${pnlSign} EXIT: ${position.symbol} @ ₹${exitPrice} (${exitReason})`);
                console.log(`   P&L: ₹${pnl.toFixed(2)}`);
            }
        }

        return closedPositions;
    }

    /**
     * Calculate position size based on risk management
     */
    calculatePositionSize(signal) {
        const riskPerTrade = 0.01; // 1% risk per trade
        const maxCapitalPerTrade = 0.05; // 5% max capital per trade

        const entryPrice = parseFloat(signal.currentPrice);
        const stopPrice = parseFloat(signal.projectedStop);
        const riskPerShare = entryPrice - stopPrice;

        // Calculate quantity based on risk
        const riskAmount = this.currentCapital * riskPerTrade;
        const quantityByRisk = Math.floor(riskAmount / riskPerShare);

        // Calculate quantity based on max capital
        const maxCapital = this.currentCapital * maxCapitalPerTrade;
        const quantityByCapital = Math.floor(maxCapital / entryPrice);

        // Use smaller quantity (more conservative)
        const quantity = Math.min(quantityByRisk, quantityByCapital);
        const actualCapital = quantity * entryPrice;

        return {
            quantity,
            capital: actualCapital,
            riskAmount: quantity * riskPerShare
        };
    }

    /**
     * Validate if position can be entered
     */
    async validatePositionEntry(signal) {
        // Check capital
        if (this.currentCapital < 5000) {
            return { allowed: false, reason: 'Insufficient capital (min ₹5,000)' };
        }

        // Check max positions
        const openCount = await this.getOpenPositionsCount();
        if (openCount >= 3) {
            return { allowed: false, reason: 'Max positions limit (3)' };
        }

        // Check signal confidence
        if (parseFloat(signal.confidence) < 0.7) {
            return { allowed: false, reason: 'Low signal confidence' };
        }

        return { allowed: true };
    }

    /**
     * Generate performance report
     */
    async generatePerformanceReport() {
        const allPositions = await prisma.paperPosition.findMany({
            where: { mode: 'PAPER' },
            orderBy: { entryDate: 'desc' }
        });

        const closedPositions = allPositions.filter(p => p.status === 'CLOSED');
        const winners = closedPositions.filter(p => p.pnl > 0);
        const losers = closedPositions.filter(p => p.pnl <= 0);

        const totalPnL = closedPositions.reduce((sum, p) => sum + (p.pnl || 0), 0);
        const winRate = closedPositions.length > 0
            ? (winners.length / closedPositions.length) * 100
            : 0;

        const avgWin = winners.length > 0
            ? winners.reduce((sum, p) => sum + p.pnl, 0) / winners.length
            : 0;

        const avgLoss = losers.length > 0
            ? losers.reduce((sum, p) => sum + Math.abs(p.pnl), 0) / losers.length
            : 0;

        return {
            initialCapital: this.initialCapital,
            currentCapital: this.currentCapital,
            totalPnL,
            totalTrades: closedPositions.length,
            winners: winners.length,
            losers: losers.length,
            winRate: parseFloat(winRate.toFixed(2)),
            avgWin: parseFloat(avgWin.toFixed(2)),
            avgLoss: parseFloat(avgLoss.toFixed(2)),
            profitFactor: avgLoss > 0 ? (avgWin / avgLoss).toFixed(2) : 0,
            openPositions: allPositions.filter(p => p.status === 'OPEN').length
        };
    }

    // ==================== HELPERS ====================

    async savePosition(position) {
        return await prisma.paperPosition.create({
            data: position
        });
    }

    async getOpenPositionsCount() {
        return await prisma.paperPosition.count({
            where: {
                mode: 'PAPER',
                status: 'OPEN'
            }
        });
    }

    async getCurrentPrice(symbol) {
        // In production: fetch from broker API
        // For paper trading: return cached price or simulate
        const cached = await prisma.ohlcvCache.findFirst({
            where: { symbol, interval: 'day' },
            orderBy: { createdAt: 'desc' }
        });

        if (!cached) return null;

        const candles = JSON.parse(cached.data);
        return candles[candles.length - 1].close;
    }

    isMaxSession(position, currentDate) {
        const entryDate = new Date(position.entryDate);
        const current = new Date(currentDate);
        const daysDiff = Math.floor((current - entryDate) / (1000 * 60 * 60 * 24));
        return daysDiff >= 10; // Max 10 trading sessions
    }

    async calculateTotalPnL() {
        const closedPositions = await prisma.paperPosition.findMany({
            where: {
                mode: 'PAPER',
                status: 'CLOSED'
            }
        });

        return closedPositions.reduce((sum, p) => sum + (p.pnl || 0), 0);
    }
}

module.exports = PaperTradingEngine;
