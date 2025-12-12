/**
 * Adaptive Grid Search for Strategy Parameters
 * Automatically expands parameter ranges if results are too tight or inaccurate
 */

class AdaptiveGridSearch {
    constructor(options = {}) {
        this.maxExpansions = options.maxExpansions || 3;
        this.minTrades = options.minTrades || 10;
        this.minAccuracy = options.minAccuracy || 50;
        this.expansionLog = [];
    }

    /**
     * Get initial parameter grid
     */
    getInitialGrid() {
        return {
            // RSI thresholds - start conservative
            rsiOversold: [20, 25, 30],
            rsiOverbought: [70, 75, 80],

            // SMA periods
            smaFast: [10, 20],
            smaSlow: [50, 100, 200],

            // Bollinger Band parameters
            bbPeriod: [20],
            bbStdDev: [2],

            // Exit parameters
            targetPercent: [2.0, 2.5, 3.0],
            stopPercent: [1.0, 1.5, 2.0],

            // Volume multiplier
            volumeThreshold: [1.3, 1.5],

            // Pattern filters
            patterns: ['Bullish Engulfing', 'Hammer', 'Morning Star']
        };
    }

    /**
     * Expand grid based on results
     * @param {Object} currentGrid - Current parameter grid
     * @param {Object} results - Test results {trades, accuracy, topLogic}
     * @param {number} expansionRound - Current expansion round
     * @returns {Object} Expanded grid
     */
    expandGrid(currentGrid, results, expansionRound) {
        const newGrid = { ...currentGrid };
        const changes = [];

        // Check if we need to expand RSI (too few trades usually means too strict)
        if (results.trades < this.minTrades) {
            // Widen RSI oversold range
            if (!currentGrid.rsiOversold.includes(35)) {
                newGrid.rsiOversold = [...currentGrid.rsiOversold, 35];
                changes.push('RSI oversold: added 35');
            }
            if (expansionRound >= 2 && !currentGrid.rsiOversold.includes(40)) {
                newGrid.rsiOversold = [...newGrid.rsiOversold, 40];
                changes.push('RSI oversold: added 40');
            }

            // Relax volume threshold
            if (!currentGrid.volumeThreshold.includes(1.2)) {
                newGrid.volumeThreshold = [1.2, ...currentGrid.volumeThreshold];
                changes.push('Volume threshold: added 1.2x');
            }

            // Add more pattern variations
            if (!currentGrid.patterns.includes('Doji')) {
                newGrid.patterns = [...currentGrid.patterns, 'Doji', 'Bullish Harami'];
                changes.push('Patterns: added Doji, Bullish Harami');
            }
        }

        // Check if accuracy is too low (need stricter filters)
        if (results.accuracy < this.minAccuracy && results.trades >= this.minTrades) {
            // Make RSI more strict
            if (currentGrid.rsiOversold.includes(40)) {
                newGrid.rsiOversold = currentGrid.rsiOversold.filter(r => r <= 35);
                changes.push('RSI: removed 40 (too loose)');
            }

            // Tighten target/stop ratio
            if (!currentGrid.targetPercent.includes(3.5)) {
                newGrid.targetPercent = [...currentGrid.targetPercent, 3.5];
                changes.push('Target: added 3.5% option');
            }

            // Add trend filter requirement
            newGrid.requireTrend = true;
            changes.push('Added trend filter requirement');
        }

        // Check if targets are too tight (low win rate despite good entries)
        if (results.trades >= this.minTrades && results.accuracy < 40) {
            // Widen targets
            if (!currentGrid.targetPercent.includes(4.0)) {
                newGrid.targetPercent = [...currentGrid.targetPercent, 4.0];
                changes.push('Target: added 4.0% option');
            }
            // Tighten stops
            if (currentGrid.stopPercent.includes(2.0)) {
                newGrid.stopPercent = currentGrid.stopPercent.filter(s => s <= 1.5);
                changes.push('Stop: removed 2.0% (too loose)');
            }
        }

        // Log expansion
        this.expansionLog.push({
            round: expansionRound,
            results: {
                trades: results.trades,
                accuracy: results.accuracy
            },
            changes,
            timestamp: new Date().toISOString()
        });

        console.log(`\n📊 Grid Expansion Round ${expansionRound}:`);
        console.log(`   Previous: ${results.trades} trades, ${results.accuracy}% accuracy`);
        changes.forEach(c => console.log(`   → ${c}`));

        return newGrid;
    }

