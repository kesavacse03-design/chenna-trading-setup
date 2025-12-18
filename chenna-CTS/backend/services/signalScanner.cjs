/**
 * Signal Scanner Service
 * Scans stocks using promoted V1 strategy and generates live trading signals
 */

const { PrismaClient } = require('@prisma/client');
const TechnicalAnalysis = require('../strategy/comprehensiveTA.cjs');
const { getMarketRegime } = require('./regimeService.cjs');
const { getCategoryConfig, isWithinTrackingWindow } = require('../config/categoryConfig.cjs');
const trackingService = require('./trackingService.cjs');

const prisma = new PrismaClient();

class SignalScanner {
    constructor() {
        this.lastScanTime = null;
        this.activeSignals = [];
    }

    /**
     * Load V1 strategy from database for a category
     * Returns default strategy if V1 not found (graceful fallback)
     */
    async loadV1Strategy(categoryKey) {
        try {
            const category = await prisma.category.findUnique({
                where: { key: categoryKey }
            });

            if (!category) {
                console.warn(`[Scanner] Category ${categoryKey} not found, using default strategy`);
                return this.getDefaultStrategy(categoryKey);
            }

            const strategy = await prisma.strategy.findFirst({
                where: {
                    categoryId: category.id,
                    promoted: true,
                    version: 'V1'
                },
                orderBy: { updatedAt: 'desc' }
            });

            if (!strategy) {
                console.warn(`[Scanner] No V1 strategy for ${categoryKey}, using default`);
                return this.getDefaultStrategy(categoryKey);
            }

            return {
                id: strategy.id,
                description: strategy.description,
                rules: strategy.rules,
                metrics: strategy.metrics,
                categoryKey
            };
        } catch (error) {
            console.error(`[Scanner] Error loading V1 for ${categoryKey}:`, error.message);
            return this.getDefaultStrategy(categoryKey);
        }
    }

    /**
     * Default strategy fallback (RSI oversold < 30)
     */
    getDefaultStrategy(categoryKey) {
        return {
            id: 'default',
            description: 'Default RSI Oversold Strategy',
            rules: {
                entry: { logic: 'RSI Oversold 30', description: 'RSI < 30' },
                exit: { target: 2.5, stop: 1.5 }
            },
            metrics: { winRate: 50 },
            categoryKey,
            isDefault: true
        };
    }

    /**
     * Get stocks for a category
     */
    async getStocksForCategory(categoryKey) {
        const categoryStocks = await prisma.stockCategory.findMany({
            where: { category: { key: categoryKey } },
            include: { stock: true }
        });

        return categoryStocks.map(sc => sc.stock);
    }

    /**
     * Fetch latest candles for a stock from cache
     * @param {string} symbol - Stock symbol
     * @param {string} interval - 'day' for swing, '15minute' for intraday
     */
    async getLatestCandles(symbol, interval = 'day') {
        try {
            const cached = await prisma.ohlcvCache.findFirst({
                where: { symbol, interval },
                orderBy: { createdAt: 'desc' }
            });

            if (!cached || !cached.data) {
                // Fallback: if 15minute not found, try day
                if (interval !== 'day') {
                    return this.getLatestCandles(symbol, 'day');
                }
                return null;
            }

            let candles = cached.data;
            if (typeof candles === 'string') {
                candles = JSON.parse(candles);
            }

            // Normalize candles (handle both array and object formats)
            if (Array.isArray(candles)) {
                return candles.map(c => {
                    // Handle Upstox format: [timestamp, open, high, low, close, volume, oi]
                    if (Array.isArray(c)) {
                        return {
                            timestamp: c[0],
                            open: parseFloat(c[1]) || 0,
                            high: parseFloat(c[2]) || 0,
                            low: parseFloat(c[3]) || 0,
                            close: parseFloat(c[4]) || 0,
                            volume: parseInt(c[5]) || 0
                        };
                    }
                    return {
                        timestamp: c.timestamp || c.date,
                        open: parseFloat(c.open) || 0,
                        high: parseFloat(c.high) || 0,
                        low: parseFloat(c.low) || 0,
                        close: parseFloat(c.close) || 0,
                        volume: parseInt(c.volume) || 0
                    };
                }).filter(c => c.close > 0);
            }

            return null;
        } catch (error) {
            console.error(`[Scanner] Error loading candles for ${symbol}:`, error.message);
            return null;
        }
    }

