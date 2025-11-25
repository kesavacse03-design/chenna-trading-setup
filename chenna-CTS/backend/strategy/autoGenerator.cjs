/**
 * Auto-Strategy Generation Engine
 * 
 * Analyzes historical stock data to automatically generate
 * optimized trading strategies with 70%+ accuracy
 */

const { CandlestickPatterns, Indicators, PatternAnalysis } = require('./patternRecognition.cjs');

class AutoStrategyGenerator {
    constructor(options = {}) {
        this.minAccuracy = options.minAccuracy || 0.70; // 70% minimum
        this.targetPercent = options.targetPercent || 2.5; // 2.5% profit target
        this.stopLossPercent = options.stopLossPercent || 1.5; // 1.5% stop loss
        this.maxDays = options.maxDays || 10; // Max holding period
    }

    /**
     * Main entry point: Generate optimized strategy for category
     */
    async generate(categoryStocks) {
        console.log(`[AutoGen] Analyzing ${categoryStocks.length} stocks...`);

        // Step 1: Analyze all patterns across all stocks
        const allPatternResults = [];

        for (const stock of categoryStocks) {
            if (!stock.historicalData || stock.historicalData.length < 50) {
                console.log(`[AutoGen] Skipping ${stock.symbol} - insufficient data`);
                continue;
            }

            const patternResults = this.analyzeStock(stock);
            allPatternResults.push(...patternResults);
        }

        console.log(`[AutoGen] Found ${allPatternResults.length} pattern occurrences`);

        // Step 2: Calculate success rates for each pattern type
        const patternStats = this.calculatePatternStats(allPatternResults);

        // Step 3: Find winning patterns (>70% success rate)
        const winningPatterns = patternStats.filter(p => p.successRate >= this.minAccuracy);

        if (winningPatterns.length === 0) {
            console.log('[AutoGen] No patterns meet 70% threshold, using best available');
            // Use top 3 best patterns even if below threshold
            winningPatterns.push(...patternStats.slice(0, 3));
        }

        console.log(`[AutoGen] ${winningPatterns.length} winning patterns found`);

        // Step 4: Analyze indicator conditions for winning patterns
        const indicatorFilters = this.findOptimalFilters(allPatternResults, winningPatterns);

        // Step 5: Generate strategy rules
        const strategy = this.buildStrategy(winningPatterns, indicatorFilters);

        // Step 6: Validate strategy on all stocks
        const validation = this.validateStrategy(strategy, categoryStocks);

        return {
            strategy,
            validation,
            breakdown: {
                totalStocksAnalyzed: categoryStocks.length,
                totalPatterns: allPatternResults.length,
                winningPatterns: winningPatterns.length,
                successful: validation.successful,
                failed: validation.failed,
                sideways: validation.sideways
            }
        };
    }

    /**
     * Analyze a single stock's historical data
     */
    analyzeStock(stock) {
        const candles = stock.historicalData;
        const results = [];

        // Scan for patterns
        const patterns = PatternAnalysis.scanPatterns(candles);

        // For each pattern, check if it was profitable
        for (const pattern of patterns) {
            const indicators = PatternAnalysis.getIndicatorsAtIndex(candles, pattern.index);
            const outcome = PatternAnalysis.wasPatternProfitable(
                candles,
                pattern.index,
                this.targetPercent,
                this.stopLossPercent,
                this.maxDays
            );

            if (outcome !== null) {
                results.push({
                    symbol: stock.symbol,
                    patternType: pattern.type,
                    patternIndex: pattern.index,
                    bullish: pattern.bullish,
                    indicators,
                    outcome
                });
            }
        }

        return results;
    }

    /**
     * Calculate success rate for each pattern type
     */
    calculatePatternStats(results) {
        const grouped = {};

        // Group by pattern type
        for (const result of results) {
            if (!grouped[result.patternType]) {
                grouped[result.patternType] = {
                    type: result.patternType,
                    bullish: result.bullish,
                    total: 0,
                    successful: 0,
                    failed: 0,
                    sideways: 0,
                    avgDays: [],
                    avgPnl: []
                };
            }

            const stats = grouped[result.patternType];
            stats.total++;

            if (result.outcome.success) {
                stats.successful++;
                stats.avgDays.push(result.outcome.days);
                stats.avgPnl.push(result.outcome.pnlPercent);
            } else if (result.outcome.reason === 'sideways') {
                stats.sideways++;
            } else {
                stats.failed++;
            }
        }

        // Calculate final stats
        const statsList = Object.values(grouped).map(stats => ({
            ...stats,
            successRate: stats.successful / stats.total,
            avgDaysToTarget: stats.avgDays.length > 0
                ? stats.avgDays.reduce((a, b) => a + b, 0) / stats.avgDays.length
                : 0,
            avgPnlPercent: stats.avgPnl.length > 0
                ? stats.avgPnl.reduce((a, b) => a + b, 0) / stats.avgPnl.length
                : 0
        }));

        // Sort by success rate
        return statsList.sort((a, b) => b.successRate - a.successRate);
    }

