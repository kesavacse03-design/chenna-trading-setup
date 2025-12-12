/**
 * Signal Scanner Service
 * Scans stocks using promoted V1 strategy and generates live trading signals
 */

const { PrismaClient } = require('@prisma/client');
const TechnicalAnalysis = require('../strategy/comprehensiveTA.cjs');
const { getMarketRegime } = require('./regimeService.cjs');

const prisma = new PrismaClient();

class SignalScanner {
    constructor() {
        this.lastScanTime = null;
        this.activeSignals = [];
    }

    /**
     * Load V1 strategy from database for a category
     */
    async loadV1Strategy(categoryKey) {
        const category = await prisma.category.findUnique({
            where: { key: categoryKey }
        });

        if (!category) {
            throw new Error(`Category ${categoryKey} not found`);
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
            throw new Error(`No V1 strategy found for ${categoryKey}`);
        }

        return {
            id: strategy.id,
            description: strategy.description,
            rules: strategy.rules,
            metrics: strategy.metrics,
            categoryKey
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
     */
    async getLatestCandles(symbol) {
        const cached = await prisma.ohlcvCache.findFirst({
            where: { symbol, interval: 'day' },
            orderBy: { createdAt: 'desc' }
        });

        if (!cached || !cached.data) return null;

        let candles = cached.data;
        if (typeof candles === 'string') {
            candles = JSON.parse(candles);
        }

        // Normalize candles
        return candles.map(c => ({
            timestamp: c.timestamp || c.date,
            open: parseFloat(c.open) || 0,
            high: parseFloat(c.high) || 0,
            low: parseFloat(c.low) || 0,
            close: parseFloat(c.close) || 0,
            volume: parseInt(c.volume) || 0
        })).filter(c => c.close > 0);
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
     */
    async scanCategory(categoryKey) {
        console.log(`\n🔍 Scanning ${categoryKey} for signals...`);
        const startTime = Date.now();

        // 1. Load V1 strategy
        const v1 = await this.loadV1Strategy(categoryKey);
        console.log(`   V1 Strategy: ${v1.rules?.entry?.logic || 'Unknown'}`);

        // 2. Get market regime
        const regime = await getMarketRegime(new Date());
        console.log(`   Market Regime: ${regime.niftyTrend} (Breadth: ${(regime.breadth * 100).toFixed(0)}%)`);

        // 3. Get stocks
        const stocks = await this.getStocksForCategory(categoryKey);
        console.log(`   Scanning ${stocks.length} stocks...`);

        // 4. Scan each stock
        const signals = [];
        let scanned = 0;

        for (const stock of stocks) {
            try {
                const candles = await this.getLatestCandles(stock.symbol);
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
                        symbol: stock.symbol,
                        name: stock.name,
                        price: indicators.currentPrice,
                        target: targetPrice,
                        stop: stopPrice,
                        targetPercent: exitRules.target,
                        stopPercent: exitRules.stop,
                        confidence,
                        reason,
                        indicators: {
                            rsi14: indicators.rsi14?.toFixed(1),
                            macdBullish: indicators.macdBullish,
                            aboveSMA50: indicators.aboveSMA50
                        },
                        timestamp: new Date().toISOString()
                    });

                    console.log(`   ✅ SIGNAL: ${stock.symbol} @ ₹${indicators.currentPrice.toFixed(2)} (${confidence}% confidence)`);
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
                totalStocks: stocks.length,
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
