/**
 * Intelligent Self-Learning Backtest Service
 * 
 * PURPOSE: Run TRUE time-travel backtests that learn from failures
 * 
 * WORKFLOW:
 * 1. Apply strategy rules to each stock on addedDate (no future data!)
 * 2. Simulate trade with exact entry/stop/target
 * 3. Walk forward to determine outcome
 * 4. Capture WHY each trade failed
 * 5. Analyze failure patterns
 * 6. Auto-generate improvement suggestions
 * 7. Re-run with improvements
 * 8. Iterate until accuracy plateaus
 */

const prisma = require('../lib/prisma.cjs');
const labsDataService = require('./labsDataService.cjs');
const patternDiscoverer = require('./patternDiscoverer.cjs');
const TechnicalAnalysis = require('../strategy/comprehensiveTA.cjs');
const tradeRejectionBrain = require('./tradeRejectionBrain.cjs');

class IntelligentBacktestService {

    constructor() {
        // Default trade parameters
        this.config = {
            atrMultiplierStop: 2,      // Stop at 2x ATR
            atrMultiplierTarget: 3,     // Target at 3x ATR
            maxHoldingDays: 10,         // Max days before exit
            minConfidence: 0.7          // Min pattern confidence
        };

        // Failure categories for analysis
        this.failureCategories = {
            STOP_HIT_EARLY: 'Stop hit within first 2 days',
            LOW_VOLUME_ENTRY: 'Volume < 0.8x average at entry',
            BEARISH_MARKET: 'Market was bearish on entry',
            WEAK_PATTERN: 'Pattern confidence was low',
            EXTENDED_RSI: 'RSI > 60 at entry (not oversold)',
            NO_FOLLOWTHROUGH: 'No bullish follow-through after entry',
            WRONG_DIRECTION: 'Moved opposite to expected',
            GAP_DOWN: 'Gap down after entry'
        };
    }