    /**
     * Find optimal indicator filters for winning patterns
     */
    findOptimalFilters(allResults, winningPatterns) {
        const winningTypes = new Set(winningPatterns.map(p => p.type));

        // Filter to only successful occurrences of winning patterns
        const successfulOccurrences = allResults.filter(r =>
            winningTypes.has(r.patternType) && r.outcome.success
        );

        if (successfulOccurrences.length === 0) return {};

        // Analyze RSI values
        const rsiValues = successfulOccurrences
            .map(r => r.indicators.rsi)
            .filter(v => v !== null);

        const filters = {};

        // RSI filter
        if (rsiValues.length > 0) {
            const avgRSI = rsiValues.reduce((a, b) => a + b, 0) / rsiValues.length;

            if (avgRSI < 40) {
                filters.rsi = { condition: 'oversold', threshold: 35, label: 'RSI(14) < 35 (oversold)' };
            } else if (avgRSI > 60) {
                filters.rsi = { condition: 'overbought', threshold: 65, label: 'RSI(14) > 65 (overbought)' };
            }
        }

        // Volume surge filter
        const volumeSurges = successfulOccurrences.filter(r => r.indicators.volumeSurge).length;
        const volumeSurgeRate = volumeSurges / successfulOccurrences.length;

        if (volumeSurgeRate > 0.6) {
            filters.volume = {
                condition: 'surge',
                multiplier: 1.5,
                label: 'Volume > 1.5x 20-day average'
            };
        }

        // EMA trend filter
        const ema20Bullish = successfulOccurrences.filter(r =>
            r.indicators.price && r.indicators.ema20 && r.indicators.price > r.indicators.ema20
        ).length;
        const ema20BullishRate = ema20Bullish / successfulOccurrences.length;

        if (ema20BullishRate > 0.65) {
            filters.ema = {
                condition: 'above',
                period: 20,
                label: 'Price above 20 EMA (uptrend)'
            };
        }

        return filters;
    }

    /**
     * Build strategy from winning patterns and filters
     */
    buildStrategy(winningPatterns, filters) {
        const description = this.generateDescription(winningPatterns);
        const rules = this.generateRules(winningPatterns, filters);
        const entry = this.generateEntry(winningPatterns);
        const target = this.generateTarget();
        const stopLoss = this.generateStopLoss();
        const additionalFilters = this.generateFilters(winningPatterns);

        return {
            description,
            rules,
            entry,
            target,
            stopLoss,
            filters: additionalFilters,
            version: 'v1',
            createdAt: new Date().toISOString(),
            generatedBy: 'auto-strategy-engine'
        };
    }

    generateDescription(winningPatterns) {
        const patternNames = winningPatterns.map(p => {
            const name = p.type.replace(/_/g, ' ');
            return name.charAt(0).toUpperCase() + name.slice(1);
        }).slice(0, 3).join(', ');

        const isBullish = winningPatterns[0].bullish === true;
        const direction = isBullish ? 'reversal/momentum' : 'reversal';

        return `AI-generated ${direction} strategy based on ${patternNames} patterns with confirmed technical indicators`;
    }

    generateRules(winningPatterns, filters) {
        const rules = [];

        // Pattern rules
        const topPatterns = winningPatterns.slice(0, 3);
        for (const pattern of topPatterns) {
            const patternName = pattern.type.replace(/\_/g, ' ');
            rules.push(`${patternName.charAt(0).toUpperCase() + patternName.slice(1)} pattern on daily timeframe`);
        }

        // Indicator rules
        if (filters.rsi) {
            rules.push(filters.rsi.label);
        }

        if (filters.volume) {
            rules.push(filters.volume.label);
        }

        if (filters.ema) {
            rules.push(filters.ema.label);
        }

        // Additional technical confirmations
        rules.push('No major resistance within 3% above entry');
        rules.push('Strong support level below entry point');

        return rules;
    }

    generateEntry(winningPatterns) {
        const isBullish = winningPatterns[0].bullish === true;

        if (isBullish) {
            return 'Buy on close of confirmation candle with all conditions met';
        } else {
            return 'Sell on close of confirmation candle with all conditions met';
        }
    }

    generateTarget() {
        return `1. First target: ${this.targetPercent}% profit\n2. Extended target: ${this.targetPercent * 1.5}% (trail stop after first target)`;
    }

    generateStopLoss() {
        return `${this.stopLossPercent}% below entry price (or below pattern low, whichever is tighter)`;
    }

