// Mock Data Generator for V2.1 Verification

function generateMockCandles(dateStr) {
    const candles = [];
    const basePrice = 1000;

    // 9:15 - 9:30: Establish Opening Range (Green Candle Start)
    // 9:15
    candles.push({
        timestamp: `${dateStr}T09:15:00+05:30`,
        open: 1000, high: 1010, low: 995, close: 1002, volume: 5000 // OR High = 1010, Low = 995
    });

    // Fill until 9:30 to solidify OR (Range = 1.5% < 2.0%)
    for (let i = 16; i <= 30; i++) {
        candles.push({
            timestamp: `${dateStr}T09:${i}:00+05:30`,
            open: 1000, high: 1008, low: 998, close: 1005, volume: 1000
        });
    }

    // 09:31 - 10:00: Consolidation / Pullback (Filter 7: Wait >15 mins)
    for (let i = 31; i <= 59; i++) {
        candles.push({
            timestamp: `${dateStr}T09:${i}:00+05:30`,
            open: 1005, high: 1009, low: 1000, close: 1002, volume: 800
        });
    }

    // 10:05: Pullback Low established (e.g. 1000 > OR Low 995)
    candles.push({
        timestamp: `${dateStr}T10:05:00+05:30`,
        open: 1002, high: 1005, low: 1000, close: 1003, volume: 1000
    });

    // 10:10: BREAKOUT! (High > 1010)
    // Filter 6: Breakout Strength > 0.5% (High > 1015)
    // Filter 8: Vol > 2x Avg (Avg ~1000 -> need 2000+)
    candles.push({
        timestamp: `${dateStr}T10:10:00+05:30`,
        open: 1005, high: 1016, low: 1004, close: 1014, volume: 5000 // Breakout Candle
    });

    // Fill rest of day
    for (let h = 10; h <= 15; h++) {
        for (let m = 0; m < 60; m += 5) {
            if (h === 10 && m <= 10) continue;
            candles.push({
                timestamp: `${dateStr}T${h}:${m.toString().padStart(2, '0')}:00+05:30`,
                open: 1014, high: 1020, low: 1010, close: 1018, volume: 500
            });
        }
    }

    return candles;
}

module.exports = { generateMockCandles };
