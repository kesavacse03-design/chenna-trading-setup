/**
 * Signal Scanner Service
 * Scans stocks using promoted V1 strategy and generates live trading signals
 */

const { PrismaClient } = require('@prisma/client');
const TechnicalAnalysis = require('../strategy/comprehensiveTA.cjs');
const { getMarketRegime, shouldAllowEntry } = require('./regimeService.cjs');
const { getCategoryConfig, isWithinTrackingWindow } = require('../config/categoryConfig.cjs');
const trackingService = require('./trackingService.cjs');
const eventReconstructor = require('./eventReconstructor.cjs');
const categorySignatureBuilder = require('./categorySignatureBuilder.cjs');
const positionSizing = require('./positionSizingService.cjs');
const livePriceService = require('./livePriceService.cjs');
const entryValidator = require('./entryValidator.cjs');
const priceService = require('./priceService.cjs'); // NEW IMPORT

const prisma = new PrismaClient();

class SignalScanner {
    // ... (constructor/loadLastScan logic unchanged)

    // ... (loadV1Strategy/getStocksForCategory logic unchanged)

    /**
     * Fetch latest candles for a stock from cache or fetch fresh if missing
     * @param {Object} stock - Stock object (symbol, instrument_key)
     * @param {string} interval - 'day', 'week', '15minute'
     */
    async getLatestCandles(stock, interval = 'day') {
        try {
            const symbol = stock.symbol || stock; // Handle extensive usage

            // 1. Try Cache First
            const cached = await prisma.ohlcvCache.findFirst({
                where: { symbol, interval },
                orderBy: { createdAt: 'desc' }
            });

            if (cached && cached.data) {
                let candles = cached.data;
                if (typeof candles === 'string') candles = JSON.parse(candles);
                if (Array.isArray(candles) && candles.length > 0) {
                    // Check staleness?
                    // If 'week', is it updated? usually fine.
                    // Flatten/Normalize
                    return candles.map(c => {
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
                        return c;
                    }).filter(c => c.close > 0);
                }
            }

            // 2. Fallback: Fetch Fresh from Upstox (if instrument_key available)
            // Only if stock is an object with key
            if (typeof stock === 'object' && stock.instrument_key) {
                console.log(`[Scanner] Cache miss for ${symbol} (${interval}). Fetching fresh...`);
                // Calculate range based on interval
                const endDate = new Date();
                const startDate = new Date();

                if (interval === 'week') startDate.setMonth(startDate.getMonth() - 12); // 1 year
                else if (interval === 'day') startDate.setMonth(startDate.getMonth() - 6);
                else startDate.setDate(startDate.getDate() - 5); // 5 days for intraday

                const freshData = await priceService.fetchPrice(
                    symbol,
                    stock.instrument_key,
                    startDate.toISOString().split('T')[0],
                    endDate.toISOString().split('T')[0],
                    interval
                );

                if (freshData && freshData.length > 0) {
                    return freshData;
                }
            }

            return null;
        } catch (error) {
            console.error(`[Scanner] Error loading/fetching candles for ${stock.symbol || stock}:`, error.message);
            return null;
        }
    }