    /**
     * Run intelligent backtest with learning
     */
    async runBacktest(categoryKey, strategyRules, options = {}) {
        console.log('\n' + '='.repeat(70));
        console.log('🧠 INTELLIGENT SELF-LEARNING BACKTEST');
        console.log('='.repeat(70));
        console.log(`📌 Category: ${categoryKey}`);
        console.log(`📌 Strategy: ${strategyRules.patterns.join(' + ')}`);
        console.log(`📌 Mode: TRUE Time-Travel (no future data!)`);

        const maxIterations = options.maxIterations || 5;
        const targetWinRate = options.targetWinRate || 60; // Stop if we hit 60%

        const results = {
            category: categoryKey,
            strategy: strategyRules,
            iterations: [],
            finalResult: null,
            improvements: [],
            learningLog: []
        };

        // Load all stocks
        console.log('\n📦 Loading stocks...');
        const stocks = await this.loadStocks(categoryKey);
        console.log(`   Found ${stocks.length} stocks`);

        // Fetch historical data
        console.log('\n📊 Fetching historical data...');
        const allData = await labsDataService.getHistoricalData(
            stocks.map(s => ({ symbol: s.symbol })),
            { mode: 'auto', days: 300 }
        );

        // Current rules (will evolve)
        let currentRules = { ...strategyRules };
        let currentFilters = [];

        // Iterative improvement loop
        for (let iteration = 1; iteration <= maxIterations; iteration++) {
            console.log(`\n${'─'.repeat(70)}`);
            console.log(`🔄 ITERATION ${iteration}/${maxIterations}`);
            console.log('─'.repeat(70));

            // Run backtest with current rules
            const iterResult = await this.executeBacktest(
                stocks,
                allData,
                currentRules,
                currentFilters
            );

            results.iterations.push({
                iteration,
                rules: { ...currentRules },
                filters: [...currentFilters],
                ...iterResult
            });

            console.log(`\n📊 Iteration ${iteration} Results:`);
            console.log(`   Trades: ${iterResult.trades.length}`);
            console.log(`   Wins: ${iterResult.wins} | Losses: ${iterResult.losses}`);
            console.log(`   Win Rate: ${iterResult.winRate.toFixed(1)}%`);
            console.log(`   Avg PnL: ${iterResult.avgPnl.toFixed(2)}%`);

            // 🧠 Trade Rejection Brain - categorize ALL trades into buckets
            const rejectionResult = tradeRejectionBrain.processTrades(iterResult.trades);
            results.rejectionBuckets = rejectionResult;

            // If we have trades, learn from the failures
            if (iterResult.failedTrades.length > 0 && iterResult.successfulTrades.length > 0) {
                tradeRejectionBrain.learnFromFailures(iterResult.failedTrades, iterResult.successfulTrades);
            }

            // Check if we've reached target
            if (iterResult.winRate >= targetWinRate) {
                console.log(`\n🎯 Target win rate (${targetWinRate}%) achieved!`);
                results.finalResult = iterResult;
                break;
            }

            // Analyze failures and generate improvements
            // FIXED: Now passes successfulTrades to compare patterns
            if (iterResult.losses > 0 && iteration < maxIterations) {
                // Threshold-based filter optimization
                const improvements = this.analyzeFailures(iterResult.failedTrades, iterResult.successfulTrades);

                // Deep failure analysis - compare failures with similar wins
                const deepAnalysis = this.deepFailureAnalysis(iterResult.failedTrades, iterResult.successfulTrades);

                // Convert deep analysis rules to proper filter objects
                for (const rule of deepAnalysis.rules || []) {
                    // Map field names to filter types
                    const filterMap = {
                        'volumeRatio': { type: 'volumeMin', direction: 'higher' },
                        'rsi': { type: 'rsiMax', direction: 'lower' },
                        'priorChange': { type: 'priorDecline', direction: 'lower' },
                        'closePosition': { type: 'strongClose', direction: 'higher' },
                        'atrPercent': { type: 'lowVolatility', direction: 'lower' }
                    };

                    const mapping = filterMap[rule.field];
                    if (mapping && rule.direction === mapping.direction) {
                        improvements.push({
                            reason: `${rule.field} threshold`,
                            count: rule.occurrences,
                            percentage: ((rule.occurrences / iterResult.failedTrades.length) * 100).toFixed(1),
                            filter: {
                                type: mapping.type,
                                value: parseFloat(rule.winValue) || 0,
                                filter: rule.rule
                            }
                        });
                    }
                }

                console.log(`\n🔍 Failure Analysis:`);
                for (const imp of improvements) {
                    console.log(`   • ${imp.reason}: ${imp.count} trades (${imp.percentage}%)`);
                }

                // Apply best improvement that doesn't hurt too much
                // PASS existing filters to prevent duplicates!
                const bestImprovement = this.selectBestImprovement(
                    improvements,
                    iterResult.successfulTrades,
                    currentFilters  // Pass existing filters to prevent duplicates
                );

                if (bestImprovement) {
                    const filterDesc = bestImprovement.filter?.filter || bestImprovement.reason || 'Filter';
                    console.log(`\n✅ Applying: ${filterDesc}`);
                    currentFilters.push(bestImprovement.filter); // Push the filter object
                    results.improvements.push({
                        iteration,
                        filter: bestImprovement.filter,
                        description: filterDesc
                    });
                    results.learningLog.push(
                        `Iteration ${iteration}: Added filter "${filterDesc}" to address ${bestImprovement.reason}`
                    );
                } else {
                    console.log(`\n⚠️ No safe improvement found. Stopping.`);
                    // CRITICAL: Set finalResult BEFORE breaking!
                    results.finalResult = iterResult;
                    break;
                }
            }

            // Store final result
            results.finalResult = iterResult;
        }

        // Summary
        console.log('\n' + '='.repeat(70));
        console.log('📈 BACKTEST COMPLETE');
        console.log('='.repeat(70));

        if (results.iterations.length > 1) {
            const first = results.iterations[0];
            const last = results.iterations[results.iterations.length - 1];

            console.log(`\n📊 BEFORE → AFTER:`);
            console.log(`   Win Rate: ${first.winRate.toFixed(1)}% → ${last.winRate.toFixed(1)}%`);
            console.log(`   Avg PnL: ${first.avgPnl.toFixed(2)}% → ${last.avgPnl.toFixed(2)}%`);
            console.log(`   Trades: ${first.trades.length} → ${last.trades.length}`);

            console.log(`\n🎓 Learned Improvements:`);
            for (const imp of results.improvements) {
                console.log(`   • ${imp.description || imp.filter?.filter || 'Filter'}`);
            }
        }

        return results;
    }

