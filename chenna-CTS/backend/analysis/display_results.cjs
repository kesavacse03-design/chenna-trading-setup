/**
 * Display PRE_MARKET backtest results to file
 */
const fs = require('fs');
const path = require('path');

const csvPath = path.join(__dirname, 'premarket_backtest_results.csv');
const csv = fs.readFileSync(csvPath, 'utf8');
const lines = csv.trim().split('\n');
const headers = lines[0].split(',');
const trades = lines.slice(1).map(line => {
    const values = line.split(',');
    const obj = {};
    headers.forEach((h, i) => obj[h] = values[i]);
    return obj;
});

let output = '';
output += '='.repeat(140) + '\n';
output += 'PRE_MARKET BACKTEST RESULTS (GAP UP SHORT - Gap Fill Strategy)\n';
output += 'Date Range: Jan 2-21, 2026 | Total Trades: 61\n';
output += '='.repeat(140) + '\n\n';

output += 'ID  | Date       | Symbol       | Gap%   | Prev Close | Open   | Entry  | Target | Exit   | Outcome | Exit Reason | P&L%\n';
output += '-'.repeat(140) + '\n';

for (const t of trades) {
    output += `${t.trade_id.padStart(3)} | ${t.date} | ${t.symbol.padEnd(12)} | ${(+t.gap_percent).toFixed(2).padStart(6)}% | ${(+t.previous_close).toFixed(2).padStart(10)} | ${(+t.today_open).toFixed(2).padStart(6)} | ${(+t.entry_price).toFixed(2).padStart(6)} | ${(+t.target_price).toFixed(2).padStart(6)} | ${(+t.exit_price).toFixed(2).padStart(6)} | ${t.outcome.padEnd(7)} | ${t.exit_reason.padEnd(11)} | ${(+t.pnl_percent).toFixed(2).padStart(6)}%\n`;
}

output += '-'.repeat(140) + '\n\n';

// Summary
const wins = trades.filter(t => t.outcome === 'WIN');
const losses = trades.filter(t => t.outcome === 'LOSS');
const totalPnl = trades.reduce((s, t) => s + parseFloat(t.pnl_percent), 0);

output += 'SUMMARY:\n';
output += `  Total Trades: ${trades.length}\n`;
output += `  Wins: ${wins.length}, Losses: ${losses.length}\n`;
output += `  Win Rate: ${((wins.length / trades.length) * 100).toFixed(1)}%\n`;
output += `  Total P&L: ${totalPnl >= 0 ? '+' : ''}${totalPnl.toFixed(2)}%\n`;
output += '\n';

// Losses detail
output += 'LOSING TRADES DETAIL:\n';
for (const t of losses) {
    output += `  ${t.date} ${t.symbol.padEnd(10)}: Gap ${(+t.gap_percent).toFixed(1)}%, Vol Ratio ${t.volume_ratio}x, Body ${t.breakdown_candle_body_percent}%, Exit: ${t.exit_reason}\n`;
}
output += '\n';

// Gap distribution
output += 'GAP SIZE DISTRIBUTION:\n';
const gapBuckets = { '2-3%': [], '3-4%': [], '4-5%': [], '5-6%': [], '6-7%': [], '7%+': [] };
for (const t of trades) {
    const gap = parseFloat(t.gap_percent);
    if (gap < 3) gapBuckets['2-3%'].push(t);
    else if (gap < 4) gapBuckets['3-4%'].push(t);
    else if (gap < 5) gapBuckets['4-5%'].push(t);
    else if (gap < 6) gapBuckets['5-6%'].push(t);
    else if (gap < 7) gapBuckets['6-7%'].push(t);
    else gapBuckets['7%+'].push(t);
}

for (const [range, bucket] of Object.entries(gapBuckets)) {
    const w = bucket.filter(t => t.outcome === 'WIN').length;
    const total = bucket.length;
    const wr = total > 0 ? ((w / total) * 100).toFixed(0) : 0;
    output += `  ${range}: ${total} trades, ${w} wins (${wr}% WR)\n`;
}

// Write to file
const outPath = path.join(__dirname, 'premarket_results_display.txt');
fs.writeFileSync(outPath, output);
console.log('Results written to:', outPath);
console.log('\nFirst 50 lines preview:');
console.log(output.split('\n').slice(0, 50).join('\n'));
