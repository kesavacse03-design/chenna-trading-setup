/**
 * Enhanced Signal Generator V2.0
 * 
 * Loads configuration from database (CategoryConfig table)
 * Saves generated signals to database (TradingSignal table)
 * Supports multiple categories (only active+analyzed ones)
 */

const prisma = require('../../lib/prisma.cjs');
const { v4: uuidv4 } = require('uuid');
const priceService = require('../priceService.cjs');
const { validateTechnicalConditions } = require('./technicalValidation.cjs');
const strategyManager = require('./strategyManager.cjs');
const { calculateIntelligentStop } = require('../stopLossCalculator.cjs');
const { getStrategy } = require('../../services/strategyRouter.cjs');
const fs = require('fs');
const path = require('path');

/**
 * Convert Date to IST YYYY-MM-DD string.
 * toISOString() converts to UTC which shifts IST midnight to previous day.
 * This adds IST offset (5h30m) before extracting date.
 */
function toISTDateString(date) {
    const d = new Date(date);
    d.setMinutes(d.getMinutes() + 330);
    return d.toISOString().split('T')[0];
}

// ============ TECHNICAL INDICATOR HELPERS ============

/**
 * Calculate RSI (Relative Strength Index)
 * @param {Array} candles - OHLCV sorted oldest first
 * @param {number} period - RSI period (default 14)
 * @returns {number|null} RSI value or null if insufficient data
 */
function calcRSI(candles, period = 14) {
    if (!candles || candles.length < period + 1) return null;
    let avgGain = 0, avgLoss = 0;
    for (let i = 1; i <= period; i++) {
        const chg = candles[i].close - candles[i - 1].close;
        if (chg > 0) avgGain += chg; else avgLoss += Math.abs(chg);
    }
    avgGain /= period;
    avgLoss /= period;
    for (let i = period + 1; i < candles.length; i++) {
        const chg = candles[i].close - candles[i - 1].close;
        avgGain = (avgGain * (period - 1) + (chg > 0 ? chg : 0)) / period;
        avgLoss = (avgLoss * (period - 1) + (chg < 0 ? Math.abs(chg) : 0)) / period;
    }
    if (avgLoss === 0) return 100;
    return 100 - 100 / (1 + avgGain / avgLoss);
}

/**
 * Calculate EMA (Exponential Moving Average)
 * @param {Array} candles - OHLCV sorted oldest first
 * @param {number} period - EMA period
 * @returns {number|null} EMA value or null if insufficient data
 */
function calcEMA(candles, period) {
    if (!candles || candles.length < period) return null;
    const k = 2 / (period + 1);
    // SMA for initial seed
    let ema = 0;
    for (let i = 0; i < period; i++) ema += candles[i].close;
    ema /= period;
    // EMA from period onward
    for (let i = period; i < candles.length; i++) {
        ema = candles[i].close * k + ema * (1 - k);
    }
    return ema;
}

/**
 * Calculate SMA (Simple Moving Average)
 */
function calcSMA(candles, period) {
    if (!candles || candles.length < period) return null;
    const closes = candles.slice(-period).map(c => c.close);
    return closes.reduce((a, b) => a + b, 0) / period;
}

/**
 * Minervini Stage Classifier
 * Stage 1 (Basing): price near SMA50 ≈ SMA200
 * Stage 2 (Uptrend): price > SMA50 > SMA200 → BUY
 * Stage 3 (Topping): price < SMA50, still > SMA200
 * Stage 4 (Decline): price < SMA50 < SMA200 → NEVER buy
 */
function classifyMinerviniStage(price, sma50, sma200) {
    if (!sma50 || !sma200 || !price) return { stage: 0, label: 'UNKNOWN' };
    if (price > sma50 && sma50 > sma200) return { stage: 2, label: 'STAGE_2_UPTREND' };
    if (price < sma50 && sma50 < sma200) return { stage: 4, label: 'STAGE_4_DECLINE' };
    if (price < sma50 && price > sma200) return { stage: 3, label: 'STAGE_3_TOPPING' };
    return { stage: 1, label: 'STAGE_1_BASING' };
}

