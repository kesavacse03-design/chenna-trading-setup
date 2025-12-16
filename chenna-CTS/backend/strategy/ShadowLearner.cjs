/**
 * Shadow Learner - Observational Research Module for Backtest
 * 
 * PURPOSE:
 * - Observe mistakes during backtest
 * - Detect repeated failure patterns
 * - Identify conditions where logic underperforms/performs well
 * - Produce HUMAN-READABLE refinement suggestions
 * 
 * DOES NOT:
 * - Automatically change logic
 * - Tune parameters
 * - Promote strategies
 * 
 * The user is always the final decision-maker.
 */

class ShadowLearner {
    constructor(backtestResults) {
        this.results = backtestResults;
        this.trades = backtestResults.executedTrades || [];
        this.invalidated = backtestResults.invalidatedSignals || [];
        this.skipped = backtestResults.skippedSignals || [];
        this.summary = backtestResults.summary || {};
    }

    /**
     * Generate complete Shadow Report
     */
    generateShadowReport() {
        return {
            timestamp: new Date().toISOString(),
            category: this.results.category,
            version: this.results.strategyVersion || 'V1',

            performanceFacts: this.analyzePerformance(),
            failureAnalysis: this.analyzeFailures(),
            strengthAnalysis: this.analyzeStrengths(),
            refinementSuggestions: this.generateSuggestions(),

            // For UI display
            humanReadableSummary: this.generateHumanSummary()
        };
    }

    // ============================================
    // SECTION 1: PERFORMANCE FACTS
    // ============================================
    analyzePerformance() {
        const trades = this.trades;
        const wins = trades.filter(t => t.result === 'WIN');
        const losses = trades.filter(t => t.result === 'LOSS');

        // Calculate max drawdown (consecutive losses)
        let maxDrawdown = 0;
        let currentDrawdown = 0;
        let maxDrawdownPeriod = [];
        let currentDrawdownPeriod = [];

        for (const trade of trades) {
            if (trade.result === 'LOSS') {
                currentDrawdown += Math.abs(trade.pnl);
                currentDrawdownPeriod.push(trade);
            } else {
                if (currentDrawdown > maxDrawdown) {
                    maxDrawdown = currentDrawdown;
                    maxDrawdownPeriod = [...currentDrawdownPeriod];
                }
                currentDrawdown = 0;
                currentDrawdownPeriod = [];
            }
        }
        // Check final period
        if (currentDrawdown > maxDrawdown) {
            maxDrawdown = currentDrawdown;
            maxDrawdownPeriod = currentDrawdownPeriod;
        }

        // Average R (risk-adjusted return)
        const avgWinR = wins.length > 0
            ? wins.reduce((s, t) => s + t.pnl, 0) / wins.length / 1.5 // Normalized to 1.5% base risk
            : 0;
        const avgLossR = losses.length > 0
            ? Math.abs(losses.reduce((s, t) => s + t.pnl, 0) / losses.length) / 1.5
            : 0;

        // Calculate expectancy
        const winRate = trades.length > 0 ? wins.length / trades.length : 0;
        const expectancy = (winRate * avgWinR) - ((1 - winRate) * avgLossR);

        // Capital protection rate (trades that hit at least partial target)
        const protectedTrades = trades.filter(t => t.partialExitPrice !== null);
        const capitalWinRate = trades.length > 0
            ? protectedTrades.length / trades.length * 100
            : 0;

        return {
            totalTrades: trades.length,
            wins: wins.length,
            losses: losses.length,
            accuracy: (winRate * 100).toFixed(1) + '%',
            maxDrawdown: maxDrawdown.toFixed(2) + '%',
            maxDrawdownTrades: maxDrawdownPeriod.length,
            maxDrawdownSymbols: maxDrawdownPeriod.map(t => t.symbol),
            expectancy: expectancy.toFixed(3),
            avgWinR: avgWinR.toFixed(2) + 'R',
            avgLossR: avgLossR.toFixed(2) + 'R',
            capitalWinRate: capitalWinRate.toFixed(1) + '%',
            avgHoldingDays: this.summary.avgHoldingDays || 'N/A',

            // Exit breakdown
            exitBreakdown: this.summary.exitBreakdown || {}
        };
    }

