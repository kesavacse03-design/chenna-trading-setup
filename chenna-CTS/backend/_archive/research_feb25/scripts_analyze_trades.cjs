/**
 * DEEP TRADE ANALYSIS - ASCII-safe version
 * Redirects all output to a UTF-8 file
 */
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const fs = require('fs');

const out = [];
function log(msg) { out.push(msg); }

function toISTDateString(date) {
    const d = new Date(date);
    d.setMinutes(d.getMinutes() + 330);
    return d.toISOString().split('T')[0];
}

async function analyzeCategory(categoryKey) {
    log('');
    log('================================================================');
    log('  DEEP ANALYSIS: ' + categoryKey);
    log('================================================================');

    const run = await prisma.backtestRun.findFirst({
        where: { categoryKey, status: 'complete' },
        orderBy: { createdAt: 'desc' }
    });
    if (!run) { log('No runs found!'); return []; }

    const trades = await prisma.backtestTrade.findMany({
        where: { backtestRunId: run.id }
    });
    log('Total trades: ' + trades.length);

    const closed = trades.filter(t => t.exitPrice && t.exitReason && t.exitReason !== 'BACKTEST_END');
    const open = trades.filter(t => !t.exitPrice || t.exitReason === 'BACKTEST_END');
    const wins = closed.filter(t => t.outcome === 'WIN');
    const losses = closed.filter(t => t.outcome === 'LOSS');

    log('Closed: ' + closed.length + ' | Open/Pending: ' + open.length);
    log('Wins: ' + wins.length + ' | Losses: ' + losses.length);
    log('Win Rate: ' + (closed.length > 0 ? (wins.length / closed.length * 100).toFixed(1) : 0) + '%');

    // 1. EXIT REASON BREAKDOWN
    log('\n--- EXIT REASON BREAKDOWN ---');
    const exitReasons = {};
    for (const t of closed) {
        const r = t.exitReason || 'UNKNOWN';
        if (!exitReasons[r]) exitReasons[r] = { count: 0, wins: 0, losses: 0, totalPnl: 0 };
        exitReasons[r].count++;
        exitReasons[r].totalPnl += (t.pnlPercent || 0);
        if (t.outcome === 'WIN') exitReasons[r].wins++;
        else exitReasons[r].losses++;
    }
    for (const [reason, data] of Object.entries(exitReasons)) {
        log('  ' + reason.padEnd(25) +
            ' Count: ' + String(data.count).padStart(3) +
            ' | WinRate: ' + (data.count > 0 ? (data.wins / data.count * 100).toFixed(0) : 0) + '%' +
            ' | AvgPnL: ' + (data.totalPnl / data.count).toFixed(2) + '%');
    }

    // 2. DAYS HELD
    log('\n--- DAYS HELD ANALYSIS ---');
    const daysBuckets = { '1-2 days': [], '3-5 days': [], '6-10 days': [], '11-20 days': [], '20+ days': [] };
    for (const t of closed) {
        const days = t.daysHeld || 0;
        const bucket = days <= 2 ? '1-2 days' : days <= 5 ? '3-5 days' : days <= 10 ? '6-10 days' : days <= 20 ? '11-20 days' : '20+ days';
        daysBuckets[bucket].push(t);
    }
    for (const [bucket, tds] of Object.entries(daysBuckets)) {
        if (tds.length === 0) continue;
        const w = tds.filter(t => t.outcome === 'WIN').length;
        const avgPnl = tds.reduce((s, t) => s + (t.pnlPercent || 0), 0) / tds.length;
        log('  ' + bucket.padEnd(12) +
            ' Count: ' + String(tds.length).padStart(3) +
            ' | WinRate: ' + (w / tds.length * 100).toFixed(0) + '%' +
            ' | AvgPnL: ' + avgPnl.toFixed(2) + '%');
    }

    // 3. STOP DISTANCE
    log('\n--- STOP DISTANCE FROM ENTRY ---');
    const stopDistBuckets = { '0-3%': [], '3-5%': [], '5-8%': [], '8-12%': [], '12%+': [] };
    for (const t of closed) {
        if (!t.entryPrice || !t.stopPrice) continue;
        const dist = Math.abs((t.entryPrice - t.stopPrice) / t.entryPrice * 100);
        const bucket = dist <= 3 ? '0-3%' : dist <= 5 ? '3-5%' : dist <= 8 ? '5-8%' : dist <= 12 ? '8-12%' : '12%+';
        stopDistBuckets[bucket].push(t);
    }
    for (const [bucket, tds] of Object.entries(stopDistBuckets)) {
        if (tds.length === 0) continue;
        const w = tds.filter(t => t.outcome === 'WIN').length;
        const avgPnl = tds.reduce((s, t) => s + (t.pnlPercent || 0), 0) / tds.length;
        log('  ' + bucket.padEnd(12) +
            ' Count: ' + String(tds.length).padStart(3) +
            ' | WinRate: ' + (w / tds.length * 100).toFixed(0) + '%' +
            ' | AvgPnl: ' + avgPnl.toFixed(2) + '%');
    }

    // 4. PRICE LEVEL
    log('\n--- ENTRY PRICE LEVEL ---');
    const priceBuckets = { '<200': [], '200-500': [], '500-1000': [], '1000-2000': [], '2000-5000': [], '5000+': [] };
    for (const t of closed) {
        if (!t.entryPrice) continue;
        const p = t.entryPrice;
        const bucket = p < 200 ? '<200' : p < 500 ? '200-500' : p < 1000 ? '500-1000' : p < 2000 ? '1000-2000' : p < 5000 ? '2000-5000' : '5000+';
        priceBuckets[bucket].push(t);
    }
    for (const [bucket, tds] of Object.entries(priceBuckets)) {
        if (tds.length === 0) continue;
        const w = tds.filter(t => t.outcome === 'WIN').length;
        const avgPnl = tds.reduce((s, t) => s + (t.pnlPercent || 0), 0) / tds.length;
        log('  Rs ' + bucket.padEnd(12) +
            ' Count: ' + String(tds.length).padStart(3) +
            ' | WinRate: ' + (w / tds.length * 100).toFixed(0) + '%' +
            ' | AvgPnl: ' + avgPnl.toFixed(2) + '%');
    }

    // 5. WIN vs LOSS SIZE
    log('\n--- WIN vs LOSS SIZE ---');
    if (wins.length > 0) {
        const avgWin = wins.reduce((s, t) => s + (t.pnlPercent || 0), 0) / wins.length;
        const maxWin = Math.max(...wins.map(t => t.pnlPercent || 0));
        log('  Avg Win:  +' + avgWin.toFixed(2) + '% | Max Win: +' + maxWin.toFixed(2) + '%');
    }
    if (losses.length > 0) {
        const avgLoss = losses.reduce((s, t) => s + (t.pnlPercent || 0), 0) / losses.length;
        const maxLoss = Math.min(...losses.map(t => t.pnlPercent || 0));
        log('  Avg Loss: ' + avgLoss.toFixed(2) + '% | Max Loss: ' + maxLoss.toFixed(2) + '%');
    }
    const expectancy = closed.length > 0 ? closed.reduce((s, t) => s + (t.pnlPercent || 0), 0) / closed.length : 0;
    log('  Expectancy per trade: ' + expectancy.toFixed(3) + '%');

    // 6. STOP LOSS PATTERN
    log('\n--- STOP LOSS PATTERN ---');
    const stopLosses = losses.filter(t => t.exitReason === 'STOP');
    const trailLosses = losses.filter(t => t.exitReason && t.exitReason.includes('TRAILING'));
    log('  Pure stop losses: ' + stopLosses.length);
    log('  Trailing stop losses: ' + trailLosses.length);
    if (stopLosses.length > 0) {
        const avgStopDist = stopLosses.reduce((s, t) => s + Math.abs((t.entryPrice - t.stopPrice) / t.entryPrice * 100), 0) / stopLosses.length;
        const avgStopPnl = stopLosses.reduce((s, t) => s + (t.pnlPercent || 0), 0) / stopLosses.length;
        log('  Avg stop distance: ' + avgStopDist.toFixed(2) + '%');
        log('  Avg stop loss PnL: ' + avgStopPnl.toFixed(2) + '%');
    }

    // 7. PER-TRADE DETAIL
    log('\n--- PER-TRADE DETAIL (CLOSED, sorted by PnL) ---');
    log('  Symbol         Entry     Exit      Stop      Target    PnL%     Days  Reason');
    log('  ' + '-'.repeat(90));
    for (const t of closed.sort((a, b) => (a.pnlPercent || 0) - (b.pnlPercent || 0))) {
        const symbol = (t.symbol || '').padEnd(14);
        const entry = String(Number(t.entryPrice || 0).toFixed(1)).padStart(9);
        const exit = String(Number(t.exitPrice || 0).toFixed(1)).padStart(9);
        const stop = String(Number(t.stopPrice || 0).toFixed(1)).padStart(9);
        const target = String(Number(t.targetPrice || 0).toFixed(1)).padStart(9);
        const pnl = String(Number(t.pnlPercent || 0).toFixed(2)).padStart(7);
        const days = String(t.daysHeld || 0).padStart(4);
        const reason = (t.exitReason || 'N/A');
        const outcome = t.outcome === 'WIN' ? ' WIN' : ' LOSS';
        log('  ' + symbol + entry + exit + stop + target + pnl + '%' + days + '  ' + reason + outcome);
    }

    // 8. TOP LOSERS CANDLE ANALYSIS
    log('\n--- TOP 5 LOSERS: Candle Analysis ---');
    const topLosers = losses.sort((a, b) => (a.pnlPercent || 0) - (b.pnlPercent || 0)).slice(0, 5);
    for (const t of topLosers) {
        const signalDate = toISTDateString(t.signalDate);
        const entryDate = toISTDateString(t.entryDate);
        const cache = await prisma.ohlcvCache.findFirst({ where: { symbol: t.symbol, interval: 'day' } });
        if (!cache || !cache.data) { log('  ' + t.symbol + ': No cache data'); continue; }
        const candles = cache.data;
        const signalCandle = candles.find(c => {
            const ts = String(c.timestamp || c.date || '');
            return (ts.includes('T') ? ts.split('T')[0] : ts.split(' ')[0]) === signalDate;
        });
        log('\n  ' + t.symbol + ' (PnL: ' + (t.pnlPercent || 0).toFixed(2) + '%, Days: ' + (t.daysHeld || 0) + ')');
        log('    Entry: ' + t.entryPrice + ' | Stop: ' + t.stopPrice + ' | Target: ' + t.targetPrice);
        log('    Stop Dist: ' + Math.abs((t.entryPrice - t.stopPrice) / t.entryPrice * 100).toFixed(2) + '%');
        if (signalCandle) {
            const isRed = signalCandle.close < signalCandle.open;
            log('    Signal (' + signalDate + '): ' + (isRed ? 'RED' : 'GREEN') +
                ' O=' + signalCandle.open + ' H=' + signalCandle.high + ' L=' + signalCandle.low + ' C=' + signalCandle.close);
        }
    }

    // 9. RED vs GREEN CANDLE SIGNAL
    log('\n--- SIGNAL DAY CANDLE COLOR ---');
    let redWins = 0, redLosses = 0, greenWins = 0, greenLosses = 0;
    for (const t of closed) {
        const signalDate = toISTDateString(t.signalDate);
        const cache = await prisma.ohlcvCache.findFirst({ where: { symbol: t.symbol, interval: 'day' } });
        if (!cache || !cache.data) continue;
        const sc = cache.data.find(c => {
            const ts = String(c.timestamp || c.date || '');
            return (ts.includes('T') ? ts.split('T')[0] : ts.split(' ')[0]) === signalDate;
        });
        if (!sc) continue;
        if (sc.close < sc.open) { if (t.outcome === 'WIN') redWins++; else redLosses++; }
        else { if (t.outcome === 'WIN') greenWins++; else greenLosses++; }
    }
    log('  RED signal:   Wins=' + redWins + ' Losses=' + redLosses +
        ' WinRate=' + (redWins + redLosses > 0 ? (redWins / (redWins + redLosses) * 100).toFixed(0) : 0) + '%');
    log('  GREEN signal: Wins=' + greenWins + ' Losses=' + greenLosses +
        ' WinRate=' + (greenWins + greenLosses > 0 ? (greenWins / (greenWins + greenLosses) * 100).toFixed(0) : 0) + '%');

    return closed;
}

