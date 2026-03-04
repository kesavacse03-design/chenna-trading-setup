const fs = require('fs');
const path = require('path');

function analyzeCSV(file) {
    if (!fs.existsSync(file)) return null;
    const lines = fs.readFileSync(file, 'utf8').split('\n').filter(l => l.trim() && !l.startsWith('symbol'));

    let totalTrades = lines.length;
    let zeroPnl = 0;
    let wins = 0;
    let totalPnl = 0;
    let stopDists = [];

    lines.forEach(line => {
        const parts = line.split(',');
        const pnl = parseFloat(parts[9]) || 0;
        const outcome = parts[10];
        const riskStr = parts[6]; // e.g. "4.00%"
        const riskPct = parseFloat(riskStr.replace('%', ''));

        if (pnl === 0 && outcome !== 'OPEN' && outcome !== 'BACKTEST_END') zeroPnl++;
        if (outcome === 'WIN') wins++;
        totalPnl += pnl;
        if (!isNaN(riskPct)) stopDists.push(riskPct);
    });

    const avgStop = stopDists.reduce((a, b) => a + b, 0) / stopDists.length;
    const winRate = (wins / totalTrades) * 100;

    return {
        totalTrades,
        zeroPnl,
        zeroPct: (zeroPnl / totalTrades) * 100,
        winRate,
        totalPnl,
        avgStop
    };
}

const oldStats = analyzeCSV(path.join(__dirname, '../outputs/verification_trades_v3.csv'));
const newStats = analyzeCSV(path.join(__dirname, '../outputs/val_final_v5.csv'));

console.log("OLD (Buggy V3)");
console.log(oldStats);
console.log("\nNEW (Fixed V3)");
console.log(newStats);
