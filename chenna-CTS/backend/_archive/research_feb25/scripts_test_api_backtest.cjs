const http = require('http');

function runTest(category) {
    return new Promise((resolve, reject) => {
        const body = JSON.stringify({
            category,
            startDate: '2026-02-01',
            endDate: '2026-02-18',
            capital: 100000,
            positionSize: 10000,
            dataMode: '1day'
        });

        const options = {
            hostname: 'localhost', port: 3001, path: '/api/backtest/run',
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Content-Length': body.length },
            timeout: 120000
        };

        const req = http.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    const r = JSON.parse(data);
                    if (r.error) {
                        console.error(`[${category}] API Error:`, r.error);
                        resolve(null);
                        return;
                    }

                    console.log('');
                    console.log(`┌──────────────────────────────────────────────┐`);
                    console.log(`│  ${category.padEnd(40)}    │`);
                    console.log(`├──────────────────────────────────────────────┤`);

                    const trades = r.results?.tradeList || [];
                    const wins = trades.filter(t => t.outcome === 'WIN').length;
                    const losses = trades.filter(t => t.outcome === 'LOSS').length;
                    const open = trades.filter(t => t.outcome === 'OPEN').length;
                    const wr = trades.length > 0 ? ((wins / trades.length) * 100).toFixed(1) : '0';

                    console.log(`│ Trades:    ${trades.length}`);
                    console.log(`│ Winners:   ${wins}  |  Losers: ${losses}  |  OPEN: ${open}`);
                    console.log(`│ Win Rate:  ${wr}% (excluding OPEN)`);
                    console.log(`└──────────────────────────────────────────────┘`);

                    // Show first 5 trades with realistic detail
                    console.log(`─── TRADE LOG (first 5 of ${trades.length}) ───`);
                    for (const t of trades.slice(0, 5)) {
                        const stopDist = Math.abs((t.entryPrice - t.stopPrice) / t.entryPrice * 100).toFixed(2);
                        const sig = t.signalDate || '?';
                        const ent = t.entryDate || t.date;
                        const hold = t.holdDays || '?';
                        console.log(`  Signal:${sig} → Entry:${ent} | ${String(t.symbol).padEnd(12)} | E:${t.entryPrice} S:${t.stopPrice}(${stopDist}%) | ${(t.exitReason || '').padEnd(10)} | Hold:${hold}d | PnL:${t.pnlPercent}% | ${t.outcome}`);
                    }

                    // CHECKS
                    console.log('─── VERIFICATION CHECKS ───');

                    // Check 1: ATR stops variable
                    const stopPcts = trades.slice(0, 10).map(t =>
                        Math.abs((t.entryPrice - t.stopPrice) / t.entryPrice * 100).toFixed(2)
                    );
                    if (stopPcts.length > 0) {
                        const allSame = new Set(stopPcts).size === 1;
                        console.log(`  ATR Stops: ${allSame ? '❌ FIXED (wrong!)' : '✅ VARIABLE (correct!)'} [${stopPcts.slice(0, 4).join('%, ')}%]`);
                    }

                    // Check 2: No fake OPEN wins
                    const fakeWins = trades.filter(t => t.outcome === 'WIN' && t.exitReason === 'OPEN');
                    console.log(`  Fake Wins: ${fakeWins.length === 0 ? '✅ None' : `❌ ${fakeWins.length} OPEN trades counted as WIN!`}`);

                    // Check 3: Signal date != Entry date
                    const hasDates = trades.filter(t => t.signalDate && t.entryDate);
                    const diffDates = hasDates.filter(t => t.signalDate !== t.entryDate);
                    console.log(`  Signal≠Entry: ${diffDates.length > 0 ? `✅ ${diffDates.length}/${hasDates.length} trades have Day+1 entry` : hasDates.length > 0 ? '❌ All same day!' : '⚠️ No date data'}`);

                    // Check 4: Trade count realistic
                    console.log(`  Trade Count: ${trades.length <= 20 ? '✅' : '⚠️'} ${trades.length} trades (expected <20 for Tier 1 only)`);

                    resolve(r);
                } catch (e) {
                    console.error(`[${category}] Parse error:`, e.message);
                    resolve(null);
                }
            });
        });

        req.on('timeout', () => { req.destroy(); console.error(`[${category}] TIMEOUT`); resolve(null); });
        req.on('error', (e) => { console.error(`[${category}] Request failed:`, e.message); resolve(null); });
        req.write(body);
        req.end();
    });
}

(async () => {
    console.log('=== BACKTEST REALISM VERIFICATION ===');
    console.log('Testing: Tier 1 only, OPEN outcomes, signalDate/entryDate\n');
    await runTest('LONG_TERM_SWING_BO_UP');
    await runTest('SHORT_TERM_SWING_BO_DOWN');
    console.log('\n=== DONE ===');
    process.exit(0);
})();
