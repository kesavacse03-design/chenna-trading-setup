/**
 * Intraday Strategy V2.1 - Enhanced Pattern Strategy
 * 
 * BUILDS ON V2 with 5 additional filters to reach 60-65% WR:
 * Filter 5: 20 EMA Support (pullback within 1% of EMA)
 * Filter 6: Strong Breakout (>0.5% above OR high)
 * Filter 7: Tighter Time Window (15-45 min after OR)
 * Filter 8: Higher Volume (2x at breakout)
 * Filter 9: OR Width Check (<2% range)
 * 
 * Expected: 60-65% win rate (vs V2's 42%)
 */

const prisma = require('../../lib/prisma.cjs'); // Use shared Prisma Client
const priceService = require('../priceService.cjs'); // Use centralized PriceService
const { STRATEGY_REGISTRY } = require('../../config/strategyRegistry.cjs'); // Single Source of Truth
const { calculateSignalQuality } = require('./signalQualityCalculator.cjs');
const liveModeSettings = require('../liveModeSettings.cjs'); // Dynamic User Settings

// Fallback Configuration (if Registry fails)
const DEFAULT_CONFIG = {
    TARGET_PERCENT: 1.5,
    VOLUME_THRESHOLD: 1.5,
    EXIT_TIME: '15:15',
    MIN_CANDLES: 100,
    MIN_OR_CANDLES: 5,
    MAX_OR_CANDLES: 30,

    // Default STRICT Mode
    STRICT: {
        MAX_OR_WIDTH_PERCENT: 2.0,
        MIN_WAIT_AFTER_OR: 15,
        MAX_WAIT_AFTER_OR: 45,
        BREAKOUT_VOLUME_MULT: 2.0,
        MIN_BREAKOUT_STRENGTH: 0.005,
        EMA_PERIOD: 20,
        MAX_EMA_DEVIATION: 0.01,
        PASS_THRESHOLD_ORIGINAL: 2,
        PASS_THRESHOLD_TRADECODE: 2
    },

    // Default RELAXED Mode
    RELAXED: {
        MAX_OR_WIDTH_PERCENT: 2.5,
        MIN_WAIT_AFTER_OR: 10,
        MAX_WAIT_AFTER_OR: 60,
        BREAKOUT_VOLUME_MULT: 1.5,
        MIN_BREAKOUT_STRENGTH: 0.003,
        EMA_PERIOD: 20,
        MAX_EMA_DEVIATION: 0.015,
        PASS_THRESHOLD_ORIGINAL: 1,
        PASS_THRESHOLD_TRADECODE: 1
    }
};

/**
 * Helper: Resolve Configuration from Registry or Defaults
 */
function getStrategyConfig(categoryKey, mode = 'STRICT') {
    // ACTIVATION: Default to COMBO_SPEED for specific categories if mode is default/STRICT
    // This ensures that live trading (which calls without mode) gets the optimized strategy.
    if ((!mode || mode === 'STRICT') && ['INTRADAY_BOOST', 'HIGH_POWERED_STOCKS'].includes(categoryKey)) {
        mode = 'COMBO_SPEED';
        console.log(`[V2.1] Auto-Activated COMBO_SPEED for ${categoryKey}`);
    }

    const registryConfig = STRATEGY_REGISTRY[categoryKey];

    // If no registry entry or using defaults, return DEFAULT_CONFIG based on mode
    if (!registryConfig || !registryConfig.parameters) {
        return {
            ...DEFAULT_CONFIG.STRICT, // Base keys
            ...DEFAULT_CONFIG[mode],   // Override with mode specific
            TARGET_PERCENT: DEFAULT_CONFIG.TARGET_PERCENT,
            VOLUME_THRESHOLD: DEFAULT_CONFIG.VOLUME_THRESHOLD
        };
    }

    // Map Registry Parameters to Strategy Config keys
    // Note: Registry keys are camelCase (targetPercent), Strategy uses CONSTANT_CASE (TARGET_PERCENT) often
    const params = registryConfig.parameters;

    // Determine mode from registry if not forced, or use passed mode
    // Registry has a 'mode' parameter which acts as default
    const effectiveMode = mode || params.mode?.value || 'STRICT';

    // Get mode-specific defaults for safety
    const modeDefaults = DEFAULT_CONFIG[effectiveMode] || DEFAULT_CONFIG.STRICT;

    // 4. SIMULATION MODE (Finetuned for Testing)
    if (mode === 'SIMULATION_V1') {
        const defaults = DEFAULT_CONFIG.RELAXED;
        return {
            TARGET_PERCENT: DEFAULT_CONFIG.TARGET_PERCENT,
            EXIT_TIME: DEFAULT_CONFIG.EXIT_TIME,
            MIN_CANDLES: DEFAULT_CONFIG.MIN_CANDLES,
            MIN_OR_CANDLES: DEFAULT_CONFIG.MIN_OR_CANDLES,
            MAX_OR_CANDLES: DEFAULT_CONFIG.MAX_OR_CANDLES,

            VOLUME_THRESHOLD: 1.2, // Lowered

            // From Defaults (Relaxed)
            MAX_OR_WIDTH_PERCENT: 2.5, // Relaxed
            MIN_WAIT_AFTER_OR: defaults.MIN_WAIT_AFTER_OR,
            MAX_WAIT_AFTER_OR: 180, // Extended
            BREAKOUT_VOLUME_MULT: defaults.BREAKOUT_VOLUME_MULT,
            MIN_BREAKOUT_STRENGTH: 0.0005, // Override
            EMA_PERIOD: defaults.EMA_PERIOD,
            MAX_EMA_DEVIATION: defaults.MAX_EMA_DEVIATION,
            PASS_THRESHOLD_ORIGINAL: defaults.PASS_THRESHOLD_ORIGINAL,
            PASS_THRESHOLD_TRADECODE: defaults.PASS_THRESHOLD_TRADECODE,

            IS_SIMULATION: true
        };
    }

    // 4. SIMULATION MODE (Finetuned for Testing)
    if (mode === 'SIMULATION_V1') {
        // ... (existing simulation mode, keeping for reference or replacing if user doesn't need it? 
        // I'll keep it or just replace this whole block with the new Combo block to keep file clean. 
        // User didn't ask to keep SIMULATION_V1 specifically, just "Pro combinations". 
        // I will append the new modes AFTER this block or just allow them.)
    }

    // 5. PRO TRADER COMBOS
    if (mode === 'COMBO_SPEED') {
        return {
            ...DEFAULT_CONFIG,
            ...DEFAULT_CONFIG.STRICT,
            MIN_WAIT_AFTER_OR: 5,
            MAX_WAIT_AFTER_OR: 60,
            BREAKOUT_VOLUME_MULT: 1.5
        };
    }
    if (mode === 'COMBO_LATE') {
        return {
            ...DEFAULT_CONFIG,
            ...DEFAULT_CONFIG.STRICT,
            MAX_WAIT_AFTER_OR: 240,
            EXIT_TIME: '15:20',
            BREAKOUT_VOLUME_MULT: 1.5
        };
    }
    if (mode === 'COMBO_PRO') {
        return {
            ...DEFAULT_CONFIG,
            ...DEFAULT_CONFIG.STRICT,
            MIN_WAIT_AFTER_OR: 5,
            MAX_WAIT_AFTER_OR: 180,
            MAX_OR_WIDTH_PERCENT: 3.0,
            BREAKOUT_VOLUME_MULT: 1.5
        };
    }

    return {
        // Map Registry -> Config
        TARGET_PERCENT: params.targetPercent?.value || DEFAULT_CONFIG.TARGET_PERCENT,
        MAX_OR_WIDTH_PERCENT: params.maxORWidth?.value || modeDefaults.MAX_OR_WIDTH_PERCENT,
        BREAKOUT_VOLUME_MULT: params.volumeThreshold?.value || modeDefaults.BREAKOUT_VOLUME_MULT,
        MIN_BREAKOUT_STRENGTH: params.minBreakoutStrength?.value || modeDefaults.MIN_BREAKOUT_STRENGTH,

        // EMA
        EMA_PERIOD: params.emaLong?.value || modeDefaults.EMA_PERIOD,

        // Wait Times (Hardcoded in registry or defaults for now if not in params)
        MIN_WAIT_AFTER_OR: modeDefaults.MIN_WAIT_AFTER_OR,
        MAX_WAIT_AFTER_OR: modeDefaults.MAX_WAIT_AFTER_OR,
        MAX_EMA_DEVIATION: modeDefaults.MAX_EMA_DEVIATION,

        PASS_THRESHOLD_ORIGINAL: modeDefaults.PASS_THRESHOLD_ORIGINAL,
        PASS_THRESHOLD_TRADECODE: modeDefaults.PASS_THRESHOLD_TRADECODE,

        EXIT_TIME: DEFAULT_CONFIG.EXIT_TIME,
        MIN_CANDLES: DEFAULT_CONFIG.MIN_CANDLES,
        MIN_OR_CANDLES: DEFAULT_CONFIG.MIN_OR_CANDLES,
        MAX_OR_CANDLES: DEFAULT_CONFIG.MAX_OR_CANDLES,
        VOLUME_THRESHOLD: DEFAULT_CONFIG.VOLUME_THRESHOLD
    };
}