    /**
     * Run multi-strategy backtest - test ALL patterns and find which works best
     * This helps understand which strategy works for which TYPE of stock
     */
    async runMultiStrategyBacktest(categoryKey, options = {}) {
        console.log('\n' + '='.repeat(70));
        console.log('🧠 MULTI-STRATEGY INTELLIGENT BACKTEST');
        console.log('='.repeat(70));
        console.log(`📌 Category: ${categoryKey}`);
        console.log(`📌 Mode: Test ALL patterns to find best for each stock`);

        const maxIterations = options.maxIterations || 3;

        // All patterns to test
        const allPatterns = [
            'VolumeSpike',
            'RSI_Oversold',
            'Stoch_Oversold',
            'HigherLow',
            'MorningStar',
            'StrongClose',
            'MACD_BullishCross'
        ];

        // Load stocks
        console.log('\n📦 Loading stocks...');
        const stocks = await this.loadStocks(categoryKey);
        console.log(`   Found ${stocks.length} stocks`);

        // Fetch data
        console.log('\n📊 Fetching historical data...');
        const allData = await labsDataService.getHistoricalData(
            stocks.map(s => ({ symbol: s.symbol })),
            { mode: 'auto', days: 300 }
        );

        const results = {
            category: categoryKey,
            strategiesCompared: allPatterns.length,
            strategyResults: [],
            stockAnalysis: [], // Which strategy works for which stock
            recommendations: []
        };

        // Test each pattern
        for (const pattern of allPatterns) {
            console.log(`\n${'─'.repeat(50)}`);
            console.log(`🔬 Testing: ${pattern}`);
            console.log('─'.repeat(50));

            const strategyResult = await this.executeBacktest(
                stocks,
                allData,
                { patterns: [pattern] },
                []
            );

            results.strategyResults.push({
                pattern,
                trades: strategyResult.trades.length,
                wins: strategyResult.wins,
                losses: strategyResult.losses,
                winRate: parseFloat(strategyResult.winRate.toFixed(1)),
                avgPnl: parseFloat(strategyResult.avgPnl.toFixed(2)),
                totalPnl: parseFloat(strategyResult.totalPnl.toFixed(2)),
                // Store which stocks succeeded with this pattern
                successfulStocks: strategyResult.successfulTrades.map(t => t.symbol),
                failedStocks: strategyResult.failedTrades.map(t => t.symbol)
            });

            console.log(`   Trades: ${strategyResult.trades.length}`);
            console.log(`   Win Rate: ${strategyResult.winRate.toFixed(1)}%`);
            console.log(`   Avg PnL: ${strategyResult.avgPnl.toFixed(2)}%`);
        }

        // Sort by win rate
        results.strategyResults.sort((a, b) => b.winRate - a.winRate);

        // Analyze per-stock: which strategy works best for each
        const stockBestStrategy = {};
        for (const sr of results.strategyResults) {
            for (const symbol of sr.successfulStocks) {
                if (!stockBestStrategy[symbol]) {
                    stockBestStrategy[symbol] = { patterns: [], winCount: 0 };
                }
                stockBestStrategy[symbol].patterns.push(sr.pattern);
                stockBestStrategy[symbol].winCount++;
            }
        }

        // Find stocks that ONLY work with specific strategy
        for (const [symbol, data] of Object.entries(stockBestStrategy)) {
            results.stockAnalysis.push({
                symbol,
                bestPatterns: data.patterns,
                successWithPatterns: data.winCount,
                recommendation: data.patterns.length === 1
                    ? `Only works with ${data.patterns[0]}`
                    : `Works with multiple: ${data.patterns.slice(0, 3).join(', ')}`
            });
        }

        // Generate recommendations
        console.log('\n' + '='.repeat(70));
        console.log('📊 MULTI-STRATEGY ANALYSIS COMPLETE');
        console.log('='.repeat(70));

        console.log('\n🏆 Strategy Rankings:');
        for (let i = 0; i < Math.min(5, results.strategyResults.length); i++) {
            const sr = results.strategyResults[i];
            console.log(`   ${i + 1}. ${sr.pattern}: ${sr.winRate}% win rate, ${sr.trades} trades`);
        }

        // Generate smart recommendations
        const top3Strategies = results.strategyResults.slice(0, 3);
        results.recommendations = [
            `Use ${top3Strategies[0]?.pattern} as PRIMARY strategy (${top3Strategies[0]?.winRate}% WR)`,
            `Use ${top3Strategies[1]?.pattern} as SECONDARY for stocks where primary fails`,
            `${top3Strategies[2]?.pattern} as fallback for remaining stocks`,
            `Combined approach could improve overall accuracy vs single strategy`
        ];

        console.log('\n💡 Recommendations:');
        for (const rec of results.recommendations) {
            console.log(`   • ${rec}`);
        }

        return results;
    }

    /**
     * Load stocks from category
     */
    async loadStocks(categoryKey) {
        const category = await prisma.category.findUnique({
            where: { key: categoryKey }
        });

        if (!category) return [];

        const stockCategories = await prisma.stockCategory.findMany({
            where: { categoryId: category.id },
            include: { stock: true }
        });

        return stockCategories.map(sc => ({
            symbol: sc.stock.symbol,
            name: sc.stock.name,
            addedDate: sc.addedDate
        }));
    }