    /**
     * Check if V1 entry conditions are met
     */
    checkV1Entry(v1Strategy, indicators, candles) {
        const rules = v1Strategy.rules?.entry;
        if (!rules) return { triggered: false };

        const logicName = rules.logic || '';

        // Parse the logic name to determine what to check
        // Examples: "RSI Oversold 30", "RSI < 40", "MACD Bullish Cross"

        let triggered = false;
        let reason = '';

        // RSI-based conditions
        if (logicName.includes('RSI')) {
            const rsiMatch = logicName.match(/RSI.*?(\d+)/);
            if (rsiMatch) {
                const threshold = parseInt(rsiMatch[1]);
                triggered = indicators.rsi14 < threshold;
                reason = `RSI(${indicators.rsi14?.toFixed(1)}) < ${threshold}`;
            }
        }

        // MACD-based conditions
        if (logicName.includes('MACD') && logicName.includes('Bullish')) {
            triggered = triggered || indicators.macdBullish;
            if (indicators.macdBullish) {
                reason += (reason ? ' + ' : '') + 'MACD Bullish';
            }
        }

        // SMA-based conditions
        if (logicName.includes('SMA') || logicName.includes('Above')) {
            triggered = triggered && indicators.aboveSMA50;
            if (indicators.aboveSMA50) {
                reason += (reason ? ' + ' : '') + 'Above SMA50';
            }
        }

        // BB Lower touch
        if (logicName.includes('BB') && indicators.bb) {
            const bbTrigger = indicators.currentPrice <= indicators.bb.lower * 1.02;
            triggered = triggered || bbTrigger;
            if (bbTrigger) {
                reason += (reason ? ' + ' : '') + 'BB Lower Touch';
            }
        }

        return { triggered, reason };
    }

    /**
     * Calculate signal confidence based on multiple factors
     */
    calculateConfidence(indicators, regime, v1Metrics) {
        let confidence = 50; // Base confidence

        // RSI in strong oversold (more confident)
        if (indicators.rsi14 < 25) confidence += 15;
        else if (indicators.rsi14 < 30) confidence += 10;
        else if (indicators.rsi14 < 35) confidence += 5;

        // Market regime bonus
        if (regime.niftyTrend === 'bullish') confidence += 10;
        if (regime.breadth > 0.6) confidence += 5;
        if (regime.volatilityState === 'low') confidence += 5;

        // V1 historical accuracy bonus
        if (v1Metrics?.winRate) {
            const winRate = parseFloat(v1Metrics.winRate);
            if (winRate > 60) confidence += 10;
            else if (winRate > 50) confidence += 5;
        }

        return Math.min(100, Math.max(0, confidence));
    }

