/**
 * Run DAILY_CONTRACTION Backtest
 * 
 * Uses the BacktestEngine with DailyContractionStrategy (Phase 2).
 * Generates detailed performance report.
 */

const BacktestEngine = require('../strategy/backtestEngine.cjs');
const fs = require('fs');
const path = require('path');

const ARTIFACT_DIR = path.join('C:', 'Users', 'chenn', '.gemini', 'antigravity', 'brain', 'a3cec65d-bae4-4202-9302-efffd9a138d8');
const REPORT_FILE = path.join(ARTIFACT_DIR, 'daily_contraction_backtest_report.md');
const TRADES_FILE = path.join(ARTIFACT_DIR, 'daily_contraction_trades.csv');

// Local backup
const LOCAL_REPORT = path.join(__dirname, '..', 'results', 'daily_contraction_backtest_report.md');
const LOCAL_CSV = path.join(__dirname, '..', 'results', 'daily_contraction_trades.csv');

async function run() {
    console.log('Starting DAILY_CONTRACTION Backtest (Phase 2)...');

    try {
        const engine = new BacktestEngine('DAILY_CONTRACTION');

        // Run backtest
        const result = await engine.run({
            progressCallback: (p) => {
                process.stdout.write(`\r[${p.processed}/${p.total}] ${p.symbol} ${(p.progress * 100).toFixed(0)}%`);
            }
        });

        console.log('\nBacktest finished. Generating report...');
        await generateReport(result);

    } catch (e) {
        console.error('Fatal Error:', e);
    } finally {
        // Force exit as Prisma might hold connection
        process.exit(0);
    }
}

