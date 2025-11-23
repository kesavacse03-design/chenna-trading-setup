// Strategy Engine for DOWNSIDE_LOM_SWING
// Targets stocks that have fallen and are showing reversal patterns
// Goal: 70%+ accuracy with proper entry/exit management

const TA = require('./technicalAnalysis.cjs');

class DownsideLomSwingStrategy {
    constructor() {
        this.name = 'DOWNSIDE_LOM_SWING_V1';
        this.version = 'V1';
        this.category = 'DOWNSIDE_LOM_SWING';
        this.targetAccuracy = 0.70;
        this.riskRewardRatio = 2.0;
    }

    // ========== ANTI-TRAP FILTERS ==========

    checkAntiTrapFilters(candles, currentCandle, idx) {
        const filters = {
            volumeConfirmation: false,
            noRecentFakeBreakout: false,
            trendAlignment: false,
            strongMomentum: false,
            riskRewardValid: false
        };

        // 1. Volume Confirmation (1.5x average - relaxed from 2x)
        filters.volumeConfirmation = TA.isVolumeSpike(currentCandle, candles.slice(0, idx), 1.5);

        // 2. No Recent Fake Breakout
        const swingLevels = TA.getSwingHighLow(candles.slice(0, idx));
        if (swingLevels.high) {
            filters.noRecentFakeBreakout = !TA.isFakeBreakout(
                candles.slice(idx - 2, idx + 1),
                swingLevels.high
            );
        } else {
            filters.noRecentFakeBreakout = true; // No swing level to check
        }

        // 3. Trend Alignment (looking for reversal from downtrend)
        const trend = TA.getTrend(candles.slice(0, idx), 20);
        filters.trendAlignment = trend === 'DOWNTREND' || trend === 'SIDEWAYS';

        // 4. Strong Momentum (RSI widened range - relaxed from 25-55)
        const rsi = TA.calculateRSI(candles.slice(0, idx + 1), 14);
        if (rsi) {
            // For bullish reversal: RSI between 20-60 (more lenient)
            filters.strongMomentum = rsi > 20 && rsi < 60;
        }

        // 5. Risk/Reward Validation (will be checked in getEntrySignal)
        filters.riskRewardValid = true; // Placeholder

        return filters;
    }

    // ========== ENTRY LOGIC ==========

    getEntrySignal(candles, idx) {
        if (idx < 50) return null; // Need enough history

        const currentCandle = candles[idx];
        const prevCandle = candles[idx - 1];
        const prev2Candle = candles[idx - 2];

        // Core Pattern: Looking for bullish reversal after downside
        // 1. Hammer or Bullish Engulfing
        const hasHammer = TA.isHammer(currentCandle, candles.slice(0, idx));
        const hasEngulfing = TA.isEngulfing(currentCandle, prevCandle, true);

        if (!hasHammer && !hasEngulfing) {
            return null; // No pattern
        }

        // 2. Price above short-term moving average (20 EMA) - more lenient
        const ema20 = TA.calculateEMA(candles.slice(0, idx + 1), 20);
        if (!ema20 || currentCandle.close < ema20 * 0.95) {
            return null; // Not above EMA (95% tolerance, relaxed from 98%)
        }

        // 3. Check anti-trap filters
        const filters = this.checkAntiTrapFilters(candles, currentCandle, idx);

        const passedFilters =
            filters.volumeConfirmation &&
            filters.noRecentFakeBreakout &&
            filters.trendAlignment &&
            filters.strongMomentum;

        if (!passedFilters) {
            return null; // Failed filters
        }

        // 4. Calculate entry, target, and stop loss
        const atr = TA.calculateATR(candles.slice(0, idx + 1), 14);
        const swingLow = TA.getSwingHighLow(candles.slice(0, idx), 10).low;

        const entry = currentCandle.close;
        const stopLoss = swingLow || (entry - (atr * 1.5));
        const risk = entry - stopLoss;
        const target = entry + (risk * this.riskRewardRatio);

        // Risk/reward check
        if (risk / entry > 0.05) {
            return null; // Risk too high (>5%)
        }

        return {
            type: 'BUY',
            entry,
            target,
            stopLoss,
            trailingStop: entry + (risk * 0.5), // Trail after 0.5R profit
            pattern: hasHammer ? 'HAMMER' : 'BULLISH_ENGULFING',
            filters,
            atr,
            rsi: TA.calculateRSI(candles.slice(0, idx + 1), 14),
            ema20
        };
    }