function logDebug(msg) {
    try {
        const logPath = 'D:/chenna-trading-system-dashboard/chenna-CTS/backend/logs/signal_debug.txt';
        const timestamp = new Date().toISOString();
        if (!fs.existsSync(path.dirname(logPath))) {
            fs.mkdirSync(path.dirname(logPath), { recursive: true });
        }
        fs.appendFileSync(logPath, `[${timestamp}] ${msg}\n`);
    } catch (e) {
        // ignore
    }
    console.log(msg);
}

/**
 * Load category configuration from Strategy Manager
 */
async function loadCategoryConfig(categoryKey) {
    try {
        return strategyManager.getStrategyConfig(categoryKey);
    } catch (e) {
        console.error(`[SignalGenV2] Error loading config for ${categoryKey}: ${e.message}`);
        throw e;
    }
}

/**
 * Get all active categories from Strategy Manager
 */
async function getActiveCategories() {
    try {
        const activeStrategies = strategyManager.getActiveStrategies();
        return activeStrategies.map(s => strategyManager.getStrategyConfig(s.category));
    } catch (e) {
        console.error(`[SignalGenV2] Error getting active categories: ${e.message}`);
        return [];
    }
}

/**
 * Check if today is a valid trading day for a category
 */
function isValidTradingDay(config, date = new Date()) {
    const dayOfWeek = date.getDay();
    const month = date.getMonth() + 1;

    // Check day of week
    const validDays = config.validDays || [1, 2, 3, 4, 5]; // Default: all weekdays
    const validDay = validDays.includes(dayOfWeek);

    // Check month
    const avoidMonths = config.avoidMonths || [];
    const avoidMonth = avoidMonths.includes(month);

    // Check prime months
    const primeMonths = config.primeMonths || [];
    const isPrimeMonth = primeMonths.includes(month);

    return {
        isValid: validDay && !avoidMonth,
        dayOfWeek,
        dayName: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][dayOfWeek],
        month,
        monthName: ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][month],
        invalidReason: !validDay ? 'Not a valid day' : (avoidMonth ? `Month ${month} is in avoid list` : null),
        isPrimeMonth,
        positionMultiplier: avoidMonth ? 0 : (isPrimeMonth ? 1.25 : 1.0)
    };
}

/**
 * Get price tier for a stock based on category config
 */
function getPriceTier(price, config) {
    const tiers = config.priceTiers || {};

    if (tiers.tier1 && price < (tiers.tier1.maxPrice || 200)) {
        return {
            tier: 1,
            name: tiers.tier1.name || 'Tier 1',
            candlePattern: tiers.tier1.candlePattern || 'ANY',
            expectedSuccess: tiers.tier1.expectedSuccess || config.expectedSuccessRate || 0.6,
            positionMultiplier: tiers.tier1.positionMultiplier || 1.5
        };
    } else if (tiers.tier2 && price < (tiers.tier2.maxPrice || 1000)) {
        return {
            tier: 2,
            name: tiers.tier2.name || 'Tier 2',
            candlePattern: tiers.tier2.candlePattern || 'RED_ONLY',
            expectedSuccess: tiers.tier2.expectedSuccess || config.expectedSuccessRate || 0.6,
            positionMultiplier: tiers.tier2.positionMultiplier || 1.0
        };
    } else {
        return {
            tier: 3,
            name: tiers.tier3?.name || 'Tier 3',
            candlePattern: tiers.tier3?.candlePattern || 'RED_ONLY',
            expectedSuccess: tiers.tier3?.expectedSuccess || config.expectedSuccessRate || 0.6,
            positionMultiplier: tiers.tier3?.positionMultiplier || 0.75
        };
    }
}

/**
 * Generate signals for a specific category
 */
