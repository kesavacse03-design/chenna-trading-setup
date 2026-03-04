/**
 * Category Signature Discovery Service
 * 
 * PURPOSE: Discover the TRUE meaning of a category by analyzing what
 * ALL stocks in that category have in COMMON on their addedDate.
 * 
 * APPROACH:
 * 1. No assumptions about what the category "should" mean
 * 2. Analyze ALL stocks - no rejection
 * 3. Look at -3 to +3 days around addedDate
 * 4. Find common patterns across all stocks
 * 5. That becomes the TRUE definition of the category
 */

const { PrismaClient } = require('@prisma/client');
const labsDataService = require('./labsDataService.cjs');
const TechnicalAnalysis = require('../strategy/comprehensiveTA.cjs');

const prisma = new PrismaClient();

class CategorySignatureService {

    constructor() {
        this.lookbackDays = 10;  // Days before addedDate to analyze
        this.lookaheadDays = 5;  // Days after addedDate to see outcome (for time-travel testing)
    }

    /**
     * Discover the signature (true meaning) of a category
     */
    async discoverSignature(categoryKey) {
        console.log(`\n${'='.repeat(60)}`);
        console.log(`🔍 CATEGORY SIGNATURE DISCOVERY: ${categoryKey}`);
        console.log('='.repeat(60));
        console.log('📌 NO ASSUMPTIONS - Let the data tell us what this category means\n');

        const result = {
            category: categoryKey,
            timestamp: new Date().toISOString(),
            stocksAnalyzed: 0,
            signatures: [],
            commonPatterns: {},
            priceAction: {},
            volumeProfile: {},
            technicalProfile: {},
            categoryDefinition: null

        };

        try {
            // Step 1: Load ALL stocks in category (no filtering!)
            console.log('📦 Step 1: Loading ALL stocks in category...');
            const stocks = await this.loadAllStocks(categoryKey);
            console.log(`   Found ${stocks.length} stocks - analyzing ALL of them\n`);
            result.stocksAnalyzed = stocks.length;

            if (stocks.length === 0) {
                result.error = 'No stocks found in category';
                return result;
            }

            // Step 2: Fetch historical data for all stocks
            console.log('📊 Step 2: Fetching historical data...');
            const allData = await labsDataService.getHistoricalData(
                stocks.map(s => ({ symbol: s.symbol })),
                { mode: 'auto', days: 300 }
            );

            // Step 3: Analyze each stock around its addedDate
            console.log('\n🔬 Step 3: Analyzing each stock around addedDate...\n');

            for (const stock of stocks) {
                const candles = allData[stock.symbol];
                if (!candles || candles.length < 50) {
                    console.log(`   ⚠️ ${stock.symbol}: Insufficient data`);
                    continue;
                }

                // Find the addedDate in candles
                const signature = await this.analyzeStockSignature(
                    stock.symbol,
                    candles,
                    stock.addedDate
                );

                if (signature) {
                    result.signatures.push(signature);
                    console.log(`   ✓ ${stock.symbol}: ${signature.summary}`);
                }
            }

            // Step 4: Find common patterns
            console.log('\n🧩 Step 4: Finding COMMON patterns across all stocks...\n');
            result.commonPatterns = this.findCommonPatterns(result.signatures);

            // Step 5: Build price action profile
            result.priceAction = this.buildPriceActionProfile(result.signatures);

            // Step 6: Build volume profile
            result.volumeProfile = this.buildVolumeProfile(result.signatures);

            // Step 7: Build technical profile
            result.technicalProfile = this.buildTechnicalProfile(result.signatures);

            // Step 8: Generate category definition
            console.log('\n📝 Step 5: Generating TRUE category definition...\n');
            result.categoryDefinition = this.generateCategoryDefinition(categoryKey, result);

            // Print summary
            this.printSummary(result);

            // Save results
            await this.saveResults(categoryKey, result);

            return result;

        } catch (error) {
            console.error(`\n❌ Error:`, error);
            result.error = error.message;
            return result;
        }
    }