    /**
     * Scan a category for signals using V1 strategy
     * Only scans stocks within their tracking window
     */
    async scanCategory(categoryKey) {
        console.log(`\n🔍 Scanning ${categoryKey} for signals...`);
        const startTime = Date.now();

        // 0. Get category config
        const config = getCategoryConfig(categoryKey);
        console.log(`   Category Type: ${config.type} (${config.trackingDays} days, ${config.scanIntervalMin} min)`);

        // 1. Load V1 strategy
        const v1 = await this.loadV1Strategy(categoryKey);
        console.log(`   V1 Strategy: ${v1.rules?.entry?.logic || 'Unknown'}`);

        // 2. Get market regime
        const regime = await getMarketRegime(new Date());
        console.log(`   Market Regime: ${regime.niftyTrend} (Breadth: ${(regime.breadth * 100).toFixed(0)}%)`);

        // 3. Get ELIGIBLE stocks only (within tracking window)
        const eligibleStocks = await trackingService.getEligibleStocks(categoryKey);
        console.log(`   Eligible stocks: ${eligibleStocks.length} (within ${config.trackingDays}-day window)`);

        // 4. Determine interval based on category type
        const interval = config.type === 'INTRADAY' ? '15minute' : 'day';

        // 5. Scan each stock
        const signals = [];
        let scanned = 0;

        for (const eligibleStock of eligibleStocks) {
            try {
                const candles = await this.getLatestCandles(eligibleStock.symbol, interval);
                if (!candles || candles.length < 50) continue;

                // Get indicators
                const indicators = TechnicalAnalysis.getMarketContext(candles);
                if (!indicators) continue;

                indicators.currentPrice = candles[candles.length - 1].close;

                // Check V1 entry
                const { triggered, reason } = this.checkV1Entry(v1, indicators, candles);

                if (triggered) {
                    const exitRules = v1.rules?.exit || { target: 2.5, stop: 1.5 };
                    const targetPrice = indicators.currentPrice * (1 + exitRules.target / 100);
                    const stopPrice = indicators.currentPrice * (1 - exitRules.stop / 100);
                    const confidence = this.calculateConfidence(indicators, regime, v1.metrics);

                    signals.push({
                        symbol: eligibleStock.symbol,
                        name: eligibleStock.name,
                        price: indicators.currentPrice,
                        target: targetPrice,
                        stop: stopPrice,
                        targetPercent: exitRules.target,
                        stopPercent: exitRules.stop,
                        confidence,
                        reason,
                        daysRemaining: eligibleStock.daysRemaining,
                        indicators: {
                            rsi14: indicators.rsi14?.toFixed(1),
                            macdBullish: indicators.macdBullish,
                            aboveSMA50: indicators.aboveSMA50
                        },
                        timestamp: new Date().toISOString()
                    });

                    console.log(`   ✅ SIGNAL: ${eligibleStock.symbol} @ ₹${indicators.currentPrice.toFixed(2)} (${confidence}% confidence)`);
                }

                scanned++;
            } catch (error) {
                // Skip stock on error
            }
        }

        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
        console.log(`\n📊 Scan complete: ${signals.length} signals found (${elapsed}s)`);

        // Store results
        this.lastScanTime = new Date().toISOString();
        this.activeSignals = signals;

        return {
            categoryKey,
            v1Strategy: v1.rules?.entry?.logic || 'Unknown',
            regime: {
                trend: regime.niftyTrend,
                breadth: regime.breadth,
                volatility: regime.volatilityState
            },
            signals,
            stats: {
                totalStocks: eligibleStocks.length,
                scanned,
                signalsFound: signals.length,
                elapsed: `${elapsed}s`
            },
            scannedAt: this.lastScanTime
        };
    }

    /**
     * Scan all enabled categories
     */
    async scanAllCategories() {
        const categories = await prisma.category.findMany({
            where: { enabled: true }
        });

        const allResults = [];
        for (const cat of categories) {
            try {
                const result = await this.scanCategory(cat.key);
                allResults.push(result);
            } catch (error) {
                console.error(`Failed to scan ${cat.key}:`, error.message);
            }
        }

        return allResults;
    }

    /**
     * Get active signals (from last scan)
     */
    getActiveSignals() {
        return {
            signals: this.activeSignals,
            lastScan: this.lastScanTime,
            count: this.activeSignals.length
        };
    }

    /**
     * Save scan results to database
     */
    async saveScanResults(results) {
        const fs = require('fs');
        const path = require('path');

        const dir = path.join(__dirname, '../results/signals');
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

        const filename = `signals_${results.categoryKey}_${Date.now()}.json`;
        fs.writeFileSync(
            path.join(dir, filename),
            JSON.stringify(results, null, 2)
        );

        return filename;
    }
}

// Export singleton instance
module.exports = new SignalScanner();
