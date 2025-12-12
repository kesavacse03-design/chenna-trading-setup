/**
 * Institutional Trap Detector Service
 * Detects 6 types of institutional manipulation patterns
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

/**
 * Detect all trap types for multiple stocks
 * @param {Array} stocks - Array of {symbol, listedDate}
 * @param {Object} stockData - Map of symbol -> candles
 * @returns {Promise<Object>} Map of symbol -> trap results
 */
async function detectTrapsForStocks(stocks, stockData) {
    const results = {};

    for (const stock of stocks) {
        const candles = stockData[stock.symbol];
        if (!candles || candles.length < 20) {
            results[stock.symbol] = { volumeTraps: [], bullTraps: [], bearTraps: [], stopHunts: [], fakeBreakouts: [], liquiditySweeps: [] };
            continue;
        }

        results[stock.symbol] = {
            volumeTraps: detectVolumeTrap(candles),
            bullTraps: detectBullTrap(candles),
            bearTraps: detectBearTrap(candles),
            stopHunts: detectStopHunt(candles),
            fakeBreakouts: detectFakeBreakout(candles),
            liquiditySweeps: detectLiquiditySweep(candles)
        };

        // Save to database
        await saveTrapsToDatabase(stock.symbol, results[stock.symbol]);
    }

    return results;
}

/**
 * Volume Trap: Abnormal volume spike without follow-through
 */
function detectVolumeTrap(candles) {
    const traps = [];
    const avgVolume = candles.reduce((sum, c) => sum + (c.volume || 0), 0) / candles.length;

    for (let i = 1; i < candles.length; i++) {
        const curr = candles[i];
        const prev = candles[i - 1];

        // Volume spike > 2.5x average
        if (curr.volume > avgVolume * 2.5) {
            // But price closes near low (no follow-through)
            const bodySize = Math.abs(curr.close - curr.open);
            const totalRange = curr.high - curr.low;
            const wickSize = curr.high - Math.max(curr.close, curr.open);

            // Large upper wick indicates rejection
            if (wickSize > bodySize * 1.5 && totalRange > 0) {
                traps.push({
                    date: curr.date,
                    type: 'volume_trap',
                    confidence: 0.85,
                    volumeRatio: curr.volume / avgVolume,
                    wickRatio: wickSize / bodySize,
                    indicators: {
                        volume: curr.volume,
                        avgVolume,
                        bodySize,
                        wickSize
                    }
                });
            }
        }
    }

    return traps;
}

/**
 * Bull Trap: False breakout above resistance
 */
function detectBullTrap(candles) {
    const traps = [];

    for (let i = 20; i < candles.length - 5; i++) {
        const curr = candles[i];
        const prev20 = candles.slice(i - 20, i);
        const next5 = candles.slice(i + 1, i + 6);

        // Find recent resistance (highest high in last 20 bars)
        const resistance = Math.max(...prev20.map(c => c.high));

        // Breakout above resistance
        if (curr.high > resistance * 1.01) {
            // But fails to sustain (closes back below resistance within 5 bars)
            const failedBreakout = next5.some(c => c.close < resistance);

            if (failedBreakout) {
                traps.push({
                    date: curr.date,
                    type: 'bull_trap',
                    confidence: 0.80,
                    resistance,
                    breakoutHigh: curr.high,
                    indicators: {
                        breakoutPercent: ((curr.high - resistance) / resistance) * 100,
                        failedWithinBars: next5.findIndex(c => c.close < resistance) + 1
                    }
                });
            }
        }
    }

    return traps;
}

/**
 * Bear Trap: False breakdown below support
 */
function detectBearTrap(candles) {
    const traps = [];

    for (let i = 20; i < candles.length - 5; i++) {
        const curr = candles[i];
        const prev20 = candles.slice(i - 20, i);
        const next5 = candles.slice(i + 1, i + 6);

        // Find recent support (lowest low in last 20 bars)
        const support = Math.min(...prev20.map(c => c.low));

        // Breakdown below support
        if (curr.low < support * 0.99) {
            // But recovers back above support within 5 bars
            const recoveredBreakdown = next5.some(c => c.close > support);

            if (recoveredBreakdown) {
                traps.push({
                    date: curr.date,
                    type: 'bear_trap',
                    confidence: 0.80,
                    support,
                    breakdownLow: curr.low,
                    indicators: {
                        breakdownPercent: ((support - curr.low) / support) * 100,
                        recoveredWithinBars: next5.findIndex(c => c.close > support) + 1
                    }
                });
            }
        }
    }

    return traps;
}

/**
 * Stop Hunt: Sharp spike to trigger stops, then reversal
 */