    /**
     * Execute backtest with current rules and filters
     */
    async executeBacktest(stocks, allData, rules, filters) {
        const trades = [];
        const failedTrades = [];
        const successfulTrades = [];

        for (const stock of stocks) {
            const candles = allData[stock.symbol];
            if (!candles || candles.length < 50) continue;

            // Transform candles
            const transformedCandles = candles.map(c => ({
                timestamp: c.date,
                open: c.open,
                high: c.high,
                low: c.low,
                close: c.close,
                volume: c.volume
            }));

            // Find addedDate index
            const addedIdx = this.findDateIndex(transformedCandles, stock.addedDate);
            if (addedIdx < 20 || addedIdx >= transformedCandles.length - 5) continue;

            // Get candles UP TO addedDate only (NO FUTURE DATA!)
            const candlesUpToDate = transformedCandles.slice(0, addedIdx + 1);

            // DISCOVER ALL PATTERNS at addedDate - True Trader Logic
            const discovery = patternDiscoverer.discoverAll(candlesUpToDate, addedIdx);
            const patternsAtEntry = discovery.patterns.map(p => p.name);

            // If no patterns found, skip (no reason to enter)
            if (patternsAtEntry.length === 0) continue;

            // Check if specific patterns are requested (non-CategoryEntry mode)
            const isCategoryEntry = rules.patterns.includes('CategoryEntry');
            if (!isCategoryEntry) {
                const hasAllPatterns = rules.patterns.every(p => patternsAtEntry.includes(p));
                if (!hasAllPatterns) continue;
            }

            // Collect context for filters
            const context = this.buildTradeContext(candlesUpToDate, addedIdx);
            // STORE patterns in context for later use
            context.patternsAtEntry = patternsAtEntry;
            context.entryReason = patternsAtEntry.slice(0, 3).join(' + ') || 'Unknown';

            // Check filters
            if (!this.passesFilters(context, filters)) continue;

            // Execute trade simulation (walk forward from addedDate)
            const trade = this.simulateTrade(
                stock,
                transformedCandles,
                addedIdx,
                context
            );

            // ADD ENTRY PATTERNS TO TRADE
            trade.entryPatterns = patternsAtEntry;
            trade.entryReason = context.entryReason;

            trades.push(trade);

            if (trade.outcome === 'WIN') {
                successfulTrades.push(trade);
            } else {
                // Capture detailed failure reasons
                trade.failureReasons = this.categorizeFailure(trade, context);
                failedTrades.push(trade);
            }
        }

        // Calculate stats
        const wins = successfulTrades.length;
        const losses = failedTrades.length;
        const winRate = trades.length > 0 ? (wins / trades.length) * 100 : 0;
        const avgPnl = trades.length > 0
            ? trades.reduce((s, t) => s + t.pnlPercent, 0) / trades.length
            : 0;

        return {
            trades,
            successfulTrades,
            failedTrades,
            wins,
            losses,
            winRate,
            avgPnl,
            totalPnl: trades.reduce((s, t) => s + t.pnlPercent, 0)
        };
    }

    /**
     * Build trade context for filtering
     */
    buildTradeContext(candles, idx) {
        const current = candles[idx];
        const prev = candles[idx - 1];
        const lookback20 = candles.slice(-20);

        // Volume analysis
        const avgVolume = lookback20.reduce((s, c) => s + c.volume, 0) / 20;
        const volumeRatio = avgVolume > 0 ? current.volume / avgVolume : 1;

        // RSI
        const rsi = TechnicalAnalysis.RSI(candles, 14);

        // Market context (simple: are most stocks going up or down?)
        const priorDays = candles.slice(idx - 5, idx);
        const priorChange = priorDays.length >= 2
            ? ((priorDays[priorDays.length - 1].close - priorDays[0].close) / priorDays[0].close) * 100
            : 0;

        // Day change
        const dayChange = ((current.close - prev.close) / prev.close) * 100;

        // ATR
        const atr = TechnicalAnalysis.ATR(candles) || (current.close * 0.02);
        const atrPercent = (atr / current.close) * 100; // ATR as percentage

        return {
            volumeRatio,
            rsi,
            priorChange,
            dayChange,
            atr,
            atrPercent, // NEW: For lowVolatility filter
            closePosition: (current.close - current.low) / (current.high - current.low || 1),
            isGapDown: current.open < prev.close * 0.98,
            isGapUp: current.open > prev.close * 1.02
        };
    }

