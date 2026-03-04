/**
 * V2.1 Production Wrapper
 * 
 * Uses PROVEN V2.1 logic (66.7% WR) and adds production features:
 * - Signal reasoning
 * - Confidence scoring  
 * - Entry price buffers
 * - Exit analysis
 */

const { generateIntradaySignalsV21, simulateIntradayTradeV21, backtestIntradayV21 } = require('./intradayStrategyV2_1.cjs');

const CONFIG = {
    ENTRY_BUFFER_PERCENT: 0.5,
    TARGET_PERCENT: 1.5
};

/**
 * Enhance V2.1 signal with production features
 */
function enhanceSignal(signal) {
    const reasons = [];
    let confidence = 0.5;

    // Build reasoning from V2.1 checks
    if (signal.enhancedChecks >= 3) {
        confidence += 0.25;
        reasons.push('All 3 enhanced filters passed (EMA, Breakout, Volume)');
    } else if (signal.enhancedChecks == 2) {
        confidence += 0.15;
        reasons.push('2 of 3 enhanced filters passed');
    }

    // OR width reasoning
    if (parseFloat(signal.orRange) < 1.5) {
        confidence += 0.05;
        reasons.push(`Tight Opening Range (${signal.orRange}%)`);
    }

    // Volume reasoning
    if (parseFloat(signal.volumeRatio) >= 2.0) {
        confidence += 0.1;
        reasons.push(`Strong opening volume (${signal.volumeRatio}x)`);
    } else if (parseFloat(signal.volumeRatio) >= 1.5) {
        reasons.push(`Good opening volume (${signal.volumeRatio}x)`);
    }

    // Quality label
    let quality = 'FAIR';
    if (confidence >= 0.8) quality = 'EXCELLENT';
    else if (confidence >= 0.7) quality = 'GOOD';

    const riskPercent = parseFloat(signal.stopPercent);
    const riskReward = CONFIG.TARGET_PERCENT / riskPercent;

    return {
        ...signal,
        strategy: 'V2.1_PRODUCTION',

        // Entry buffer
        entryRange: {
            min: signal.entryPrice,
            max: signal.entryPrice * (1 + CONFIG.ENTRY_BUFFER_PERCENT / 100),
            note: `Acceptable entry up to ${(signal.entryPrice * (1 + CONFIG.ENTRY_BUFFER_PERCENT / 100)).toFixed(2)}`
        },

        // Risk analysis
        riskReward: riskReward.toFixed(2),

        // Reasoning
        reasoning: {
            primary: 'N-pattern breakout with higher low above Opening Range',
            supporting: reasons,
            pattern: 'Opening Range → Pullback (higher low) → Breakout above OR high'
        },

        // Confidence
        confidence: Math.min(1.0, confidence).toFixed(2),
        quality,

        // Warnings
        warnings: [
            `Max entry: ${(signal.entryPrice * (1 + CONFIG.ENTRY_BUFFER_PERCENT / 100)).toFixed(2)}`,
            'Skip if price moved > 0.5% before you can enter'
        ]
    };
}

/**
 * Generate production signals using V2.1
 */
async function generateProductionSignals(categoryName, date) {
    const signals = await generateIntradaySignalsV21(categoryName, date);
    return signals.map(enhanceSignal);
}

/**
 * Simulate trade with exit analysis
 */
async function simulateProductionTrade(signal, date) {
    const result = await simulateIntradayTradeV21(signal, date);

    // Add exit analysis
    const exitAnalysis = { factors: [] };

    if (result.exitReason === 'TARGET_HIT') {
        exitAnalysis.factors = ['Pattern completed as expected', 'Strong momentum follow-through'];
    } else if (result.exitReason === 'STOP_HIT') {
        exitAnalysis.factors = ['False breakout', 'Price reversed after entry'];
        exitAnalysis.lesson = 'Consider waiting for 2nd candle confirmation above OR high';
    } else if (result.exitReason === 'EOD_EXIT') {
        exitAnalysis.factors = ['Trade held until market close'];
    }

    return { ...result, exitAnalysis };
}

/**
 * Backtest with production features
 */
async function backtestProduction(categoryName, startDate, endDate) {
    console.log('\n' + '═'.repeat(70));
    console.log('V2.1 PRODUCTION BACKTEST');
    console.log('═'.repeat(70));
    console.log(`Using proven V2.1 logic with production enhancements`);

    const result = await backtestIntradayV21(categoryName, startDate, endDate);

    // Enhance all trades
    result.trades = result.trades.map(t => {
        const enhanced = enhanceSignal(t);
        return { ...t, ...enhanced };
    });

    // Show sample enhanced signals
    console.log('\n📋 Sample Enhanced Signals:');
    result.trades.slice(0, 3).forEach((t, i) => {
        console.log(`\n${i + 1}. ${t.symbol} (${t.date})`);
        console.log(`   Entry: ${t.entryPrice} (range: ${t.entryRange?.min}-${t.entryRange?.max})`);
        console.log(`   Quality: ${t.quality} | Confidence: ${t.confidence}`);
        console.log(`   Reasons: ${t.reasoning?.supporting?.join(', ')}`);
        console.log(`   Outcome: ${t.outcome} | P&L: ${t.pnlPercent}%`);
    });

    return result;
}

module.exports = { generateProductionSignals, simulateProductionTrade, backtestProduction, enhanceSignal };

if (require.main === module) {
    const args = process.argv.slice(2);
    const category = args[0] || 'INTRADAY_BOOST';
    const startDate = args[1] || '2026-01-02';
    const endDate = args[2] || '2026-01-09';

    backtestProduction(category, startDate, endDate)
        .then(() => console.log('\n✅ V2.1 Production Backtest complete'))
        .catch(console.error)
        .finally(() => require('@prisma/client').PrismaClient && process.exit(0));
}
