const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'chenna-CTS/backend/strategy/timeTravelEngine.cjs');
let content = fs.readFileSync(filePath, 'utf8');

// Add exhaustion-specific indicators after indicators.currentPrice
const oldPattern = `indicators.currentPrice = availableCandles[availableCandles.length - 1].close;`;

const newPattern = `indicators.currentPrice = availableCandles[availableCandles.length - 1].close;

        // ✅ EXHAUSTION INDICATORS - For DOWNSIDE_LOM_SWING detection
        const lastCandle = availableCandles[availableCandles.length - 1];
        const prevCandle = availableCandles[availableCandles.length - 2];
        
        // Lower wick percentage (buying pressure)
        const candleRange = lastCandle.high - lastCandle.low;
        const lowerWick = Math.min(lastCandle.open, lastCandle.close) - lastCandle.low;
        indicators.lowerWickPct = candleRange > 0 ? (lowerWick / candleRange) * 100 : 0;
        
        // Upper wick percentage (selling pressure)
        const upperWick = lastCandle.high - Math.max(lastCandle.open, lastCandle.close);
        indicators.upperWickPct = candleRange > 0 ? (upperWick / candleRange) * 100 : 0;
        
        // Volume vs 20-day average
        const recentCandles = availableCandles.slice(-20);
        const avgVolume = recentCandles.reduce((s, c) => s + c.volume, 0) / recentCandles.length;
        indicators.volumeVsAvg = avgVolume > 0 ? lastCandle.volume / avgVolume : 1;
        indicators.volumeDecline = indicators.volumeVsAvg < 0.8;
        indicators.volumeSpike = indicators.volumeVsAvg > 1.5;
        indicators.volumeExpanding = lastCandle.volume > prevCandle.volume * 1.2;
        
        // Check for recent new low (within last 5 days)
        const last5Candles = availableCandles.slice(-5);
        const lookback20 = availableCandles.slice(-25, -5);
        const recentLow5 = Math.min(...last5Candles.map(c => c.low));
        const prior20Low = lookback20.length > 0 ? Math.min(...lookback20.map(c => c.low)) : recentLow5;
        indicators.recentNewLow = recentLow5 < prior20Low * 0.99;
        indicators.aboveRecentLow = lastCandle.close > recentLow5;
        indicators.newLow = lastCandle.low < prior20Low;
        indicators.holdingAboveLow = !indicators.newLow && indicators.aboveRecentLow;
        
        // Close position within candle range
        const closePosition = candleRange > 0 ? (lastCandle.close - lastCandle.low) / candleRange : 0.5;
        indicators.closeNearHigh = closePosition > 0.7;
        indicators.closeNearLow = closePosition < 0.3;
        
        // ATR spike and contraction
        if (indicators.atr14 && availableCandles.length >= 30) {
            const atrHistory = availableCandles.slice(-30);
            let atrValues = [];
            for (let i = 14; i < atrHistory.length; i++) {
                const slice = atrHistory.slice(i - 14, i);
                let tr = 0;
                for (let j = 1; j < slice.length; j++) {
                    tr += Math.max(
                        slice[j].high - slice[j].low,
                        Math.abs(slice[j].high - slice[j - 1].close),
                        Math.abs(slice[j].low - slice[j - 1].close)
                    );
                }
                atrValues.push(tr / 14);
            }
            const maxATR = Math.max(...atrValues);
            const currentATR = atrValues[atrValues.length - 1];
            const prevATR = atrValues[atrValues.length - 2] || currentATR;
            indicators.atrSpikeRecent = maxATR > currentATR * 1.3;
            indicators.atrContracting = currentATR < prevATR * 0.95;
            indicators.atrExpanding = currentATR > prevATR * 1.1;
        }
        
        // Previous RSI for divergence detection
        if (prevCandle && availableCandles.length >= 16) {
            const prevIndicators = TechnicalAnalysis.getMarketContext(availableCandles.slice(0, -1));
            indicators.rsi14_prev = prevIndicators?.rsi14 || null;
        }
        
        // ✅ END EXHAUSTION INDICATORS`;

if (content.includes(oldPattern) && !content.includes('EXHAUSTION INDICATORS')) {
    content = content.replace(oldPattern, newPattern);
    fs.writeFileSync(filePath, content, 'utf8');
    console.log('✅ Added exhaustion indicators to timeTravelEngine.cjs');
} else if (content.includes('EXHAUSTION INDICATORS')) {
    console.log('⚠️ Exhaustion indicators already present');
} else {
    console.log('❌ Pattern not found');
}
