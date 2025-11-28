/**
 * Risk Manager
 * 
 * Safety guardrails for live trading
 * Prevents catastrophic losses through strict rule enforcement
 * 
 * Hard Limits (Cannot be overridden):
 * - Max ₹1,000 loss per trade
 * - Max 3 open positions
 * - Max 2% daily capital risk
 * - Mandatory stop-loss
 * - Min 1.5:1 reward:risk
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

class RiskManager {

    constructor(config = {}) {
        // Hard limits (cannot be changed)
        this.HARD_LIMITS = {
            maxLossPerTrade: 1000,          // ₹1,000 max loss
            maxOpenPositions: 3,             // Maximum 3 concurrent trades
            maxDailyRisk: 0.02,              // 2% of capital per day
            stopLossRequired: true,          // Mandatory stop loss
            minRewardRisk: 1.5               // Minimum 1.5:1 R:R
        };

        // Soft limits (can be configured)
        this.config = {
            maxPositionSize: config.maxPositionSize || 0.05,  // 5% of capital per trade
            minSignalConfidence: config.minSignalConfidence || 0.7,  // 70% min confidence
            maxHoldingSessions: config.maxHoldingSessions || 10,     // 10 max sessions
            riskPerTrade: config.riskPerTrade || 0.01                // 1% risk per trade
        };

        this.totalCapital = config.initialCapital || 100000;
    }

    /**
     * Validate if trade meets all risk criteria
     * Returns: { passed: boolean, reason?: string, warnings?: string[] }
     */
    async validateTrade(signal, mode = 'LIVE') {
        const checks = [];
        const warnings = [];

        // 1. Capital availability check
        const availableCapital = await this.getAvailableCapital(mode);
        const requiredCapital = signal.quantity * signal.currentPrice;

        if (availableCapital < requiredCapital) {
            return {
                passed: false,
                reason: `Insufficient capital: Required ₹${requiredCapital}, Available ₹${availableCapital}`
            };
        }

        // 2. Position size check (soft limit)
        const positionSize = requiredCapital / this.totalCapital;
        if (positionSize > this.config.maxPositionSize) {
            return {
                passed: false,
                reason: `Position size ${(positionSize * 100).toFixed(1)}% exceeds limit ${(this.config.maxPositionSize * 100)}%`
            };
        }

        // 3. Max loss per trade check (HARD LIMIT)
        const entryPrice = parseFloat(signal.currentPrice);
        const stopPrice = parseFloat(signal.projectedStop);
        const lossPerShare = entryPrice - stopPrice;
        const maxLoss = lossPerShare * signal.quantity;

        if (maxLoss > this.HARD_LIMITS.maxLossPerTrade) {
            return {
                passed: false,
                reason: `Max loss ₹${maxLoss.toFixed(0)} exceeds hard limit ₹${this.HARD_LIMITS.maxLossPerTrade}`
            };
        }

        // 4. Daily risk check (HARD LIMIT)
        const dailyRiskExposure = await this.getDailyRiskExposure(mode);
        const newRisk = maxLoss / this.totalCapital;
        const totalRisk = dailyRiskExposure + newRisk;

        if (totalRisk > this.HARD_LIMITS.maxDailyRisk) {
            return {
                passed: false,
                reason: `Daily risk ${(totalRisk * 100).toFixed(1)}% exceeds limit ${(this.HARD_LIMITS.maxDailyRisk * 100)}%`
            };
        }

        // 5. Open positions check (HARD LIMIT)
        const openCount = await this.getOpenPositionsCount(mode);
        if (openCount >= this.HARD_LIMITS.maxOpenPositions) {
            return {
                passed: false,
                reason: `Max positions limit reached (${this.HARD_LIMITS.maxOpenPositions})`
            };
        }

        // 6. Reward:Risk ratio check (HARD LIMIT)
        const targetPrice = parseFloat(signal.projectedTarget);
        const rewardPerShare = targetPrice - entryPrice;
        const rewardRiskRatio = rewardPerShare / lossPerShare;

        if (rewardRiskRatio < this.HARD_LIMITS.minRewardRisk) {
            return {
                passed: false,
                reason: `R:R ratio ${rewardRiskRatio.toFixed(2)}:1 below minimum ${this.HARD_LIMITS.minRewardRisk}:1`
            };
        }

        // 7. Stop loss check (HARD LIMIT)
        if (!signal.projectedStop || signal.projectedStop >= signal.currentPrice) {
            return {
                passed: false,
                reason: 'Stop loss is mandatory and must be below entry price'
            };
        }

        // 8. Signal confidence check (soft limit)
        const confidence = parseFloat(signal.confidence);
        if (confidence < this.config.minSignalConfidence) {
            return {
                passed: false,
                reason: `Signal confidence ${(confidence * 100).toFixed(0)}% below minimum ${(this.config.minSignalConfidence * 100)}%`
            };
        }

        // 9. Trap detection check
        if (signal.trapDetected) {
            return {
                passed: false,
                reason: `Institutional traps detected: ${signal.trapTypes.join(', ')}`
            };
        }

        // All checks passed
        // Add warnings for edge cases
        if (positionSize > 0.03) {
            warnings.push('Position size >3% of capital - consider reducing');
        }

        if (rewardRiskRatio < 2.0) {
            warnings.push('R:R ratio <2:1 - prefer higher reward setups');
        }

        return {
            passed: true,
            warnings: warnings.length > 0 ? warnings : undefined,
            metrics: {
                positionSize: (positionSize * 100).toFixed(1) + '%',
                maxLoss: '₹' + maxLoss.toFixed(0),
                rewardRisk: rewardRiskRatio.toFixed(2) + ':1',
                dailyRisk: (totalRisk * 100).toFixed(1) + '%'
            }
        };
    }

    /**
     * Calculate safe position size
     */
    calculatePositionSize(entryPrice, stopPrice, mode = 'LIVE') {
        const riskAmount = this.totalCapital * this.config.riskPerTrade;
        const riskPerShare = entryPrice - stopPrice;

        if (riskPerShare <= 0) {
            throw new Error('Stop price must be below entry price');
        }

        // Calculate quantity based on risk
        let quantity = Math.floor(riskAmount / riskPerShare);

        // Apply max loss cap
        const maxLoss = quantity * riskPerShare;
        if (maxLoss > this.HARD_LIMITS.maxLossPerTrade) {
            quantity = Math.floor(this.HARD_LIMITS.maxLossPerTrade / riskPerShare);
        }

        // Apply max position size cap
        const maxCapital = this.totalCapital * this.config.maxPositionSize;
        const quantityByCapital = Math.floor(maxCapital / entryPrice);
        quantity = Math.min(quantity, quantityByCapital);

        const actualCapital = quantity * entryPrice;
        const actualRisk = quantity * riskPerShare;

        return {
            quantity,
            capital: actualCapital,
            riskAmount: actualRisk,
            riskPercent: (actualRisk / this.totalCapital * 100).toFixed(2) + '%'
        };
    }

    /**
     * Emergency stop - halt all trading
     */
    async emergencyStop(reason) {
        console.error(`🚨 EMERGENCY STOP: ${reason}`);

        // Mark all pending orders as cancelled
        await prisma.position.updateMany({
            where: {
                status: 'PENDING',
                mode: 'LIVE'
            },
            data: {
                status: 'CANCELLED',
                exitReason: `EMERGENCY: ${reason}`
            }
        });

        // Log emergency stop
        await prisma.systemEvent.create({
            data: {
                type: 'EMERGENCY_STOP',
                reason,
                timestamp: new Date()
            }
        });

        return {
            stopped: true,
            reason,
            timestamp: new Date()
        };
    }

    /**
     * Daily risk check - run every morning
     */
    async dailyRiskCheck() {
        const openPositions = await this.getOpenPositionsCount('LIVE');
        const dailyRisk = await this.getDailyRiskExposure('LIVE');
        const availableCapital = await this.getAvailableCapital('LIVE');

        const status = {
            date: new Date().toISOString().split('T')[0],
            openPositions,
            dailyRiskExposure: (dailyRisk * 100).toFixed(1) + '%',
            availableCapital: '₹' + availableCapital.toLocaleString(),
            canTrade: dailyRisk < this.HARD_LIMITS.maxDailyRisk && openPositions < this.HARD_LIMITS.maxOpenPositions,
            warnings: []
        };

        // Generate warnings
        if (dailyRisk > 0.015) {
            status.warnings.push('Daily risk >1.5% - approaching limit');
        }

        if (openPositions >= 2) {
            status.warnings.push('2+ positions open - approaching limit');
        }

        if (availableCapital < this.totalCapital * 0.5) {
            status.warnings.push('Available capital <50% - high deployment');
        }

        return status;
    }

    // ==================== HELPERS ====================

    async getAvailableCapital(mode) {
        const deployed = await prisma.position.aggregate({
            where: {
                mode: mode.toUpperCase(),
                status: 'OPEN'
            },
            _sum: {
                capital: true
            }
        });

        return this.totalCapital - (deployed._sum.capital || 0);
    }

    async getDailyRiskExposure(mode) {
        const today = new Date().toISOString().split('T')[0];

        const positions = await prisma.position.findMany({
            where: {
                mode: mode.toUpperCase(),
                OR: [
                    { status: 'OPEN' },
                    { entryDate: { gte: new Date(today) } }
                ]
            }
        });

        const totalRisk = positions.reduce((sum, p) => {
            const risk = (p.entryPrice - p.stopPrice) * p.quantity;
            return sum + risk;
        }, 0);

        return totalRisk / this.totalCapital;
    }

    async getOpenPositionsCount(mode) {
        return await prisma.position.count({
            where: {
                mode: mode.toUpperCase(),
                status: 'OPEN'
            }
        });
    }
}

module.exports = RiskManager;