/**
 * Calculate EMA for a series of candles
 */
function calculateEMA(candles, period) {
    if (candles.length < period) return null;

    const multiplier = 2 / (period + 1);

    // Start with SMA
    let sum = 0;
    for (let i = 0; i < period; i++) {
        sum += candles[i].close;
    }
    let ema = sum / period;

    // Calculate EMA
    for (let i = period; i < candles.length; i++) {
        ema = (candles[i].close - ema) * multiplier + ema;
    }

    return ema;
}

/**
 * Helper: Check if candle is within market hours (9:15 - 15:30 IST)
 * Handles both UTC ISO strings and Local Time strings
 */
function isValidIntradayCandle(timestamp, targetDateStr) {
    if (!timestamp) return false;

    // Handle different timestamp formats from Cache/Upstox
    let dateStr, timeNum;

    // Case 1: ISO UTC String (e.g., "2026-02-05T03:45:00.000Z")
    if (typeof timestamp === 'string' && timestamp.endsWith('Z')) {
        const d = new Date(timestamp);
        // Add 5.5 hours for IST
        const istTime = new Date(d.getTime() + (5.5 * 60 * 60 * 1000));
        dateStr = istTime.toISOString().split('T')[0];
        const hours = istTime.getUTCHours();
        const minutes = istTime.getUTCMinutes();
        timeNum = hours * 100 + minutes;
    }
    // Case 2: Local/IST String (e.g., "2026-02-05T09:15:00+05:30" or "2026-02-05T09:15:00")
    else if (typeof timestamp === 'string') {
        const parts = timestamp.split('T');
        dateStr = parts[0];
        const timePart = parts[1] || '';
        const timeParts = timePart.split(':');
        const hours = parseInt(timeParts[0], 10);
        const minutes = parseInt(timeParts[1], 10);
        timeNum = hours * 100 + minutes;
    }
    // Case 3: Timestamp constant (number)
    else if (typeof timestamp === 'number') {
        const d = new Date(timestamp);
        const istTime = new Date(d.getTime() + (5.5 * 60 * 60 * 1000));
        dateStr = istTime.toISOString().split('T')[0];
        const hours = istTime.getUTCHours();
        const minutes = istTime.getUTCMinutes();
        timeNum = hours * 100 + minutes;
    }
    else {
        return false;
    }

    if (dateStr !== targetDateStr) return false;
    // Market Hours: 9:15 to 15:30
    return timeNum >= 915 && timeNum <= 1530;
}

/**
 * Get 1-minute candles using PriceService (Auto-fetch + Cache)
 */
async function get1MinCandles(symbol, date) {
    const targetDateStr = typeof date === 'string' ? date.split('T')[0] : new Date(date).toISOString().split('T')[0];

    // 1. Get Instrument Key
    const instrument = await prisma.instrument.findFirst({
        where: { OR: [{ symbol: symbol }, { tradingSymbol: symbol }] }
    });

    if (!instrument || !instrument.instrumentKey) return [];

    // 2. Fetch Data (Cache -> Upstox -> Save)
    const nextDate = new Date(targetDateStr);
    nextDate.setDate(nextDate.getDate() + 1);
    const nextDateStr = nextDate.toISOString().split('T')[0];

    let rawCandles;
    try {
        rawCandles = await priceService.fetchPrice(symbol, instrument.instrumentKey, targetDateStr, nextDateStr, '1minute');
    } catch (e) {
        console.error(`[V2.1] PriceService Error for ${symbol}:`, e.message);
        return [];
    }

    if (!rawCandles || rawCandles.length === 0) return [];

    // 3. Filter for Market Hours
    const filteredCandles = rawCandles.filter(c => isValidIntradayCandle(c.timestamp, targetDateStr));
    return filteredCandles.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
}