async function generateCategorySignals(categoryKey, date = new Date(), portfolioSize = 500000, backtestMode = false, unlimitedMode = false) {
    logDebug(`[SignalGenV2] ====== Generating signals for ${categoryKey} ======`);
    logDebug(`[SignalGenV2] Date: ${toISTDateString(date)}`);
    logDebug(`[SignalGenV2] Mode: ${backtestMode ? 'BACKTEST' : 'LIVE'}`);

    const config = await loadCategoryConfig(categoryKey);

    if (!config.active || !config.analyzed) {
        logDebug(`[SignalGenV2] ❌ Category not active or not analyzed`);
        return {
            categoryKey,
            status: 'SKIPPED',
            reason: 'Category not active or not analyzed',
            signals: [],
            skipReport: []
        };
    }

    const tradingDay = isValidTradingDay(config, date);

    if (!tradingDay.isValid) {
        logDebug(`[SignalGenV2] ❌ Not a valid trading day: ${tradingDay.invalidReason}`);
        return {
            categoryKey,
            status: 'NO_TRADE',
            reason: tradingDay.invalidReason,
            marketState: tradingDay,
            signals: [],
            skipReport: []
        };
    }

    logDebug(`[SignalGenV2] ✅ Valid trading day`);

    const category = await prisma.category.findFirst({
        where: { key: categoryKey }
    });

    if (!category) {
        logDebug(`[SignalGenV2] ❌ Category not found in database`);
        return {
            categoryKey,
            status: 'ERROR',
            reason: 'Category not found in database',
            signals: []
        };
    }

    let stocks;

    if (backtestMode) {
        // SWING categories: only signal on the day the stock was ADDED
        // INTRADAY categories: check all active stocks every day
        const SWING_CATEGORIES = [
            'LONG_TERM_SWING_BO_UP',
            'LONG_TERM_SWING_BO_DOWN',
            'SHORT_TERM_SWING_BO_UP',
            'SHORT_TERM_SWING_BO_DOWN',
            'MULTI_SUPPORT_BO',
            'MULTI_RESISTANCE_BO'
        ];

        const isSwingCategory = SWING_CATEGORIES.includes(categoryKey);

        if (isSwingCategory) {
            // SWING: Only get stocks added on THIS specific day
            const dayStart = new Date(date);
            dayStart.setHours(0, 0, 0, 0);
            const dayEnd = new Date(date);
            dayEnd.setHours(23, 59, 59, 999);

            stocks = await prisma.stockCategory.findMany({
                where: {
                    categoryId: category.id,
                    addedDate: { gte: dayStart, lte: dayEnd }
                },
                include: { stock: true }
            });
            logDebug(`[SignalGenV2] SWING backtest: ${stocks.length} stocks added on ${toISTDateString(date)}`);
        } else {
            // INTRADAY: Check all active stocks (existing behavior)
            const simulationDate = new Date(date);
            simulationDate.setHours(23, 59, 59, 999);

            stocks = await prisma.stockCategory.findMany({
                where: {
                    categoryId: category.id,
                    addedDate: { lte: simulationDate }
                },
                include: { stock: true }
            });
            logDebug(`[SignalGenV2] INTRADAY backtest: ${stocks.length} stocks active on ${toISTDateString(date)}`);
        }
        if (stocks.length > 0) {
            const sample = stocks[0].stock;
            logDebug(`[SignalGenV2] Sample Stock: ${sample.symbol} Key: ${sample.instrumentKey}`);
        }
    } else {
        const todayStart = new Date(date);
        todayStart.setHours(0, 0, 0, 0);
        const todayEnd = new Date(date);
        todayEnd.setHours(23, 59, 59, 999);

        stocks = await prisma.stockCategory.findMany({
            where: {
                categoryId: category.id,
                addedDate: { gte: todayStart, lte: todayEnd }
            },
            include: { stock: true }
        });

        if (stocks.length === 0) {
            stocks = await prisma.stockCategory.findMany({
                where: { categoryId: category.id },
                include: { stock: true },
                orderBy: { addedDate: 'desc' },
                take: 10
            });
        }
        logDebug(`[SignalGenV2] Mode: ${backtestMode ? 'BACKTEST' : 'LIVE'}`);
        logDebug(`[SignalGenV2] Stock Count: ${stocks.length}`);

        if (stocks.length > 0) {
            const sample = stocks[0].stock;
            logDebug(`[SignalGenV2] Sample Stock: ${sample.symbol} Key: ${sample.instrumentKey}`);
        }
    }

    const signals = [];
    const skipReport = [];
    const basePosition = portfolioSize * 0.10; // 10% per trade

    for (const sc of stocks) {
        if (!sc.stock) continue;

        const symbol = sc.stock.symbol;
        const instrumentKey = sc.stock.instrumentKey;

        // Try database price first
        let price = sc.stock.lastPrice || sc.stock.close;
        let ohlcData = [];
        let isRedCandle = true;
        let isGreenCandle = false;
        let signalDayVolume = 0;
        let avgVolume20 = 0;
        let rsiValue = null;
        let ema50Value = null;

        if (instrumentKey) {
            try {
                const targetDate = toISTDateString(date);
                const startDate = new Date(date);
                startDate.setDate(startDate.getDate() - 365); // Fetch 365 calendar days to ensure 200+ trading days for SMA200
                const fromDate = toISTDateString(startDate);

                // Add 1 day to ensure Upstox returns the targetDate candle
                const endDate = new Date(date);
                endDate.setDate(endDate.getDate() + 1);
                const toDateStr = toISTDateString(endDate);

                // Fetch larger history
                ohlcData = await priceService.fetchPrice(symbol, instrumentKey, fromDate, toDateStr);

                if (ohlcData && ohlcData.length > 0) {
                    ohlcData.sort((a, b) => new Date(a.timestamp || a.date) - new Date(b.timestamp || b.date));

                    const candle = ohlcData.find(c => {
                        // CRITICAL: Use raw timestamp string split, NOT toISOString()!
                        // Candle timestamps are in IST (T00:00:00+05:30).
                        // toISOString() converts to UTC, shifting date back by 1 day.
                        const ts = String(c.timestamp || c.date || '');
                        const candleDate = ts.includes('T') ? ts.split('T')[0] : ts.split(' ')[0];
                        return candleDate === targetDate;
                    }) || ohlcData[ohlcData.length - 1];

                    price = candle.close;
                    const open = candle.open;
                    const close = candle.close;
                    isRedCandle = close < open;
                    isGreenCandle = close > open;

                    // Extract volume data for volume filter
                    signalDayVolume = parseInt(candle.volume || 0);

                    // Calculate 20-day average volume
                    const candleIdx = ohlcData.indexOf(candle);
                    const recentCandles = ohlcData.slice(Math.max(0, candleIdx - 20), candleIdx);
                    if (recentCandles.length > 0) {
                        avgVolume20 = Math.round(recentCandles.reduce((s, c) => s + parseInt(c.volume || 0), 0) / recentCandles.length);
                    }

                    // Calculate RSI-14 using all candles up to signal day
                    const candlesUpToSignal = ohlcData.slice(0, candleIdx + 1);
                    rsiValue = calcRSI(candlesUpToSignal, 14);

                    // Calculate EMA-50
                    ema50Value = calcEMA(candlesUpToSignal, 50);

                    // Calculate SMA-50 and SMA-200 for Minervini Stage
                    const sma50Value = calcSMA(candlesUpToSignal, 50);
                    const sma200Value = calcSMA(candlesUpToSignal, 200);

                    logDebug(`[SignalGen] ${symbol} on ${targetDate}: O=${open} C=${close} ${isRedCandle ? 'RED' : 'GREEN'} | Vol: ${signalDayVolume} (${avgVolume20 > 0 ? (signalDayVolume / avgVolume20).toFixed(1) : '?'}x) | RSI: ${rsiValue ? rsiValue.toFixed(1) : 'N/A'} | EMA50: ${ema50Value ? ema50Value.toFixed(1) : 'N/A'}`);

                    // ═══ GATE 2: MINERVINI STOCK TREND CLASSIFIER ═══
                    const isBreakoutUp = categoryKey.includes('BO_UP');
                    const isStSwingBoUp = categoryKey === 'SHORT_TERM_SWING_BO_UP';
                    if (isBreakoutUp && sma200Value) {
                        const { stage, label } = classifyMinerviniStage(price, sma50Value, sma200Value);
                        if (stage >= 3 || (isStSwingBoUp && stage !== 2)) {
                            skipReport.push({
                                symbol,
                                reason: `${label}: price ₹${price.toFixed(0)} vs SMA50=${sma50Value?.toFixed(0)} SMA200=${sma200Value.toFixed(0)} — fighting the trend`,
                                tier: null
                            });
                            logDebug(`[SignalGen] SKIP ${symbol}: ${label} (P=${price.toFixed(0)} SMA50=${sma50Value?.toFixed(0)} SMA200=${sma200Value.toFixed(0)})`);
                            continue;
                        }
                    }

                    // ═══ GATE 3: RSI SWEET SPOT (ST_SWING_BO_UP ONLY) ═══
                    if (isStSwingBoUp && rsiValue !== null) {
                        if (rsiValue < 60 || rsiValue > 70) {
                            skipReport.push({
                                symbol,
                                reason: `RSI ${rsiValue.toFixed(1)} is outside the 60-70 golden range`,
                                tier: null
                            });
                            logDebug(`[SignalGen] SKIP ${symbol}: RSI ${rsiValue.toFixed(1)} outside 60-70`);
                            continue;
                        }
                    }
                }
            } catch (e) {
                logDebug(`[SignalGen] Error fetching history for ${symbol}: ${e.message}`);
            }
        }

        if (!price || price <= 0) {
            skipReport.push({ symbol, reason: 'No price data available', tier: null });
            continue;
        }

        // FILTER: Volume confirmation — skip if signal day volume < 1.2x avg
        if (avgVolume20 > 0 && signalDayVolume > 0 && signalDayVolume < avgVolume20 * 1.2) {
            skipReport.push({ symbol, reason: `Low volume: ${signalDayVolume.toLocaleString()} < 1.2x avg ${avgVolume20.toLocaleString()}`, tier: null });
            logDebug(`[SignalGen] SKIP ${symbol}: Low volume ${signalDayVolume} < 1.2x avg ${avgVolume20}`);
            continue;
        }

        // FILTER: RSI oversold — skip if RSI > 40 (ONLY for MULTI_SUPPORT_BO)
        const isSupportCategory = categoryKey.includes('SUPPORT');
        if (isSupportCategory && rsiValue !== null && rsiValue > 40) {
            skipReport.push({ symbol, reason: `RSI ${rsiValue.toFixed(1)} > 40 (not oversold enough)`, tier: null });
            logDebug(`[SignalGen] SKIP ${symbol}: RSI ${rsiValue.toFixed(1)} > 40`);
            continue;
        }

        // FILTER: EMA50 — for SUPPORT categories, price should be BELOW EMA50 (49% vs 27%)
        if (isSupportCategory && ema50Value !== null && price > ema50Value) {
            skipReport.push({ symbol, reason: `Price ₹${price.toFixed(0)} above EMA50 ₹${ema50Value.toFixed(0)} (not a pullback)`, tier: null });
            logDebug(`[SignalGen] SKIP ${symbol}: Price ${price.toFixed(0)} > EMA50 ${ema50Value.toFixed(0)}`);
            continue;
        }

        const tier = getPriceTier(price, config);

        // ============================================
        // STRATEGY SPECIFIC LOGIC (Router)
        // ============================================
        const specificStrategy = getStrategy(categoryKey);
        let strategyResult = null;

        if (specificStrategy) {
            logDebug(`[SignalGen] Using specific strategy for ${categoryKey}`);
            try {
                // Filter history to avoid future leakage
                const validHistory = ohlcData.filter(d => {
                    // Use raw string date comparison to avoid IST→UTC shift
                    const ts = String(d.timestamp || d.date || '');
                    const dDateStr = ts.includes('T') ? ts.split('T')[0] : ts.split(' ')[0];
                    return dDateStr <= toISTDateString(date);
                });

                strategyResult = await specificStrategy.checkSignal(
                    sc.stock,
                    validHistory,
                    null, // Weekly candles (fallback to daily inside strategy)
                    null, // Nifty candles (fallback to sideways)
                    { date }
                );

                if (!strategyResult || (strategyResult.signal !== 'BUY' && strategyResult.signal !== 'SHORT')) {
                    const reason = (strategyResult && strategyResult.reason) || 'Strategy rejected';
                    skipReport.push({
                        symbol,
                        reason,
                        tier: strategyResult?.tier || null,
                        preTrend: strategyResult?.preTrendPct || null
                    });
                    if (strategyResult && strategyResult.reason) {
                        logDebug(`[SignalGen] Strategy Skip ${symbol}: ${strategyResult.reason}`);
                    }
                    continue; // Skip if strategy says NO
                }

                logDebug(`[SignalGen] ✅ Strategy Signal: ${symbol} (Tier ${strategyResult.tier})`);

            } catch (e) {
                console.error(`[SignalGen] Strategy execution error for ${symbol}: ${e.message}`);
                skipReport.push({ symbol, reason: `Strategy error: ${e.message}`, tier: null });
                continue;
            }
        } else {
            // ============================================
            // GENERIC LOGIC (Fallback)
            // ============================================

            if (tier.candlePattern === 'RED_ONLY' && !isRedCandle) {
                logDebug(`[SignalGen] Skipping ${symbol}: Tier requires RED candle, got GREEN`);
                skipReport.push({ symbol, reason: 'Requires RED candle, got GREEN', tier: tier.tier });
                continue;
            }
            if (tier.candlePattern === 'GREEN_ONLY' && !isGreenCandle) {
                logDebug(`[SignalGen] Skipping ${symbol}: Tier requires GREEN candle, got RED`);
                skipReport.push({ symbol, reason: 'Requires GREEN candle, got RED', tier: tier.tier });
                continue;
            }

            const techValidation = await validateTechnicalConditions(symbol, instrumentKey, price, 0, date);
            if (!techValidation.isValid) {
                logDebug(`[SignalGen] Skipping ${symbol}: ${techValidation.reason}`);
                skipReport.push({ symbol, reason: techValidation.reason, tier: tier.tier });
                continue;
            }
            if (tier.tier !== 1) {
                skipReport.push({ symbol, reason: `Tier ${tier.tier} skipped (Tier 1 only)`, tier: tier.tier });
                continue;
            }

            // Previous Day Red Check (Generic)
            let prevDayRed = false;
            if (ohlcData && ohlcData.length > 0) {
                // Filter to candles strictly BEFORE target date
                const pastCandles = ohlcData.filter(c => new Date(c.timestamp || c.date) < date);
                if (pastCandles.length > 0) {
                    const prevCandle = pastCandles[pastCandles.length - 1];
                    prevDayRed = prevCandle.close < prevCandle.open;
                }
            }

            if (!prevDayRed) {
                skipReport.push({ symbol, reason: 'Previous day not RED candle', tier: tier.tier });
                continue;
            }
            logDebug(`[SignalGen] ✅ Generic Signal: ${symbol} (Tier ${tier.tier})`);
        }

        // ============================================
        // FINALIZE SIGNAL
        // ============================================

        let targetPrice, stopPrice, stopMethod, atrValue, swingLow, confidence, tierValue, tierName;
        let entryChecklist = {};

        if (strategyResult) {
            // Use Strategy Output
            targetPrice = strategyResult.targetPrice;
            stopPrice = strategyResult.stopPrice;
            stopMethod = strategyResult.stopMethod || 'STRATEGY_DEFINED';
            atrValue = strategyResult.atr || 0;
            swingLow = 0; // Not returned by all strategies
            confidence = 0.8; // High confidence for strategy signals
            tierValue = strategyResult.tier;
            tierName = `Tier ${tierValue}`;
            entryChecklist = {
                strategyReason: strategyResult.reason,
                passed: true
            };
        } else {
            // Use Generic Output (Intelligent Stop)
            const validHistory = ohlcData.filter(d => d && new Date(d.timestamp || d.date) <= date);
            const stopDetails = calculateIntelligentStop({
                entryPrice: price,
                candles: validHistory,
                atrMultiplier: 2.0,
                swingLookback: 5,
                minStopPct: 0.02,
                maxStopPct: 0.10,
                rrMultiple: 2.0
            });
            targetPrice = stopDetails.targetPrice;
            stopPrice = stopDetails.stopPrice;
            stopMethod = stopDetails.method;
            atrValue = stopDetails.atr || 0;
            swingLow = stopDetails.swingLow || 0;
            confidence = tier.expectedSuccess;
            tierValue = tier.tier;
            tierName = tier.name;
            entryChecklist = {
                genericReason: 'Passed Generic Validation',
                passed: true
            };
        }

        const positionSize = basePosition * (strategyResult ? 1.5 : tier.positionMultiplier) * tradingDay.positionMultiplier;
        const quantity = Math.floor(positionSize / price);

        signals.push({
            signalId: `${categoryKey}_${symbol}_${toISTDateString(date)}_${uuidv4().slice(0, 8)}`,
            categoryKey,
            type: config.type,
            symbol,
            signalDate: date,
            entryPrice: Math.round(price * 100) / 100,
            signalDayClose: Math.round(price * 100) / 100, // For gap filter
            signalDayVolume,  // For volume analysis
            avgVolume20,      // For volume ratio
            targetPrice: Math.round(targetPrice * 100) / 100,
            stopPrice: Math.round(stopPrice * 100) / 100,
            stopMethod,
            direction: (strategyResult && strategyResult.direction) || config.direction || 'LONG',
            atrValue,
            swingLow,
            confidenceScore: confidence,
            tier: tierValue,
            tierName,
            suggestedPositionSize: Math.round(positionSize),
            suggestedQuantity: quantity,
            entryChecklist,
            // Technical indicators for analysis
            technicals: {
                rsi: rsiValue ? Math.round(rsiValue * 10) / 10 : null,
                ema50: ema50Value ? Math.round(ema50Value * 100) / 100 : null,
                priceVsEma50: ema50Value ? Math.round((price - ema50Value) / ema50Value * 10000) / 100 : null,
                volumeRatio: avgVolume20 > 0 ? Math.round(signalDayVolume / avgVolume20 * 10) / 10 : null
            }
        });
    }

    // Sort by tier
    signals.sort((a, b) => a.tier - b.tier);

    // Deduplicate signals
    const uniqueSignals = [];
    const seenSymbols = new Set();
    for (const sig of signals) {
        if (!seenSymbols.has(sig.symbol)) {
            uniqueSignals.push(sig);
            seenSymbols.add(sig.symbol);
        } else {
            logDebug(`[SignalGen] Removing duplicate signal for ${sig.symbol}`);
        }
    }

    // MAX SIGNALS PER DAY: Avoid signal clustering (Jan 7 debacle: 14 signals = mass losses)
    const MAX_SIGNALS_PER_DAY = 3;

    // Sort by RSI (most oversold first = highest conviction)
    uniqueSignals.sort((a, b) => {
        const rsiA = a.technicals?.rsi ?? 50;
        const rsiB = b.technicals?.rsi ?? 50;
        return rsiA - rsiB; // Most oversold first
    });

    // In unlimited/statistical mode: take all (up to cap). Normal: limit to 5 or cap.
    const maxSignals = unlimitedMode ? MAX_SIGNALS_PER_DAY : Math.min(5, MAX_SIGNALS_PER_DAY);
    const finalSignals = uniqueSignals.slice(0, maxSignals);

    // Track signals that were capped
    if (uniqueSignals.length > maxSignals) {
        const capped = uniqueSignals.slice(maxSignals);
        for (const sig of capped) {
            skipReport.push({ symbol: sig.symbol, reason: `Signal cap: ${uniqueSignals.length} signals, max ${maxSignals}/day`, tier: sig.tier });
        }
        logDebug(`[SignalGen] CAPPED: ${uniqueSignals.length} signals → ${maxSignals} (sorted by RSI, most oversold first)`);
    }

    return {
        categoryKey,
        categoryName: config.categoryName,
        type: config.type,
        version: config.version,
        status: 'READY',
        date: toISTDateString(date),
        marketState: tradingDay,
        signals: finalSignals,
        skipReport,
        summary: {
            totalStocksChecked: stocks.length,
            totalSignals: finalSignals.length,
            totalSkipped: skipReport.length,
            totalExposure: finalSignals.reduce((s, sig) => s + sig.suggestedPositionSize, 0),
            avgConfidence: finalSignals.length > 0
                ? finalSignals.reduce((s, sig) => s + sig.confidenceScore, 0) / finalSignals.length
                : 0
        }
    };
}

