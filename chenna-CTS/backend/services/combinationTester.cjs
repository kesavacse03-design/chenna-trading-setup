/**
 * Combination Tester Service
 * 
 * PURPOSE: Test if COMBINATIONS of patterns work better than individual patterns
 * 
 * For example:
 * - Hammer alone: 55% win rate
 * - VolumeSpike alone: 50% win rate
 * - Hammer + VolumeSpike: 72% win rate  ← Better!
 * 
 * This service generates and tests 2-way and 3-way combinations
 */

class CombinationTester {

    constructor() {
        // Minimum requirements
        this.requirements = {
            minPatternCount: 2,        // Need at least 2 patterns to combine
            minTrades: 5,              // Minimum trades to consider a combo
            minWinRate: 50,            // Minimum win rate to consider
            maxCombinations: 100       // Limit to prevent explosion
        };
    }

    /**
     * Generate all 2-way and 3-way combinations
     */
    generateCombinations(patterns, maxSize = 3) {
        const combos = [];
        const patternNames = patterns.map(p => p.name);

        // 2-way combinations
        if (patternNames.length >= 2) {
            for (let i = 0; i < patternNames.length; i++) {
                for (let j = i + 1; j < patternNames.length; j++) {
                    combos.push({
                        size: 2,
                        patterns: [patternNames[i], patternNames[j]],
                        key: `${patternNames[i]}+${patternNames[j]}`
                    });
                }
            }
        }

        // 3-way combinations
        if (maxSize >= 3 && patternNames.length >= 3) {
            for (let i = 0; i < patternNames.length; i++) {
                for (let j = i + 1; j < patternNames.length; j++) {
                    for (let k = j + 1; k < patternNames.length; k++) {
                        combos.push({
                            size: 3,
                            patterns: [patternNames[i], patternNames[j], patternNames[k]],
                            key: `${patternNames[i]}+${patternNames[j]}+${patternNames[k]}`
                        });
                    }
                }
            }
        }

        return combos.slice(0, this.requirements.maxCombinations);
    }

    /**
     * Test a specific combination across all tested stocks
     */
    testCombination(combo, stockResults) {
        const trades = [];

        for (const stock of stockResults) {
            // Check if this stock had ALL patterns in the combo
            const foundPatterns = stock.tested.map(t => t.pattern);
            const hasAllPatterns = combo.patterns.every(p => foundPatterns.includes(p));

            if (hasAllPatterns) {
                // Get the pattern results for this combo
                const relevantResults = stock.tested.filter(t => combo.patterns.includes(t.pattern));

                // Use the first one as the "combo result" (they should agree on direction)
                const mainResult = relevantResults[0];

                // Check if all patterns agree on direction
                const signals = relevantResults.map(r => r.signal);
                const allAgree = signals.every(s => s === signals[0]);

                if (allAgree) {
                    trades.push({
                        symbol: stock.symbol,
                        outcome: mainResult.outcome,
                        pnlPercent: mainResult.pnlPercent,
                        daysHeld: mainResult.daysHeld,
                        exitReason: mainResult.exitReason
                    });
                }
            }
        }

        // Calculate combo statistics
        if (trades.length < this.requirements.minTrades) {
            return {
                combo: combo.key,
                valid: false,
                reason: `Only ${trades.length} trades (need ${this.requirements.minTrades}+)`
            };
        }

        const wins = trades.filter(t => t.outcome === 'WIN').length;
        const winRate = (wins / trades.length) * 100;
        const totalPnl = trades.reduce((s, t) => s + t.pnlPercent, 0);
        const avgPnl = totalPnl / trades.length;
        const expectancy = avgPnl;

        return {
            combo: combo.key,
            patterns: combo.patterns,
            size: combo.size,
            valid: true,
            trades: trades.length,
            wins,
            losses: trades.length - wins,
            winRate: winRate.toFixed(1) + '%',
            avgPnl: avgPnl.toFixed(2) + '%',
            totalPnl: totalPnl.toFixed(2) + '%',
            expectancy,
            avgHoldingDays: (trades.reduce((s, t) => s + (t.daysHeld || 0), 0) / trades.length).toFixed(1),
            stocks: trades.map(t => t.symbol)
        };
    }