    /**
     * Append live price as today's candle
     * Creates a synthetic candle with LTP as OHLC
     */
    appendLiveCandle(candles, symbol) {
        const liveData = livePriceService.getPrice(symbol);

        if (!liveData || !liveData.ltp) {
            return candles; // Return original if no live price
        }

        const lastCandle = candles[candles.length - 1];
        const lastCandleDate = new Date(lastCandle.timestamp).toDateString();
        const todayDate = new Date().toDateString();

        // If last candle is already today, update its close with LTP
        if (lastCandleDate === todayDate) {
            candles[candles.length - 1] = {
                ...lastCandle,
                high: Math.max(lastCandle.high, liveData.ltp),
                low: Math.min(lastCandle.low, liveData.ltp),
                close: liveData.ltp // Update close to live price
            };
            return candles;
        }

        // Otherwise, append a new synthetic today's candle
        const todayCandle = {
            timestamp: new Date().toISOString(),
            open: lastCandle.close, // Open at yesterday's close
            high: Math.max(lastCandle.close, liveData.ltp),
            low: Math.min(lastCandle.close, liveData.ltp),
            close: liveData.ltp,
            volume: 0 // No volume data from LTP
        };

        return [...candles, todayCandle];
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
        console.log(`   Market Regime: ${regime.niftyTrend} (Breadth: ${(regime.breadth * 100).toFixed(0)}%, Score: ${regime.regimeScore})`);

        // 2b. MARKET CONTEXT GATE - Block signals if market hostile
        const entryType = config.type === 'INTRADAY' ? 'intraday' : 'swing';
        if (!shouldAllowEntry(regime, entryType)) {
            console.log(`   ⛔ BLOCKED: Market context hostile (Score: ${regime.regimeScore}, ${regime.niftyTrend}/${regime.volatilityState})`);
            return {
                categoryKey,
                signals: [],
                scannedAt: new Date(),
                blocked: true,
                blockReason: `hostile_market: ${regime.niftyTrend}/${regime.volatilityState}, score ${regime.regimeScore}`
            };
        }
        console.log(`   ✅ Market context: ALLOWED (Score: ${regime.regimeScore})`);

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
                let candles = await this.getLatestCandles(eligibleStock, interval);
                if (!candles || candles.length < 50) continue;

                // === LIVE PRICE INTEGRATION ===
                // Append today's live price as a synthetic candle
                candles = this.appendLiveCandle(candles, eligibleStock.symbol);

                // === SIGNAL QUALITY GATE LAYER 1: Event Validation ===
                // Verify something meaningful happened on the stock's addedDate
                const eventResult = await eventReconstructor.reconstructEvent(
                    eligibleStock.symbol,
                    eligibleStock.addedDate,
                    categoryKey
                );

                if (!eventResult.valid || eventResult.eventScore < 25) {
                    // Skip stocks with no meaningful event
                    continue;
                }

                // === SIGNAL QUALITY GATE LAYER 2: Category Similarity ===
                // Check if stock matches what this category typically looks like
                const similarity = await categorySignatureBuilder.scoreSimilarity(
                    eligibleStock.symbol,
                    eligibleStock.addedDate,
                    categoryKey
                );

                if (similarity.similarity < 40) {
                    // Skip stocks that don't match category signature
                    continue;
                }

                // === SIGNAL QUALITY GATE LAYER 3: Indicator Analysis ===
                // Get indicators
                const indicators = TechnicalAnalysis.getMarketContext(candles);
                if (!indicators) continue;

                indicators.currentPrice = candles[candles.length - 1].close;

                // === PROFESSIONAL ENTRY VALIDATION (5-Layer) ===
                const validation = entryValidator.validateEntry({
                    candles,
                    indicators,
                    eventResult,
                    similarity,
                    categoryKey,
                    v1Strategy: v1
                });

                // Skip if validation failed
                if (!validation.valid) {
                    console.log(`   ⛔ ${eligibleStock.symbol}: ${validation.rejections[0] || 'Failed validation'}`);
                    continue;
                }

                // Use ATR-based dynamic stops from validator
                const { entryPrice, stopLoss, targetPrice, confidence } = validation.entry;

                // === POSITION SIZING: Calculate risk-based quantity ===
                const sizing = positionSizing.calculatePositionSize({
                    price: entryPrice,
                    stop: stopLoss,
                    target: targetPrice
                });

                signals.push({
                    symbol: eligibleStock.symbol,
                    name: eligibleStock.name,
                    categoryKey,
                    instrument_key: eligibleStock.instrument_key, // For fallback data fetching
                    price: entryPrice,
                    target: targetPrice,
                    stop: stopLoss,
                    targetPercent: validation.entry.targetPercent,
                    stopPercent: validation.entry.stopLossPercent,
                    confidence,
                    reason: validation.signals.join(' + '),
                    daysRemaining: eligibleStock.daysRemaining,
                    // Position Sizing (1% risk rule)
                    quantity: sizing.quantity,
                    positionValue: sizing.positionValue,
                    riskAmount: sizing.riskAmount,
                    riskPercent: sizing.riskPercent,
                    rewardRiskRatio: sizing.rewardRiskRatio,
                    sizingSummary: sizing.summary,
                    // Validation metrics
                    validationScore: validation.score,
                    passedChecks: validation.signals,
                    atr: validation.entry.atr,
                    eventScore: eventResult?.eventScore,
                    similarityScore: similarity?.similarity,
                    indicators: {
                        rsi14: indicators.rsi14?.toFixed(1),
                        macdBullish: indicators.macdBullish,
                        aboveSMA50: indicators.aboveSMA50
                    },
                    timestamp: new Date().toISOString()
                });

                console.log(`   ✅ SIGNAL: ${eligibleStock.symbol} @ ₹${entryPrice.toFixed(2)} | Score: ${validation.score} | ${validation.signals.join(', ')}`);


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

        // Enrich Signals (Strategy Specific)
        await this.enrichSwingSignals(categoryKey, signals);

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
     * Helper to Enrich Swing Signals with Strat Logic
     */
    async enrichSwingSignals(categoryKey, signals) {
        // Map Category to Strategy File
        const strategyMap = {
            'SHORT_TERM_SWING_BO_DOWN': './strategies/swingBoDownLongStrategy.cjs',
            'SHORT_TERM_SWING_BO_UP': './strategies/swingBoUpLongStrategy.cjs'
        };

        const strategyPath = strategyMap[categoryKey];
        if (!strategyPath) return signals;

        try {
            const strategy = require(strategyPath);
            console.log(`   [Enrich] Applying V2 Logic to ${signals.length} signals...`);

            // Fetch Nifty Data once (for context)
            const niftyCandles = await this.getLatestCandles('NIFTY 50', 'day'); // Context

            for (const signal of signals) {
                // Fetch Daily & Weekly Candles
                const dailyCandles = await this.getLatestCandles(signal, 'day');
                const weeklyCandles = await this.getLatestCandles(signal, 'week');

                if (!dailyCandles || dailyCandles.length < 50) continue;

                // Call V2 Logic
                const details = await strategy.checkSignal(signal.symbol, dailyCandles, weeklyCandles, niftyCandles);

                if (details && details.signal === 'BUY') {
                    signal.tier = details.tier;
                    signal.tierName = `TIER ${details.tier}`;
                    signal.reason += ` | ${details.reason}`;

                    // Update Targets/Stops based on Strategy
                    if (details.target) {
                        signal.targetPercent = details.target;
                        signal.target = Number((signal.price * (1 + details.target / 100)).toFixed(2));
                    }
                    if (details.stopLoss) {
                        signal.stopPercent = details.stopLoss;
                        signal.stop = Number((signal.price * (1 - details.stopLoss / 100)).toFixed(2));
                    }

                    console.log(`   [Enrich] ${signal.symbol} -> TIER ${details.tier} (${details.reason})`);
                } else if (details && details.signal === 'SKIP') {
                    // Mark as invalid/blocked? 
                    // Or just downgrade confidence?
                    // User wants to SKIP.
                    signal.blocked = true;
                    signal.blockReason = details.reason;
                    console.log(`   [Enrich] ${signal.symbol} -> SKIP (${details.reason})`);
                }
            }

            // Filter out BLOCKED signals
            return signals.filter(s => !s.blocked);

        } catch (e) {
            console.error(`   [Enrich] Failed: ${e.message}`);
        }
        return signals;
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
