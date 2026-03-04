/**
 * Pattern Tester Service
 * 
 * PURPOSE: Test discovered patterns by simulating trades
 * 
 * For each pattern found:
 * 1. Simulate entry at pattern completion
 * 2. Use ATR-based stops (2x ATR) and targets (3x ATR)
 * 3. Walk forward through candles
 * 4. Record: WIN, LOSS, MAX_DD, HOLDING_DAYS
 */

const TechnicalAnalysis = require('../strategy/comprehensiveTA.cjs');

class PatternTester {

    constructor() {
        // Default trade parameters
        this.defaults = {
            atrMultiplierStop: 2,    // Stop at 2x ATR
            atrMultiplierTarget: 3,   // Target at 3x ATR
            maxHoldingDays: 10,       // Max days before forced exit
            trailingStopTrigger: 0.5  // Trail after 50% to target
        };
    }

    /**
     * Test a single pattern
     */
    testPattern(pattern, candles, entryIdx) {
        if (entryIdx >= candles.length - 1) {
            return { tested: false, reason: 'No future data for simulation' };
        }

        const entryCandle = candles[entryIdx];
        const entryPrice = entryCandle.close;

        // Calculate ATR for dynamic stops
        const slicedCandles = candles.slice(0, entryIdx + 1);
        const atr = TechnicalAnalysis.ATR(slicedCandles) || (entryPrice * 0.02);

        // Set stop and target based on pattern signal
        let stopLoss, target;

        if (pattern.signal === 'bullish') {
            stopLoss = entryPrice - (atr * this.defaults.atrMultiplierStop);
            target = entryPrice + (atr * this.defaults.atrMultiplierTarget);
        } else if (pattern.signal === 'bearish') {
            // For bearish patterns, we're shorting
            stopLoss = entryPrice + (atr * this.defaults.atrMultiplierStop);
            target = entryPrice - (atr * this.defaults.atrMultiplierTarget);
        } else {
            // Neutral patterns - skip
            return { tested: false, reason: 'Neutral pattern, no trade direction' };
        }

        const trade = {
            pattern: pattern.name,
            signal: pattern.signal,
            entryPrice,
            entryDate: entryCandle.timestamp,
            entryIdx,
            stopLoss,
            target,
            atr: atr.toFixed(2),
            stopPercent: ((Math.abs(entryPrice - stopLoss) / entryPrice) * 100).toFixed(2) + '%',
            targetPercent: ((Math.abs(target - entryPrice) / entryPrice) * 100).toFixed(2) + '%'
        };

        // Simulate walking forward
        return this.simulateTrade(trade, candles, pattern.signal === 'bullish');
    }

    /**
     * Simulate trade through future candles
     */
    simulateTrade(trade, candles, isLong) {
        let currentTrail = null;
        let maxAdverseExcursion = 0;
        let maxFavorableExcursion = 0;

        for (let i = trade.entryIdx + 1; i < candles.length; i++) {
            const candle = candles[i];
            const daysHeld = i - trade.entryIdx;

            // Calculate MAE/MFE
            if (isLong) {
                const adverseMove = ((trade.entryPrice - candle.low) / trade.entryPrice) * 100;
                const favorableMove = ((candle.high - trade.entryPrice) / trade.entryPrice) * 100;
                maxAdverseExcursion = Math.max(maxAdverseExcursion, adverseMove);
                maxFavorableExcursion = Math.max(maxFavorableExcursion, favorableMove);
            } else {
                const adverseMove = ((candle.high - trade.entryPrice) / trade.entryPrice) * 100;
                const favorableMove = ((trade.entryPrice - candle.low) / trade.entryPrice) * 100;
                maxAdverseExcursion = Math.max(maxAdverseExcursion, adverseMove);
                maxFavorableExcursion = Math.max(maxFavorableExcursion, favorableMove);
            }

            // Check TARGET HIT
            if (isLong && candle.high >= trade.target) {
                return this.createResult(trade, {
                    outcome: 'WIN',
                    exitReason: 'TARGET_HIT',
                    exitPrice: trade.target,
                    exitDate: candle.timestamp,
                    daysHeld,
                    pnlPercent: parseFloat(trade.targetPercent),
                    mae: maxAdverseExcursion,
                    mfe: maxFavorableExcursion
                });
            }

            if (!isLong && candle.low <= trade.target) {
                return this.createResult(trade, {
                    outcome: 'WIN',
                    exitReason: 'TARGET_HIT',
                    exitPrice: trade.target,
                    exitDate: candle.timestamp,
                    daysHeld,
                    pnlPercent: parseFloat(trade.targetPercent),
                    mae: maxAdverseExcursion,
                    mfe: maxFavorableExcursion
                });
            }

            // Check STOP LOSS HIT
            if (isLong && candle.low <= trade.stopLoss) {
                return this.createResult(trade, {
                    outcome: 'LOSS',
                    exitReason: 'STOP_HIT',
                    exitPrice: trade.stopLoss,
                    exitDate: candle.timestamp,
                    daysHeld,
                    pnlPercent: -parseFloat(trade.stopPercent),
                    mae: maxAdverseExcursion,
                    mfe: maxFavorableExcursion
                });
            }

            if (!isLong && candle.high >= trade.stopLoss) {
                return this.createResult(trade, {
                    outcome: 'LOSS',
                    exitReason: 'STOP_HIT',
                    exitPrice: trade.stopLoss,
                    exitDate: candle.timestamp,
                    daysHeld,
                    pnlPercent: -parseFloat(trade.stopPercent),
                    mae: maxAdverseExcursion,
                    mfe: maxFavorableExcursion
                });
            }

            // Check TRAILING STOP (if in profit > 50% of target)
            if (isLong) {
                const progressToTarget = (candle.high - trade.entryPrice) / (trade.target - trade.entryPrice);
                if (progressToTarget > this.defaults.trailingStopTrigger) {
                    // Set trailing stop at breakeven
                    currentTrail = currentTrail || trade.entryPrice;
                    currentTrail = Math.max(currentTrail, trade.entryPrice + (candle.high - trade.entryPrice) * 0.5);

                    if (candle.low <= currentTrail) {
                        const pnl = ((currentTrail - trade.entryPrice) / trade.entryPrice) * 100;
                        return this.createResult(trade, {
                            outcome: pnl > 0 ? 'WIN' : 'LOSS',
                            exitReason: 'TRAILING_STOP',
                            exitPrice: currentTrail,
                            exitDate: candle.timestamp,
                            daysHeld,
                            pnlPercent: pnl,
                            mae: maxAdverseExcursion,
                            mfe: maxFavorableExcursion
                        });
                    }
                }
            }

            // Check MAX HOLDING DAYS
            if (daysHeld >= this.defaults.maxHoldingDays) {
                const exitPrice = candle.close;
                const pnl = isLong
                    ? ((exitPrice - trade.entryPrice) / trade.entryPrice) * 100
                    : ((trade.entryPrice - exitPrice) / trade.entryPrice) * 100;

                return this.createResult(trade, {
                    outcome: pnl > 0 ? 'WIN' : 'LOSS',
                    exitReason: 'TIME_EXPIRED',
                    exitPrice,
                    exitDate: candle.timestamp,
                    daysHeld,
                    pnlPercent: pnl,
                    mae: maxAdverseExcursion,
                    mfe: maxFavorableExcursion
                });
            }
        }

        // End of data - mark as incomplete
        const lastCandle = candles[candles.length - 1];
        const exitPrice = lastCandle.close;
        const pnl = isLong
            ? ((exitPrice - trade.entryPrice) / trade.entryPrice) * 100
            : ((trade.entryPrice - exitPrice) / trade.entryPrice) * 100;

        return this.createResult(trade, {
            outcome: pnl > 0 ? 'WIN' : 'LOSS',
            exitReason: 'END_OF_DATA',
            exitPrice,
            exitDate: lastCandle.timestamp,
            daysHeld: candles.length - trade.entryIdx - 1,
            pnlPercent: pnl,
            mae: maxAdverseExcursion,
            mfe: maxFavorableExcursion
        });
    }