async function generateReport(summary) {
    const trades = summary.trades;

    if (trades.length === 0) {
        console.log('No trades generated.');
        return;
    }

    // ===== STATS =====

    // 1. Overall
    const total = trades.length;
    const wins = trades.filter(t => t.outcome === 'WIN');
    const losses = trades.filter(t => t.outcome === 'LOSS');
    const winRate = (wins.length / total * 100).toFixed(1);

    // Calculate R-multiples (Approximate PnL / Risk)
    // In this strategy, we don't have Risk stored explicitly in trade result from engine,
    // but we have pnl and we know target is 1.5R.
    // If WIN (Target Hit), PnL = 1.5R.
    // If LOSS (Stop Hit), PnL = -1.0R.
    // Timeout/Sideways = Actual PnL / Implied Risk.
    // Let's re-calculate R for each trade based on Exit Type.

    let totalR = 0;
    trades.forEach(t => {
        let r = 0;
        if (t.exitType === 'TARGET_HIT') r = 1.5;
        else if (t.exitType === 'SL_HIT') r = -1.0;
        else {
            // Timeout
            // Estimate R based on pnlPercent: Target(1.5R) approx X%.
            // Risk approx X% / 1.5.
            // This is hard to precise without stored risk.
            // But we can approximate: Avg Risk is ~1-2%.
            // Let's assume standard 1R loss is the unit.
            // Or better: implied R = pnl / (entry - stopLoss). We don't have stopLoss easily here in result...
            // Wait, result HAS stopLoss!
            const risk = Math.abs(t.entryPrice - t.stopLoss);
            r = t.pnl / risk;
        }
        t.rMultiple = r;
        totalR += r;
    });

    const avgR = (totalR / total).toFixed(2);

    // 2. Filter Stats
    const insider = trades.filter(t => t.pattern === 'INSIDER_NR7');
    const regular = trades.filter(t => t.pattern === 'NR7'); // Should be 0 if we filtered strictly

    const insiderWR = insider.length > 0 ? (insider.filter(t => t.outcome === 'WIN').length / insider.length * 100).toFixed(1) : '0';

    // 3. Direction Stats
    const longs = trades.filter(t => t.entryPrice > t.stopLoss); // Rough check for direction? 
    // Wait, trade doesn't have direction explicit, but we can infer:
    // Buy: Target > Entry. Sell: Target < Entry.
    trades.forEach(t => {
        t.direction = t.target > t.entryPrice ? 'LONG' : 'SHORT';
    });

    const longTrades = trades.filter(t => t.direction === 'LONG');
    const shortTrades = trades.filter(t => t.direction === 'SHORT');

    const longWR = longTrades.length > 0 ? (longTrades.filter(t => t.outcome === 'WIN').length / longTrades.length * 100).toFixed(1) : '0';
    const shortWR = shortTrades.length > 0 ? (shortTrades.filter(t => t.outcome === 'WIN').length / shortTrades.length * 100).toFixed(1) : '0';

    // 4. Quality Stats (if available in logs? Engine doesn't store filters in result)
    // We only have standard fields. We can't do detailed quality breakdown unless we enhanced engine result.
    // But we know we applied "Insider Only" logic in strategy.

    // ===== MARKDOWN GENERATION =====
    const md = `# DAILY_CONTRACTION Strategy Backtest Report
> Phase 2 Implementation (Insider NR7 Only)
> Date: ${new Date().toISOString().split('T')[0]}

## 1. Overall Performance

| Metric | Value |
|--------|-------|
| Total Trades | ${total} |
| Win Rate | **${winRate}%** |
| Total P&L (R) | **${totalR.toFixed(1)}R** |
| Avg P&L per Trade | ${avgR}R |
| Accuracy Target | ${summary.passedTarget ? '✅ PASSED' : '❌ FAILED'} |

## 2. Direction Analysis

| Direction | Trades | Win Rate | P&L (R) |
|-----------|--------|----------|---------|
| SHORT | ${shortTrades.length} | **${shortWR}%** | ${shortTrades.reduce((s, t) => s + t.rMultiple, 0).toFixed(1)}R |
| LONG | ${longTrades.length} | ${longWR}% | ${longTrades.reduce((s, t) => s + t.rMultiple, 0).toFixed(1)}R |

## 3. Pattern Analysis

| Pattern | Trades | Win Rate | Note |
|---------|--------|----------|------|
| **INSIDER_NR7** | ${insider.length} | **${insiderWR}%** | Primary Filter |

## 4. Monthly Breakdown (Last 6 Months)
*(Derived from trade dates)*
${getMonthlyStats(trades)}

## 5. Trade Log (Last 20)
| Symbol | Date | Dir | Outcome | P&L (R) | Type |
|--------|------|-----|---------|---------|------|
${trades.slice(-20).map(t => `| ${t.symbol} | ${new Date(t.entryDate).toISOString().split('T')[0]} | ${t.direction} | ${t.outcome} | ${t.rMultiple.toFixed(1)} | ${t.exitType} |`).join('\n')}

`;

    // ===== SAVE FILES =====
    fs.writeFileSync(REPORT_FILE, md);
    fs.writeFileSync(LOCAL_REPORT, md);

    if (trades.length > 0) {
        const csv = 'Symbol,Date,Direction,Entry,Exit,PnlR,Outcome,Type\n' +
            trades.map(t => `${t.symbol},${t.entryDate},${t.direction},${t.entryPrice},${t.exitPrice},${t.rMultiple},${t.outcome},${t.exitType}`).join('\n');
        fs.writeFileSync(TRADES_FILE, csv);
        fs.writeFileSync(LOCAL_CSV, csv);
    }

    console.log(`Saved report to ${REPORT_FILE}`);
}

function getMonthlyStats(trades) {
    const byMonth = {};
    trades.forEach(t => {
        const m = new Date(t.entryDate).toISOString().slice(0, 7);
        if (!byMonth[m]) byMonth[m] = { count: 0, wins: 0, r: 0 };
        byMonth[m].count++;
        byMonth[m].r += t.rMultiple;
        if (t.outcome === 'WIN') byMonth[m].wins++;
    });

    let table = '| Month | Trades | Win Rate | P&L (R) |\n|---|---|---|---|\n';
    Object.keys(byMonth).sort().forEach(m => {
        const d = byMonth[m];
        const wr = (d.wins / d.count * 100).toFixed(1);
        table += `| ${m} | ${d.count} | ${wr}% | ${d.r.toFixed(1)}R |\n`;
    });
    return table;
}

run();
