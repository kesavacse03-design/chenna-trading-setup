// Analyze PRE_MARKET backtest trades to identify problem stocks
const fs = require('fs');

const csvPath = './analysis/premarket_backtest_results.csv';
const raw = fs.readFileSync(csvPath, 'utf8');
const lines = raw.trim().split('\n');

// Parse CSV
const headers = lines[0].split(',');
const trades = lines.slice(1).map(line => {
    const values = line.split(',');
    const obj = {};
    headers.forEach((h, i) => obj[h] = values[i]);
    return obj;
});

// Deduplicate by unique trade key (date + symbol + entry_time + entry_price)
const seen = new Set();
const uniqueTrades = trades.filter(t => {
    const key = `${t.date}-${t.symbol}-${t.entry_time}-${t.entry_price}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
});

console.log('═'.repeat(60));
console.log('PRE_MARKET TRADE ANALYSIS');
console.log('═'.repeat(60));
console.log(`Total trades in CSV: ${trades.length}`);
console.log(`Unique trades (deduplicated): ${uniqueTrades.length}`);

// Analyze by stock
const stockAnalysis = {};
uniqueTrades.forEach(t => {
    const symbol = t.symbol;
    if (!stockAnalysis[symbol]) {
        stockAnalysis[symbol] = { wins: 0, losses: 0, totalPnl: 0, trades: [] };
    }

    const pnl = parseFloat(t.pnl_percent) || 0;
    stockAnalysis[symbol].totalPnl += pnl;

    if (t.outcome === 'WIN') {
        stockAnalysis[symbol].wins++;
    } else {
        stockAnalysis[symbol].losses++;
    }

    stockAnalysis[symbol].trades.push({
        date: t.date,
        outcome: t.outcome,
        pnl: pnl,
        exit: t.exit_reason,
        gap: parseFloat(t.gap_percent)
    });
});

// Summary stats
let totalWins = 0, totalLosses = 0, totalPnl = 0;
uniqueTrades.forEach(t => {
    if (t.outcome === 'WIN') totalWins++;
    else totalLosses++;
    totalPnl += parseFloat(t.pnl_percent) || 0;
});

console.log(`\nOVERALL STATS:`);
console.log(`  Wins: ${totalWins}`);
console.log(`  Losses: ${totalLosses}`);
console.log(`  Win Rate: ${(totalWins / uniqueTrades.length * 100).toFixed(1)}%`);
console.log(`  Total P&L: ${totalPnl.toFixed(2)}%`);

// Find problem stocks (loss rate > 50% with 2+ trades)
console.log('\n\n' + '═'.repeat(60));
console.log('PROBLEM STOCKS (>50% loss rate, 2+ trades)');
console.log('═'.repeat(60));

const problemStocks = Object.entries(stockAnalysis)
    .filter(([_, s]) => (s.wins + s.losses) >= 2)
    .filter(([_, s]) => s.losses / (s.wins + s.losses) >= 0.5)
    .sort((a, b) => b[1].losses - a[1].losses)
    .map(([symbol, s]) => ({
        symbol,
        trades: s.wins + s.losses,
        wins: s.wins,
        losses: s.losses,
        winRate: Math.round(s.wins / (s.wins + s.losses) * 100) + '%',
        totalPnl: s.totalPnl.toFixed(2) + '%'
    }));

if (problemStocks.length > 0) {
    console.table(problemStocks);
} else {
    console.log('No problem stocks found!');
}

// Find reliable stocks (win rate >= 60% with 2+ trades)
console.log('\n\n' + '═'.repeat(60));
console.log('RELIABLE STOCKS (>=60% win rate, 2+ trades)');
console.log('═'.repeat(60));

const reliableStocks = Object.entries(stockAnalysis)
    .filter(([_, s]) => (s.wins + s.losses) >= 2)
    .filter(([_, s]) => s.wins / (s.wins + s.losses) >= 0.6)
    .sort((a, b) => b[1].wins - a[1].wins)
    .map(([symbol, s]) => ({
        symbol,
        trades: s.wins + s.losses,
        wins: s.wins,
        losses: s.losses,
        winRate: Math.round(s.wins / (s.wins + s.losses) * 100) + '%',
        totalPnl: s.totalPnl.toFixed(2) + '%'
    }));

if (reliableStocks.length > 0) {
    console.table(reliableStocks);
} else {
    console.log('No reliable stocks found!');
}

// All stocks breakdown
console.log('\n\n' + '═'.repeat(60));
console.log('ALL STOCKS BREAKDOWN');
console.log('═'.repeat(60));

const allStocks = Object.entries(stockAnalysis)
    .sort((a, b) => (b[1].wins + b[1].losses) - (a[1].wins + a[1].losses))
    .map(([symbol, s]) => ({
        symbol,
        trades: s.wins + s.losses,
        wins: s.wins,
        losses: s.losses,
        winRate: Math.round(s.wins / (s.wins + s.losses) * 100) + '%',
        totalPnl: s.totalPnl.toFixed(2) + '%'
    }));

console.table(allStocks);

// Recommendation
console.log('\n\n' + '═'.repeat(60));
console.log('RECOMMENDATION FOR EXCLUSION LIST');
console.log('═'.repeat(60));

const toExclude = problemStocks
    .filter(s => s.trades >= 3 || parseFloat(s.totalPnl) < -1)
    .map(s => s.symbol);

console.log(`Stocks to exclude: ${toExclude.length > 0 ? toExclude.join(', ') : 'None - data quality issue'}`);
console.log(`\nNote: This CSV has only Jan 16-21, 2026 data (3 days).`);
console.log(`Need more recent backtest to get Dec 2025 - Feb 2026 analysis.`);