/**
 * Generate signals for ALL active categories
 */
async function generateAllSignals(date = new Date(), portfolioSize = 500000) {
    logDebug('=== SIGNAL GENERATOR V2.0 ===');
    logDebug('Date:', toISTDateString(date));
    logDebug('Portfolio:', '₹' + portfolioSize.toLocaleString());

    const activeCategories = await getActiveCategories();
    logDebug('\nActive categories:', activeCategories.length);

    const allResults = [];

    for (const cat of activeCategories) {
        logDebug(`\n--- ${cat.categoryKey} (${cat.type}) ---`);
        const result = await generateCategorySignals(cat.categoryKey, date, portfolioSize);

        logDebug(`Status: ${result.status}`);
        if (result.signals.length > 0) {
            result.signals.forEach((s, i) => {
                logDebug(`  ${i + 1}. ${s.symbol} (Tier ${s.tier}) - ${(s.confidenceScore * 100).toFixed(0)}%`);
            });
        }

        allResults.push(result);
    }

    // Aggregate
    const allSignals = allResults.flatMap(r => r.signals);
    const swingSignals = allSignals.filter(s => s.type === 'SWING');
    const intradaySignals = allSignals.filter(s => s.type === 'INTRADAY');

    logDebug('\n=== SUMMARY ===');
    logDebug('Total signals:', allSignals.length);
    logDebug('  SWING:', swingSignals.length);
    logDebug('  INTRADAY:', intradaySignals.length);

    return {
        date: toISTDateString(date),
        categoriesChecked: activeCategories.length,
        results: allResults,
        allSignals,
        summary: {
            totalSignals: allSignals.length,
            swingSignals: swingSignals.length,
            intradaySignals: intradaySignals.length,
            totalExposure: allSignals.reduce((s, sig) => s + sig.suggestedPositionSize, 0)
        }
    };
}

