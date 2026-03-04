/**
 * Position Sizing Service
 * 
 * PURPOSE: Calculate proper position sizes based on risk management rules
 * 
 * Core Principle: Never risk more than X% of capital on any single trade
 * 
 * The Formula:
 * Position Size (₹) = (Account Size × Risk %) / Stop Loss %
 * Quantity = Position Size / Entry Price
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

class PositionSizingService {

    constructor() {
        // Default configuration (can be overridden per user)
        this.defaultConfig = {
            // Risk Management
            riskPerTradePercent: 1.0,      // Risk 1% of capital per trade
            maxRiskPerTradePercent: 2.0,   // Never exceed 2% on any trade

            // Position Limits
            maxOpenPositions: 5,            // Max 5 concurrent trades
            maxPositionSizePercent: 20,     // Max 20% of capital in one stock
            minPositionSize: 5000,          // Minimum ₹5,000 per trade

            // Category Limits
            maxPerCategory: 2,              // Max 2 stocks from same category

            // Capital (default - should be set per user)
            defaultCapital: 100000          // ₹1 Lakh default
        };
    }

    /**
     * Calculate position size for a trade signal
     * 
     * @param {Object} signal - Signal with entry, stop loss
     * @param {Object} options - Account settings
     * @returns {Object} Position sizing details
     */
    calculatePositionSize(signal, options = {}) {
        const config = { ...this.defaultConfig, ...options };
        const capital = config.capital || config.defaultCapital;

        // Extract prices from signal
        const entryPrice = signal.price || signal.entry;
        const stopLoss = signal.stop || signal.stopLoss;
        const targetPrice = signal.target || signal.targetPrice;

        if (!entryPrice || !stopLoss) {
            return {
                valid: false,
                reason: 'Missing entry or stop loss price',
                quantity: 0,
                positionValue: 0
            };
        }

        // Calculate stop loss percentage
        const stopLossPercent = Math.abs((entryPrice - stopLoss) / entryPrice) * 100;

        // Risk amount in rupees
        const riskAmount = capital * (config.riskPerTradePercent / 100);

        // Position size based on risk
        // Formula: If I lose (stopLossPercent)%, I should lose only (riskAmount)
        // So: positionValue × (stopLossPercent/100) = riskAmount
        // positionValue = riskAmount / (stopLossPercent/100)
        let positionValue = stopLossPercent > 0
            ? riskAmount / (stopLossPercent / 100)
            : 0;

        // Apply maximum position size limit
        const maxPosition = capital * (config.maxPositionSizePercent / 100);
        if (positionValue > maxPosition) {
            positionValue = maxPosition;
        }

        // Apply minimum position size
        if (positionValue < config.minPositionSize) {
            positionValue = config.minPositionSize;
        }

        // Calculate quantity
        let quantity = Math.floor(positionValue / entryPrice);

        // Ensure at least 1 share
        if (quantity < 1) quantity = 1;

        // Recalculate actual position value and risk
        const actualPositionValue = quantity * entryPrice;
        const actualRiskAmount = quantity * (entryPrice - stopLoss);
        const actualRiskPercent = (actualRiskAmount / capital) * 100;

        // Check if risk exceeds maximum
        const riskExceeded = actualRiskPercent > config.maxRiskPerTradePercent;

        // Calculate potential reward
        const potentialReward = targetPrice
            ? quantity * (targetPrice - entryPrice)
            : null;
        const rewardRiskRatio = potentialReward && actualRiskAmount > 0
            ? potentialReward / actualRiskAmount
            : null;

        return {
            valid: !riskExceeded,

            // Position details
            quantity,
            entryPrice,
            positionValue: actualPositionValue,

            // Stop loss
            stopLoss,
            stopLossPercent: stopLossPercent.toFixed(2) + '%',

            // Risk
            riskAmount: actualRiskAmount.toFixed(0),
            riskPercent: actualRiskPercent.toFixed(2) + '%',
            riskExceeded,

            // Reward (if target provided)
            targetPrice,
            potentialReward: potentialReward?.toFixed(0) || null,
            rewardRiskRatio: rewardRiskRatio?.toFixed(2) || null,

            // Context
            capitalUsed: capital,
            maxAllowedRisk: config.maxRiskPerTradePercent + '%',

            // Formatted for display
            summary: `Buy ${quantity} shares @ ₹${entryPrice.toFixed(2)} (₹${actualPositionValue.toFixed(0)}) | Risk: ₹${actualRiskAmount.toFixed(0)} (${actualRiskPercent.toFixed(1)}%)`
        };
    }

    /**
     * Check if adding a new position is within limits
     * 
     * @param {Object} newSignal - Proposed new signal
     * @param {Array} existingPositions - Current open positions
     * @param {Object} options - Configuration
     */
    checkPositionLimits(newSignal, existingPositions = [], options = {}) {
        const config = { ...this.defaultConfig, ...options };
        const capital = config.capital || config.defaultCapital;

        const violations = [];
        const warnings = [];

        // Check max open positions
        if (existingPositions.length >= config.maxOpenPositions) {
            violations.push({
                rule: 'max_positions',
                message: `Maximum ${config.maxOpenPositions} positions already open`,
                current: existingPositions.length,
                limit: config.maxOpenPositions
            });
        }

        // Check category limit
        const categoryKey = newSignal.categoryKey || newSignal.category;
        const sameCategoryCount = existingPositions.filter(
            p => p.categoryKey === categoryKey || p.category === categoryKey
        ).length;

        if (sameCategoryCount >= config.maxPerCategory) {
            violations.push({
                rule: 'max_per_category',
                message: `Maximum ${config.maxPerCategory} trades from ${categoryKey} already`,
                current: sameCategoryCount,
                limit: config.maxPerCategory
            });
        }

        // Check duplicate symbol
        const symbolExists = existingPositions.some(
            p => p.symbol === newSignal.symbol
        );
        if (symbolExists) {
            violations.push({
                rule: 'duplicate_symbol',
                message: `Already have a position in ${newSignal.symbol}`
            });
        }

        // Check total exposure
        const totalCurrentExposure = existingPositions.reduce(
            (sum, p) => sum + (p.positionValue || p.quantity * p.entryPrice || 0),
            0
        );
        const exposurePercent = (totalCurrentExposure / capital) * 100;

        if (exposurePercent > 80) {
            warnings.push({
                rule: 'high_exposure',
                message: `High exposure: ${exposurePercent.toFixed(1)}% of capital deployed`
            });
        }

        return {
            allowed: violations.length === 0,
            violations,
            warnings,
            currentExposure: exposurePercent.toFixed(1) + '%',
            openPositions: existingPositions.length
        };
    }

    /**
     * Size multiple signals with portfolio awareness
     * 
     * @param {Array} signals - Array of signals to size
     * @param {Array} existingPositions - Current positions
     * @param {Object} options - Configuration
     */
    sizePortfolio(signals, existingPositions = [], options = {}) {
        const config = { ...this.defaultConfig, ...options };
        const capital = config.capital || config.defaultCapital;

        const sized = [];
        const rejected = [];

        // Calculate remaining capacity
        let remainingPositions = config.maxOpenPositions - existingPositions.length;
        let usedCapital = existingPositions.reduce(
            (sum, p) => sum + (p.positionValue || 0),
            0
        );

        for (const signal of signals) {
            // Check limits
            const limitCheck = this.checkPositionLimits(
                signal,
                [...existingPositions, ...sized],
                config
            );

            if (!limitCheck.allowed) {
                rejected.push({
                    signal,
                    reason: limitCheck.violations[0]?.message || 'Limit exceeded'
                });
                continue;
            }

            // Calculate size
            const sizing = this.calculatePositionSize(signal, {
                ...config,
                capital: capital - usedCapital // Size based on remaining capital
            });

            if (!sizing.valid) {
                rejected.push({
                    signal,
                    reason: sizing.reason || 'Risk exceeded'
                });
                continue;
            }

            sized.push({
                ...signal,
                sizing,
                quantity: sizing.quantity,
                positionValue: sizing.positionValue,
                riskAmount: sizing.riskAmount,
                riskPercent: sizing.riskPercent
            });

            usedCapital += sizing.positionValue;
            remainingPositions--;

            if (remainingPositions <= 0) break;
        }

        return {
            sized,
            rejected,
            summary: {
                totalSignals: signals.length,
                accepted: sized.length,
                rejected: rejected.length,
                totalCapitalAllocated: sized.reduce((s, p) => s + p.positionValue, 0),
                totalRiskAmount: sized.reduce((s, p) => s + parseFloat(p.riskAmount), 0),
                remainingSlots: remainingPositions
            }
        };
    }

    /**
     * Get recommended position size for different risk profiles
     */
    getRiskProfiles(signal) {
        const profiles = {
            conservative: this.calculatePositionSize(signal, { riskPerTradePercent: 0.5 }),
            moderate: this.calculatePositionSize(signal, { riskPerTradePercent: 1.0 }),
            aggressive: this.calculatePositionSize(signal, { riskPerTradePercent: 2.0 })
        };

        return {
            entryPrice: signal.price || signal.entry,
            stopLoss: signal.stop || signal.stopLoss,
            profiles: {
                conservative: {
                    name: 'Conservative (0.5% risk)',
                    quantity: profiles.conservative.quantity,
                    value: profiles.conservative.positionValue,
                    risk: profiles.conservative.riskAmount
                },
                moderate: {
                    name: 'Moderate (1% risk)',
                    quantity: profiles.moderate.quantity,
                    value: profiles.moderate.positionValue,
                    risk: profiles.moderate.riskAmount
                },
                aggressive: {
                    name: 'Aggressive (2% risk)',
                    quantity: profiles.aggressive.quantity,
                    value: profiles.aggressive.positionValue,
                    risk: profiles.aggressive.riskAmount
                }
            }
        };
    }

    /**
     * Calculate Kelly Criterion position size (advanced)
     * Based on win rate and reward:risk ratio
     */
    kellyPositionSize(winRate, rewardRiskRatio, capital, config = {}) {
        // Kelly % = W - [(1-W) / R]
        // W = win probability
        // R = reward/risk ratio

        const W = winRate / 100;
        const R = rewardRiskRatio;

        let kellyPercent = W - ((1 - W) / R);

        // Use half-Kelly for safety (industry standard)
        kellyPercent = kellyPercent / 2;

        // Bound between 0 and max risk
        const maxRisk = config.maxRiskPerTradePercent || this.defaultConfig.maxRiskPerTradePercent;
        kellyPercent = Math.max(0, Math.min(kellyPercent * 100, maxRisk));

        return {
            kellyPercent: kellyPercent.toFixed(2) + '%',
            positionValue: (capital * kellyPercent / 100).toFixed(0),
            halfKelly: true,
            inputs: { winRate, rewardRiskRatio }
        };
    }
}

module.exports = new PositionSizingService();
