const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const fs = require('fs');
const path = require('path');
const upsideLom = require('../services/labs/upsideLomIntraStrategy.cjs');
const intradayV21 = require('../services/labs/intradayStrategyV2_1.cjs');

async function runBacktest() {
    const START_DATE = '2026-02-05';
    const END_DATE = '2026-02-19'; // Fixed to today to prevent future testing
    const RESULTS_DIR = path.join(__dirname, '../results');

    if (!fs.existsSync(RESULTS_DIR)) fs.mkdirSync(RESULTS_DIR, { recursive: true });

    console.log(`🚀 Starting Full Intraday Backtest (${START_DATE} to ${END_DATE})...`);
    console.log(`📂 Results will be saved to: ${RESULTS_DIR}`);

    const finalResults = {
        meta: {
            startDate: START_DATE,
            endDate: END_DATE,
            timestamp: new Date().toISOString()
        },
        strategies: {}
    };

    try {
        // --- 1. UPSIDE_LOM_INTRA ---
        console.log('\n🔵 Running UPSIDE_LOM_INTRA Backtest...');
        try {
            const lomResults = await upsideLom.backtest(START_DATE, END_DATE);
            finalResults.strategies['UPSIDE_LOM_INTRA'] = formatStrategyResult(lomResults);
            console.log('   ✅ Completed UPSIDE_LOM_INTRA');
        } catch (e) {
            console.error('   ❌ Failed UPSIDE_LOM_INTRA:', e.message);
            finalResults.strategies['UPSIDE_LOM_INTRA'] = { error: e.message };
        }

        // --- 2. INTRADAY_BOOST (V2.1 Strict) ---
        console.log('\n🟠 Running INTRADAY_BOOST (V2.1 Strict) Backtest...');
        try {
            const boostResults = await intradayV21.backtestIntradayV21('INTRADAY_BOOST', START_DATE, END_DATE, 'STRICT');
            finalResults.strategies['INTRADAY_BOOST'] = formatStrategyResult(boostResults);
            console.log('   ✅ Completed INTRADAY_BOOST');
        } catch (e) {
            console.error('   ❌ Failed INTRADAY_BOOST:', e.message);
            finalResults.strategies['INTRADAY_BOOST'] = { error: e.message };
        }

        // --- 3. HIGH_POWERED_STOCKS (V2.1 Strict) ---
        console.log('\n🟣 Running HIGH_POWERED_STOCKS (V2.1 Strict) Backtest...');
        try {
            const hpResults = await intradayV21.backtestIntradayV21('HIGH_POWERED_STOCKS', START_DATE, END_DATE, 'STRICT');
            finalResults.strategies['HIGH_POWERED_STOCKS'] = formatStrategyResult(hpResults);
            console.log('   ✅ Completed HIGH_POWERED_STOCKS');
        } catch (e) {
            console.error('   ❌ Failed HIGH_POWERED_STOCKS:', e.message);
            finalResults.strategies['HIGH_POWERED_STOCKS'] = { error: e.message };
        }

        // --- SAVE RESULTS & GENERATE REPORT ---
        const jsonPath = path.join(RESULTS_DIR, 'intraday_full_results.json');
        fs.writeFileSync(jsonPath, JSON.stringify(finalResults, null, 2));
        console.log(`\n💾 JSON saved to: ${jsonPath}`);

        const mdPath = path.join(RESULTS_DIR, 'intraday_full_report.md');
        const mdContent = generateMarkdownReport(finalResults);
        fs.writeFileSync(mdPath, mdContent);
        console.log(`📝 Report saved to: ${mdPath}`);

        printConsoleSummary(finalResults);

        await prisma.$disconnect();

    } catch (e) {
        console.error('❌ Fatal Backtest Error:', e);
        await prisma.$disconnect();
    }
}

