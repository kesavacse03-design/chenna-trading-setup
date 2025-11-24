
// Auto-Generated Strategy for DOWNSIDE_LOM_SWING
// Generated: 2025-11-24T11:27:54.702Z
// Accuracy: 45.45%
// Total Trades: 11

const EnhancedTA = require('./enhancedTA.cjs');

class OptimizedStrategy {
  constructor() {
    this.name = 'DOWNSIDE_LOM_SWING_OPTIMIZED';
    this.version = 'V1_AUTO';
    this.category = 'DOWNSIDE_LOM_SWING';
    this.targetAccuracy = 15.0;
    this.riskRewardRatio = 1.5;
    
    // Optimized parameters
    this.patterns = ["HAMMER","BULLISH_ENGULFING"];
    this.rsiMin = 20;
    this.rsiMax = 60;
    this.volumeMultiplier = 1.2;
    this.emaTolerance = 0.9;
  }

  getEntrySignal(candles, idx) {
    if (idx < 50) return null;

    const candle = candles[idx];
    const prevCandle = candles[idx - 1];

    // Pattern check
    const detectedPatterns = EnhancedTA.getAllBullishPatterns(candles, idx);
    let hasPattern = false;
    let matchedPattern = null;

    for (const pattern of this.patterns) {
      if (pattern === 'ALL_BULLISH' && detectedPatterns.length > 0) {
        hasPattern = true;
        matchedPattern = detectedPatterns[0];
        break;
      } else if (detectedPatterns.includes(pattern)) {
        hasPattern = true;
        matchedPattern = pattern;
        break;
      }
    }

    if (!hasPattern) return null;

    // EMA check
    const ema20 = EnhancedTA.calculateEMA(candles.slice(0, idx + 1), 20);
    if (!ema20 || candle.close < ema20 * this.emaTolerance) return null;

    // Volume check
    if (!EnhancedTA.isVolumeSpike(candle, candles.slice(0, idx), this.volumeMultiplier)) return null;

    // RSI check
    const rsi = EnhancedTA.calculateRSI(candles.slice(0, idx + 1), 14);
    if (!rsi || rsi < this.rsiMin || rsi > this.rsiMax) return null;

    // Calculate entry/target/SL
    const atr = EnhancedTA.calculateATR(candles.slice(0, idx + 1), 14);
   const swingLow = EnhancedTA.getSwingHighLow(candles.slice(0, idx), 10).low;

    const entry = candle.close;
    const stopLoss = swingLow || (entry - (atr * 1.5));
    const risk = entry - stopLoss;
    const target = entry + (risk * this.riskRewardRatio);

    if (risk / entry > 0.05) return null;

    return {
      type: 'BUY',
      entry,
      target,
      stopLoss,
      trailingStop: entry + (risk * 0.5),
      pattern: matchedPattern,
      rsi,
      ema20
    };
  }
}

module.exports = OptimizedStrategy;