    /**
     * Load all stocks in a category (NO FILTERING!)
     */
    async loadAllStocks(categoryKey) {
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

    /**
     * Analyze a single stock's signature around its addedDate
     */
    async analyzeStockSignature(symbol, candles, addedDate) {
        // Transform candles to have timestamp field
        const transformedCandles = candles.map(c => ({
            timestamp: c.date,
            open: c.open,
            high: c.high,
            low: c.low,
            close: c.close,
            volume: c.volume
        }));

        // Find addedDate index
        const targetDate = new Date(addedDate).toDateString();
        let addedIdx = -1;

        for (let i = 0; i < transformedCandles.length; i++) {
            const candleDate = new Date(transformedCandles[i].timestamp).toDateString();
            if (candleDate === targetDate) {
                addedIdx = i;
                break;
            }
        }

        // If exact date not found, find closest
        if (addedIdx === -1) {
            const targetTime = new Date(addedDate).getTime();
            let closestDiff = Infinity;
            for (let i = 0; i < transformedCandles.length; i++) {
                const diff = Math.abs(new Date(transformedCandles[i].timestamp).getTime() - targetTime);
                if (diff < closestDiff) {
                    closestDiff = diff;
                    addedIdx = i;
                }
            }
        }

        if (addedIdx < this.lookbackDays || addedIdx >= transformedCandles.length - this.lookaheadDays) {
            return null; // Not enough data around addedDate
        }

        const signature = {
            symbol,
            addedDate: addedDate,
            addedIdx,

            // Price action on addedDate
            priceAction: this.analyzePriceAction(transformedCandles, addedIdx),

            // Price action -3 to +3 days
            contextDays: this.analyzeContextDays(transformedCandles, addedIdx),

            // Technical indicators on addedDate
            technicals: this.analyzeTechnicals(transformedCandles, addedIdx),

            // Volume analysis
            volume: this.analyzeVolume(transformedCandles, addedIdx),

            // Summary
            summary: ''
        };

        // Generate summary
        signature.summary = this.generateStockSummary(signature);

        return signature;
    }

    /**
     * Analyze price action on addedDate
     */
    analyzePriceAction(candles, idx) {
        const current = candles[idx];
        const prev = candles[idx - 1];
        const prev3 = candles.slice(idx - 3, idx);
        const prev10 = candles.slice(idx - 10, idx);

        const change = ((current.close - prev.close) / prev.close) * 100;
        const change3d = ((current.close - prev3[0].close) / prev3[0].close) * 100;
        const change10d = ((current.close - prev10[0].close) / prev10[0].close) * 100;

        const range = current.high - current.low;
        const body = Math.abs(current.close - current.open);
        const closePosition = range > 0 ? (current.close - current.low) / range : 0.5;

        const recent10High = Math.max(...prev10.map(c => c.high));
        const recent10Low = Math.min(...prev10.map(c => c.low));
        const recent20High = Math.max(...candles.slice(idx - 20, idx).map(c => c.high));
        const recent20Low = Math.min(...candles.slice(idx - 20, idx).map(c => c.low));

        return {
            change1d: change.toFixed(2) + '%',
            change3d: change3d.toFixed(2) + '%',
            change10d: change10d.toFixed(2) + '%',
            direction: change > 1 ? 'UP' : change < -1 ? 'DOWN' : 'FLAT',
            closePosition: closePosition.toFixed(2),
            closePositionLabel: closePosition > 0.7 ? 'HIGH' : closePosition < 0.3 ? 'LOW' : 'MID',
            nearSupport: current.low <= recent10Low * 1.02,
            nearResistance: current.high >= recent10High * 0.98,
            brokeSupport: current.close < recent10Low,
            brokeResistance: current.close > recent10High,
            atRange20Low: current.low <= recent20Low * 1.02,
            atRange20High: current.high >= recent20High * 0.98
        };
    }

    /**
     * Analyze context around addedDate (-3 to +3 days)
     */
    analyzeContextDays(candles, idx) {
        const context = {
            before: [],
            after: []
        };

        // 3 days before
        for (let i = idx - 3; i < idx; i++) {
            if (i >= 0) {
                const c = candles[i];
                const prev = candles[i - 1] || c;
                context.before.push({
                    day: i - idx,
                    change: (((c.close - prev.close) / prev.close) * 100).toFixed(2) + '%',
                    direction: c.close > prev.close ? 'UP' : 'DOWN'
                });
            }
        }

        // 3 days after (for outcome analysis only - not for entry decision!)
        for (let i = idx + 1; i <= idx + 3 && i < candles.length; i++) {
            const c = candles[i];
            const prev = candles[i - 1];
            context.after.push({
                day: i - idx,
                change: (((c.close - prev.close) / prev.close) * 100).toFixed(2) + '%',
                direction: c.close > prev.close ? 'UP' : 'DOWN'
            });
        }

        // Summarize pattern before addedDate
        const downDays = context.before.filter(d => d.direction === 'DOWN').length;
        const upDays = context.before.filter(d => d.direction === 'UP').length;
        context.priorTrend = downDays >= 2 ? 'DECLINING' : upDays >= 2 ? 'RISING' : 'CHOPPY';

        return context;
    }

    /**
     * Analyze technical indicators on addedDate
     */
    analyzeTechnicals(candles, idx) {
        const slicedCandles = candles.slice(0, idx + 1);

        const rsi = TechnicalAnalysis.RSI(slicedCandles, 14);
        const macd = TechnicalAnalysis.MACD(slicedCandles);
        const bb = TechnicalAnalysis.BollingerBands(slicedCandles);
        const stoch = TechnicalAnalysis.Stochastic(slicedCandles);
        const atr = TechnicalAnalysis.ATR(slicedCandles);

        const current = candles[idx];

        return {
            rsi: rsi?.toFixed(1) || null,
            rsiLevel: rsi < 30 ? 'OVERSOLD' : rsi > 70 ? 'OVERBOUGHT' : 'NEUTRAL',
            macdHistogram: macd?.histogram?.toFixed(2) || null,
            macdSignal: macd?.histogram > 0 ? 'BULLISH' : macd?.histogram < 0 ? 'BEARISH' : 'NEUTRAL',
            bbBand: bb ? (current.close <= bb.lower * 1.02 ? 'LOWER' : current.close >= bb.upper * 0.98 ? 'UPPER' : 'MIDDLE') : null,
            stochK: stoch?.k?.toFixed(1) || null,
            stochLevel: stoch?.k < 20 ? 'OVERSOLD' : stoch?.k > 80 ? 'OVERBOUGHT' : 'NEUTRAL',
            atr: atr?.toFixed(2) || null,
            atrPercent: atr ? ((atr / current.close) * 100).toFixed(2) + '%' : null
        };
    }

    /**
     * Analyze volume on addedDate
     */
    analyzeVolume(candles, idx) {
        const current = candles[idx];
        const prev20 = candles.slice(idx - 20, idx);
        const avgVolume = prev20.reduce((s, c) => s + c.volume, 0) / prev20.length;

        const volumeRatio = avgVolume > 0 ? current.volume / avgVolume : 1;

        return {
            volumeRatio: volumeRatio.toFixed(2) + 'x',
            level: volumeRatio > 1.5 ? 'SPIKE' : volumeRatio < 0.6 ? 'DRY' : 'NORMAL',
            avgVolume: avgVolume.toFixed(0),
            currentVolume: current.volume
        };
    }

    /**
     * Generate summary for a single stock
     */
    generateStockSummary(sig) {
        const parts = [];

        parts.push(sig.priceAction.direction);
        parts.push(sig.priceAction.change1d);
        parts.push(`Vol:${sig.volume.level}`);
        parts.push(`RSI:${sig.technicals.rsiLevel}`);

        if (sig.priceAction.nearSupport) parts.push('NearSupport');
        if (sig.priceAction.brokeSupport) parts.push('BrokeSupport');
        if (sig.contextDays.priorTrend === 'DECLINING') parts.push('PriorDecline');

        return parts.join(' | ');
    }

    /**
     * Find common patterns across all signatures
     */
    findCommonPatterns(signatures) {
        if (signatures.length === 0) return {};

        const counts = {
            direction: { UP: 0, DOWN: 0, FLAT: 0 },
            closePosition: { HIGH: 0, MID: 0, LOW: 0 },
            rsiLevel: { OVERSOLD: 0, NEUTRAL: 0, OVERBOUGHT: 0 },
            volumeLevel: { SPIKE: 0, NORMAL: 0, DRY: 0 },
            macdSignal: { BULLISH: 0, NEUTRAL: 0, BEARISH: 0 },
            priorTrend: { DECLINING: 0, CHOPPY: 0, RISING: 0 },
            nearSupport: 0,
            brokeSupport: 0,
            nearResistance: 0,
            brokeResistance: 0,
            atRange20Low: 0,
            atRange20High: 0
        };

        for (const sig of signatures) {
            counts.direction[sig.priceAction.direction]++;
            counts.closePosition[sig.priceAction.closePositionLabel]++;
            if (sig.technicals.rsiLevel) counts.rsiLevel[sig.technicals.rsiLevel]++;
            if (sig.volume.level) counts.volumeLevel[sig.volume.level]++;
            if (sig.technicals.macdSignal) counts.macdSignal[sig.technicals.macdSignal]++;
            if (sig.contextDays.priorTrend) counts.priorTrend[sig.contextDays.priorTrend]++;
            if (sig.priceAction.nearSupport) counts.nearSupport++;
            if (sig.priceAction.brokeSupport) counts.brokeSupport++;
            if (sig.priceAction.nearResistance) counts.nearResistance++;
            if (sig.priceAction.brokeResistance) counts.brokeResistance++;
            if (sig.priceAction.atRange20Low) counts.atRange20Low++;
            if (sig.priceAction.atRange20High) counts.atRange20High++;
        }

        // Convert to percentages
        const total = signatures.length;
        return {
            direction: this.toPercentages(counts.direction, total),
            closePosition: this.toPercentages(counts.closePosition, total),
            rsiLevel: this.toPercentages(counts.rsiLevel, total),
            volumeLevel: this.toPercentages(counts.volumeLevel, total),
            macdSignal: this.toPercentages(counts.macdSignal, total),
            priorTrend: this.toPercentages(counts.priorTrend, total),
            nearSupport: ((counts.nearSupport / total) * 100).toFixed(1) + '%',
            brokeSupport: ((counts.brokeSupport / total) * 100).toFixed(1) + '%',
            nearResistance: ((counts.nearResistance / total) * 100).toFixed(1) + '%',
            brokeResistance: ((counts.brokeResistance / total) * 100).toFixed(1) + '%',
            atRange20Low: ((counts.atRange20Low / total) * 100).toFixed(1) + '%',
            atRange20High: ((counts.atRange20High / total) * 100).toFixed(1) + '%'
        };
    }

    toPercentages(obj, total) {
        const result = {};
        for (const [key, count] of Object.entries(obj)) {
            result[key] = ((count / total) * 100).toFixed(1) + '%';
        }
        return result;
    }

    /**
     * Build price action profile
     */
    buildPriceActionProfile(signatures) {
        if (signatures.length === 0) return {};

        const changes = signatures.map(s => parseFloat(s.priceAction.change1d));
        const changes3d = signatures.map(s => parseFloat(s.priceAction.change3d));

        return {
            avgChange1d: (changes.reduce((a, b) => a + b, 0) / changes.length).toFixed(2) + '%',
            avgChange3d: (changes3d.reduce((a, b) => a + b, 0) / changes3d.length).toFixed(2) + '%',
            minChange1d: Math.min(...changes).toFixed(2) + '%',
            maxChange1d: Math.max(...changes).toFixed(2) + '%',
            medianChange1d: changes.sort((a, b) => a - b)[Math.floor(changes.length / 2)]?.toFixed(2) + '%'
        };
    }

    /**
     * Build volume profile
     */
    buildVolumeProfile(signatures) {
        if (signatures.length === 0) return {};

        const ratios = signatures.map(s => parseFloat(s.volume.volumeRatio));

        return {
            avgVolumeRatio: (ratios.reduce((a, b) => a + b, 0) / ratios.length).toFixed(2) + 'x',
            minVolumeRatio: Math.min(...ratios).toFixed(2) + 'x',
            maxVolumeRatio: Math.max(...ratios).toFixed(2) + 'x'
        };
    }

    /**
     * Build technical profile
     */
    buildTechnicalProfile(signatures) {
        if (signatures.length === 0) return {};

        const rsis = signatures.filter(s => s.technicals.rsi).map(s => parseFloat(s.technicals.rsi));

        return {
            avgRSI: rsis.length > 0 ? (rsis.reduce((a, b) => a + b, 0) / rsis.length).toFixed(1) : 'N/A',
            minRSI: rsis.length > 0 ? Math.min(...rsis).toFixed(1) : 'N/A',
            maxRSI: rsis.length > 0 ? Math.max(...rsis).toFixed(1) : 'N/A'
        };
    }

    /**
     * Generate the TRUE definition of the category
     */
    generateCategoryDefinition(categoryKey, result) {
        const common = result.commonPatterns;
        const definition = {
            categoryKey,
            discoveredMeaning: [],
            characteristics: [],
            verificationRules: []
        };

        // Find dominant patterns (>50%)
        const findDominant = (obj) => {
            for (const [key, val] of Object.entries(obj)) {
                if (parseFloat(val) > 50) return key;
            }
            return null;
        };

        // Direction
        const dominantDirection = findDominant(common.direction);
        if (dominantDirection) {
            definition.characteristics.push(`Price Direction: ${dominantDirection}`);
        }

        // Close Position
        const dominantClose = findDominant(common.closePosition);
        if (dominantClose) {
            definition.characteristics.push(`Close Position: ${dominantClose}`);
        }

        // RSI
        const dominantRSI = findDominant(common.rsiLevel);
        if (dominantRSI) {
            definition.characteristics.push(`RSI Level: ${dominantRSI}`);
        }

        // Volume
        const dominantVolume = findDominant(common.volumeLevel);
        if (dominantVolume) {
            definition.characteristics.push(`Volume: ${dominantVolume}`);
        }

        // Prior Trend
        const dominantTrend = findDominant(common.priorTrend);
        if (dominantTrend) {
            definition.characteristics.push(`Prior Trend: ${dominantTrend}`);
        }

        // Support/Resistance
        if (parseFloat(common.nearSupport) > 40) {
            definition.characteristics.push('Often near support');
        }
        if (parseFloat(common.brokeSupport) > 30) {
            definition.characteristics.push('Sometimes breaks support');
        }

        // Generate summary
        definition.discoveredMeaning = [
            `Based on analysis of ${result.stocksAnalyzed} stocks:`,
            ...definition.characteristics.map(c => `• ${c}`)
        ];

        return definition;
    }

    /**
     * Print summary
     */
    printSummary(result) {
        console.log('='.repeat(60));
        console.log('📊 CATEGORY SIGNATURE SUMMARY');
        console.log('='.repeat(60));

        console.log(`\nStocks Analyzed: ${result.signatures.length}/${result.stocksAnalyzed}`);

        console.log('\n🔹 Common Patterns:');
        console.log(`   Direction: ${JSON.stringify(result.commonPatterns.direction)}`);
        console.log(`   RSI Level: ${JSON.stringify(result.commonPatterns.rsiLevel)}`);
        console.log(`   Volume: ${JSON.stringify(result.commonPatterns.volumeLevel)}`);
        console.log(`   Prior Trend: ${JSON.stringify(result.commonPatterns.priorTrend)}`);
        console.log(`   Near Support: ${result.commonPatterns.nearSupport}`);
        console.log(`   Near Resistance: ${result.commonPatterns.nearResistance}`);

        console.log('\n🔹 Price Action Profile:');
        console.log(`   Avg 1-day change: ${result.priceAction.avgChange1d}`);
        console.log(`   Avg 3-day change: ${result.priceAction.avgChange3d}`);

        console.log('\n🔹 TRUE Category Definition:');
        for (const line of result.categoryDefinition.discoveredMeaning) {
            console.log(`   ${line}`);
        }
    }

    /**
     * Save results
     */
    async saveResults(categoryKey, result) {
        const fs = require('fs');
        const path = require('path');

        const resultsDir = path.join(__dirname, '..', 'results', 'category_signatures');
        if (!fs.existsSync(resultsDir)) {
            fs.mkdirSync(resultsDir, { recursive: true });
        }

        const filename = `${categoryKey}_signature_${Date.now()}.json`;
        const filepath = path.join(resultsDir, filename);

        fs.writeFileSync(filepath, JSON.stringify(result, null, 2));
        console.log(`\n📁 Results saved to: ${filename}`);
    }
}

module.exports = new CategorySignatureService();
