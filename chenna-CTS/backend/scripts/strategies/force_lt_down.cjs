const { RSI } = require('technicalindicators');
const { calculateIntelligentStop } = require('../../services/stopLossCalculator.cjs');

async function checkSignal(stock, dailyCandles, weeklyCandles, niftyCandles, options = {}) {
    if (!dailyCandles || dailyCandles.length < 15) return null;

    const closes = dailyCandles.map(c => c.close);

    // RSI
    const rsiInput = { values: closes, period: 14 };
    const rsiValues = RSI.calculate(rsiInput);
    const currentRsi = rsiValues[rsiValues.length - 1];

    // Weekly Trend
    let trendUp = false;
    if (weeklyCandles && weeklyCandles.length >= 20) {
        const wCloses = weeklyCandles.map(c => c.close);
        const wSma20 = wCloses.slice(-20).reduce((a, b) => a + b, 0) / 20;
        trendUp = wCloses[wCloses.length - 1] > wSma20;
    } else if (closes.length >= 50) {
        const sma50 = closes.slice(-50).reduce((a, b) => a + b, 0) / 50;
        trendUp = closes[closes.length - 1] > sma50;
    }

    // Nifty Trend
    let niftyTrend = 'SIDEWAYS';
    if (niftyCandles && niftyCandles.length > 20) {
        const nCloses = niftyCandles.map(c => c.close);
        const nSma20 = nCloses.slice(-20).reduce((a, b) => a + b, 0) / 20;
        const nPrice = nCloses[nCloses.length - 1];
        niftyTrend = nPrice > nSma20 * 1.01 ? 'UP' : nPrice < nSma20 * 0.99 ? 'DOWN' : 'SIDEWAYS';
    }

    // Force Calculation even if Counter Trend
    const entryPrice = closes[closes.length - 1];
    const stopCalc = calculateIntelligentStop({
        entryPrice,
        candles: dailyCandles,
        atrMultiplier: 2.0,
        swingLookback: 5,
        vix: options.vix || null,
        niftyTrend,
        rrMultiple: 2.0
    });

    let tier = 2;
    let reason = `Dip in Uptrend (RSI ${currentRsi.toFixed(1)})`;

    if (!trendUp) {
        tier = 3;
        reason = `Counter Trend Reversal (Weekly DOWN, RSI ${currentRsi.toFixed(1)})`;
    } else if (currentRsi < 30) {
        tier = 1;
        reason = `Oversold Reversal (RSI ${currentRsi.toFixed(1)}) + Uptrend`;
    }

    return {
        signal: 'BUY',
        tier,
        reason,
        stopLoss: stopCalc.stopPct,
        target: stopCalc.targetPct,
        stopPrice: stopCalc.stopPrice,
        targetPrice: stopCalc.targetPrice,
        stopMethod: stopCalc.method,
        atr: stopCalc.atr,
        atrPct: stopCalc.atrPct,
        riskReward: stopCalc.riskRewardRatio
    };
}

module.exports = { checkSignal };
