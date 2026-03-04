/**
 * Tracking Service
 * Manages stock eligibility for live tracking based on category rules
 */

const { PrismaClient } = require('@prisma/client');
const {
    getCategoryConfig,
    isWithinTrackingWindow,
    getTrackingExpiryDate,
    isSwingCategory,
    isIntradayCategory
} = require('../config/categoryConfig.cjs');

const prisma = new PrismaClient();
const { todayIST, startOfDayUTC, importDateIST } = require('../utils/istUtils.cjs');

class TrackingService {
    constructor() {
        this.eligibilityCache = new Map();
        this.cacheExpiry = 5 * 60 * 1000; // 5 minute cache
    }

    /**
     * Get stocks that are eligible for live tracking in a category
     * Only returns stocks within their tracking window
     */
    async getEligibleStocks(categoryKey) {
        const category = await prisma.category.findUnique({
            where: { key: categoryKey },
            include: {
                stocks: {
                    include: { stock: true }
                }
            }
        });

        if (!category) return [];

        const config = getCategoryConfig(categoryKey);
        const eligible = [];
        const expired = [];

        for (const stockCat of category.stocks) {
            const addedDate = stockCat.addedDate;

            if (isWithinTrackingWindow(addedDate, categoryKey)) {
                eligible.push({
                    symbol: stockCat.stock.symbol,
                    name: stockCat.stock.name,
                    addedDate: addedDate,
                    expiresAt: getTrackingExpiryDate(addedDate, categoryKey),
                    daysRemaining: this.calculateDaysRemaining(addedDate, categoryKey)
                });
            } else {
                expired.push(stockCat.stock.symbol);
            }
        }

        console.log(`[Tracking] ${categoryKey}: ${eligible.length} eligible, ${expired.length} expired`);

        return eligible;
    }

    /**
     * Calculate days remaining in tracking window
     */
    calculateDaysRemaining(addedDate, categoryKey) {
        if (!addedDate) return 0;

        const config = getCategoryConfig(categoryKey);
        const todayStart = startOfDayUTC(todayIST());

        const added = new Date(addedDate);
        const addedMidnight = new Date(Date.UTC(added.getUTCFullYear(), added.getUTCMonth(), added.getUTCDate()));

        const expiryDate = new Date(addedMidnight);
        expiryDate.setDate(expiryDate.getDate() + config.trackingDays);

        const diffTime = expiryDate.getTime() - todayStart.getTime();
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

        return Math.max(0, diffDays);
    }

    /**
     * Check if a specific stock-category combination is eligible
     */
    async isStockEligible(symbol, categoryKey) {
        const stockCat = await prisma.stockCategory.findFirst({
            where: {
                stock: { symbol },
                category: { key: categoryKey }
            }
        });

        if (!stockCat) return false;

        return isWithinTrackingWindow(stockCat.addedDate, categoryKey);
    }

    /**
     * Get all eligible stocks across all categories
     * Grouped by category type (Swing vs Intraday)
     */
    async getAllEligibleStocks() {
        const categories = await prisma.category.findMany({
            include: {
                stocks: {
                    include: { stock: true }
                }
            }
        });

        const swingStocks = [];
        const intradayStocks = [];

        for (const category of categories) {
            for (const stockCat of category.stocks) {
                if (!isWithinTrackingWindow(stockCat.addedDate, category.key)) {
                    continue;
                }

                const stockInfo = {
                    symbol: stockCat.stock.symbol,
                    categoryKey: category.key,
                    addedDate: stockCat.addedDate,
                    daysRemaining: this.calculateDaysRemaining(stockCat.addedDate, category.key)
                };

                if (isSwingCategory(category.key)) {
                    swingStocks.push(stockInfo);
                } else if (isIntradayCategory(category.key)) {
                    intradayStocks.push(stockInfo);
                }
            }
        }

        return {
            swing: swingStocks,
            intraday: intradayStocks,
            totalSwing: swingStocks.length,
            totalIntraday: intradayStocks.length
        };
    }

    /**
     * Get tracking summary for a category
     */
    async getTrackingSummary(categoryKey) {
        const config = getCategoryConfig(categoryKey);
        const eligible = await this.getEligibleStocks(categoryKey);

        return {
            categoryKey,
            categoryType: config.type,
            trackingDays: config.trackingDays,
            scanIntervalMin: config.scanIntervalMin,
            eligibleStocks: eligible.length,
            stocks: eligible
        };
    }

    /**
     * Get today's intraday stocks only
     * For intraday categories, only stocks added TODAY are eligible
     */
    async getTodaysIntradayStocks() {
        const todayUTC = importDateIST();

        const categories = await prisma.category.findMany({
            include: {
                stocks: {
                    include: { stock: true },
                    where: {
                        addedDate: todayUTC
                    }
                }
            }
        });

        const intradayStocks = [];

        for (const category of categories) {
            if (!isIntradayCategory(category.key)) continue;

            for (const stockCat of category.stocks) {
                intradayStocks.push({
                    symbol: stockCat.stock.symbol,
                    categoryKey: category.key,
                    addedDate: stockCat.addedDate
                });
            }
        }

        return intradayStocks;
    }

    /**
     * Clean up expired tracking entries (for maintenance)
     */
    async getExpiredStocks() {
        const categories = await prisma.category.findMany({
            include: {
                stocks: {
                    include: { stock: true }
                }
            }
        });

        const expired = [];

        for (const category of categories) {
            for (const stockCat of category.stocks) {
                if (!isWithinTrackingWindow(stockCat.addedDate, category.key)) {
                    expired.push({
                        symbol: stockCat.stock.symbol,
                        categoryKey: category.key,
                        addedDate: stockCat.addedDate,
                        expiredAt: getTrackingExpiryDate(stockCat.addedDate, category.key)
                    });
                }
            }
        }

        return expired;
    }
}

module.exports = new TrackingService();