    createResult(trade, exit) {
        return {
            tested: true,
            pattern: trade.pattern,
            signal: trade.signal,
            entryPrice: trade.entryPrice,
            entryDate: trade.entryDate,
            stopLoss: trade.stopLoss,
            target: trade.target,
            atr: trade.atr,
            ...exit,
            rewardRiskRatio: parseFloat(trade.targetPercent) / parseFloat(trade.stopPercent)
        };
    }

    /**
     * Test all patterns for a stock
     */
    testAllPatterns(patterns, candles, entryIdx) {
        const results = {
            tested: [],
            skipped: [],
            summary: {
                total: patterns.length,
                wins: 0,
                losses: 0,
                avgPnl: 0,
                bestPattern: null,
                worstPattern: null
            }
        };

        for (const pattern of patterns) {
            const result = this.testPattern(pattern, candles, entryIdx);

            if (result.tested) {
                results.tested.push(result);

                if (result.outcome === 'WIN') {
                    results.summary.wins++;
                } else {
                    results.summary.losses++;
                }
            } else {
                results.skipped.push({ pattern: pattern.name, reason: result.reason });
            }
        }

        // Calculate summary stats
        if (results.tested.length > 0) {
            const pnls = results.tested.map(r => r.pnlPercent);
            results.summary.avgPnl = pnls.reduce((a, b) => a + b, 0) / pnls.length;
            results.summary.winRate = (results.summary.wins / results.tested.length * 100).toFixed(1) + '%';

            // Find best/worst
            results.tested.sort((a, b) => b.pnlPercent - a.pnlPercent);
            results.summary.bestPattern = results.tested[0];
            results.summary.worstPattern = results.tested[results.tested.length - 1];
        }

        return results;
    }

    /**
     * Build pattern × stock matrix for cross-validation
     */
    buildPatternMatrix(stockResults) {
        const matrix = {};

        for (const stock of stockResults) {
            for (const result of stock.tested) {
                if (!matrix[result.pattern]) {
                    matrix[result.pattern] = {
                        wins: 0,
                        losses: 0,
                        totalPnl: 0,
                        trades: []
                    };
                }

                matrix[result.pattern].trades.push({
                    symbol: stock.symbol,
                    outcome: result.outcome,
                    pnlPercent: result.pnlPercent
                });

                if (result.outcome === 'WIN') {
                    matrix[result.pattern].wins++;
                } else {
                    matrix[result.pattern].losses++;
                }
                matrix[result.pattern].totalPnl += result.pnlPercent;
            }
        }

        // Calculate stats per pattern
        const patternStats = [];
        for (const [pattern, data] of Object.entries(matrix)) {
            const total = data.wins + data.losses;
            patternStats.push({
                pattern,
                trades: total,
                wins: data.wins,
                losses: data.losses,
                winRate: total > 0 ? (data.wins / total * 100).toFixed(1) + '%' : '0%',
                avgPnl: total > 0 ? (data.totalPnl / total).toFixed(2) + '%' : '0%',
                expectancy: total > 0 ? data.totalPnl / total : 0,
                stocksCovered: [...new Set(data.trades.map(t => t.symbol))].length
            });
        }

        // Sort by expectancy (best first)
        patternStats.sort((a, b) => b.expectancy - a.expectancy);

        return {
            matrix,
            ranked: patternStats
        };
    }
}

module.exports = new PatternTester();
