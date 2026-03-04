/**
 * Category Signature Analyzer Service
 * 
 * PURPOSE: Discover what's COMMON across all stocks in a category
 * around their addedDate. This becomes the "Category Signature".
 * 
 * APPROACH:
 * 1. For each stock, analyze behavior at addedDate
 * 2. Look at -3 to +3 days (what led to this? what happened after?)
 * 3. Find statistically common patterns
 * 4. Return the signature (patterns found in >50% of stocks)
 * 
 * KEY PRINCIPLE: No assumptions - everything discovered from data
 */

const prisma = require('../lib/prisma.cjs');
const labsDataService = require('./labsDataService.cjs');
const TechnicalAnalysis = require('../strategy/comprehensiveTA.cjs');

class CategorySignatureAnalyzer {

    constructor() {
        // All possible characteristics to check
        // We check ALL, then report only what's COMMON
        this.characteristics = {
            // Price Action
            priceVsSMA20: 'Price vs SMA20',
            priceVsSMA50: 'Price vs SMA50',
            priceVsSMA200: 'Price vs SMA200',
            distanceFromHigh: 'Distance from 20-day high',
            distanceFromLow: 'Distance from 20-day low',

            // Momentum
            rsiLevel: 'RSI level',
            rsiBand: 'RSI band (oversold/neutral/overbought)',
            macdSignal: 'MACD signal',
            stochLevel: 'Stochastic level',

            // Volume
            volumeVsAvg: 'Volume vs 20-day average',
            volumeSpike: 'Volume spike (>1.5x)',

            // Candle Patterns
            candleStrength: 'Candle strength (strong/weak close)',
            gapDirection: 'Gap direction (up/down/none)',

            // Trend
            priorMomentum3Day: '3-day prior momentum',
            priorMomentum5Day: '5-day prior momentum',

            // Structure
            nearSupport: 'Near support level',
            nearResistance: 'Near resistance level',
            breakingOut: 'Breaking above resistance'
        };
    }

    /**
     * Main entry point: Analyze a category and discover its signature
     */
    async discoverSignature(categoryKey, options = {}) {
        console.log('\n' + '='.repeat(70));
        console.log('🔬 CATEGORY SIGNATURE ANALYZER');
        console.log('='.repeat(70));
        console.log(`📌 Category: ${categoryKey}`);
        console.log('📌 Purpose: Find what is COMMON across all stocks\n');

        // Load stocks from category
        const stocks = await this.loadStocks(categoryKey);
        console.log(`📦 Loaded ${stocks.length} stocks from category`);

        if (stocks.length === 0) {
            return { ok: false, error: 'No stocks found in category' };
        }

        // Limit for testing if needed
        const analysisStocks = options.quickMode
            ? stocks.slice(0, options.stockCount || 50)
            : stocks;

        console.log(`📊 Analyzing ${analysisStocks.length} stocks...\n`);

        // Fetch historical data for all stocks (300 days for SMA200)
        const allData = await labsDataService.getHistoricalData(
            analysisStocks.map(s => ({ symbol: s.symbol })),
            { mode: 'auto', days: 300 }
        );

        // Analyze each stock at its addedDate
        const stockCharacteristics = [];
        const characteristicCounts = {};

        for (const stock of analysisStocks) {
            const candles = allData[stock.symbol];
            if (!candles || candles.length < 30) {
                console.log(`  ⚠️ Skipping ${stock.symbol} - insufficient data`);
                continue;
            }

            // Find addedDate index
            const entryIdx = this.findDateIndex(candles, stock.addedDate);
            if (entryIdx < 10 || entryIdx >= candles.length - 5) {
                console.log(`  ⚠️ Skipping ${stock.symbol} - addedDate not in range`);
                continue;
            }

            // Extract all characteristics for this stock
            const characteristics = this.extractCharacteristics(candles, entryIdx);
            stockCharacteristics.push({
                symbol: stock.symbol,
                addedDate: stock.addedDate,
                characteristics
            });

            // Count each characteristic
            for (const [key, value] of Object.entries(characteristics)) {
                if (!characteristicCounts[key]) {
                    characteristicCounts[key] = {};
                }
                const valueStr = String(value);
                if (!characteristicCounts[key][valueStr]) {
                    characteristicCounts[key][valueStr] = 0;
                }
                characteristicCounts[key][valueStr]++;
            }
        }

        const totalAnalyzed = stockCharacteristics.length;
        console.log(`\n✅ Analyzed ${totalAnalyzed} stocks successfully`);

        // Find COMMON characteristics (appearing in >50% of stocks)
        const signature = [];
        const allPatterns = [];

        for (const [characteristic, valueCounts] of Object.entries(characteristicCounts)) {
            for (const [value, count] of Object.entries(valueCounts)) {
                const coverage = (count / totalAnalyzed) * 100;

                allPatterns.push({
                    characteristic,
                    characteristicLabel: this.characteristics[characteristic] || characteristic,
                    value,
                    count,
                    coverage: parseFloat(coverage.toFixed(1))
                });

                // Add to signature if >50% coverage
                if (coverage > 50) {
                    signature.push({
                        characteristic,
                        characteristicLabel: this.characteristics[characteristic] || characteristic,
                        value,
                        count,
                        coverage: parseFloat(coverage.toFixed(1))
                    });
                }
            }
        }

        // Sort signature by coverage (highest first)
        signature.sort((a, b) => b.coverage - a.coverage);
        allPatterns.sort((a, b) => b.coverage - a.coverage);

        // Print findings
        console.log('\n' + '='.repeat(50));
        console.log('📊 CATEGORY SIGNATURE DISCOVERED');
        console.log('='.repeat(50));
        console.log('\n🏆 Common Characteristics (>50% coverage):');
        for (const s of signature.slice(0, 10)) {
            console.log(`   ${s.coverage}%: ${s.characteristicLabel} = ${s.value}`);
        }

        return {
            ok: true,
            category: categoryKey,
            stocksAnalyzed: totalAnalyzed,
            signature: signature.slice(0, 15), // Top 15 common patterns
            allPatterns: allPatterns.slice(0, 30), // Top 30 patterns for detail view
            stockDetails: stockCharacteristics.slice(0, 10) // First 10 for debugging
        };
    }