/**
 * Get 20-day average volume for a stock
 */
async function getAvgVolume(symbol, date) {
    const targetDateStr = typeof date === 'string' ? date.split('T')[0] : new Date(date).toISOString().split('T')[0];
    const cached = await prisma.ohlcvCache.findFirst({ where: { symbol, interval: 'day' } });
    if (!cached || !cached.data || cached.data.length < 10) return null;

    const priorCandles = cached.data.filter(c => {
        const d = typeof c.timestamp === 'string' ? c.timestamp.split('T')[0] : new Date(c.timestamp).toISOString().split('T')[0];
        return d < targetDateStr;
    }).slice(-20);

    if (priorCandles.length < 10) return null;
    return priorCandles.reduce((sum, c) => sum + (c.volume || 0), 0) / priorCandles.length;
}

/**
 * Get stocks from intraday categories added on target date
 */
async function getIntradayStocks(categoryName, targetDate) {
    const dateStr = typeof targetDate === 'string' ? targetDate : new Date(targetDate).toISOString().split('T')[0];
    const TODAY_ONLY_CATEGORIES = ['INTRADAY_BOOST', 'HIGH_POWERED_STOCKS'];
    const isTodayOnly = TODAY_ONLY_CATEGORIES.includes(categoryName.toUpperCase());

    const category = await prisma.category.findFirst({
        where: { key: categoryName },
        include: { stocks: { include: { stock: true } } }
    });
    if (!category) return [];

    const seenSymbols = new Set();
    const uniqueStocks = [];

    for (const sc of category.stocks) {
        if (sc.stock && !seenSymbols.has(sc.stock.symbol)) {
            if (isTodayOnly) {
                // Use addedDate (IST-aware UTC midnight) for comparison
                // addedDate is stored as UTC midnight of the IST date (via importDateIST)
                let addedDateStr;
                if (sc.addedDate) {
                    addedDateStr = sc.addedDate.toISOString().split('T')[0];
                } else {
                    // Fallback to createdAt with IST offset
                    const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
                    const ist = new Date(sc.createdAt.getTime() + IST_OFFSET_MS);
                    addedDateStr = ist.toISOString().split('T')[0];
                }
                if (addedDateStr !== dateStr) continue;
            }
            seenSymbols.add(sc.stock.symbol);
            uniqueStocks.push({ symbol: sc.stock.symbol, instrumentKey: sc.stock.instrumentKey });
        }
    }
    return uniqueStocks;
}

function isGreenCandle(candle) {
    return candle.close > candle.open;
}

function isBreakoutFresh(nPattern, stock, targetDateStr, isBacktest = false) {
    if (isBacktest) return { fresh: true };

    const breakoutTime = new Date(nPattern.breakoutCandle.timestamp);
    const now = new Date();
    const isLive = now.toISOString().split('T')[0] === targetDateStr;

    if (isLive) {
        const diffMinutes = (now - breakoutTime) / (1000 * 60);
        if (diffMinutes > 10) {
            return { fresh: false, reason: `Stale breakout (>10m ago)` };
        }
    }
    return { fresh: true };
}

/**
 * ENHANCED FILTERS: V2.1 additional checks + TradeCode methodology
 */
function applyV21Filters(candles, openingRange, nPattern, avgDailyVolume, config, mode) {
    const SETTINGS = config;

    const result = {
        passed: false,
        emaCheck: false,
        breakoutStrength: false,
        volumeCheck: false,
        emaProximity: false,      // NEW: TradeCode - don't chase
        healthyCandle: false,     // NEW: TradeCode - strong candle
        emaTrend: false,          // NEW: TradeCode - trend confirmation
        reasons: []
    };

    // FILTER 5: 20 EMA Support (pullback near EMA)
    const emaCandles = candles.slice(0, nPattern.pullbackIndex + 1);
    const ema20 = calculateEMA(emaCandles, SETTINGS.EMA_PERIOD);

    if (ema20) {
        const deviation = Math.abs(nPattern.pullbackLow - ema20) / ema20;
        if (deviation <= SETTINGS.MAX_EMA_DEVIATION) {
            result.emaCheck = true;
        } else {
            result.reasons.push(`EMA deviation ${(deviation * 100).toFixed(2)}% > ${(SETTINGS.MAX_EMA_DEVIATION * 100)}%`);
        }
    }

    // FILTER 6: Strong Breakout
    const breakoutStrength = (nPattern.breakoutCandle.high - openingRange.high) / openingRange.high;
    if (breakoutStrength >= SETTINGS.MIN_BREAKOUT_STRENGTH) {
        result.breakoutStrength = true;
    } else {
        result.reasons.push(`Breakout ${(breakoutStrength * 100).toFixed(2)}% < ${(SETTINGS.MIN_BREAKOUT_STRENGTH * 100)}%`);
    }

    // FILTER 8: Higher Volume at Breakout
    const avgCandleVolume = avgDailyVolume / 375; // ~375 candles per day
    const breakoutVolume = nPattern.breakoutCandle.volume || 0;

    // If avgDailyVolume is missing, we skip volume check (or assume fail)
    if (avgDailyVolume && breakoutVolume >= avgCandleVolume * SETTINGS.BREAKOUT_VOLUME_MULT) {
        result.volumeCheck = true;
    } else if (avgDailyVolume) {
        result.reasons.push(`Breakout volume ${breakoutVolume} < ${avgCandleVolume.toFixed(0)} * ${SETTINGS.BREAKOUT_VOLUME_MULT}`);
    } else {
        // No volume data to compare
        result.reasons.push('No avg volume data');
    }

    // TradeCode Filters (Thresholds hardcoded or can be parameterized too)
    // We'll keep them relatively strict or map them if needed. 
    // For now, keep logic same but relax passing count.

    const breakoutCandles = candles.slice(0, nPattern.breakoutIndex + 1);
    const ema10AtBreakout = calculateEMA(breakoutCandles, 10);

    if (ema10AtBreakout) {
        const breakoutPrice = nPattern.breakoutCandle.close;
        const distanceFromEMA10 = Math.abs((breakoutPrice - ema10AtBreakout) / ema10AtBreakout) * 100;

        if (distanceFromEMA10 <= 1.5) {  // Relaxed to 1.5% generally or strictly 1% in STRICT
            // Let's use 1.0 for STRICT and 1.5 for RELAXED? 
            // Implementing implicit logic:
            const threshold = (mode === 'RELAXED' || mode === 'SIMULATION_V1') ? 1.5 : 1.0;
            if (distanceFromEMA10 <= threshold) {
                result.emaProximity = true;
            } else {
                result.reasons.push(`EMA10 dist ${distanceFromEMA10.toFixed(2)}% > ${threshold}%`);
            }
        } else {
            result.reasons.push(`EMA10 dist ${distanceFromEMA10.toFixed(2)}% > 1.5%`);
        }
    }

    const bc = nPattern.breakoutCandle;
    const bodySize = Math.abs(bc.close - bc.open);
    const totalRange = bc.high - bc.low;
    const bodyRatio = totalRange > 0 ? bodySize / totalRange : 0;

    const bodyThreshold = (mode === 'RELAXED' || mode === 'SIMULATION_V1') ? 0.50 : 0.60;
    if (bodyRatio >= bodyThreshold) {
        result.healthyCandle = true;
    } else {
        result.reasons.push(`Weak candle: body ${(bodyRatio * 100).toFixed(0)}% < ${(bodyThreshold * 100)}%`);
    }

    const ema20AtBreakout = calculateEMA(breakoutCandles, 20);

    if (ema10AtBreakout && ema20AtBreakout) {
        if (ema10AtBreakout > ema20AtBreakout) {
            result.emaTrend = true;
        } else {
            result.reasons.push(`EMA10 < EMA20 (bearish)`);
        }
    }

    const originalChecks = [result.emaCheck, result.breakoutStrength, result.volumeCheck].filter(Boolean).length;
    const tradeCodeChecks = [result.emaProximity, result.healthyCandle, result.emaTrend].filter(Boolean).length;

    result.passed = originalChecks >= SETTINGS.PASS_THRESHOLD_ORIGINAL && tradeCodeChecks >= SETTINGS.PASS_THRESHOLD_TRADECODE;
    result.checksPass = originalChecks + tradeCodeChecks;
    result.originalPass = originalChecks;
    result.tradeCodePass = tradeCodeChecks;

    return result;
}