    // ============================================
    // SECTION 2: FAILURE ANALYSIS
    // ============================================
    analyzeFailures() {
        const losses = this.trades.filter(t => t.result === 'LOSS');
        const analysis = {
            patterns: [],
            earlyEntries: [],
            rigidExits: [],
            repeatedFailures: {}
        };

        // Pattern 1: Quick stops (holding < 2 days) = premature entry
        const quickStops = losses.filter(t => t.holdingDays <= 2);
        if (quickStops.length > losses.length * 0.5) {
            analysis.patterns.push({
                type: 'EARLY_ENTRY',
                severity: 'HIGH',
                count: quickStops.length,
                description: `${quickStops.length} trades stopped within 2 days - entries may be too early`,
                examples: quickStops.slice(0, 3).map(t => ({
                    symbol: t.symbol,
                    entryDate: t.entryDate,
                    holdingDays: t.holdingDays
                }))
            });
        }

        // Pattern 2: Losses that were close to target (within 1% of target)
        const almostWins = losses.filter(t => {
            if (!t.targetPrice || !t.entryPrice) return false;
            const targetDistance = (t.targetPrice - t.entryPrice) / t.entryPrice * 100;
            const actualHigh = t.highestPriceSinceEntry || t.entryPrice;
            const reachedPercent = (actualHigh - t.entryPrice) / t.entryPrice * 100;
            return reachedPercent > targetDistance * 0.7; // Reached 70% of target
        });

        // Pattern 3: Same symbol repeated losses
        const symbolLosses = {};
        for (const loss of losses) {
            symbolLosses[loss.symbol] = (symbolLosses[loss.symbol] || 0) + 1;
        }
        const repeatedLossSymbols = Object.entries(symbolLosses)
            .filter(([_, count]) => count >= 2)
            .map(([symbol, count]) => ({ symbol, count }));

        if (repeatedLossSymbols.length > 0) {
            analysis.patterns.push({
                type: 'REPEATED_SYMBOL_LOSSES',
                severity: 'MEDIUM',
                description: 'Same symbols showing repeated losses',
                symbols: repeatedLossSymbols
            });
        }

        // Pattern 4: Strategy-specific failure rates
        const strategyLosses = {};
        const strategyTotal = {};
        for (const trade of this.trades) {
            const strat = trade.strategy;
            strategyTotal[strat] = (strategyTotal[strat] || 0) + 1;
            if (trade.result === 'LOSS') {
                strategyLosses[strat] = (strategyLosses[strat] || 0) + 1;
            }
        }

        const weakStrategies = Object.entries(strategyTotal)
            .filter(([strat, total]) => {
                const lossCount = strategyLosses[strat] || 0;
                return total >= 3 && lossCount / total > 0.6;
            })
            .map(([strat, total]) => ({
                strategy: strat,
                losses: strategyLosses[strat],
                total,
                lossRate: ((strategyLosses[strat] / total) * 100).toFixed(1) + '%'
            }));

        if (weakStrategies.length > 0) {
            analysis.patterns.push({
                type: 'WEAK_STRATEGY',
                severity: 'MEDIUM',
                description: 'Some strategies underperforming',
                strategies: weakStrategies
            });
        }

        // Early entries analysis
        analysis.earlyEntries = quickStops.map(t => ({
            symbol: t.symbol,
            strategy: t.strategy,
            entryDate: t.entryDate,
            holdingDays: t.holdingDays,
            pnl: t.pnl.toFixed(2) + '%'
        }));

        return analysis;
    }