    /**
     * Extract all characteristics for a stock at entry point
     */
    extractCharacteristics(candles, entryIdx) {
        const current = candles[entryIdx];
        const prev = candles[entryIdx - 1];
        const lookback20 = candles.slice(Math.max(0, entryIdx - 20), entryIdx);
        const lookback5 = candles.slice(Math.max(0, entryIdx - 5), entryIdx);
        const lookback3 = candles.slice(Math.max(0, entryIdx - 3), entryIdx);

        // Calculate technical indicators
        const closes = candles.slice(0, entryIdx + 1).map(c => c.close);
        const highs = candles.slice(0, entryIdx + 1).map(c => c.high);
        const lows = candles.slice(0, entryIdx + 1).map(c => c.low);
        const volumes = candles.slice(0, entryIdx + 1).map(c => c.volume);

        // SMAs
        const sma20 = this.calculateSMA(closes, 20);
        const sma50 = this.calculateSMA(closes, 50);
        const sma200 = closes.length >= 200 ? this.calculateSMA(closes, 200) : null;

        // RSI
        const rsi = this.calculateRSI(closes, 14);

        // Volume average
        const avgVolume = volumes.slice(-20).reduce((a, b) => a + b, 0) / 20;
        const volumeRatio = current.volume / avgVolume;

        // 20-day high/low
        const high20 = Math.max(...lookback20.map(c => c.high));
        const low20 = Math.min(...lookback20.map(c => c.low));

        // Price changes
        const momentum3Day = lookback3.length > 0
            ? ((current.close - lookback3[0].close) / lookback3[0].close) * 100
            : 0;
        const momentum5Day = lookback5.length > 0
            ? ((current.close - lookback5[0].close) / lookback5[0].close) * 100
            : 0;

        // Candle strength
        const bodySize = Math.abs(current.close - current.open);
        const range = current.high - current.low;
        const closeStrength = range > 0 ? (current.close - current.low) / range : 0.5;

        // Gap
        const gap = prev ? ((current.open - prev.close) / prev.close) * 100 : 0;

        return {
            // Price vs SMAs
            priceVsSMA20: sma20 ? (current.close > sma20 ? 'above' : 'below') : 'unknown',
            priceVsSMA50: sma50 ? (current.close > sma50 ? 'above' : 'below') : 'unknown',
            priceVsSMA200: sma200 ? (current.close > sma200 ? 'above' : 'below') : 'unknown',

            // Distance from highs/lows
            distanceFromHigh: high20 > 0 ? this.categorizeDistance((high20 - current.close) / high20 * 100) : 'unknown',
            distanceFromLow: low20 > 0 ? this.categorizeDistance((current.close - low20) / low20 * 100) : 'unknown',

            // Momentum indicators
            rsiBand: this.categorizeRSI(rsi),
            rsiLevel: rsi ? Math.round(rsi) : null,

            // Volume
            volumeSpike: volumeRatio > 1.5 ? 'yes' : 'no',
            volumeVsAvg: this.categorizeVolumeRatio(volumeRatio),

            // Candle patterns
            candleStrength: closeStrength > 0.7 ? 'strongClose' : closeStrength < 0.3 ? 'weakClose' : 'neutral',
            gapDirection: gap > 0.5 ? 'gapUp' : gap < -0.5 ? 'gapDown' : 'noGap',

            // Trend/Momentum
            priorMomentum3Day: this.categorizeMomentum(momentum3Day),
            priorMomentum5Day: this.categorizeMomentum(momentum5Day),

            // Structure
            nearResistance: (high20 - current.close) / current.close * 100 < 2 ? 'yes' : 'no',
            nearSupport: (current.close - low20) / current.close * 100 < 2 ? 'yes' : 'no'
        };
    }

