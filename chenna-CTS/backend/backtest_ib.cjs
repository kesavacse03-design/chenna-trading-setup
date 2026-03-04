/**
 * Backtest IB (INTRADAY_BOOST) signals using confirmIntradaySignals()
 * 
 * Usage: node backtest_ib.cjs [startDate] [endDate]
 * Example: node backtest_ib.cjs 2026-02-23 2026-03-02
 * 
 * This calls the EXACT same signal generator + evaluator used in production.
 * 1. For each trading day, deletes any existing IB signals (clean slate)
 * 2. Calls confirmIntradaySignals(date) to generate signals
 * 3. Evaluates outcomes using evaluateOutcome() from signalEngine
 * 4. Prints summary with win rate, PnL, and per-signal breakdown
 */

require('dotenv').config();
const prisma = require('./lib/prisma.cjs');
const cs = require('./services/confirmationService.cjs');
const { evaluateOutcome } = require('./services/signalEngine.cjs');
const priceService = require('./services/priceService.cjs');
const fs = require('fs');
const path = require('path');

// Use the same 1-min candle loader as intradayStrategyV2_1
function get1MinCandles(symbol, dateStr) {
    // Try cache first
    const cleanKey = symbol.replace(/[^a-zA-Z0-9_-]/g, '_');
    const cachePath = path.join(__dirname, 'cache', '1minute', `${cleanKey}_master.json`);
    if (fs.existsSync(cachePath)) {
        try {
            const raw = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
            const dayCandles = raw.filter(c => {
                const d = String(c.timestamp || c.date).split('T')[0];
                return d === dateStr;
            }).sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

            if (dayCandles.length > 0) {
                return dayCandles.map(c => ({
                    timestamp: c.timestamp,
                    open: parseFloat(c.open),
                    high: parseFloat(c.high),
                    low: parseFloat(c.low),
                    close: parseFloat(c.close),
                    volume: parseFloat(c.volume || 0)
                }));
            }
        } catch (e) { /* fall through */ }
    }
    return [];
}

// Get trading days that have cache data (30-min or 1-min)
function getTradingDays(startDate, endDate) {
    const allDates = new Set();

    // Check 30-min cache
    const cacheDir30m = path.join(__dirname, 'cache', '30minute');
    const files30m = fs.readdirSync(cacheDir30m).filter(f => f.endsWith('_master.json'));
    if (files30m.length > 0) {
        try {
            const raw = JSON.parse(fs.readFileSync(path.join(cacheDir30m, files30m[0]), 'utf8'));
            raw.forEach(c => allDates.add(String(c.timestamp || c.date).split('T')[0]));
        } catch (e) { }
    }

    // Also check 1-min cache (needed for 5-min evaluation)
    const cacheDir1m = path.join(__dirname, 'cache', '1minute');
    const files1m = fs.readdirSync(cacheDir1m).filter(f => f.endsWith('_master.json'));
    if (files1m.length > 0) {
        // Sample first 3 files for available dates
        for (const f of files1m.slice(0, 3)) {
            try {
                const raw = JSON.parse(fs.readFileSync(path.join(cacheDir1m, f), 'utf8'));
                raw.forEach(c => allDates.add(String(c.timestamp || c.date).split('T')[0]));
            } catch (e) { }
        }
    }

    return [...allDates].sort().filter(d => d >= startDate && d <= endDate);
}