function detectStopHunt(candles) {
    const traps = [];

    for (let i = 10; i < candles.length; i++) {
        const curr = candles[i];
        const prev = candles[i - 1];
        const prev10 = candles.slice(i - 10, i);

        const avgRange = prev10.reduce((sum, c) => sum + (c.high - c.low), 0) / prev10.length;
        const currRange = curr.high - curr.low;

        // Abnormally large range (> 2x average)
        if (currRange > avgRange * 2) {
            const bodySize = Math.abs(curr.close - curr.open);

            // But small body (< 30% of range) - indicates wick spike
            if (bodySize < currRange * 0.3) {
                // Upper wick stop hunt (spike up then close low)
                const upperWick = curr.high - Math.max(curr.open, curr.close);
                const lowerWick = Math.min(curr.open, curr.close) - curr.low;

                if (upperWick > currRange * 0.5) {
                    traps.push({
                        date: curr.date,
                        type: 'stop_hunt',
                        direction: 'upside',
                        confidence: 0.75,
                        indicators: {
                            rangeMultiple: currRange / avgRange,
                            wickPercent: (upperWick / currRange) * 100
                        }
                    });
                } else if (lowerWick > currRange * 0.5) {
                    traps.push({
                        date: curr.date,
                        type: 'stop_hunt',
                        direction: 'downside',
                        confidence: 0.75,
                        indicators: {
                            rangeMultiple: currRange / avgRange,
                            wickPercent: (lowerWick / currRange) * 100
                        }
                    });
                }
            }
        }
    }

    return traps;
}

/**
 * Fake Breakout: Breakout with low volume
 */
function detectFakeBreakout(candles) {
    const traps = [];
    const avgVolume = candles.reduce((sum, c) => sum + (c.volume || 0), 0) / candles.length;

    for (let i = 20; i < candles.length - 3; i++) {
        const curr = candles[i];
        const prev20 = candles.slice(i - 20, i);
        const next3 = candles.slice(i + 1, i + 4);

        const resistance = Math.max(...prev20.map(c => c.high));

        // Breakout above resistance
        if (curr.close > resistance) {
            // But with below-average volume (< 0.8x)
            if (curr.volume < avgVolume * 0.8) {
                // And fails to sustain
                const failed = next3.some(c => c.close < resistance);

                if (failed) {
                    traps.push({
                        date: curr.date,
                        type: 'fake_breakout',
                        confidence: 0.70,
                        resistance,
                        volumeRatio: curr.volume / avgVolume,
                        indicators: {
                            breakoutPercent: ((curr.close - resistance) / resistance) * 100,
                            volumeDeficit: (1 - (curr.volume / avgVolume)) * 100
                        }
                    });
                }
            }
        }
    }

    return traps;
}

/**
 * Liquidity Sweep: Quick move to grab liquidity, then reversal
 */
function detectLiquiditySweep(candles) {
    const traps = [];

    for (let i = 20; i < candles.length - 2; i++) {
        const curr = candles[i];
        const next = candles[i + 1];
        const prev20 = candles.slice(i - 20, i);

        const support = Math.min(...prev20.map(c => c.low));
        const resistance = Math.max(...prev20.map(c => c.high));

        // Sweep below support with long lower wick
        const lowerWick = Math.min(curr.open, curr.close) - curr.low;
        const bodySize = Math.abs(curr.close - curr.open);

        if (curr.low < support && lowerWick > bodySize * 2) {
            // Followed by strong reversal
            if (next && next.close > curr.close) {
                traps.push({
                    date: curr.date,
                    type: 'liquidity_sweep',
                    direction: 'downside',
                    confidence: 0.78,
                    support,
                    sweepLow: curr.low,
                    indicators: {
                        wickToBodyRatio: lowerWick / bodySize,
                        reversalPercent: ((next.close - curr.close) / curr.close) * 100
                    }
                });
            }
        }

        // Sweep above resistance with long upper wick
        const upperWick = curr.high - Math.max(curr.open, curr.close);

        if (curr.high > resistance && upperWick > bodySize * 2) {
            // Followed by strong reversal
            if (next && next.close < curr.close) {
                traps.push({
                    date: curr.date,
                    type: 'liquidity_sweep',
                    direction: 'upside',
                    confidence: 0.78,
                    resistance,
                    sweepHigh: curr.high,
                    indicators: {
                        wickToBodyRatio: upperWick / bodySize,
                        reversalPercent: ((curr.close - next.close) / curr.close) * 100
                    }
                });
            }
        }
    }

    return traps;
}

/**
 * Save detected traps to database
 */
async function saveTrapsToDatabase(symbol, trapResults) {
    const allTraps = [
        ...trapResults.volumeTraps,
        ...trapResults.bullTraps,
        ...trapResults.bearTraps,
        ...trapResults.stopHunts,
        ...trapResults.fakeBreakouts,
        ...trapResults.liquiditySweeps
    ];

    for (const trap of allTraps) {
        try {
            await prisma.trapDetection.create({
                data: {
                    symbol,
                    date: new Date(trap.date),
                    trapType: trap.type,
                    confidence: trap.confidence,
                    indicators: trap.indicators || {}
                }
            });
        } catch (error) {
            // Ignore duplicates
            if (!error.message.includes('unique')) {
                console.error(`[TrapDetector] Error saving trap for ${symbol}:`, error.message);
            }
        }
    }
}

/**
 * Get trap history for a symbol
 */
async function getTrapHistory(symbol, days = 90) {
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    return await prisma.trapDetection.findMany({
        where: {
            symbol,
            date: { gte: since }
        },
        orderBy: { date: 'desc' }
    });
}

module.exports = {
    detectTrapsForStocks,
    detectVolumeTrap,
    detectBullTrap,
    detectBearTrap,
    detectStopHunt,
    detectFakeBreakout,
    detectLiquiditySweep,
    getTrapHistory
};
