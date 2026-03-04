function synthesize1Hour(thirtyMinCandles) {
    // Merge every 2 consecutive 30-min candles:
    // 9:15+9:45 → 9:15-10:15 (1hr candle)
    // 10:15+10:45 → 10:15-11:15 (1hr candle)
    const hourly = [];
    for (let i = 0; i < thirtyMinCandles.length - 1; i += 2) {
        const c1 = thirtyMinCandles[i];
        const c2 = thirtyMinCandles[i + 1];
        hourly.push({
            timestamp: c1.timestamp || c1.date,
            open: c1.open,
            high: Math.max(c1.high, c2.high),
            low: Math.min(c1.low, c2.low),
            close: c2.close,
            volume: c1.volume + c2.volume
        });
    }
    return hourly;
}

function synthesize15Min(oneMinCandles) {
    // Merge every 15 consecutive 1-min candles:
    const fifteenMin = [];
    if (!oneMinCandles || oneMinCandles.length === 0) return fifteenMin;

    // Sort array by time to be safe
    const sorted = [...oneMinCandles].sort((a, b) => new Date(a.date || a.timestamp) - new Date(b.date || b.timestamp));

    let currentCandle = null;
    let currentIntervalStart = null;

    for (const c of sorted) {
        const d = new Date(c.date || c.timestamp);
        // Get interval start: round down to nearest 15 min block
        // e.g., 9:15-9:29 => 9:15
        const m = d.getMinutes();
        const startMin = Math.floor(m / 15) * 15;
        const intervalStart = new Date(d);
        intervalStart.setMinutes(startMin, 0, 0);

        const intervalTimeStr = intervalStart.getTime();

        if (currentIntervalStart !== intervalTimeStr) {
            // Push old and init new
            if (currentCandle) fifteenMin.push(currentCandle);
            currentIntervalStart = intervalTimeStr;
            // Upstox formats normally uses 'timestamp' or 'date', reuse the field logic
            currentCandle = {
                timestamp: c.timestamp || c.date,
                open: c.open,
                high: c.high,
                low: c.low,
                close: c.close,
                volume: c.volume
            };
        } else {
            // Update current
            currentCandle.high = Math.max(currentCandle.high, c.high);
            currentCandle.low = Math.min(currentCandle.low, c.low);
            currentCandle.close = c.close;
            currentCandle.volume += c.volume;
        }
    }

    if (currentCandle) fifteenMin.push(currentCandle);
    return fifteenMin;
}

function getISOWeek(d) {
    const date = new Date(d.getTime());
    date.setHours(0, 0, 0, 0);
    date.setDate(date.getDate() + 3 - (date.getDay() + 6) % 7);
    const week1 = new Date(date.getFullYear(), 0, 4);
    return date.getFullYear() + '-W' + String(1 + Math.round(((date.getTime() - week1.getTime()) / 86400000 - 3 + (week1.getDay() + 6) % 7) / 7)).padStart(2, '0');
}

function synthesizeWeekly(dailyCandles) {
    // Group daily candles by ISO week
    // Each week: open=Monday open, close=Friday close,
    //   high=max of week, low=min of week, vol=sum
    const weeks = {};
    for (const c of dailyCandles) {
        const d = new Date(c.date || c.timestamp);
        const weekKey = getISOWeek(d); // e.g. "2026-W08"
        if (!weeks[weekKey]) {
            weeks[weekKey] = {
                open: c.open, high: c.high, low: c.low,
                close: c.close, volume: c.volume, date: c.date || c.timestamp
            };
        } else {
            weeks[weekKey].high = Math.max(weeks[weekKey].high, c.high);
            weeks[weekKey].low = Math.min(weeks[weekKey].low, c.low);
            weeks[weekKey].close = c.close;
            weeks[weekKey].volume += c.volume;
        }
    }
    return Object.values(weeks);
}

function calcRSI(candles, period = 14) {
    // Standard RSI calculation
    if (candles.length < period + 1) return [];
    const rsi = [];
    let avgGain = 0, avgLoss = 0;

    for (let i = 1; i <= period; i++) {
        const change = candles[i].close - candles[i - 1].close;
        if (change > 0) avgGain += change;
        else avgLoss += Math.abs(change);
    }
    avgGain /= period;
    avgLoss /= period;
    rsi.push({
        date: candles[period].date || candles[period].timestamp,
        value: 100 - (100 / (1 + avgGain / avgLoss))
    });

    for (let i = period + 1; i < candles.length; i++) {
        const change = candles[i].close - candles[i - 1].close;
        const gain = change > 0 ? change : 0;
        const loss = change < 0 ? Math.abs(change) : 0;
        avgGain = (avgGain * (period - 1) + gain) / period;
        avgLoss = (avgLoss * (period - 1) + loss) / period;
        const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
        rsi.push({
            date: candles[i].date || candles[i].timestamp,
            value: 100 - (100 / (1 + rs))
        });
    }
    return rsi;
}

function detectDivergence(priceCandles, rsiValues, lookback = 10) {
    // Bearish divergence: price higher high + RSI lower high
    // Bullish divergence: price lower low + RSI higher low
    if (rsiValues.length < lookback) return null;

    const len = priceCandles.length;
    const currentPrice = priceCandles[len - 1].high;
    const currentRSI = rsiValues[rsiValues.length - 1].value;

    // Look back for previous swing high/low
    let prevHighPrice = -Infinity, prevHighRSI = 0;
    let prevLowPrice = Infinity, prevLowRSI = 100;

    for (let i = Math.max(0, len - lookback); i < len - 2; i++) {
        if (priceCandles[i].high > prevHighPrice) {
            prevHighPrice = priceCandles[i].high;
            const rsiIdx = rsiValues.findIndex(r => r.date ===
                (priceCandles[i].date || priceCandles[i].timestamp));
            if (rsiIdx >= 0) prevHighRSI = rsiValues[rsiIdx].value;
        }
        if (priceCandles[i].low < prevLowPrice) {
            prevLowPrice = priceCandles[i].low;
            const rsiIdx = rsiValues.findIndex(r => r.date ===
                (priceCandles[i].date || priceCandles[i].timestamp));
            if (rsiIdx >= 0) prevLowRSI = rsiValues[rsiIdx].value;
        }
    }

    // Bearish divergence
    if (currentPrice > prevHighPrice && currentRSI < prevHighRSI) {
        return {
            type: 'BEARISH', priceDiff: currentPrice - prevHighPrice,
            rsiDiff: prevHighRSI - currentRSI
        };
    }
    // Bullish divergence
    const currentLow = priceCandles[len - 1].low;
    if (currentLow < prevLowPrice && currentRSI > prevLowRSI) {
        return {
            type: 'BULLISH', priceDiff: prevLowPrice - currentLow,
            rsiDiff: currentRSI - prevLowRSI
        };
    }
    return null;
}

module.exports = { synthesize1Hour, synthesize15Min, synthesizeWeekly, calcRSI, detectDivergence };