    /**
     * Check if trade passes all filters
     */
    passesFilters(context, filters) {
        for (const filter of filters) {
            // Volume minimum filter - uses dynamic threshold
            if (filter.type === 'volumeMin' && context.volumeRatio < filter.value) {
                return false;
            }
            // RSI maximum filter - uses dynamic threshold
            if (filter.type === 'rsiMax' && context.rsi > filter.value) {
                return false;
            }
            // No gap down filter
            if (filter.type === 'noGapDown' && context.isGapDown) {
                return false;
            }
            // Prior decline filter - uses dynamic threshold
            if (filter.type === 'priorDecline' && context.priorChange > filter.value) {
                return false;
            }
            // Strong close filter - uses dynamic threshold
            if (filter.type === 'strongClose' && context.closePosition < filter.value) {
                return false;
            }
            // Low volatility filter
            if (filter.type === 'lowVolatility' && context.atrPercent > 3) {
                return false;
            }
        }
        return true;
    }

    /**
     * Simulate a single trade
     */
    simulateTrade(stock, candles, entryIdx, context) {
        const entryCandle = candles[entryIdx];
        const entryPrice = entryCandle.close;
        const atr = context.atr;

        // Set stop and target
        const stopLoss = entryPrice - (atr * this.config.atrMultiplierStop);
        const target = entryPrice + (atr * this.config.atrMultiplierTarget);

        const trade = {
            symbol: stock.symbol,
            addedDate: stock.addedDate,
            entryDate: entryCandle.timestamp,
            entryPrice,
            stopLoss,
            target,
            context: { ...context },
            outcome: null,
            exitReason: null,
            exitPrice: null,
            exitDate: null,
            daysHeld: 0,
            pnlPercent: 0,
            maxAdverseExcursion: 0,
            maxFavorableExcursion: 0
        };

        // Walk forward
        for (let i = entryIdx + 1; i < candles.length && i <= entryIdx + this.config.maxHoldingDays; i++) {
            const candle = candles[i];
            trade.daysHeld = i - entryIdx;

            // Track MAE/MFE
            const adverseMove = ((entryPrice - candle.low) / entryPrice) * 100;
            const favorableMove = ((candle.high - entryPrice) / entryPrice) * 100;
            trade.maxAdverseExcursion = Math.max(trade.maxAdverseExcursion, adverseMove);
            trade.maxFavorableExcursion = Math.max(trade.maxFavorableExcursion, favorableMove);

            // Check target
            if (candle.high >= target) {
                trade.outcome = 'WIN';
                trade.exitReason = 'TARGET_HIT';
                trade.exitPrice = target;
                trade.exitDate = candle.timestamp;
                trade.pnlPercent = ((target - entryPrice) / entryPrice) * 100;
                return trade;
            }

            // Check stop
            if (candle.low <= stopLoss) {
                trade.outcome = 'LOSS';
                trade.exitReason = 'STOP_HIT';
                trade.exitPrice = stopLoss;
                trade.exitDate = candle.timestamp;
                trade.pnlPercent = ((stopLoss - entryPrice) / entryPrice) * 100;
                return trade;
            }
        }

        // Time expired
        const exitCandle = candles[Math.min(entryIdx + this.config.maxHoldingDays, candles.length - 1)];
        trade.outcome = exitCandle.close > entryPrice ? 'WIN' : 'LOSS';
        trade.exitReason = 'TIME_EXPIRED';
        trade.exitPrice = exitCandle.close;
        trade.exitDate = exitCandle.timestamp;
        trade.pnlPercent = ((exitCandle.close - entryPrice) / entryPrice) * 100;
        return trade;
    }

    /**
     * Categorize why a trade failed
     */
    categorizeFailure(trade, context) {
        const reasons = [];

        // Hit stop too early?
        if (trade.exitReason === 'STOP_HIT' && trade.daysHeld <= 2) {
            reasons.push('STOP_HIT_EARLY');
        }

        // Low volume?
        if (context.volumeRatio < 0.8) {
            reasons.push('LOW_VOLUME_ENTRY');
        }

        // RSI not oversold?
        if (context.rsi && context.rsi > 60) {
            reasons.push('EXTENDED_RSI');
        }

        // Gap down after entry?
        if (trade.maxAdverseExcursion > 3) {
            reasons.push('GAP_DOWN');
        }

        // No follow-through?
        if (trade.maxFavorableExcursion < 1) {
            reasons.push('NO_FOLLOWTHROUGH');
        }

        // Prior trend was up (wrong direction for LOM)?
        if (context.priorChange > 2) {
            reasons.push('WRONG_DIRECTION');
        }

        return reasons.length > 0 ? reasons : ['UNKNOWN'];
    }