    /**
     * Build logic combinations from grid
     * @param {Object} grid - Parameter grid
     * @returns {Array} Array of logic combinations
     */
    buildLogicsFromGrid(grid) {
        const logics = [];

        // RSI-based logics
        for (const rsi of grid.rsiOversold) {
            logics.push({
                name: `RSI < ${rsi}`,
                entry: (indicators) => indicators.rsi14 < rsi,
                exit: { target: grid.targetPercent[0], stop: grid.stopPercent[0] },
                params: { rsi, type: 'rsi_only' }
            });

            // RSI + SMA
            for (const sma of grid.smaSlow) {
                logics.push({
                    name: `RSI < ${rsi} + Above SMA${sma}`,
                    entry: (indicators) =>
                        indicators.rsi14 < rsi &&
                        indicators[`aboveSMA${sma}`],
                    exit: { target: grid.targetPercent[1] || 2.5, stop: grid.stopPercent[0] },
                    params: { rsi, sma, type: 'rsi_sma' }
                });
            }

            // RSI + BB
            logics.push({
                name: `RSI < ${rsi} + BB Lower Touch`,
                entry: (indicators) => {
                    if (!indicators.bb) return false;
                    return indicators.rsi14 < rsi &&
                        indicators.currentPrice <= indicators.bb.lower * 1.02;
                },
                exit: { target: grid.targetPercent[1] || 2.5, stop: grid.stopPercent[1] || 1.5 },
                params: { rsi, type: 'rsi_bb' }
            });

            // RSI + MACD
            logics.push({
                name: `RSI < ${rsi} + MACD Bullish`,
                entry: (indicators) =>
                    indicators.rsi14 < rsi && indicators.macdBullish,
                exit: { target: grid.targetPercent[2] || 3.0, stop: grid.stopPercent[0] },
                params: { rsi, type: 'rsi_macd' }
            });
        }

        // Add regime-filtered versions if enabled
        if (grid.requireTrend) {
            const baseLogics = [...logics];
            for (const logic of baseLogics) {
                logics.push({
                    ...logic,
                    name: `${logic.name} + Bullish Market`,
                    entry: (indicators, candles, context) => {
                        if (context?.regime?.niftyTrend !== 'bullish') return false;
                        return logic.entry(indicators, candles, context);
                    },
                    params: { ...logic.params, requireBullish: true }
                });
            }
        }

        return logics;
    }

    /**
     * Run adaptive search with automatic expansion
     * @param {Function} testFunction - Function to test logics (logic) => {trades, accuracy}
     * @returns {Object} Best results after expansion
     */
    async runAdaptiveSearch(testFunction) {
        let grid = this.getInitialGrid();
        let bestResult = null;
        let expansionRound = 0;

        while (expansionRound < this.maxExpansions) {
            console.log(`\n🔬 Adaptive Search Round ${expansionRound + 1}/${this.maxExpansions}`);

            const logics = this.buildLogicsFromGrid(grid);
            console.log(`   Testing ${logics.length} logic combinations...`);

            // Test all logics
            const results = [];
            for (const logic of logics) {
                const result = await testFunction(logic);
                results.push({ logic, ...result });
            }

            // Find best result
            const sorted = results
                .filter(r => r.trades > 0)
                .sort((a, b) => {
                    // Score: accuracy * log(trades) for balance
                    const scoreA = a.accuracy * Math.log(a.trades + 1);
                    const scoreB = b.accuracy * Math.log(b.trades + 1);
                    return scoreB - scoreA;
                });

            if (sorted.length > 0) {
                bestResult = sorted[0];
                console.log(`   Best: ${bestResult.logic.name}`);
                console.log(`   Trades: ${bestResult.trades}, Accuracy: ${bestResult.accuracy}%`);
            }

            // Check if we need to expand
            const needsExpansion =
                !bestResult ||
                bestResult.trades < this.minTrades ||
                bestResult.accuracy < this.minAccuracy;

            if (!needsExpansion) {
                console.log(`\n✅ Adaptive search complete - good results found!`);
                break;
            }

            // Expand grid
            expansionRound++;
            if (expansionRound < this.maxExpansions) {
                grid = this.expandGrid(grid, {
                    trades: bestResult?.trades || 0,
                    accuracy: bestResult?.accuracy || 0
                }, expansionRound);
            }
        }

        return {
            bestResult,
            expansionLog: this.expansionLog,
            totalRounds: expansionRound + 1,
            finalGrid: grid
        };
    }

    /**
     * Get expansion summary for logging
     */
    getExpansionSummary() {
        return {
            totalExpansions: this.expansionLog.length,
            expansions: this.expansionLog.map(e => ({
                round: e.round,
                trades: e.results.trades,
                accuracy: e.results.accuracy,
                changes: e.changes.length
            }))
        };
    }
}

module.exports = AdaptiveGridSearch;