/**
 * Save signals to database
 */
async function saveSignalsToDatabase(signals) {
    const saved = [];

    for (const signal of signals) {
        try {
            const result = await prisma.tradingSignal.upsert({
                where: { signalId: signal.signalId },
                update: signal,
                create: signal
            });
            saved.push(result);
        } catch (error) {
            console.error(`Error saving signal ${signal.signalId}:`, error.message);
        }
    }

    return saved;
}

/**
 * Get today's signals from database
 */
async function getTodaysSignals(date = new Date()) {
    const todayStart = new Date(date);
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date(date);
    todayEnd.setHours(23, 59, 59, 999);

    return prisma.tradingSignal.findMany({
        where: {
            signalDate: { gte: todayStart, lte: todayEnd }
        },
        orderBy: [
            { tier: 'asc' },
            { confidenceScore: 'desc' }
        ]
    });
}

// CLI interface
if (require.main === module) {
    (async () => {
        try {
            const result = await generateAllSignals(new Date(), 500000);

            // Save to database
            if (result.allSignals.length > 0) {
                logDebug('\nSaving signals to database...');
                const saved = await saveSignalsToDatabase(result.allSignals);
                logDebug('Saved:', saved.length, 'signals');
            }

            logDebug('\n=== JSON OUTPUT ===');
            logDebug(JSON.stringify({ summary: result.summary }, null, 2));
        } catch (error) {
            console.error('Error:', error.message);
        } finally {
            await prisma.$disconnect();
        }
    })();
}

module.exports = {
    generateCategorySignals,
    generateAllSignals,
    saveSignalsToDatabase,
    getTodaysSignals,
    loadCategoryConfig,
    getActiveCategories,
    isValidTradingDay,
    getPriceTier
};
