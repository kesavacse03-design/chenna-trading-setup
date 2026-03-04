/**
 * COMBO_SPEED vs ORIGINAL (STRICT) Strategy Comparison
 * Runs both strategies on the same dates & stocks, then produces a detailed report.
 */
const { generateIntradaySignalsV21, simulateIntradayTradeV21 } = require('./chenna-CTS/backend/services/labs/intradayStrategyV2_1.cjs');
const prisma = require('./chenna-CTS/backend/lib/prisma.cjs');

// Test dates: Today + last 2 weeks of trading days
const DATES = [
    '2026-02-17', // Today
    '2026-02-16', '2026-02-13', '2026-02-12', '2026-02-11', '2026-02-10',
    '2026-02-09', '2026-02-06', '2026-02-05', '2026-02-04', '2026-02-03'
];

const CATEGORIES = ['INTRADAY_BOOST', 'HIGH_POWERED_STOCKS'];
const MODES = ['STRICT', 'COMBO_SPEED'];

async function runComparison() {
    console.log('╔══════════════════════════════════════════════════════════════════════════════╗');
    console.log('║       STRATEGY COMPARISON: ORIGINAL (STRICT) vs COMBO_SPEED                 ║');
    console.log('║       Date Range: Feb 3 - Feb 17, 2026 | Categories: IB + HPS               ║');
    console.log('╚══════════════════════════════════════════════════════════════════════════════╝');

    const results = { STRICT: [], COMBO_SPEED: [] };

    for (const mode of MODES) {
        console.log(`\n\n${'═'.repeat(80)}`);
        console.log(`  RUNNING: ${mode === 'STRICT' ? '🔒 ORIGINAL (STRICT)' : '⚡ COMBO_SPEED'} STRATEGY`);
        console.log(`${'═'.repeat(80)}`);

        for (const date of DATES) {
            for (const cat of CATEGORIES) {
                try {
                    const res = await generateIntradaySignalsV21(cat, date, mode, true);
                    if (res.signals.length > 0) {
                        for (const s of res.signals) {
                            const trade = await simulateIntradayTradeV21(s, date, { EXIT_TIME: '15:15' });
                            const pnl = parseFloat(trade.pnlPercent || 0);
                            results[mode].push({
                                date,
                                category: cat,
                                symbol: s.symbol,
                                entryTime: s.entryTime,
                                entryPrice: s.entryPrice,
                                targetPrice: s.targetPrice,
                                stopPrice: s.stopPrice,
                                exitTime: trade.exitTime,
                                exitPrice: trade.exitPrice,
                                exitReason: trade.exitReason,
                                outcome: trade.outcome,
                                pnl
                            });
                            const icon = trade.outcome === 'WIN' ? '✅' : '❌';
                            console.log(`  ${icon} ${date} | ${cat} | ${s.symbol} @ ${s.entryTime} (₹${s.entryPrice}) → Exit ${trade.exitTime} (₹${(trade.exitPrice || 0).toFixed(2)}) | ${trade.exitReason} | ${pnl > 0 ? '+' : ''}${pnl}%`);
                        }
                    }
                } catch (e) {
                    // Skip errors silently
                }
            }
        }
    }

    // ══════════════════════════════════════════════
    // SUMMARY REPORT
    // ══════════════════════════════════════════════
    console.log('\n\n');
    console.log('╔══════════════════════════════════════════════════════════════════════════════╗');
    console.log('║                        COMPARISON SUMMARY REPORT                            ║');
    console.log('╚══════════════════════════════════════════════════════════════════════════════╝');

    for (const mode of MODES) {
        const trades = results[mode];
        const wins = trades.filter(t => t.outcome === 'WIN').length;
        const losses = trades.filter(t => t.outcome === 'LOSS').length;
        const totalPnL = trades.reduce((a, t) => a + t.pnl, 0);
        const winRate = trades.length > 0 ? ((wins / trades.length) * 100).toFixed(1) : '0';

        const label = mode === 'STRICT' ? '🔒 ORIGINAL (STRICT)' : '⚡ COMBO_SPEED';
        console.log(`\n  ${label}`);
        console.log(`  ${'─'.repeat(50)}`);
        console.log(`  Total Signals:  ${trades.length}`);
        console.log(`  Wins:           ${wins}`);
        console.log(`  Losses:         ${losses}`);
        console.log(`  Win Rate:       ${winRate}%`);
        console.log(`  Total P&L:      ${totalPnL > 0 ? '+' : ''}${totalPnL.toFixed(2)}%`);
        console.log(`  Avg P&L/Trade:  ${trades.length > 0 ? (totalPnL / trades.length).toFixed(2) : '0'}%`);
    }

    // HEAD-TO-HEAD
    const strictPnL = results.STRICT.reduce((a, t) => a + t.pnl, 0);
    const speedPnL = results.COMBO_SPEED.reduce((a, t) => a + t.pnl, 0);
    const diff = speedPnL - strictPnL;

    console.log(`\n\n  🏆 HEAD-TO-HEAD VERDICT`);
    console.log(`  ${'─'.repeat(50)}`);
    console.log(`  COMBO_SPEED P&L Advantage: ${diff > 0 ? '+' : ''}${diff.toFixed(2)}%`);
    console.log(`  COMBO_SPEED Extra Signals: ${results.COMBO_SPEED.length - results.STRICT.length}`);
    if (diff > 0) {
        console.log(`  ✅ COMBO_SPEED WINS by +${diff.toFixed(2)}%`);
    } else if (diff < 0) {
        console.log(`  ❌ ORIGINAL STRICT wins. COMBO_SPEED underperforms by ${diff.toFixed(2)}%`);
    } else {
        console.log(`  🤝 TIE - Both strategies performed equally.`);
    }

    // DETAILED TRADE TABLE
    console.log(`\n\n${'═'.repeat(80)}`);
    console.log('  DETAILED TRADE LOG: ⚡ COMBO_SPEED');
    console.log(`${'═'.repeat(80)}`);
    console.log('| # | Date | Category | Symbol | Entry Time | Entry ₹ | Target ₹ | Stop ₹ | Exit Time | Exit ₹ | Outcome | P&L% | Exit Reason |');
    console.log('|---|------|----------|--------|------------|---------|----------|--------|-----------|--------|---------|------|-------------|');
    results.COMBO_SPEED.forEach((t, i) => {
        const icon = t.outcome === 'WIN' ? '✅' : '❌';
        console.log(`| ${i + 1} | ${t.date} | ${t.category.substring(0, 10)} | ${t.symbol} | ${t.entryTime} | ${t.entryPrice} | ${(t.targetPrice || 0).toFixed(2)} | ${(t.stopPrice || 0).toFixed(2)} | ${t.exitTime} | ${(t.exitPrice || 0).toFixed(2)} | ${icon} ${t.outcome} | ${t.pnl > 0 ? '+' : ''}${t.pnl}% | ${t.exitReason} |`);
    });

    console.log(`\n${'═'.repeat(80)}`);
    console.log('  DETAILED TRADE LOG: 🔒 ORIGINAL (STRICT)');
    console.log(`${'═'.repeat(80)}`);
    console.log('| # | Date | Category | Symbol | Entry Time | Entry ₹ | Target ₹ | Stop ₹ | Exit Time | Exit ₹ | Outcome | P&L% | Exit Reason |');
    console.log('|---|------|----------|--------|------------|---------|----------|--------|-----------|--------|---------|------|-------------|');
    results.STRICT.forEach((t, i) => {
        const icon = t.outcome === 'WIN' ? '✅' : '❌';
        console.log(`| ${i + 1} | ${t.date} | ${t.category.substring(0, 10)} | ${t.symbol} | ${t.entryTime} | ${t.entryPrice} | ${(t.targetPrice || 0).toFixed(2)} | ${(t.stopPrice || 0).toFixed(2)} | ${t.exitTime} | ${(t.exitPrice || 0).toFixed(2)} | ${icon} ${t.outcome} | ${t.pnl > 0 ? '+' : ''}${t.pnl}% | ${t.exitReason} |`);
    });

    // UNIQUE TRADES (only in COMBO_SPEED, not in STRICT)
    const strictSymbolDates = new Set(results.STRICT.map(t => `${t.symbol}-${t.date}`));
    const uniqueSpeed = results.COMBO_SPEED.filter(t => !strictSymbolDates.has(`${t.symbol}-${t.date}`));

    if (uniqueSpeed.length > 0) {
        console.log(`\n${'═'.repeat(80)}`);
        console.log('  ⚡ TRADES ONLY FOUND BY COMBO_SPEED (Not in Original)');
        console.log(`${'═'.repeat(80)}`);
        uniqueSpeed.forEach(t => {
            const icon = t.outcome === 'WIN' ? '✅' : '❌';
            console.log(`  ${icon} ${t.date} | ${t.symbol} | Entry ${t.entryTime} ₹${t.entryPrice} → Exit ${t.exitTime} ₹${(t.exitPrice || 0).toFixed(2)} | ${t.exitReason} | ${t.pnl > 0 ? '+' : ''}${t.pnl}%`);
        });
        const uniqueWins = uniqueSpeed.filter(t => t.outcome === 'WIN').length;
        const uniquePnL = uniqueSpeed.reduce((a, t) => a + t.pnl, 0);
        console.log(`  → ${uniqueSpeed.length} Extra Trades | ${uniqueWins} Wins | Net: ${uniquePnL > 0 ? '+' : ''}${uniquePnL.toFixed(2)}%`);
    }

    console.log(`\n${'═'.repeat(80)}`);
    console.log('  END OF COMPARISON REPORT');
    console.log(`${'═'.repeat(80)}`);
}

if (require.main === module) {
    runComparison()
        .then(() => prisma.$disconnect())
        .catch(e => { console.error(e); prisma.$disconnect(); });
}