    /**
     * Analyze failures - Find optimal thresholds that eliminate max failures with min winner impact
     * GOAL: Find filter thresholds that remove failures WITHOUT removing too many winners
     */
    analyzeFailures(failedTrades, successfulTrades = []) {
        if (failedTrades.length === 0) return [];

        const totalFailed = failedTrades.length;
        const totalSuccess = successfulTrades.length || 1;

        console.log(`\n📊 Analyzing ${totalFailed} failures and ${totalSuccess} wins...`);

        // Extract context values from all trades
        const failedContexts = failedTrades.filter(t => t.context).map(t => t.context);
        const successContexts = successfulTrades.filter(t => t.context).map(t => t.context);

        if (failedContexts.length === 0) {
            console.log('⚠️ No context data in failed trades');
            return [];
        }

        // Define filter candidates with different thresholds to test
        const filterCandidates = [
            {
                name: 'volumeMin',
                label: 'Volume > Xavg',
                thresholds: [0.8, 1.0, 1.2, 1.5, 2.0],
                getter: (ctx) => ctx.volumeRatio || 0,
                filterType: 'min', // Filter OUT if value < threshold
                createFilter: (v) => ({ type: 'volumeMin', value: v, filter: `Volume > ${v}x avg` })
            },
            {
                name: 'rsiMax',
                label: 'RSI < X',
                thresholds: [30, 40, 50, 60],
                getter: (ctx) => ctx.rsi || 50,
                filterType: 'max', // Filter OUT if value > threshold
                createFilter: (v) => ({ type: 'rsiMax', value: v, filter: `RSI < ${v}` })
            },
            {
                name: 'priorDecline',
                label: 'Prior change < X%',
                thresholds: [-5, -3, -2, -1, 0],
                getter: (ctx) => ctx.priorChange || 0,
                filterType: 'max', // Filter OUT if value > threshold
                createFilter: (v) => ({ type: 'priorDecline', value: v, filter: `Prior change < ${v}%` })
            },
            {
                name: 'closePos',
                label: 'Close position > X',
                thresholds: [0.3, 0.4, 0.5, 0.6],
                getter: (ctx) => ctx.closePosition || 0.5,
                filterType: 'min', // Filter OUT if value < threshold
                createFilter: (v) => ({ type: 'strongClose', value: v, filter: `Close position > ${(v * 100).toFixed(0)}%` })
            }
        ];

        const improvements = [];

        for (const candidate of filterCandidates) {
            let bestThreshold = null;
            let bestScore = -Infinity;
            let bestStats = null;

            for (const threshold of candidate.thresholds) {
                // Count how many would be FILTERED OUT at this threshold
                let failedFiltered = 0;
                let successFiltered = 0;

                for (const ctx of failedContexts) {
                    const val = candidate.getter(ctx);
                    if (candidate.filterType === 'min' && val < threshold) failedFiltered++;
                    if (candidate.filterType === 'max' && val > threshold) failedFiltered++;
                }

                for (const ctx of successContexts) {
                    const val = candidate.getter(ctx);
                    if (candidate.filterType === 'min' && val < threshold) successFiltered++;
                    if (candidate.filterType === 'max' && val > threshold) successFiltered++;
                }

                // Score = (failures removed) - 2*(winners removed)
                // We penalize removing winners more than removing failures
                const failRemoveRate = (failedFiltered / totalFailed) * 100;
                const winRemoveRate = (successFiltered / totalSuccess) * 100;
                const score = failRemoveRate - (2 * winRemoveRate);

                if (score > bestScore && failRemoveRate > 10) { // Must remove at least 10% of failures
                    bestScore = score;
                    bestThreshold = threshold;
                    bestStats = { failRemoveRate, winRemoveRate, failedFiltered, successFiltered };
                }
            }

            if (bestThreshold !== null && bestStats) {
                console.log(`   ${candidate.label}: threshold=${bestThreshold}, removes ${bestStats.failRemoveRate.toFixed(1)}% failures, ${bestStats.winRemoveRate.toFixed(1)}% wins (score: ${bestScore.toFixed(1)})`);

                // Only add if we remove MORE failures than winners
                if (bestStats.failRemoveRate > bestStats.winRemoveRate * 1.5) {
                    improvements.push({
                        reason: candidate.name,
                        count: bestStats.failedFiltered,
                        percentage: bestStats.failRemoveRate.toFixed(1),
                        winnerLoss: bestStats.winRemoveRate.toFixed(1),
                        score: bestScore.toFixed(1),
                        filter: candidate.createFilter(bestThreshold)
                    });
                }
            }
        }

        // Sort by score (best first)
        improvements.sort((a, b) => parseFloat(b.score) - parseFloat(a.score));

        if (improvements.length > 0) {
            console.log(`\n✅ Found ${improvements.length} effective filters:`);
            for (const imp of improvements) {
                console.log(`   ${imp.filter.filter} removes ${imp.percentage}% failures, loses ${imp.winnerLoss}% winners`);
            }
        } else {
            console.log(`\n⚠️ No effective filters found - entry conditions similar for wins/losses`);
            console.log(`   💡 Suggestion: Focus on EXIT strategy or position sizing instead`);
        }

        return improvements;
    }

