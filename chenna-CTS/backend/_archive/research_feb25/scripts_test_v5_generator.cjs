/**
 * V5 Signal Generator — Manual Test Runner
 * Usage: node scripts/test_v5_generator.cjs [date]
 * Example: node scripts/test_v5_generator.cjs 2026-02-25
 */
const { generateSignals } = require('../services/v5SignalGenerator.cjs');

async function main() {
    const dateStr = process.argv[2] || new Date().toISOString().split('T')[0];
    console.log(`\n${'═'.repeat(80)}`);
    console.log(` V5 SIGNAL GENERATOR TEST — ${dateStr}`);
    console.log(`${'═'.repeat(80)}\n`);

    const result = await generateSignals(dateStr, 'SHORT_TERM_SWING_BO_UP');

    // Print generated signals
    if (result.signals.length > 0) {
        console.log(`\n${'─'.repeat(80)}`);
        console.log(` ✅ GENERATED SIGNALS (${result.signals.length}):`);
        console.log(`${'─'.repeat(80)}`);
        for (const s of result.signals) {
            console.log(`  ${s.confidenceTier.padEnd(6)} ${s.symbol.padEnd(15)} | Score: ${String(s.confidenceScore).padStart(3)} | RSI: ${s.rsi.padStart(5)} | ADX: ${s.adx.padStart(5)} | Vol: ${s.volumeRatio.padStart(5)}× | MACD: ${s.macd1hState.padEnd(13)} | Stop: ₹${s.suggestedStop} | Qty: ${s.suggestedQty}`);
        }
    }

    // Print skipped signals
    if (result.skipped.length > 0) {
        console.log(`\n${'─'.repeat(80)}`);
        console.log(` ❌ SKIPPED SIGNALS (${result.skipped.length}):`);
        console.log(`${'─'.repeat(80)}`);
        for (const s of result.skipped) {
            console.log(`  ${(s.symbol || 'GLOBAL').padEnd(15)} | ${s.reason.padEnd(18)} | ${s.detail}`);
        }
    }

    console.log(`\n${'═'.repeat(80)}`);
    console.log(` SUMMARY: ${result.generated} generated, ${result.skipped.length} skipped`);
    console.log(`${'═'.repeat(80)}\n`);

    process.exit(0);
}

main().catch(err => { console.error(err); process.exit(1); });