async function main() {
    const support = await analyzeCategory('MULTI_SUPPORT_BO');
    const resistance = await analyzeCategory('MULTI_RESISTANCE_BO');

    log('');
    log('================================================================');
    log('  CROSS-CATEGORY PATTERNS');
    log('================================================================');

    const allClosed = [...support, ...resistance];
    const allWins = allClosed.filter(t => t.outcome === 'WIN');
    const allLosses = allClosed.filter(t => t.outcome === 'LOSS');

    if (allWins.length > 0 && allLosses.length > 0) {
        const avgWinDays = allWins.reduce((s, t) => s + (t.daysHeld || 0), 0) / allWins.length;
        const avgLossDays = allLosses.reduce((s, t) => s + (t.daysHeld || 0), 0) / allLosses.length;
        log('\n  Avg days held - Winners: ' + avgWinDays.toFixed(1) + ' vs Losers: ' + avgLossDays.toFixed(1));

        const avgWinStopDist = allWins.reduce((s, t) => s + Math.abs((t.entryPrice - t.stopPrice) / t.entryPrice * 100), 0) / allWins.length;
        const avgLossStopDist = allLosses.reduce((s, t) => s + Math.abs((t.entryPrice - t.stopPrice) / t.entryPrice * 100), 0) / allLosses.length;
        log('  Avg stop distance - Winners: ' + avgWinStopDist.toFixed(2) + '% vs Losers: ' + avgLossStopDist.toFixed(2) + '%');

        const avgWinEntry = allWins.reduce((s, t) => s + t.entryPrice, 0) / allWins.length;
        const avgLossEntry = allLosses.reduce((s, t) => s + t.entryPrice, 0) / allLosses.length;
        log('  Avg entry price - Winners: Rs ' + avgWinEntry.toFixed(0) + ' vs Losers: Rs ' + avgLossEntry.toFixed(0));
    }

    // Overlap
    const supportSymbols = new Set(support.map(t => t.symbol));
    const resistanceSymbols = new Set(resistance.map(t => t.symbol));
    const overlap = [...supportSymbols].filter(s => resistanceSymbols.has(s));
    log('\n  Stocks in BOTH categories: ' + overlap.join(', '));

    // Consistent losers
    const lossBySymbol = {};
    for (const t of allClosed) {
        if (!lossBySymbol[t.symbol]) lossBySymbol[t.symbol] = { wins: 0, losses: 0, totalPnl: 0 };
        lossBySymbol[t.symbol].totalPnl += (t.pnlPercent || 0);
        if (t.outcome === 'WIN') lossBySymbol[t.symbol].wins++;
        else lossBySymbol[t.symbol].losses++;
    }
    const consistentLosers = Object.entries(lossBySymbol)
        .filter(([_, d]) => d.losses > 0 && d.wins === 0)
        .sort((a, b) => a[1].totalPnl - b[1].totalPnl);
    log('\n  CONSISTENT LOSERS (0 wins):');
    for (const [sym, d] of consistentLosers.slice(0, 10)) {
        log('    ' + sym.padEnd(15) + ' Losses: ' + d.losses + ' | Total PnL: ' + d.totalPnl.toFixed(2) + '%');
    }

    // Write output
    const outputPath = require('path').join(__dirname, 'analysis_result.txt');
    fs.writeFileSync(outputPath, out.join('\n'), 'utf8');
    console.log('Analysis saved to: ' + outputPath);
    console.log('Total lines: ' + out.length);

    await prisma.$disconnect();
}

main().catch(e => { console.error(e); prisma.$disconnect(); });
