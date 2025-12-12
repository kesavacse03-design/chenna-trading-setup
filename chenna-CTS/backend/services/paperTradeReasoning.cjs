/**
 * Paper Trade AI Reasoning
 * Phase 8: Analyzes failed trades and suggests strategy improvements
 * 
 * "Re-time-travel" - looks at historical context and asks:
 * "What would AI have said on that specific day?"
 */

const trapDetector = require('./institutionalTrapDetector.cjs');
const regimeFilter = require('./regimeFilter.cjs');

/**
 * Analyze a failed trade and provide AI reasoning
 */
async function analyzeFailedTrade(trade, candles, marketContext = {}) {
    const analysis = {
        symbol: trade.symbol,
        entryDate: trade.entryDate,
        exitDate: trade.exitDate,
        pnl: trade.pnlPercent,
        findings: [],
        suggestions: [],
        avoidable: false,
        confidence: 0
    };

    // Get entry candle index
    const entryIdx = candles.findIndex(c => c.timestamp === trade.entryDate);
    if (entryIdx === -1 || entryIdx < 30) {
        return analysis;
    }

    // 1. Check if traps were present at entry
    const candlesAtEntry = candles.slice(Math.max(0, entryIdx - 30), entryIdx + 1);
    const trapCheck = trapDetector.detectAllTraps(trade.symbol, candlesAtEntry);

    if (trapCheck.detected) {
        analysis.findings.push({
            type: 'TRAP_PRESENT',
            severity: 'HIGH',
            description: `${trapCheck.count} institutional trap(s) detected at entry`,
            traps: trapCheck.traps.map(t => t.type)
        });

        const criticalTraps = trapCheck.traps.filter(t => t.severity === 'CRITICAL');
        if (criticalTraps.length > 0) {
            analysis.suggestions.push({
                rule: 'Block entries when critical traps detected',
                impact: 'Would have avoided this loss',
                implementation: `if (traps.includes('${criticalTraps[0].type}')) skip_entry();`
            });
            analysis.avoidable = true;
            analysis.confidence = 0.8;
        }
    }

    // 2. Check market regime at entry
    const regime = await getHistoricalRegime(candles, entryIdx);
    if (regime && trade.exitType === 'STOP_LOSS_HIT') {
        if (regime.regime === 'VOLATILE' || regime.regime === 'TRENDING_BEARISH') {
            analysis.findings.push({
                type: 'UNFAVORABLE_REGIME',
                severity: 'MEDIUM',
                description: `Entered during ${regime.regime} regime (${Math.round(regime.confidence * 100)}% confidence)`,
                regime: regime.regime
            });

            analysis.suggestions.push({
                rule: `Skip long entries during ${regime.regime} regime`,
                impact: 'Would have avoided this loss',
                implementation: `if (regime === '${regime.regime}') skip_entry();`
            });
            analysis.avoidable = true;
            analysis.confidence = Math.max(analysis.confidence, 0.7);
        }
    }

    // 3. Check volume spike at entry
    if (entryIdx >= 20) {
        const recentCandles = candles.slice(entryIdx - 20, entryIdx);
        const avgVolume = recentCandles.reduce((sum, c) => sum + c.volume, 0) / 20;
        const entryVolume = candles[entryIdx].volume;

        if (entryVolume > avgVolume * 3) {
            analysis.findings.push({
                type: 'ABNORMAL_VOLUME',
                severity: 'MEDIUM',
                description: `Entry volume ${(entryVolume / avgVolume).toFixed(1)}x average - potential manipulation`
            });

            analysis.suggestions.push({
                rule: 'Avoid entries with volume > 3x average',
                impact: 'Reduces manipulation risk',
                implementation: 'if (volume > avgVolume * 3) skip_entry();'
            });
            analysis.confidence = Math.max(analysis.confidence, 0.6);
        }
    }

    // 4. Check if stopped out very quickly
    if (trade.daysHeld <= 2 && trade.exitType === 'STOP_LOSS_HIT') {
        analysis.findings.push({
            type: 'QUICK_STOP_OUT',
            severity: 'HIGH',
            description: `Stopped out in ${trade.daysHeld} day(s) - possible stop hunt or bad entry`
        });

        analysis.suggestions.push({
            rule: 'Widen stop loss or avoid tight entry levels',
            impact: 'Reduces premature stops',
            implementation: 'stopLoss = Math.max(stopLoss, 2.0%);'
        });
    }

    // 5. Check broader market context (if provided)
    if (marketContext.niftyChange && marketContext.niftyChange < -1.5) {
        analysis.findings.push({
            type: 'MARKET_WEAKNESS',
            severity: 'MEDIUM',
            description: `Nifty down ${marketContext.niftyChange.toFixed(2)}% on entry day - market headwind`
        });

        analysis.suggestions.push({
            rule: 'Skip entries when Nifty down > 1.5%',
            impact: 'Aligns with market direction',
            implementation: 'if (niftyChange < -1.5) skip_entry();'
        });
        analysis.confidence = Math.max(analysis.confidence, 0.65);
    }

    return analysis;
}