    /**
     * Test all combinations and rank by performance
     */
    testAllCombinations(stockResults) {
        // Collect all unique patterns from all stocks
        const allPatterns = [];
        for (const stock of stockResults) {
            for (const result of stock.tested) {
                if (!allPatterns.find(p => p.name === result.pattern)) {
                    allPatterns.push({ name: result.pattern, signal: result.signal });
                }
            }
        }

        console.log(`Testing combinations of ${allPatterns.length} unique patterns...`);

        // Generate combinations
        const combos = this.generateCombinations(allPatterns);
        console.log(`Generated ${combos.length} combinations`);

        // Test each combination
        const results = [];
        for (const combo of combos) {
            const result = this.testCombination(combo, stockResults);
            if (result.valid) {
                results.push(result);
            }
        }

        // Sort by expectancy (best first)
        results.sort((a, b) => b.expectancy - a.expectancy);

        return {
            totalCombos: combos.length,
            validCombos: results.length,
            ranked: results,
            top5: results.slice(0, 5),
            byWinRate: [...results].sort((a, b) => parseFloat(b.winRate) - parseFloat(a.winRate)).slice(0, 5)
        };
    }

    /**
     * Find the BEST overall strategy (single pattern vs combo)
     */
    findBestStrategy(patternStats, comboResults) {
        const candidates = [];

        // Add best single patterns
        for (const pattern of patternStats.slice(0, 10)) {
            candidates.push({
                type: 'single',
                name: pattern.pattern,
                winRate: parseFloat(pattern.winRate),
                expectancy: pattern.expectancy,
                trades: pattern.trades
            });
        }

        // Add best combos
        for (const combo of comboResults.ranked.slice(0, 10)) {
            candidates.push({
                type: 'combo',
                name: combo.combo,
                patterns: combo.patterns,
                winRate: parseFloat(combo.winRate),
                expectancy: combo.expectancy,
                trades: combo.trades
            });
        }

        // Sort by expectancy
        candidates.sort((a, b) => b.expectancy - a.expectancy);

        // Filter for minimum win rate
        const viable = candidates.filter(c => c.winRate >= this.requirements.minWinRate);

        return {
            best: viable[0] || candidates[0],
            allCandidates: candidates,
            viableCandidates: viable,
            recommendation: this.generateRecommendation(viable[0] || candidates[0])
        };
    }

    generateRecommendation(best) {
        if (!best) {
            return 'No viable strategy found. Consider adding more stocks or adjusting thresholds.';
        }

        if (best.type === 'single') {
            return `Use "${best.name}" pattern with ${best.winRate.toFixed(1)}% win rate and ${best.expectancy.toFixed(2)}% expectancy. Tested on ${best.trades} trades.`;
        } else {
            return `Use combination "${best.name}" (${best.patterns.join(' + ')}) with ${best.winRate.toFixed(1)}% win rate and ${best.expectancy.toFixed(2)}% expectancy. Tested on ${best.trades} trades.`;
        }
    }

    /**
     * Generate category-specific entry rules from best strategy
     */
    generateEntryRules(best, categoryKey) {
        if (!best) return null;

        const rules = {
            category: categoryKey,
            strategy: best.name,
            type: best.type,
            patterns: best.type === 'combo' ? best.patterns : [best.name],
            expected: {
                winRate: best.winRate,
                expectancy: best.expectancy
            },
            conditions: []
        };

        // Generate conditions based on patterns
        for (const pattern of rules.patterns) {
            rules.conditions.push(this.patternToCondition(pattern));
        }

        return rules;
    }

    patternToCondition(patternName) {
        const conditions = {
            // Candle patterns
            'Hammer': { type: 'candle', rule: 'lowerWick > 60% of range, body < 30%' },
            'BullishEngulfing': { type: 'candle', rule: 'current body > previous body, bullish closes above prev open' },
            'MorningStar': { type: 'candle', rule: '3-candle: bearish + doji + bullish > midpoint' },
            'Doji': { type: 'candle', rule: 'body < 10% of range' },
            'StrongClose': { type: 'candle', rule: 'close in upper 25% of range' },

            // Volume patterns
            'VolumeSpike': { type: 'volume', rule: 'volume > 1.5x 20-day average' },
            'VolumeDryUp': { type: 'volume', rule: 'volume < 0.6x 20-day average' },
            'Accumulation': { type: 'volume', rule: 'volume spike on up day after decline' },

            // Technical patterns
            'RSI_Oversold': { type: 'indicator', rule: 'RSI(14) < 30' },
            'MACD_BullishCross': { type: 'indicator', rule: 'MACD histogram > 0' },
            'BB_LowerTouch': { type: 'indicator', rule: 'close <= lower BB * 1.01' },
            'Stoch_Oversold': { type: 'indicator', rule: 'Stochastic K < 20' },

            // Structural patterns
            'ResistanceBreak': { type: 'structure', rule: 'close > 20-day high' },
            'FailedBreakdown': { type: 'structure', rule: 'low < 20-day low but close > 20-day low' },
            'HigherLow': { type: 'structure', rule: 'current low > 10-day lowest low' },
            'Consolidation': { type: 'structure', rule: 'range < 5% over 5 days' }
        };

        return conditions[patternName] || { type: 'unknown', rule: patternName };
    }
}

module.exports = new CombinationTester();