async function runBacktest(startDate, endDate) {
    console.log('═'.repeat(70));
    console.log('  INTRADAY BOOST BACKTEST — confirmIntradaySignals()');
    console.log(`  Range: ${startDate} → ${endDate}`);
    console.log('═'.repeat(70));

    const tradingDays = getTradingDays(startDate, endDate);
    console.log(`\nTrading days found: ${tradingDays.length}: ${tradingDays.join(', ')}`);

    if (tradingDays.length === 0) {
        console.log('❌ No trading days with 30-min cache data in range');
        await prisma.$disconnect();
        return;
    }

    const allResults = [];
    let totalWins = 0, totalLosses = 0, totalExpired = 0, totalNotFilled = 0;

    for (const date of tradingDays) {
        console.log(`\n${'─'.repeat(70)}`);
        console.log(`  ${date}`);
        console.log('─'.repeat(70));

        // Step 1: Delete existing signals (and related positions) for clean slate
        const importDateIST = (d) => new Date(d + 'T00:00:00Z');

        // First delete positions that reference these signals (FK constraint)
        const existingSignalIds = await prisma.v5Signal.findMany({
            where: { category: 'INTRADAY_BOOST', signalDate: importDateIST(date) },
            select: { id: true }
        });
        if (existingSignalIds.length > 0) {
            const ids = existingSignalIds.map(s => s.id);
            try {
                await prisma.$executeRawUnsafe(`DELETE FROM v5_positions WHERE signal_id IN (${ids.map(id => `'${id}'`).join(',')})`);
            } catch (e) { /* positions table may not exist or be empty */ }
            await prisma.v5Signal.deleteMany({
                where: { id: { in: ids } }
            });
            console.log(`  Cleaned ${ids.length} existing signals`);
        }

        // Step 2: Generate signals using production logic
        try {
            const genResult = await cs.confirmIntradaySignals(date);
            console.log(`  Generated: ${JSON.stringify(genResult)}`);
        } catch (e) {
            console.log(`  ❌ Generation error: ${e.message}`);
            continue;
        }

        // Step 3: Fetch generated signals
        const signals = await prisma.v5Signal.findMany({
            where: {
                category: 'INTRADAY_BOOST',
                signalDate: importDateIST(date)
            }
        });

        console.log(`  Signals: ${signals.length}`);
        if (signals.length === 0) continue;

        // Step 4: Evaluate each signal
        for (const sig of signals) {
            if (sig.status === 'EXPIRED' && sig.entryType === 'RETEST_FAILED') {
                allResults.push({
                    date, symbol: sig.symbol, direction: sig.direction,
                    entryType: sig.entryType, outcome: 'RETEST_FAILED',
                    rMultiple: 0, entry: Number(sig.entryPrice),
                    stop: Number(sig.stopPrice)
                });
                continue;
            }

            // Get 1-min candles for outcome evaluation
            const candles = get1MinCandles(sig.symbol, date);
            let result;

            if (candles.length > 0) {
                result = evaluateOutcome(sig, candles);
            } else {
                // Fallback to 30-min candles
                const { evaluateOutcome30m } = require('./services/signalEngine.cjs');
                const cleanKey = sig.symbol.replace(/[^a-zA-Z0-9_-]/g, '_');
                const path = require('path');
                const fs = require('fs');
                const p = path.join(__dirname, 'cache', '30minute', `${cleanKey}_master.json`);

                let candles30m = [];
                if (fs.existsSync(p)) {
                    try {
                        const raw = JSON.parse(fs.readFileSync(p, 'utf8'));
                        candles30m = raw.filter(c => String(c.timestamp || c.date).split('T')[0] === date)
                            .map(c => ({
                                timestamp: c.timestamp || c.date,
                                open: parseFloat(c.open),
                                high: parseFloat(c.high),
                                low: parseFloat(c.low),
                                close: parseFloat(c.close),
                                volume: parseFloat(c.volume || 0)
                            }))
                            .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
                    } catch (e) { }
                }

                if (candles30m.length > 0) {
                    result = evaluateOutcome30m(sig, candles30m);
                    console.log(`  [Fallback] ${sig.symbol}: Used 30-min data for evaluation`);
                } else {
                    console.log(`  ${sig.symbol}: No 1-min or 30-min candles for evaluation`);
                    allResults.push({
                        date, symbol: sig.symbol, direction: sig.direction,
                        entryType: sig.entryType, outcome: 'NO_DATA',
                        rMultiple: 0, entry: Number(sig.entryPrice),
                        stop: Number(sig.stopPrice)
                    });
                    continue;
                }
            }

            const entry = Number(sig.entryPrice);
            const stop = Number(sig.stopPrice);
            const risk = Math.abs(entry - stop);
            const icon = result.outcome === 'T1_HIT' || result.outcome === 'T2_HIT' ? '✅' :
                result.outcome === 'STOP_HIT' ? '❌' :
                    result.outcome === 'NOT_FILLED' ? '⏭️' : '🔸';

            console.log(`  ${icon} ${sig.symbol.padEnd(12)} ${sig.direction.padEnd(6)} ${(sig.entryType || '-').padEnd(8)} Entry=₹${entry.toFixed(0).padStart(5)} Stop=₹${stop.toFixed(0).padStart(5)} → ${result.outcome.padEnd(10)} R=${result.rMultiple.toFixed(2)}`);

            allResults.push({
                date, symbol: sig.symbol, direction: sig.direction,
                entryType: sig.entryType, outcome: result.outcome,
                rMultiple: result.rMultiple, entry, stop,
                exitPrice: result.exitPrice, fillTime: result.fillTime
            });

            // Update DB status
            const statusMap = { 'T1_HIT': 'T1_HIT', 'T2_HIT': 'T2_HIT', 'STOP_HIT': 'STOPPED', 'EOD_CLOSE': 'EOD_CLOSE', 'NOT_FILLED': 'EXPIRED' };
            await prisma.v5Signal.update({
                where: { id: sig.id },
                data: { status: statusMap[result.outcome] || sig.status }
            });

            if (result.outcome === 'T1_HIT' || result.outcome === 'T2_HIT') totalWins++;
            else if (result.outcome === 'STOP_HIT') totalLosses++;
            else if (result.outcome === 'NOT_FILLED') totalNotFilled++;
            else totalExpired++;
        }
    }

    // Summary
    const totalTrades = totalWins + totalLosses + totalExpired;
    const totalR = allResults.reduce((s, r) => s + (r.rMultiple || 0), 0);
    const winRate = totalTrades > 0 ? (totalWins / (totalWins + totalLosses) * 100).toFixed(1) : 'N/A';

    console.log('\n' + '═'.repeat(70));
    console.log('  BACKTEST SUMMARY');
    console.log('═'.repeat(70));
    console.log(`  Days:        ${tradingDays.length}`);
    console.log(`  Total Sigs:  ${allResults.length}`);
    console.log(`  Wins:        ${totalWins}`);
    console.log(`  Losses:      ${totalLosses}`);
    console.log(`  EOD/Other:   ${totalExpired}`);
    console.log(`  Not Filled:  ${totalNotFilled}`);
    console.log(`  Win Rate:    ${winRate}%`);
    console.log(`  Total R:     ${totalR.toFixed(2)}`);

    // Breakdown by direction
    const shorts = allResults.filter(r => r.direction === 'SHORT' && r.outcome !== 'NO_DATA' && r.outcome !== 'RETEST_FAILED');
    const longs = allResults.filter(r => r.direction === 'LONG' && r.outcome !== 'NO_DATA' && r.outcome !== 'RETEST_FAILED');
    const shortWins = shorts.filter(r => r.outcome === 'T1_HIT' || r.outcome === 'T2_HIT').length;
    const longWins = longs.filter(r => r.outcome === 'T1_HIT' || r.outcome === 'T2_HIT').length;

    console.log(`\n  LONG:  ${longWins}W / ${longs.length} trades (${longs.length > 0 ? (longWins / longs.length * 100).toFixed(0) : 'N/A'}%)`);
    console.log(`  SHORT: ${shortWins}W / ${shorts.length} trades (${shorts.length > 0 ? (shortWins / shorts.length * 100).toFixed(0) : 'N/A'}%)`);

    // By entry type
    const retests = allResults.filter(r => r.entryType === 'RETEST' && r.outcome !== 'NO_DATA');
    const runners = allResults.filter(r => r.entryType === 'RUNNER' && r.outcome !== 'NO_DATA');
    const retestWins = retests.filter(r => r.outcome === 'T1_HIT' || r.outcome === 'T2_HIT').length;
    const runnerWins = runners.filter(r => r.outcome === 'T1_HIT' || r.outcome === 'T2_HIT').length;

    console.log(`\n  RETEST:  ${retestWins}W / ${retests.length} trades (${retests.length > 0 ? (retestWins / retests.length * 100).toFixed(0) : 'N/A'}%)`);
    console.log(`  RUNNER:  ${runnerWins}W / ${runners.length} trades (${runners.length > 0 ? (runnerWins / runners.length * 100).toFixed(0) : 'N/A'}%)`);

    console.log('═'.repeat(70));

    // Export CSV
    try {
        const csvHeaders = 'Date,Symbol,Direction,Type,Outcome,Entry,Stop,T1,ExitPrice,ExitTime,R-Multiple,EvaluatedBy\n';
        const csvRows = allResults.map(r => {
            const date = r.date;
            const sym = r.symbol;
            const dir = r.direction;
            const type = r.entryType || '';
            const outcome = r.outcome;
            const entry = r.entry.toFixed(2);
            const stop = r.stop.toFixed(2);
            // We don't store T1 explicitly in allResults but we know R-multiple.
            // If T1 was hit, R is usually >= 1. We'll just leave T1 blank as it's derivable.
            const t1 = '';
            const exitP = r.exitPrice ? r.exitPrice.toFixed(2) : '';
            const exitT = r.fillTime ? new Date(r.fillTime).toISOString() : '';
            const rMult = r.rMultiple.toFixed(2);
            const evalBy = r.evaluatedBy || '1-min'; // Fallback added property

            return `${date},${sym},${dir},${type},${outcome},${entry},${stop},${t1},${exitP},${exitT},${rMult},${evalBy}`;
        });

        fs.writeFileSync('ib_backtest_results.csv', csvHeaders + csvRows.join('\n'), 'utf8');
        console.log(`\n💾 Exported detailed results to: ib_backtest_results.csv`);
    } catch (e) {
        console.log(`\n⚠️ Failed to export CSV: ${e.message}`);
    }

    await prisma.$disconnect();
}

// CLI
const args = process.argv.slice(2);
const startDate = args[0] || '2026-02-23';
const endDate = args[1] || '2026-03-02';

runBacktest(startDate, endDate).catch(e => { console.error('ERROR:', e); process.exit(1); });