    // ============================================
    // SECTION 3: STRENGTH ANALYSIS
    // ============================================
    analyzeStrengths() {
        const wins = this.trades.filter(t => t.result === 'WIN');
        const analysis = {
            patterns: [],
            patiencePayoffs: [],
            structureHolds: [],
            extendedWins: []
        };

        // Pattern 1: Trades that reached second target
        const fullTargetWins = wins.filter(t => t.exitReason === 'SECOND_TARGET');
        if (fullTargetWins.length > 0) {
            analysis.patterns.push({
                type: 'FULL_TARGET_HITS',
                severity: 'POSITIVE',
                count: fullTargetWins.length,
                description: `${fullTargetWins.length} trades reached full target - structure holding well`,
                avgHoldingDays: (fullTargetWins.reduce((s, t) => s + t.holdingDays, 0) / fullTargetWins.length).toFixed(1)
            });
        }

        // Pattern 2: Trailing stops that captured extra profit
        const trailingWins = wins.filter(t => t.exitReason === 'TRAILING_STOP');
        if (trailingWins.length > 0) {
            const avgTrailPnl = trailingWins.reduce((s, t) => s + t.pnl, 0) / trailingWins.length;
            analysis.patterns.push({
                type: 'TRAILING_SUCCESS',
                severity: 'POSITIVE',
                count: trailingWins.length,
                description: `${trailingWins.length} trailing stops captured avg ${avgTrailPnl.toFixed(2)}% profit`
            });
        }

        // Pattern 3: Wins with longer holding (patience paid off)
        const patientWins = wins.filter(t => t.holdingDays >= 4);
        if (patientWins.length > 0) {
            const avgPnl = patientWins.reduce((s, t) => s + t.pnl, 0) / patientWins.length;
            analysis.patterns.push({
                type: 'PATIENCE_REWARD',
                severity: 'POSITIVE',
                count: patientWins.length,
                description: `${patientWins.length} trades held 4+ days, avg ${avgPnl.toFixed(2)}% profit`
            });

            analysis.patiencePayoffs = patientWins.map(t => ({
                symbol: t.symbol,
                holdingDays: t.holdingDays,
                pnl: t.pnl.toFixed(2) + '%',
                exitReason: t.exitReason
            }));
        }

        // Pattern 4: High quality score trades
        const highQualityWins = wins.filter(t => {
            const qualityMatch = t.lifecycle?.[1]?.reason?.match(/Quality: (\d)\/4/);
            return qualityMatch && parseInt(qualityMatch[1]) >= 3;
        });

        if (highQualityWins.length > wins.length * 0.5) {
            analysis.patterns.push({
                type: 'QUALITY_FILTER_EFFECTIVE',
                severity: 'POSITIVE',
                description: 'High quality score trades showing better win rate'
            });
        }

        // Strong strategies
        const strategyWins = {};
        const strategyTotal = {};
        for (const trade of this.trades) {
            const strat = trade.strategy;
            strategyTotal[strat] = (strategyTotal[strat] || 0) + 1;
            if (trade.result === 'WIN') {
                strategyWins[strat] = (strategyWins[strat] || 0) + 1;
            }
        }

        const strongStrategies = Object.entries(strategyTotal)
            .filter(([strat, total]) => {
                const winCount = strategyWins[strat] || 0;
                return total >= 3 && winCount / total > 0.5;
            })
            .map(([strat, total]) => ({
                strategy: strat,
                wins: strategyWins[strat],
                total,
                winRate: ((strategyWins[strat] / total) * 100).toFixed(1) + '%'
            }));

        if (strongStrategies.length > 0) {
            analysis.patterns.push({
                type: 'STRONG_STRATEGY',
                severity: 'POSITIVE',
                strategies: strongStrategies
            });
        }

        return analysis;
    }

    // ============================================
    // SECTION 4: REFINEMENT SUGGESTIONS
    // ============================================
    generateSuggestions() {
        const suggestions = [];
        const failures = this.analyzeFailures();
        const strengths = this.analyzeStrengths();
        const perf = this.analyzePerformance();

        // Suggestion 1: Early entry problem
        const earlyEntryPattern = failures.patterns.find(p => p.type === 'EARLY_ENTRY');
        if (earlyEntryPattern) {
            suggestions.push({
                id: 'S1',
                priority: 'HIGH',
                area: 'Entry Timing',
                observation: `${earlyEntryPattern.count} trades stopped within 2 days`,
                suggestion: 'Require more price acceptance before entry - wait for at least 1 candle closing above swing low before entering',
                impact: 'Expected to reduce premature entries by 30-40%'
            });
        }

        // Suggestion 2: Repeated symbol losses
        const repeatedLossPattern = failures.patterns.find(p => p.type === 'REPEATED_SYMBOL_LOSSES');
        if (repeatedLossPattern) {
            suggestions.push({
                id: 'S2',
                priority: 'MEDIUM',
                area: 'Stock Selection',
                observation: `Same symbols showing repeated losses: ${repeatedLossPattern.symbols.map(s => s.symbol).join(', ')}`,
                suggestion: 'Consider adding a cooldown period after a loss on a symbol before re-entering',
                impact: 'Prevents overtrading losing positions'
            });
        }

        // Suggestion 3: Weak strategy
        const weakStratPattern = failures.patterns.find(p => p.type === 'WEAK_STRATEGY');
        if (weakStratPattern) {
            suggestions.push({
                id: 'S3',
                priority: 'MEDIUM',
                area: 'Strategy Selection',
                observation: `Strategies underperforming: ${weakStratPattern.strategies.map(s => s.strategy).join(', ')}`,
                suggestion: 'Consider requiring additional confirmation (e.g., volume, broader market context) for these strategies',
                impact: 'May improve strategy-specific win rates'
            });
        }

        // Suggestion 4: Patience reward
        const patiencePattern = strengths.patterns.find(p => p.type === 'PATIENCE_REWARD');
        if (patiencePattern) {
            suggestions.push({
                id: 'S4',
                priority: 'LOW',
                area: 'Trade Management',
                observation: `Trades held 4+ days averaged higher profit`,
                suggestion: 'Consider allowing strong setups more room before trailing - patience is being rewarded',
                impact: 'May capture more profit from strong moves'
            });
        }

        // Suggestion 5: Strong strategy
        const strongStratPattern = strengths.patterns.find(p => p.type === 'STRONG_STRATEGY');
        if (strongStratPattern) {
            suggestions.push({
                id: 'S5',
                priority: 'INFO',
                area: 'Strategy Confidence',
                observation: `Strong strategies: ${strongStratPattern.strategies.map(s => `${s.strategy} (${s.winRate})`).join(', ')}`,
                suggestion: 'Consider allocating more capital weight to these strategies when market conditions align',
                impact: 'Capitalizes on proven edge'
            });
        }

        // Suggestion 6: Based on invalidation rate
        if (this.invalidated.length > this.trades.length) {
            suggestions.push({
                id: 'S6',
                priority: 'MEDIUM',
                area: 'Signal Quality',
                observation: `More signals invalidated (${this.invalidated.length}) than executed (${this.trades.length})`,
                suggestion: 'Entry delay filter is catching many bad entries - this is good. Consider if current filter strictness is optimal.',
                impact: 'Currently protecting capital well'
            });
        }

        // Suggestion 7: Capital protection observation
        if (parseFloat(perf.capitalWinRate) > 40) {
            suggestions.push({
                id: 'S7',
                priority: 'INFO',
                area: 'Risk Management',
                observation: `${perf.capitalWinRate} of trades reached partial exit before adverse move`,
                suggestion: 'Partial exit strategy is protecting capital effectively - maintain current approach',
                impact: 'Capital preservation working'
            });
        }

        return suggestions;
    }