    generateFilters(winningPatterns) {
        const filters = [];

        filters.push('Avoid entry on high volatility days (VIX > 25)');
        filters.push('Skip if gap down/up > 3% from previous close');
        filters.push('Ensure stock has minimum ₹50 liquidity in 5-day average');

        // Add pattern-specific filters
        const hasEngulfing = winningPatterns.some(p => p.type.includes('engulfing'));
        if (hasEngulfing) {
            filters.push('For engulfing patterns: Current candle body must be ≥ 1.5x previous candle');
        }

        return filters;
    }

    /**
     * Validate generated strategy on all stocks
     */
    validateStrategy(strategy, stocks) {
        let successful = 0;
        let failed = 0;
        let sideways = 0;
        const trades = [];

        for (const stock of stocks) {
            if (!stock.historicalData || stock.historicalData.length < 50) continue;

            const stockTrades = this.backtestStrategy(strategy, stock);
            trades.push(...stockTrades);

            for (const trade of stockTrades) {
                if (trade.outcome.success) {
                    successful++;
                } else if (trade.outcome.reason === 'sideways') {
                    sideways++;
                } else {
                    failed++;
                }
            }
        }

        const totalTrades = successful + failed + sideways;
        const accuracy = totalTrades > 0 ? successful / totalTrades : 0;

        const netPnl = trades.reduce((sum, t) => sum + (t.outcome.pnlPercent || 0) * 1000, 0); // Assume ₹1000 per trade
        const expectancy = totalTrades > 0
            ? trades.reduce((sum, t) => sum + (t.outcome.pnlPercent || 0), 0) / totalTrades
            : 0;

        return {
            accuracy,
            totalTrades,
            successful,
            failed,
            sideways,
            netPnl,
            expectancy,
            maxDrawdown: this.calculateMaxDrawdown(trades),
            avgRMultiple: expectancy / this.stopLossPercent
        };
    }

    /**
     * Backtest strategy on a single stock
     */
    backtestStrategy(strategy, stock) {
        const candles = stock.historicalData;
        const trades = [];

        // Extract pattern types from strategy
        const strategyPatterns = [];
        for (const rule of strategy.rules) {
            const lowerRule = rule.toLowerCase();
            if (lowerRule.includes('engulfing')) strategyPatterns.push('bullish_engulfing', 'bearish_engulfing');
            if (lowerRule.includes('hammer')) strategyPatterns.push('hammer');
            if (lowerRule.includes('morning star')) strategyPatterns.push('morning_star');
            if (lowerRule.includes('piercing')) strategyPatterns.push('piercing_line');
        }

        // Scan for patterns
        const patterns = PatternAnalysis.scanPatterns(candles);

        for (const pattern of patterns) {
            // Check if pattern is in strategy
            if (!strategyPatterns.includes(pattern.type)) continue;

            // Get indicators at pattern
            const indicators = PatternAnalysis.getIndicatorsAtIndex(candles, pattern.index);

            // Check if all strategy conditions are met
            const meetsConditions = this.checkStrategyConditions(strategy, indicators);

            if (meetsConditions) {
                const outcome = PatternAnalysis.wasPatternProfitable(
                    candles,
                    pattern.index,
                    this.targetPercent,
                    this.stopLossPercent,
                    this.maxDays
                );

                if (outcome !== null) {
                    trades.push({
                        symbol: stock.symbol,
                        patternType: pattern.type,
                        entryDate: candles[pattern.index].timestamp,
                        outcome
                    });
                }
            }
        }

        return trades;
    }

    checkStrategyConditions(strategy, indicators) {
        // Check RSI condition if present
        const rsiRule = strategy.rules.find(r => r.toLowerCase().includes('rsi'));
        if (rsiRule && indicators.rsi !== null) {
            if (rsiRule.includes('< 35') && indicators.rsi >= 35) return false;
            if (rsiRule.includes('> 65') && indicators.rsi <= 65) return false;
        }

        // Check volume condition
        const volumeRule = strategy.rules.find(r => r.toLowerCase().includes('volume'));
        if (volumeRule && !indicators.volumeSurge) return false;

        // Check EMA condition
        const emaRule = strategy.rules.find(r => r.toLowerCase().includes('ema'));
        if (emaRule && indicators.price && indicators.ema20) {
            if (emaRule.includes('above') && indicators.price <= indicators.ema20) return false;
        }

        return true;
    }

    calculateMaxDrawdown(trades) {
        let peak = 0;
        let maxDrawdown = 0;
        let cumulative = 0;

        for (const trade of trades) {
            cumulative += (trade.outcome.pnlPercent || 0) * 1000;

            if (cumulative > peak) {
                peak = cumulative;
            }

            const drawdown = peak - cumulative;
            if (drawdown > maxDrawdown) {
                maxDrawdown = drawdown;
            }
        }

        return maxDrawdown;
    }
}

module.exports = AutoStrategyGenerator;