function formatStrategyResult(raw) {
    // Both strategies return { trades: [...] }
    const trades = raw.trades || [];
    const winners = trades.filter(t => t.outcome === 'WIN');
    const losers = trades.filter(t => t.outcome === 'LOSS'); // Includes STOP_HIT
    // Note: V2.1 might use 'STOP_HIT' as exitReason but outcome 'LOSS'.

    const total = trades.length;
    const winRate = total > 0 ? (winners.length / total * 100) : 0;

    // Avg P&L
    const totalPnl = trades.reduce((sum, t) => sum + parseFloat(t.pnlPercent || 0), 0);
    const avgPnl = total > 0 ? totalPnl / total : 0;

    return {
        totalTrades: total,
        winRate: winRate.toFixed(1),
        avgPnl: avgPnl.toFixed(2),
        totalPnl: totalPnl.toFixed(2),
        winners: winners.length,
        losers: losers.length,
        trades: trades // Include raw trades for detailed JSON
    };
}

function generateMarkdownReport(results) {
    let md = `# Intraday Strategy Backtest Report\n`;
    md += `**Period**: ${results.meta.startDate} to ${results.meta.endDate}\n`;
    md += `**Generated**: ${results.meta.timestamp}\n\n`;

    md += `## Executive Summary\n\n`;
    md += `| Strategy | Trades | Win Rate | Avg P&L | Total P&L |\n`;
    md += `| :--- | :--- | :--- | :--- | :--- |\n`;

    for (const [name, stats] of Object.entries(results.strategies)) {
        if (stats.error) {
            md += `| **${name}** | ERROR | - | - | - |\n`;
        } else {
            md += `| **${name}** | ${stats.totalTrades} | ${stats.winRate}% | ${stats.avgPnl}% | ${stats.totalPnl}% |\n`;
        }
    }

    md += `\n## Detailed Analysis\n`;

    for (const [name, stats] of Object.entries(results.strategies)) {
        if (stats.error) continue;
        md += `\n### ${name}\n`;
        md += `- **Trades**: ${stats.totalTrades} (Wins: ${stats.winners}, Losses: ${stats.losers})\n`;
        md += `- **Win Rate**: ${stats.winRate}%\n`;
        md += `- **Avg P&L**: ${stats.avgPnl}%\n`;

        if (stats.trades.length > 0) {
            md += `\n#### Recent Trades (Last 10)\n`;
            md += `| Date | Symbol | Entry | Exit | P&L | Reason |\n`;
            md += `| :--- | :--- | :--- | :--- | :--- | :--- |\n`;

            // Show last 10 trades
            const last10 = stats.trades.slice(-10);
            for (const t of last10) {
                const date = t.date || t.entryTime?.split('T')[0] || '-';
                const pnl = parseFloat(t.pnlPercent).toFixed(2);
                const pnlStr = parseFloat(pnl) >= 0 ? `+${pnl}%` : `${pnl}%`;
                md += `| ${date} | ${t.symbol} | ${t.entryPrice} | ${t.exitPrice} | **${pnlStr}** | ${t.exitReason || '-'} |\n`;
            }
        }
    }

    return md;
}

function printConsoleSummary(results) {
    console.log('\n═══════════════════════════════════════════════════════════════');
    console.log('🏁 CONSOLE SUMMARY');
    console.log('═══════════════════════════════════════════════════════════════');
    console.log(`| ${'Strategy'.padEnd(25)} | Trades | Win Rate | Avg P&L |`);
    console.log(`|${'-'.repeat(27)}|${'-'.repeat(8)}|${'-'.repeat(10)}|${'-'.repeat(9)}|`);

    for (const [name, stats] of Object.entries(results.strategies)) {
        if (stats.error) {
            console.log(`| ${name.padEnd(25)} |  ERROR |    -     |    -    |`);
        } else {
            console.log(`| ${name.padEnd(25)} | ${String(stats.totalTrades).padEnd(6)} | ${String(stats.winRate + '%').padEnd(8)} | ${String(stats.avgPnl + '%').padEnd(7)} |`);
        }
    }
    console.log('═══════════════════════════════════════════════════════════════');
}

runBacktest();