/**
 * Generate intraday signals for a day (V2.1)
 */
/**
 * Generate Signals for a Category (V2.1)
 * @param {string} mode - 'STRICT' or 'RELAXED'
 * @param {boolean} isBacktest - If true, skips freshness checks (stale breakout)
 */
async function generateIntradaySignalsV21(categoryKey = 'INTRADAY_BOOST', dateStr = null, mode = null, isBacktest = false, customStocks = null) {
    const today = dateStr || new Date().toISOString().slice(0, 10);
    console.log(`[V2.1] Generating signals for ${categoryKey} on ${today} (Mode: ${mode || 'AUTO'})`);

    // Resolve Config (Registry > Mode > Default)
    const config = getStrategyConfig(categoryKey, mode);
    console.log(`[V2.1] Loaded Config: Target=${config.TARGET_PERCENT}%, VolMult=${config.BREAKOUT_VOLUME_MULT}, ORWidth=${config.MAX_OR_WIDTH_PERCENT}%`);

    const signals = [];
    // Stats object for tracking
    const stats = {
        volumePass: 0,
        orDetected: 0,
        nPatternFound: 0,
        enhancedFiltersPass: 0,
        finalSignals: 0,
        duplicatesSkipped: 0
    };

    const skipReport = [];
    const seenSignals = new Set();
    const debugSamples = []; // DEBUG ARRAY

    const stocks = customStocks || await getIntradayStocks(categoryKey, dateStr);
    console.log(`[V2.1 SCAN] Found ${stocks.length} unique stocks to scan`);
    console.log('═'.repeat(60));

    // --- PHASE 1: MARKET CONTEXT (Nifty 50) ---
    // Fetch DIRECTLY via priceService (Nifty is NOT in Instrument DB table)
    let niftyCandles = [];
    try {
        const niftyInstrumentKey = 'NSE_INDEX|Nifty 50';
        const nextDay = new Date(today);
        nextDay.setDate(nextDay.getDate() + 1);
        const nextDayStr = nextDay.toISOString().split('T')[0];
        const rawNifty = await priceService.fetchPrice('NIFTY50', niftyInstrumentKey, today, nextDayStr, '1minute');
        if (rawNifty && rawNifty.length > 0) {
            niftyCandles = rawNifty.filter(c => isValidIntradayCandle(c.timestamp, today))
                .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
        }
        console.log(`[V2.1] Fetched ${niftyCandles.length} Nifty 50 candles for Market Trend`);
    } catch (e) {
        console.warn(`[V2.1] Failed to fetch Nifty 50 data: ${e.message}`);
    }

    for (const stock of stocks) {
        try {
            const candles = await get1MinCandles(stock.symbol, today);

            // LOGGING: Data Status
            if (candles.length === 0) {
                if (isBacktest) console.log(`[${stock.symbol}] ❌ No 1-min Data found`);
                continue;
            }
            if (candles.length < config.MIN_CANDLES) {
                if (isBacktest) console.log(`[${stock.symbol}] ❌ Insufficient Data (${candles.length} < ${config.MIN_CANDLES})`);
                continue;
            }

            // V1 FILTER: Opening volume
            const first5Candles = candles.slice(0, 5);
            const openingVolume = first5Candles.reduce((sum, c) => sum + (c.volume || 0), 0);
            const avgDailyVolume = await getAvgVolume(stock.symbol, dateStr);

            if (!avgDailyVolume || avgDailyVolume === 0) {
                if (isBacktest) console.log(`[${stock.symbol}] ❌ No Avg Volume Data`);
                continue;
            }

            const expectedOpeningVolume = avgDailyVolume * 0.03;
            const volumeRatio = openingVolume / expectedOpeningVolume;

            const volumePassed = volumeRatio >= config.VOLUME_THRESHOLD;

            // DEBUG: Volume Check (First 10)
            if (debugSamples.length < 10) {
                debugSamples.push({
                    symbol: stock.symbol,
                    volumeRatio: volumeRatio.toFixed(2),
                    threshold: config.VOLUME_THRESHOLD,
                    openingVol: openingVolume,
                    expectedVol: expectedOpeningVolume.toFixed(2),
                    passed: volumePassed,
                    type: 'VOLUME_CHECK'
                });
            }

            if (!volumePassed) {
                if (isBacktest && stats.volumePass < 5) console.log(`[${stock.symbol}] ❌ Volume Fail: ${volumeRatio.toFixed(2)}x < ${config.VOLUME_THRESHOLD}x`);
                continue;
            }
            stats.volumePass++;

            // 1. OR Detection
            const openingRange = detectOpeningRange(candles, config);
            if (!openingRange) {
                if (isBacktest && stats.orDetected < 5) console.log(`[${stock.symbol}] ❌ OR Fail: Range too wide or undetermined`);
                continue;
            }
            stats.orDetected++;

            // 2. N-Pattern Detection
            const nPattern = detectNPatternV21(candles, openingRange, config);
            if (!nPattern) {
                // Too noisy to log every pattern fail, but maybe log first few
                if (isBacktest && stats.nPatternFound < 5) console.log(`[${stock.symbol}] ❌ No N-Pattern found`);
                continue;
            }
            stats.nPatternFound++;

            // FILTER 10: Fresh Breakout Check
            const freshness = isBreakoutFresh(nPattern, stock, dateStr, isBacktest);
            // if (stock.symbol === 'TCS') console.log(`[TCS] Freshness: ${freshness.fresh} (${freshness.reason})`);

            if (!freshness.fresh) {
                console.log(`[${stock.symbol}] ❌ Skipped: ${freshness.reason} `);
                continue;
            }
            // console.log(`[${stock.symbol}] ✓ Freshness check passed`);


            // FILTERS 5, 6, 8: Enhanced checks
            const enhancedFilters = applyV21Filters(candles, openingRange, nPattern, avgDailyVolume, config, mode);
            if (!enhancedFilters.passed) {
                console.log(`[${stock.symbol}] ❌ Filters Failed: ${enhancedFilters.reasons.join(', ')} `);
                continue;
            }
            stats.enhancedFiltersPass++;

            // All filters passed
            const entryPrice = openingRange.high;
            const stopPrice = nPattern.pullbackLow;
            const stopPercent = ((entryPrice - stopPrice) / entryPrice) * 100;
            const targetPrice = entryPrice * (1 + config.TARGET_PERCENT / 100);
            const entryTime = nPattern.breakoutCandle.timestamp.split('T')[1].substring(0, 5);

            // --- SIGNAL QUALITY CHECK ---
            let qualityData = { score: 0, confidence: 'UNKNOWN', factors: {}, warnings: [] };
            try {
                // Fetch Previous Day Candle for Context
                const fiveDaysAgo = new Date(new Date(today).getTime() - 5 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

                // Look up instrumentKey from DB if not on stock object
                let instrumentKey = stock.instrumentKey;
                if (!instrumentKey) {
                    const inst = await prisma.instrument.findFirst({
                        where: { OR: [{ symbol: stock.symbol }, { tradingSymbol: stock.symbol }] }
                    });
                    instrumentKey = inst?.instrumentKey;
                }

                let prevDayCandle = null;
                if (instrumentKey) {
                    const dailyCandles = await priceService.fetchPrice(stock.symbol, instrumentKey, fiveDaysAgo, today, 'day');
                    if (dailyCandles && dailyCandles.length > 0) {
                        prevDayCandle = dailyCandles.filter(c => {
                            try {
                                const cDate = new Date(c.timestamp).toISOString().split('T')[0];
                                return cDate < today;
                            } catch { return false; }
                        }).pop() || null;
                    }
                }

                // Pass to Calculator
                const signalContext = { entryTime, symbol: stock.symbol, date: dateStr };
                qualityData = calculateSignalQuality(signalContext, candles, niftyCandles, prevDayCandle);

                console.log(`[${stock.symbol}] Quality Score: ${qualityData.score} (${qualityData.confidence})`);
                if (qualityData.warnings.length > 0) console.log(`[${stock.symbol}] ⚠️ Warnings: ${qualityData.warnings.join(', ')}`);

                // --- AUTO-SKIP FILTER (HYBRID MODE) ---
                // Only applies if user has enabled these settings
                const { autoSkipLow, autoSkipAgainstTrend } = liveModeSettings.getAutoSkipSettings();

                if (autoSkipLow && qualityData.confidence === 'LOW') {
                    console.log(`[${stock.symbol}] Skipped: Low Confidence (Auto-Skip Enabled)`);
                    continue; // SKIP SIGNAL
                }

                if (autoSkipAgainstTrend && qualityData.warnings.includes('AGAINST_TREND')) {
                    console.log(`[${stock.symbol}] Skipped: Against Trend (Auto-Skip Enabled)`);
                    continue; // SKIP SIGNAL
                }

            } catch (e) {
                console.log(`[${stock.symbol}] Failed to calc quality: ${e.message}`);
                // Proceeding with default (score 0, UNKNOWN) is safer.
            }

            const signalKey = `${dateStr} -${stock.symbol} -${entryTime} `;
            if (seenSignals.has(signalKey)) {
                stats.duplicatesSkipped++;
                continue;
            }
            seenSignals.add(signalKey);

            console.log(`[${stock.symbol}] 🎯 SIGNAL GENERATED: Entry = ${entryPrice} `);

            signals.push({
                symbol: stock.symbol,
                date: dateStr,
                entryTime,
                entryPrice,
                targetPrice,
                stopPrice,
                stopPercent: stopPercent.toFixed(2),
                volumeRatio: volumeRatio.toFixed(2),
                orRange: openingRange.rangePercent.toFixed(2),
                enhancedChecks: enhancedFilters.checksPass,
                strategy: 'V2.1_ENHANCED',
                // UI Extras
                confidence: qualityData.confidence, // Override basic confidence
                qualityScore: qualityData.score,
                qualityFactors: qualityData.factors,
                warnings: qualityData.warnings,
                freshness: 'Fresh'
            });
            stats.finalSignals++;

        } catch (error) {
            console.error(`[V2.1] Error processing ${stock.symbol}: `, error.message);
        }
    }

    console.log(`[V2.1] Pattern filtering stats: `);
    console.log(`  Volume passed: ${stats.volumePass} `);
    console.log(`  Opening Range detected(< 2 %): ${stats.orDetected} `);
    console.log(`  N - Pattern found(15 - 45 min): ${stats.nPatternFound} `);
    console.log(`  Enhanced filters pass(2 / 3): ${stats.enhancedFiltersPass} `);
    if (stats.duplicatesSkipped > 0) {
        console.log(`  Duplicates skipped: ${stats.duplicatesSkipped} `);
    }
    console.log(`[V2.1] Generated ${signals.length} unique signals`);

    // Return both signals and stats for UI monitoring

    // DEBUG: Final Summary
    console.log('═'.repeat(60));
    console.log('[V2.1] SCAN SUMMARY');
    console.log('═'.repeat(60));
    console.log(`  Total Stocks: ${stocks.length} `);
    console.log(`  Volume Pass(>= ${config.VOLUME_THRESHOLD}x): ${stats.volumePass} `);
    console.log(`  OR Detected(< ${config.MAX_OR_WIDTH_PERCENT}%): ${stats.orDetected} `);
    console.log(`  N - Pattern Found: ${stats.nPatternFound} `);
    console.log(`  Final Signals: ${stats.finalSignals} `);
    console.log('═'.repeat(60));

    if (debugSamples.length > 0) {
        console.log('[V2.1] Debug Samples (First 10):');
        debugSamples.forEach(d => {
            if (d.type === 'VOLUME_CHECK') {
                console.log(`  ${d.symbol}: VolRatio ${d.volumeRatio} x(Need ${d.threshold}x) -> ${d.passed ? 'PASS' : 'FAIL'} `);
            } else if (d.type === 'OR_CHECK') {
                console.log(`  ${d.symbol}: OR Range ${d.rangePercent}% (Need < ${d.threshold}%) -> ${d.passed ? 'PASS' : 'FAIL'} `);
            }
        });
        console.log('═'.repeat(60));
    }

    return {
        signals,
        stats: {
            ...stats,
            totalStocks: stocks.length,
            lastScanTime: new Date().toISOString()
        }
    };
}

/**
 * Simulate a single intraday trade (V2.1)
 */

async function simulateIntradayTradeV21(signal, date, config) {
    const { evaluateOutcome } = require('../signalEngine.cjs');
    const dateStr = typeof date === 'string' ? date : date.toISOString().split('T')[0];
    const candles = await get1MinCandles(signal.symbol, dateStr);

    if (candles.length === 0) {
        return { ...signal, outcome: 'NO_DATA', pnlPercent: 0, rMultiple: 0 };
    }

    // Build a signal-like object that evaluateOutcome expects
    const sigObj = {
        entryPrice: signal.entryPrice,
        stopPrice: signal.stopPrice,
        t1Price: signal.t1Price || signal.targetPrice,
        t2Price: signal.t2Price || null,
        direction: signal.direction || 'LONG',
        confirmedAt: signal.entryTime ? `${dateStr}T${signal.entryTime}:00+05:30` : null
    };

    // Use the shared evaluateOutcome (includes fill phase + T1/T2/breakeven logic)
    const result = evaluateOutcome(sigObj, candles);

    const pnlPercent = result.exitPrice && signal.entryPrice
        ? (((result.exitPrice - signal.entryPrice) / signal.entryPrice) * 100 *
            (signal.direction === 'SHORT' ? -1 : 1))
        : 0;

    // Map to legacy outcome format for backward compatibility
    const outcomeMap = {
        'T1_HIT': result.rMultiple > 0 ? 'WIN' : 'BREAKEVEN',
        'T2_HIT': 'WIN',
        'STOP_HIT': 'LOSS',
        'EOD_CLOSE': result.rMultiple > 0 ? 'WIN' : 'LOSS',
        'NOT_FILLED': 'EXPIRED',
        'NO_DATA': 'NO_DATA'
    };

    return {
        ...signal,
        exitTime: result.exitTime ? result.exitTime.split('T')[1]?.substring(0, 5) : config.EXIT_TIME,
        exitPrice: result.exitPrice || signal.entryPrice,
        exitReason: result.outcome,
        outcome: outcomeMap[result.outcome] || 'LOSS',
        pnlPercent: pnlPercent.toFixed(2),
        rMultiple: result.rMultiple,
        hitT1: result.hitT1 || false,
        hitT2: result.hitT2 || false,
        hitStop: result.hitStop || false,
        fillTime: result.fillTime
    };
}


/**
 * FILTER 1: Detect Opening Range
 */
function detectOpeningRange(candles, config) {
    // Standard 9:15-9:30 OR (first 15 mins)
    // If MIN_OR_CANDLES is 5 (for 3min candles) or 15 (for 1min candles)
    // We'll use time-based check: 9:15 to 9:30

    // Assuming 1-min candles (so 15 candles)
    if (candles.length < 15) return null;

    let high = -Infinity;
    let low = Infinity;

    // OR is first 15 minutes logic
    // We use a fixed 15 here or could derive from config if needed
    const orDurationIdx = 15;

    for (let i = 0; i < orDurationIdx; i++) {
        if (candles[i].high > high) high = candles[i].high;
        if (candles[i].low < low) low = candles[i].low;
    }

    // Validate OR Width
    const orHeightPercent = ((high - low) / low) * 100;
    if (config && orHeightPercent > config.MAX_OR_WIDTH_PERCENT) {
        // Should we return null or return object with failure?
        // Original code returned object or null. 
        // Let's stick to returning null if it fails width check for simplicity in usage
        return null;
    }

    return {
        complete: true,
        high,
        low,
        endIdx: orDurationIdx - 1,
        rangePercent: orHeightPercent
    };
}

/**
 * FILTER 2: Detect N-Pattern (V2.1 ENHANCED)
 */
function detectNPatternV21(candles, orData, config) {
    const { high: orHigh, low: orLow, endIdx } = orData;

    // Config values
    const minWait = config.MIN_WAIT_AFTER_OR;
    const maxWait = config.MAX_WAIT_AFTER_OR;

    // Search window
    const searchStart = endIdx + minWait;
    const searchEnd = Math.min(endIdx + maxWait, candles.length - 1);

    let pullbackLow = Infinity;
    let pullbackIndex = -1;
    let breakoutIndex = -1;
    let breakoutCandle = null;

    // Iterate through the search window
    // We need to find:
    // 1. A pullback (this is continuously tracked)
    // 2. A breakout (close > OR High)

    for (let i = endIdx + 1; i <= searchEnd; i++) {
        const candle = candles[i];

        // Track Lowest Low since OR (Pullback)
        if (candle.low < pullbackLow) {
            pullbackLow = candle.low;
            pullbackIndex = i;
        }

        // Wait until MIN_WAIT reached before checking breakout
        if (i < searchStart) continue;

        // Breakout Check
        if (candle.close > orHigh) {

            // Minimal breakout strength check to avoid noise (optional, can be done in main filters too)
            const breakStrength = (candle.close - orHigh) / orHigh;
            if (config.MIN_BREAKOUT_STRENGTH && breakStrength < config.MIN_BREAKOUT_STRENGTH) {
                continue; // Weak breakout, ignore
            }

            // Valid N-Pattern found?
            // Need a pullback that is lower than break price (obviously) 
            // and maybe higher than OR low (higher low)?
            // V2 standard rule: Pullback Low > OR Low (Higher Low Structure)

            if (pullbackLow > orLow) {
                breakoutIndex = i;
                breakoutCandle = candle;

                return {
                    found: true,
                    breakoutIndex,
                    breakoutCandle,
                    pullbackLow,
                    pullbackIndex
                };
            }
        }
    }

    return null;
}

/**
 * Run backtest for a date range (V2.1)
 * REFACTORED: Iterates day-by-day, respects addedDate, handles 1min vs Daily data
 */
async function backtestIntradayV21(categoryName, startDate, endDate, mode = 'STRICT') {
    console.log('\n' + '═'.repeat(60));
    console.log(`INTRADAY BACKTEST V2.1(ENHANCED PATTERNS) - ${mode} MODE`);
    console.log('═'.repeat(60));
    console.log(`Category: ${categoryName} `);
    console.log(`Period: ${startDate} to ${endDate} `);

    const start = new Date(startDate);
    const end = new Date(endDate);
    const allTrades = [];

    // 30 days ago calculation for data granularity
    const today = new Date();
    const thirtyDaysAgo = new Date(today.getTime() - (30 * 24 * 60 * 60 * 1000));
    console.log(`Data Cutoff(30d ago): ${thirtyDaysAgo.toISOString().split('T')[0]} `);

    let currentDate = new Date(start);
    let tradingDays = 0;

    while (currentDate <= end) {
        const dayOfWeek = currentDate.getDay();
        const dateStr = currentDate.toISOString().split('T')[0];

        // Skip Weekends
        if (dayOfWeek !== 0 && dayOfWeek !== 6) {

            // 1. Determine Data Mode
            const isRecent = currentDate >= thirtyDaysAgo;
            const dataType = isRecent ? '1minute' : 'daily';

            console.log(`\n[Backtest] Processing ${dateStr} (${dataType} mode)...`);

            if (!isRecent) {
                console.warn(`  ⚠️  WARNING: Date > 30 days old. 1 - minute data not available.Using DAILY approximation.`);
                // For V2.1 (Intraday ORB), Daily data is insufficient for accurate signals.
                // We skips old dates to avoid false results, OR we could implement a rough heuristic.
                // User requested "Use daily data (approximation)", but practically V2.1 needs intraday.
                // We will try to scan, but get1MinCandles will likely fail or we mock it.
                // Actually, let's skip for now to prevent crash, unless we write a specific Daily emulator.
                console.warn(`  ⚠️  Skipping ${dateStr} as V2.1 requires Intraday data.`);
                currentDate.setDate(currentDate.getDate() + 1);
                continue;
            }

            // 2. Scan Stocks Added ON THIS DATE
            // getIntradayStocks is now fixed to filter by dateStr
            const { signals } = await generateIntradaySignalsV21(categoryName, dateStr, mode, true);

            // Resolve config again for simulation (or pass it back from generate?)
            // We can re-fetch easily since it's cheap
            const config = getStrategyConfig(categoryName, mode);

            if (signals.length > 0) {
                console.log(`  -> Generated ${signals.length} signals`);
                for (const signal of signals) {
                    const trade = await simulateIntradayTradeV21(signal, currentDate, config);
                    allTrades.push(trade);
                }
            } else {
                console.log(`  -> No signals.`);
            }

            tradingDays++;
        }

        currentDate.setDate(currentDate.getDate() + 1);
    }

    // ... (Stats calculation)
    const winners = allTrades.filter(t => t.outcome === 'WIN');
    const losers = allTrades.filter(t => t.outcome === 'LOSS');
    const winRate = allTrades.length > 0 ? (winners.length / allTrades.length * 100) : 0;

    // CONFIDENCE METRICS breakdown
    const confidenceMetrics = {
        HIGH: { total: 0, wins: 0, losses: 0, pnl: 0, winRate: 0, avgPnl: 0 },
        MEDIUM: { total: 0, wins: 0, losses: 0, pnl: 0, winRate: 0, avgPnl: 0 },
        LOW: { total: 0, wins: 0, losses: 0, pnl: 0, winRate: 0, avgPnl: 0 },
        AVOID: { total: 0, wins: 0, losses: 0, pnl: 0, winRate: 0, avgPnl: 0 },
        UNKNOWN: { total: 0, wins: 0, losses: 0, pnl: 0, winRate: 0, avgPnl: 0 }
    };

    allTrades.forEach(t => {
        const conf = (t.confidence || 'UNKNOWN').toUpperCase();
        if (confidenceMetrics[conf]) {
            confidenceMetrics[conf].total++;
            const pnl = parseFloat(t.pnlPercent);
            confidenceMetrics[conf].pnl += pnl;
            if (t.outcome === 'WIN') confidenceMetrics[conf].wins++;
            else if (t.outcome === 'LOSS') confidenceMetrics[conf].losses++;
        } else {
            // Fallback for unexpected values
            confidenceMetrics.UNKNOWN.total++;
            if (t.outcome === 'WIN') confidenceMetrics.UNKNOWN.wins++;
            else if (t.outcome === 'LOSS') confidenceMetrics.UNKNOWN.losses++;
        }
    });

    Object.keys(confidenceMetrics).forEach(key => {
        const m = confidenceMetrics[key];
        if (m.total > 0) {
            m.winRate = (m.wins / m.total) * 100;
            m.avgPnl = m.pnl / m.total;
        }
    });

    const avgWin = winners.length > 0
        ? winners.reduce((sum, t) => sum + parseFloat(t.pnlPercent), 0) / winners.length
        : 0;
    const avgLoss = losers.length > 0
        ? losers.reduce((sum, t) => sum + parseFloat(t.pnlPercent), 0) / losers.length
        : 0;
    const totalPnL = allTrades.reduce((sum, t) => sum + parseFloat(t.pnlPercent), 0);
    const ev = allTrades.length > 0 ? totalPnL / allTrades.length : 0;

    const targetHits = allTrades.filter(t => t.exitReason === 'TARGET_HIT').length;
    const stopHits = allTrades.filter(t => t.exitReason === 'STOP_HIT').length;
    const eodExits = allTrades.filter(t => t.exitReason === 'EOD_EXIT').length;

    console.log('═'.repeat(60));
    console.log(`Trading Days: ${tradingDays} `);
    console.log(`Total Signals: ${allTrades.length} `);
    console.log(`Winners: ${winners.length} (${winRate.toFixed(1)}%)`);
    console.log(`Losers: ${losers.length} (${(100 - winRate).toFixed(1)}%)`);
    console.log('');
    console.log('Confidence Breakdown:');
    Object.entries(confidenceMetrics).forEach(([k, v]) => {
        if (v.total > 0) {
            console.log(`  ${k}: ${v.total} trades, ${v.winRate.toFixed(1)}% WR, Avg PnL: ${v.avgPnl.toFixed(2)}%`);
        }
    });
    console.log('');
    console.log(`Avg Win: +${avgWin.toFixed(2)}% `);
    console.log(`Avg Loss: ${avgLoss.toFixed(2)}% `);
    console.log(`Total P & L: ${totalPnL >= 0 ? '+' : ''}${totalPnL.toFixed(2)}% `);
    console.log('');
    console.log(`Expected Value: ${ev >= 0 ? '+' : ''}${ev.toFixed(3)}% per trade`);
    console.log('');
    console.log('Exit Breakdown:');
    if (allTrades.length > 0) {
        console.log(`  TARGET_HIT: ${targetHits} (${(targetHits / allTrades.length * 100).toFixed(1)}%)`);
        console.log(`  STOP_HIT: ${stopHits} (${(stopHits / allTrades.length * 100).toFixed(1)}%)`);
        console.log(`  EOD_EXIT: ${eodExits} (${(eodExits / allTrades.length * 100).toFixed(1)}%)`);
    }
    console.log('═'.repeat(60));

    return {
        category: categoryName,
        period: { start: startDate, end: endDate },
        tradingDays,
        totalTrades: allTrades.length,
        winners: winners.length,
        losers: losers.length,
        winRate,
        avgWin,
        avgLoss,
        totalPnL,
        ev,
        confidenceMetrics, // New Field
        trades: allTrades
    };
}

/**
 * Debug function to analyze a single stock in depth
 */
async function debugSingleStock(symbol, date) {
    console.log('═'.repeat(60));
    console.log(`DEBUGGING ${symbol} for date ${date}`);
    console.log('═'.repeat(60));

    // 1. Get 1-min data
    const candles = await get1MinCandles(symbol, date);
    console.log(`\n1.DATA STATUS: `);
    console.log(`   Candles found: ${candles.length} `);

    if (candles.length > 0) {
        console.log(`   First Candle: ${JSON.stringify(candles[0])} `);
        console.log(`   Last Candle: ${JSON.stringify(candles[candles.length - 1])} `);
        const sampleVolumes = candles.slice(0, 5).map(c => c.volume);
        console.log(`   Sample Volumes(first 5): ${JSON.stringify(sampleVolumes)} `);
        const sampleHighs = candles.slice(0, 5).map(c => c.high);
        console.log(`   Sample Highs(first 5): ${JSON.stringify(sampleHighs)} `);
        const zeroVolCount = candles.filter(c => !c.volume || c.volume === 0).length;
        console.log(`   Zero Volume Candles: ${zeroVolCount}/${candles.length}`);
    } else {
        console.log(`   ❌ NO DATA FOUND! Check database or Upstox fetch.`);
        return;
    }

    // 2. Check Opening Range
    console.log(`\n2. OPENING RANGE (9:15 - 9:30):`);
    const or = detectOpeningRange(candles);
    if (or) {
        console.log(`   ✅ OR Detected: High=${or.high}, Low=${or.low}, Range=${or.rangePercent.toFixed(2)}%`);
    } else {
        console.log(`   ❌ OR Detection Failed`);
        const orCandles = candles.slice(0, Math.min(candles.length, CONFIG.MAX_OR_CANDLES));
        if (orCandles.length > 0) {
            const firstCandle = orCandles[0];
            const isGreen = firstCandle.close > firstCandle.open;
            console.log(`   First Candle: H=${firstCandle.high}, L=${firstCandle.low}, Green=${isGreen}`);
        }
    }

    // 3. Strategy Analysis

    // 3. Strategy Analysis
    console.log(`\n3. STRATEGY ANALYSIS:`);
    const avgVol = await getAvgVolume(symbol, date);
    console.log(`   Avg Daily Volume (20d): ${avgVol ? avgVol.toFixed(0) : 'N/A'}`);

    // Resolve Config for Debugging
    const config = getStrategyConfig('INTRADAY_BOOST', 'STRICT'); // Assume Strict/Default for debug

    if (or && avgVol) {
        const nPattern = detectNPatternV21(candles, or, config);
        if (nPattern) {
            console.log(`   ✅ N-Pattern Found at index ${nPattern.breakoutIndex} (Time: ${candles[nPattern.breakoutIndex].timestamp})`);
            const filters = applyV21Filters(candles, or, nPattern, avgVol, config);
            console.log(`   Filter Results:`, JSON.stringify(filters, null, 2));
        } else {
            console.log(`   ❌ No N-Pattern found (Breakout > OR High with Pullback)`);
            const windowEnd = Math.min(candles.length, or.endIndex + config.MAX_WAIT_AFTER_OR);
            const windowCandles = candles.slice(or.endIndex + 1, windowEnd);
            const maxHigh = Math.max(...windowCandles.map(c => c.high));
            console.log(`   Max High in Window (${or.endIndex + 1}-${windowEnd}): ${maxHigh} (OR High: ${or.high})`);
        }
    }

    console.log('═'.repeat(60));
}

module.exports = {
    generateIntradaySignalsV21,
    simulateIntradayTradeV21,
    backtestIntradayV21,
    calculateEMA,
    debugSingleStock,
    // Exports for Testing/Debug
    detectOpeningRange,
    detectNPatternV21,
    applyV21Filters,
    get1MinCandles,
    getIntradayStocks
};

if (require.main === module) {
    const args = process.argv.slice(2);
    const category = args[0] || 'INTRADAY_BOOST';
    const startDate = args[1] || '2026-01-06';
    const endDate = args[2] || startDate;
    const mode = args[3] || 'STRICT';

    backtestIntradayV21(category, startDate, endDate, mode)
        .then(results => {
            console.log('\n✅ V2.1 Backtest complete');
        })
        .catch(console.error)
        .finally(() => prisma.$disconnect());
}