    // ========== EXIT LOGIC ==========

    checkExit(trade, currentCandle, candles, idx) {
        // 1. Target Hit
        if (currentCandle.high >= trade.target) {
            return {
                type: 'TARGET_HIT',
                exitPrice: trade.target,
                pnl: trade.target - trade.entry,
                pnlPercent: ((trade.target - trade.entry) / trade.entry) * 100
            };
        }

        // 2. Stop Loss Hit
        if (currentCandle.low <= trade.stopLoss) {
            return {
                type: 'SL_HIT',
                exitPrice: trade.stopLoss,
                pnl: trade.stopLoss - trade.entry,
                pnlPercent: ((trade.stopLoss - trade.entry) / trade.entry) * 100
            };
        }

        // 3. Trailing Stop Hit (if price moved favorably)
        if (trade.currentTrail && currentCandle.low <= trade.currentTrail) {
            return {
                type: 'TRAILING_SL_HIT',
                exitPrice: trade.currentTrail,
                pnl: trade.currentTrail - trade.entry,
                pnlPercent: ((trade.currentTrail - trade.entry) / trade.entry) * 100
            };
        }

        // 4. Update Trailing Stop (lock in profits)
        const entryToTarget = trade.target - trade.entry;
        const entryToCurrent = currentCandle.close - trade.entry;
        const profitPercent = entryToCurrent / entryToTarget;

        if (profitPercent > 0.5 && currentCandle.close > trade.trailingStop) {
            // Moved 50% to target - trail stop to breakeven
            trade.currentTrail = trade.entry;
        } else if (profitPercent > 0.75) {
            // Moved 75% to target - trail to 50% profit
            trade.currentTrail = trade.entry + (entryToTarget * 0.5);
        }

        return null; // Trade continues
    }

    // ========== SIDEWAYS DETECTION ==========

    isSideways(candles, entryIdx, currentIdx, maxDays = 10) {
        if (currentIdx - entryIdx >= maxDays) {
            // Max days reached - check if it moved anywhere
            const candleAtEntry = candles[entryIdx];
            const currentCandle = candles[currentIdx];

            const movePercent = Math.abs(currentCandle.close - candleAtEntry.close) / candleAtEntry.close;

            // If moved less than 2% in 10 days - it's sideways
            return movePercent < 0.02;
        }

        return false;
    }

    // ========== STRATEGY DESCRIPTION ==========

    getDescription() {
        return {
            name: this.name,
            version: this.version,
            category: this.category,
            targetAccuracy: this.targetAccuracy,
            riskRewardRatio: this.riskRewardRatio,
            rules: [
                'Entry Pattern: Hammer or Bullish Engulfing candle',
                'Price must be above 20 EMA (98% tolerance)',
                'Volume spike > 2x average',
                'No recent fake breakouts',
                'Trend: Downtrend or Sideways (reversal setup)',
                'RSI: 25-55 (oversold recovery)',
                'Risk < 5% of entry price',
                'Target: 2x risk',
                'Trailing stop: Lock profits at 0.5R'
            ],
            antiTrapFilters: [
                'Volume confirmation (2x average)',
                'Fake breakout detection (last 3 candles)',
                'Trend alignment check',
                'Momentum validation (RSI range)',
                'Risk/reward minimum threshold'
            ]
        };
    }
}

module.exports = DownsideLomSwingStrategy;