    /**
     * Select best improvement that won't hurt successful trades
     * FIXED: Now accepts existingFilters to prevent duplicate filter types
     */
    selectBestImprovement(improvements, successfulTrades, existingFilters = []) {
        // Get list of already-applied filter types
        const appliedTypes = new Set(
            existingFilters
                .filter(f => f.filter && f.filter.type)
                .map(f => f.filter.type)
        );

        for (const imp of improvements) {
            if (!imp.filter) continue;

            // SKIP if this filter type was already applied!
            if (appliedTypes.has(imp.filter.type)) {
                console.log(`   ⏭️ Skipping ${imp.filter.type} - already applied`);
                continue;
            }

            // Check how many successful trades would be affected
            // NOTE: trade.context is stored in executeBacktest
            let affected = 0;
            for (const trade of successfulTrades) {
                if (trade.context && !this.passesFilters(trade.context, [imp.filter])) {
                    affected++;
                }
            }

            const affectedPercent = successfulTrades.length > 0
                ? (affected / successfulTrades.length) * 100
                : 0;

            // Only apply if it doesn't hurt more than 30% of successful trades
            if (affectedPercent <= 30) {
                imp.affectedSuccessful = affected;
                imp.affectedPercent = affectedPercent.toFixed(1);
                console.log(`   ✅ Selected: ${imp.filter.type} (affects ${affectedPercent.toFixed(1)}% of wins)`);
                return imp;
            } else {
                console.log(`   ❌ Rejected: ${imp.filter.type} (would hurt ${affectedPercent.toFixed(1)}% of wins)`);
            }
        }

        return null;
    }

    /**
     * Find index of date in candles
     */
    findDateIndex(candles, targetDate) {
        const target = new Date(targetDate).toDateString();

        for (let i = 0; i < candles.length; i++) {
            const candleDate = new Date(candles[i].timestamp).toDateString();
            if (candleDate === target) return i;
        }

        // Find closest
        const targetTime = new Date(targetDate).getTime();
        let closestIdx = candles.length - 1;
        let closestDiff = Infinity;

        for (let i = 0; i < candles.length; i++) {
            const diff = Math.abs(new Date(candles[i].timestamp).getTime() - targetTime);
            if (diff < closestDiff) {
                closestDiff = diff;
                closestIdx = i;
            }
        }

        return closestIdx;
    }

    // ============================================================
    // PER-STOCK PATTERN TESTING
    // ============================================================

    /**
     * Test a single stock with all available patterns to find optimal entry
     * Returns the best pattern(s) for this specific stock
     */
    async testStockWithAllPatterns(symbol, candles, addedDate) {
        if (candles.length < 50) {
            return { symbol, bestPattern: null, error: 'Insufficient data' };
        }

        const addedIdx = this.findDateIndex(candles, addedDate);
        if (addedIdx < 20 || addedIdx >= candles.length - 5) {
            return { symbol, bestPattern: null, error: 'Invalid date index' };
        }

        // Get all patterns available on addedDate
        const candlesUpToDate = candles.slice(0, addedIdx + 1);
        const discovered = patternDiscoverer.discoverAll(candlesUpToDate, addedIdx);
        const patternsAtEntry = discovered.patterns.map(p => p.name);

        if (patternsAtEntry.length === 0) {
            return { symbol, bestPattern: null, error: 'No patterns found' };
        }

        // Build context for this trade
        const context = this.buildTradeContext(candlesUpToDate, addedIdx);

        // Simulate trade to see outcome  
        const trade = this.simulateTrade(
            { symbol, addedDate },
            candles,
            addedIdx,
            context
        );

        // Return pattern performance for this stock
        return {
            symbol,
            addedDate,
            patternsAtEntry,
            outcome: trade.outcome,
            pnlPercent: trade.pnlPercent,
            context: {
                volumeRatio: context.volumeRatio?.toFixed(2),
                rsi: context.rsi?.toFixed(1),
                priorChange: context.priorChange?.toFixed(2),
                closePosition: context.closePosition?.toFixed(2)
            }
        };
    }