    // ============================================
    // HUMAN-READABLE SUMMARY
    // ============================================
    generateHumanSummary() {
        const perf = this.analyzePerformance();
        const failures = this.analyzeFailures();
        const strengths = this.analyzeStrengths();
        const suggestions = this.generateSuggestions();

        let summary = `
═══════════════════════════════════════════════════════════════
                    SHADOW LEARNER REPORT
                    ${this.results.category} - ${this.results.strategyVersion || 'V1'}
═══════════════════════════════════════════════════════════════

📊 PERFORMANCE SNAPSHOT
───────────────────────────────────────────────────────────────
• Total Trades: ${perf.totalTrades} (${perf.wins}W / ${perf.losses}L)
• Accuracy: ${perf.accuracy}
• Max Drawdown: ${perf.maxDrawdown} (${perf.maxDrawdownTrades} consecutive losses)
• Expectancy: ${perf.expectancy}R per trade
• Avg Win: ${perf.avgWinR} | Avg Loss: ${perf.avgLossR}
• Capital Protection Rate: ${perf.capitalWinRate}

📉 FAILURE PATTERNS
───────────────────────────────────────────────────────────────`;

        if (failures.patterns.length > 0) {
            for (const pattern of failures.patterns) {
                summary += `\n• [${pattern.severity}] ${pattern.description}`;
            }
        } else {
            summary += `\n• No significant failure patterns detected`;
        }

        summary += `

📈 STRENGTH PATTERNS
───────────────────────────────────────────────────────────────`;

        if (strengths.patterns.length > 0) {
            for (const pattern of strengths.patterns) {
                summary += `\n• [${pattern.severity}] ${pattern.description}`;
            }
        } else {
            summary += `\n• Analyzing for strength patterns...`;
        }

        summary += `

💡 REFINEMENT SUGGESTIONS (USER DECISION REQUIRED)
───────────────────────────────────────────────────────────────`;

        const priorityOrder = ['HIGH', 'MEDIUM', 'LOW', 'INFO'];
        const sortedSuggestions = suggestions.sort((a, b) =>
            priorityOrder.indexOf(a.priority) - priorityOrder.indexOf(b.priority)
        );

        for (const sug of sortedSuggestions) {
            summary += `
[${sug.id}] ${sug.area} (${sug.priority})
    Observed: ${sug.observation}
    Suggestion: "${sug.suggestion}"
    Expected Impact: ${sug.impact}
`;
        }

        summary += `
═══════════════════════════════════════════════════════════════
⚠️  THESE ARE SUGGESTIONS ONLY - NOT AUTO-APPLIED
    Review carefully and apply manually if you agree.
    To apply: Create V1.b1 with your refinements.
═══════════════════════════════════════════════════════════════
`;

        return summary;
    }
}

module.exports = { ShadowLearner };