    // Helper: Calculate SMA
    calculateSMA(values, period) {
        if (values.length < period) return null;
        const slice = values.slice(-period);
        return slice.reduce((a, b) => a + b, 0) / period;
    }

    // Helper: Calculate RSI
    calculateRSI(closes, period = 14) {
        if (closes.length < period + 1) return null;

        let gains = 0, losses = 0;
        for (let i = closes.length - period; i < closes.length; i++) {
            const change = closes[i] - closes[i - 1];
            if (change > 0) gains += change;
            else losses -= change;
        }

        if (losses === 0) return 100;
        const rs = gains / losses;
        return 100 - (100 / (1 + rs));
    }

    // Helper: Categorize RSI
    categorizeRSI(rsi) {
        if (!rsi) return 'unknown';
        if (rsi < 30) return 'oversold';
        if (rsi > 70) return 'overbought';
        if (rsi >= 50) return 'neutral-bullish';
        return 'neutral-bearish';
    }

    // Helper: Categorize volume ratio
    categorizeVolumeRatio(ratio) {
        if (ratio > 2) return 'veryHigh';
        if (ratio > 1.5) return 'high';
        if (ratio > 0.8) return 'normal';
        return 'low';
    }

    // Helper: Categorize momentum
    categorizeMomentum(pct) {
        if (pct > 5) return 'strongUp';
        if (pct > 2) return 'up';
        if (pct > -2) return 'flat';
        if (pct > -5) return 'down';
        return 'strongDown';
    }

    // Helper: Categorize distance
    categorizeDistance(pct) {
        if (pct < 2) return 'veryNear';
        if (pct < 5) return 'near';
        if (pct < 10) return 'moderate';
        return 'far';
    }

    // Helper: Find date index
    findDateIndex(candles, targetDate) {
        const target = new Date(targetDate).toDateString();

        for (let i = 0; i < candles.length; i++) {
            const candleDate = new Date(candles[i].date || candles[i].timestamp).toDateString();
            if (candleDate === target) return i;
        }

        // Find closest date if exact match not found
        const targetTime = new Date(targetDate).getTime();
        let closestIdx = candles.length - 1;
        let closestDiff = Infinity;

        for (let i = 0; i < candles.length; i++) {
            const diff = Math.abs(new Date(candles[i].date || candles[i].timestamp).getTime() - targetTime);
            if (diff < closestDiff) {
                closestDiff = diff;
                closestIdx = i;
            }
        }
        return closestIdx;
    }

    // Helper: Load stocks from category
    async loadStocks(categoryKey) {
        const category = await prisma.category.findUnique({
            where: { key: categoryKey }
        });

        if (!category) return [];

        const stockCategories = await prisma.stockCategory.findMany({
            where: { categoryId: category.id },
            include: { stock: true }
        });

        return stockCategories.map(sc => ({
            symbol: sc.stock.symbol,
            name: sc.stock.name,
            addedDate: sc.addedDate
        }));
    }
}

module.exports = new CategorySignatureAnalyzer();