    // ============================================================
    // DEEP FAILURE ANALYSIS
    // ============================================================

    /**
     * Deep failure analysis - compare each failure with similar wins
     * to find WHAT specifically made the difference
     */
    deepFailureAnalysis(failedTrades, successfulTrades) {
        if (failedTrades.length === 0 || successfulTrades.length === 0) {
            return { insights: [], noDataReason: 'Need both failures and wins to compare' };
        }

        const insights = [];
        const differenceCounts = {};

        for (const failedTrade of failedTrades) {
            if (!failedTrade.context) continue;

            // Find similar successful trades (close context values)
            const similarWins = this.findSimilarTrades(failedTrade, successfulTrades, 0.3);

            if (similarWins.length > 0) {
                // There ARE wins with similar entry - find what's DIFFERENT
                for (const win of similarWins) {
                    const differences = this.findContextDifferences(failedTrade.context, win.context);

                    for (const diff of differences) {
                        const key = `${diff.field}:${diff.direction}`;
                        differenceCounts[key] = differenceCounts[key] || { count: 0, diff };
                        differenceCounts[key].count++;
                    }
                }
            } else {
                // No similar wins - this context is always bad
                insights.push({
                    type: 'ALWAYS_FAIL',
                    symbol: failedTrade.symbol,
                    context: failedTrade.context,
                    message: `No wins found with similar entry conditions`
                });
            }
        }

        // Convert difference counts to rules
        const rules = [];
        for (const [key, data] of Object.entries(differenceCounts)) {
            if (data.count >= 3) { // At least 3 occurrences to be significant
                const { field, failedValue, winValue, direction } = data.diff;
                rules.push({
                    field,
                    direction, // Include direction for filter mapping
                    winValue,  // Include winValue for threshold
                    failedValue,
                    rule: direction === 'higher'
                        ? `Require ${field} > ${winValue.toFixed(2)} (failures had ${failedValue.toFixed(2)})`
                        : `Require ${field} < ${winValue.toFixed(2)} (failures had ${failedValue.toFixed(2)})`,
                    occurrences: data.count
                });
            }
        }

        // Sort by occurrences
        rules.sort((a, b) => b.occurrences - a.occurrences);

        console.log(`\n🔍 Deep Failure Analysis:`);
        console.log(`   Analyzed ${failedTrades.length} failures vs ${successfulTrades.length} wins`);
        for (const rule of rules.slice(0, 5)) {
            console.log(`   📌 ${rule.rule} (${rule.occurrences} cases)`);
        }

        return { insights, rules };
    }

    /**
     * Find trades with similar context values
     */
    findSimilarTrades(targetTrade, candidates, tolerance = 0.3) {
        if (!targetTrade.context) return [];

        return candidates.filter(candidate => {
            if (!candidate.context) return false;

            const tc = targetTrade.context;
            const cc = candidate.context;

            // Check if key metrics are within tolerance
            const volumeSimilar = Math.abs((tc.volumeRatio || 1) - (cc.volumeRatio || 1)) < tolerance;
            const rsiSimilar = Math.abs((tc.rsi || 50) - (cc.rsi || 50)) < 15;
            const changeSimilar = Math.abs((tc.priorChange || 0) - (cc.priorChange || 0)) < 3;

            return volumeSimilar && rsiSimilar && changeSimilar;
        });
    }

    /**
     * Find what's different between two contexts
     */
    findContextDifferences(failedContext, winContext) {
        const differences = [];
        const fc = failedContext;
        const wc = winContext;

        const fields = ['volumeRatio', 'rsi', 'priorChange', 'closePosition', 'atrPercent'];

        for (const field of fields) {
            const failedVal = fc[field];
            const winVal = wc[field];

            if (failedVal !== undefined && winVal !== undefined) {
                const diff = Math.abs(failedVal - winVal);
                if (diff > 0.1 * Math.max(1, Math.abs(winVal))) { // >10% difference
                    differences.push({
                        field,
                        failedValue: failedVal,
                        winValue: winVal,
                        direction: failedVal < winVal ? 'higher' : 'lower'
                    });
                }
            }
        }

        return differences;
    }
}

module.exports = new IntelligentBacktestService();
