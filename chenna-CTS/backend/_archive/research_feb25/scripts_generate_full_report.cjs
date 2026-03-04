/**
 * Generate FULL PRE_MARKET Backtest Report
 * Includes all trade details for manual verification
 */

const {
    runFullBacktest,
    loadDailyData,
    getPreMarketStocks,
    CONFIG
} = require('../services/labs/preMarketDailyStrategy.cjs');
const fs = require('fs').promises;
const path = require('path');

async function generateFullReport() {
    console.log('═'.repeat(60));
    console.log('GENERATING FULL PRE_MARKET BACKTEST REPORT');
    console.log('═'.repeat(60));

    // Run backtest and get all trades
    const results = await runFullBacktest();

    // Create detailed report
    const report = {
        generatedAt: new Date().toISOString(),

        strategy: {
            name: CONFIG.name,
            displayName: CONFIG.displayName,
            category: CONFIG.category,
            directions: ['LONG', 'SHORT'],
            entryRules: [
                'Gap UP ≥3% → SHORT entry (expect gap fill DOWN)',
                'Gap DOWN ≤-3% → LONG entry (expect gap fill UP)',
                'Gap must be between 3% and 10% (extreme gaps are risky)'
            ],
            exitRules: {
                target: 'Gap Fill to Previous Close',
                stop: '2% from entry price (opposite direction)',
                timeExit: 'EOD if neither target nor stop hit'
            },
            parameters: {
                minGapPercent: CONFIG.minGapPercent,
                maxGapPercent: CONFIG.maxGapPercent,
                stopPercent: CONFIG.stopPercent,
                targetType: CONFIG.targetType
            }
        },

        summary: {
            period: 'Aug 2024 - Jan 2026',
            tradingDays: 342,
            stocksTested: 96,
            ...results.stats
        },

        exitBreakdown: results.stats.exitBreakdown,

        trades: results.trades.map((t, i) => ({
            tradeNo: i + 1,
            date: t.date,
            symbol: t.symbol,
            direction: t.direction,
            gapPercent: t.gapPercent,  // Already includes %
            entryPrice: parseFloat(t.entryPrice),
            targetPrice: parseFloat(t.targetPrice),
            stopPrice: parseFloat(t.stopPrice),
            exitPrice: parseFloat(t.exitPrice),
            exitReason: t.exitReason,
            pnl: t.pnl,  // Already includes %
            outcome: t.outcome
        }))
    };

    // Save JSON report
    const reportsDir = path.join(__dirname, '../reports');
    await fs.mkdir(reportsDir, { recursive: true });

    const jsonPath = path.join(reportsDir, 'PRE_MARKET_full_backtest.json');
    await fs.writeFile(jsonPath, JSON.stringify(report, null, 2));
    console.log(`\n✅ JSON report saved: ${jsonPath}`);

    // Generate CSV
    const csvHeader = 'Trade#,Date,Symbol,Direction,Gap%,Entry,Target,Stop,Exit,ExitReason,PnL%,Outcome';
    const csvRows = report.trades.map(t =>
        `${t.tradeNo},${t.date},${t.symbol},${t.direction},${t.gapPercent},${t.entryPrice},${t.targetPrice},${t.stopPrice},${t.exitPrice},${t.exitReason},${t.pnl},${t.outcome}`
    );
    const csvContent = [csvHeader, ...csvRows].join('\n');

    const csvPath = path.join(reportsDir, 'PRE_MARKET_trades.csv');
    await fs.writeFile(csvPath, csvContent);
    console.log(`✅ CSV report saved: ${csvPath}`);

    // Generate Manual Verification Samples
    console.log('\n' + '═'.repeat(60));
    console.log('MANUAL VERIFICATION SAMPLES');
    console.log('═'.repeat(60));

    // Pick sample trades: 2 wins (target hit), 2 losses (stop hit), 1 EOD
    const targetWins = results.trades.filter(t => t.exitReason === 'TARGET_HIT').slice(0, 2);
    const stopLosses = results.trades.filter(t => t.exitReason === 'STOP_HIT').slice(0, 2);
    const eodExits = results.trades.filter(t => t.exitReason === 'EOD').slice(0, 1);
    const samples = [...targetWins, ...stopLosses, ...eodExits];

    const verificationSamples = [];

    for (let i = 0; i < samples.length; i++) {
        const trade = samples[i];

        // Get actual OHLC data for verification
        const candles = await loadDailyData(trade.symbol);
        const tradeCandle = candles.find(c => c.date === trade.date);
        const prevCandle = candles.find((c, idx) =>
            candles[idx + 1] && candles[idx + 1].date === trade.date
        );

        if (tradeCandle && prevCandle) {
            const gapPercent = ((tradeCandle.open - prevCandle.close) / prevCandle.close) * 100;
            const isShort = trade.direction === 'SHORT';
            const stopPrice = isShort
                ? tradeCandle.open * 1.02
                : tradeCandle.open * 0.98;

            // Target/stop checks differ by direction
            const targetCheck = isShort
                ? `Did Low (${tradeCandle.low.toFixed(2)}) reach PrevClose (${prevCandle.close.toFixed(2)})? ${tradeCandle.low <= prevCandle.close ? 'YES' : 'NO'}`
                : `Did High (${tradeCandle.high.toFixed(2)}) reach PrevClose (${prevCandle.close.toFixed(2)})? ${tradeCandle.high >= prevCandle.close ? 'YES' : 'NO'}`;

            const stopCheck = isShort
                ? `Did High (${tradeCandle.high.toFixed(2)}) reach Stop (${stopPrice.toFixed(2)})? ${tradeCandle.high >= stopPrice ? 'YES' : 'NO'}`
                : `Did Low (${tradeCandle.low.toFixed(2)}) reach Stop (${stopPrice.toFixed(2)})? ${tradeCandle.low <= stopPrice ? 'YES' : 'NO'}`;

            const sample = {
                sampleNo: i + 1,
                symbol: trade.symbol,
                date: trade.date,
                direction: trade.direction,
                previousDay: {
                    close: prevCandle.close.toFixed(2)
                },
                tradeDay: {
                    open: tradeCandle.open.toFixed(2),
                    high: tradeCandle.high.toFixed(2),
                    low: tradeCandle.low.toFixed(2),
                    close: tradeCandle.close.toFixed(2)
                },
                calculations: {
                    gapPercent: (gapPercent > 0 ? '+' : '') + gapPercent.toFixed(2) + '%',
                    entryPrice: tradeCandle.open.toFixed(2),
                    targetPrice: prevCandle.close.toFixed(2),
                    stopPrice: stopPrice.toFixed(2)
                },
                verification: {
                    gapCheck: `Gap ≥±3%? ${Math.abs(gapPercent) >= 3 ? 'YES' : 'NO'} (${(gapPercent > 0 ? '+' : '') + gapPercent.toFixed(2)}%)`,
                    direction: `${isShort ? 'Gap UP → SHORT' : 'Gap DOWN → LONG'}`,
                    targetCheck,
                    stopCheck
                },
                result: {
                    exitReason: trade.exitReason,
                    outcome: trade.outcome,
                    pnl: trade.pnl
                },
                verifyOn: `https://www.tradingview.com/chart/?symbol=NSE:${trade.symbol}`
            };

            verificationSamples.push(sample);

            console.log(`\n${'─'.repeat(60)}`);
            console.log(`SAMPLE #${sample.sampleNo}: ${sample.symbol} on ${sample.date} [${sample.direction}]`);
            console.log(`${'─'.repeat(60)}`);
            console.log(`Previous Close: ${sample.previousDay.close}`);
            console.log(`Today Open: ${sample.tradeDay.open} (Gap: ${sample.calculations.gapPercent})`);
            console.log(`Direction: ${sample.verification.direction}`);
            console.log(`Today OHLC: O=${sample.tradeDay.open}, H=${sample.tradeDay.high}, L=${sample.tradeDay.low}, C=${sample.tradeDay.close}`);
            console.log(`\nVERIFICATION:`);
            console.log(`  ${sample.verification.gapCheck}`);
            console.log(`  ${sample.verification.targetCheck}`);
            console.log(`  ${sample.verification.stopCheck}`);
            console.log(`\nRESULT: ${sample.result.exitReason} - ${sample.result.outcome} (${sample.result.pnl})`);
            console.log(`Verify: ${sample.verifyOn}`);
        }
    }

    // Save verification samples
    const samplesPath = path.join(reportsDir, 'PRE_MARKET_verification_samples.json');
    await fs.writeFile(samplesPath, JSON.stringify(verificationSamples, null, 2));
    console.log(`\n✅ Verification samples saved: ${samplesPath}`);

    // Summary stats by symbol
    console.log('\n' + '═'.repeat(60));
    console.log('PERFORMANCE BY SYMBOL');
    console.log('═'.repeat(60));

    const symbolStats = {};
    for (const trade of results.trades) {
        if (!symbolStats[trade.symbol]) {
            symbolStats[trade.symbol] = { trades: 0, wins: 0, totalPnl: 0 };
        }
        symbolStats[trade.symbol].trades++;
        if (trade.outcome === 'WIN') symbolStats[trade.symbol].wins++;
        symbolStats[trade.symbol].totalPnl += parseFloat(trade.pnl);
    }

    // Sort by trade count
    const sortedSymbols = Object.entries(symbolStats)
        .sort((a, b) => b[1].trades - a[1].trades)
        .slice(0, 15);

    console.log('\nTop 15 Symbols by Trade Count:');
    console.log('Symbol'.padEnd(12) + 'Trades'.padEnd(8) + 'Wins'.padEnd(6) + 'WR%'.padEnd(8) + 'Total P&L');
    console.log('─'.repeat(50));

    for (const [symbol, stats] of sortedSymbols) {
        const wr = ((stats.wins / stats.trades) * 100).toFixed(1);
        console.log(
            symbol.padEnd(12) +
            String(stats.trades).padEnd(8) +
            String(stats.wins).padEnd(6) +
            (wr + '%').padEnd(8) +
            stats.totalPnl.toFixed(2) + '%'
        );
    }

    // Final summary
    console.log('\n' + '═'.repeat(60));
    console.log('REPORT GENERATION COMPLETE');
    console.log('═'.repeat(60));
    console.log('\nFiles generated:');
    console.log(`  1. ${jsonPath}`);
    console.log(`  2. ${csvPath}`);
    console.log(`  3. ${samplesPath}`);
    console.log('\nTotal trades: ' + results.trades.length);
    console.log('Win rate: ' + results.stats.winRate.toFixed(1) + '%');
    console.log('Total P&L: ' + results.stats.totalPnl.toFixed(2) + '%');

    return report;
}

generateFullReport()
    .then(() => process.exit(0))
    .catch(err => {
        console.error(err);
        process.exit(1);
    });