/**
 * Analyze all failed trades and generate improved strategy
 */
async function analyzeFailuresBatch(failedTrades, allCandles) {
    const analyses = [];
    const suggestions = {};

    for (const trade of failedTrades) {
        const candles = allCandles[trade.symbol];
        if (!candles) continue;

        const analysis = await analyzeFailedTrade(trade, candles);
        if (analysis.findings.length > 0) {
            analyses.push(analysis);

            // Aggregate suggestions
            analysis.suggestions.forEach(sug => {
                if (!suggestions[sug.rule]) {
                    suggestions[sug.rule] = {
                        ...sug,
                        occurrences: 0,
                        avgLossAvoided: 0
                    };
                }
                suggestions[sug.rule].occurrences++;
                suggestions[sug.rule].avgLossAvoided += Math.abs(trade.pnlPercent);
            });
        }
    }

    // Calculate averages and rank by impact
    const rankedSuggestions = Object.values(suggestions).map(sug => ({
        ...sug,
        avgLossAvoided: sug.avgLossAvoided / sug.occurrences,
        frequency: sug.occurrences / failedTrades.length
    })).sort((a, b) => b.avgLossAvoided - a.avgLossAvoided);

    return {
        totalAnalyzed: failedTrades.length,
        avoidableCount: analyses.filter(a => a.avoidable).length,
        avoidablePercent: (analyses.filter(a => a.avoidable).length / failedTrades.length) * 100,
        analyses,
        topSuggestions: rankedSuggestions.slice(0, 5),
        estimatedImprovement: calculateImprovement(analyses, failedTrades)
    };
}

/**
 * Calculate estimated improvement if suggestions applied
 */
function calculateImprovement(analyses, failedTrades) {
    const avoidableTrades = analyses.filter(a => a.avoidable && a.confidence > 0.6);
    const avoidedLoss = avoidableTrades.reduce((sum, a) => {
        const trade = failedTrades.find(t => t.symbol === a.symbol && t.entryDate === a.entryDate);
        return sum + (trade ? Math.abs(trade.pnlPercent) : 0);
    }, 0);

    return {
        avoidableTradesCount: avoidableTrades.length,
        avoidableLossPercent: avoidedLoss,
        newWinRate: null, // Calculate after applying suggestions
        confidence: avoidableTrades.length > 0
            ? avoidableTrades.reduce((sum, a) => sum + a.confidence, 0) / avoidableTrades.length
            : 0
    };
}

/**
 * Get historical regime (mock for now)
 */
async function getHistoricalRegime(candles, idx) {
    // In real implementation, this would analyze candles up to idx
    // For now, return a mock regime
    const recent = candles.slice(Math.max(0, idx - 50), idx);
    const trend = (recent[recent.length - 1].close - recent[0].close) / recent[0].close * 100;

    let regime = 'RANGING';
    let confidence = 0.6;

    if (trend > 5) {
        regime = 'TRENDING_BULLISH';
        confidence = 0.75;
    } else if (trend < -5) {
        regime = 'TRENDING_BEARISH';
        confidence = 0.75;
    }

    return { regime, confidence };
}

/**
 * Generate improved strategy parameters
 */
function generateImprovedStrategy(suggestions, currentStrategy) {
    const improvements = {
        original: currentStrategy,
        suggested: { ...currentStrategy },
        changes: []
    };

    suggestions.forEach(sug => {
        if (sug.rule.includes('trap') && sug.frequency > 0.3) {
            improvements.suggested.trapDetection = true;
            improvements.changes.push('Enable trap detection filter');
        }

        if (sug.rule.includes('regime') && sug.frequency > 0.25) {
            improvements.suggested.regimeFilter = true;
            improvements.changes.push('Enable regime-aware filtering');
        }

        if (sug.rule.includes('volume') && sug.frequency > 0.2) {
            improvements.suggested.maxVolumeSpike = 3.0;
            improvements.changes.push('Limit volume spikes to 3x average');
        }

        if (sug.rule.includes('stop loss') && sug.avgLossAvoided > 1.5) {
            improvements.suggested.stopLoss = Math.max(currentStrategy.stopLoss || 1.5, 2.0);
            improvements.changes.push('Increase stop loss to 2.0%');
        }
    });

    return improvements;
}

module.exports = {
    analyzeFailedTrade,
    analyzeFailuresBatch,
    generateImprovedStrategy
};
