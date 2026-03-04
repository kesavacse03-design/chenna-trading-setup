/**
 * DEEP VERIFICATION SCRIPT — Pro Trader Audit
 * 
 * Answers ALL 7 questions with PROOF:
 * 1. IOC entry price ₹159 — where did it come from?
 * 2. KOTAKBANK entry price ₹411 — matches chart?
 * 3. Stocks checked per day — bug or correct?
 * 4. Already-in-position skip check
 * 5. maxHoldDays config
 * 6. Single-stock trace (IOC)
 * 7. Gap filter check
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

function toISTDateString(date) {
    const d = new Date(date);
    d.setMinutes(d.getMinutes() + 330);
    return d.toISOString().split('T')[0];
}

async function main() {
    console.log('═══════════════════════════════════════════════════');
    console.log('  DEEP VERIFICATION — SHORT_TERM_SWING_BO_UP');
    console.log('═══════════════════════════════════════════════════\n');

    // ─── STEP 1: IOC CANDLE DATA ───────────────────────────────
    console.log('═══ STEP 1: IOC OHLCV CANDLES (Feb 1-10) ═══\n');

    const iocCache = await prisma.ohlcvCache.findFirst({
        where: { symbol: 'IOC', interval: 'day' },
        orderBy: { createdAt: 'desc' }
    });

    if (iocCache && iocCache.data && Array.isArray(iocCache.data)) {
        const filtered = iocCache.data
            .filter(c => {
                const dt = String(c.timestamp || c.date || '');
                const d = dt.includes('T') ? dt.split('T')[0] : dt.split(' ')[0];
                return d >= '2026-01-28' && d <= '2026-02-10';
            })
            .sort((a, b) => new Date(a.timestamp || a.date) - new Date(b.timestamp || b.date));

        console.log('| Date       | Open     | High     | Low      | Close    | Volume     |');
        console.log('|------------|----------|----------|----------|----------|------------|');
        filtered.forEach(c => {
            const dt = String(c.timestamp || c.date || '');
            const d = dt.includes('T') ? dt.split('T')[0] : dt.split(' ')[0];
            console.log(`| ${d} | ${String(c.open).padStart(8)} | ${String(c.high).padStart(8)} | ${String(c.low).padStart(8)} | ${String(c.close).padStart(8)} | ${String(c.volume).padStart(10)} |`);
        });

        if (filtered.length === 0) {
            console.log('  ❌ No IOC candles found in range Feb 1-10!');
            console.log(`  Cache has ${iocCache.data.length} total candles.`);
            // Show last 5 candles to understand range
            const last5 = iocCache.data.slice(-5);
            console.log('  Last 5 candles in cache:');
            last5.forEach(c => {
                const dt = String(c.timestamp || c.date || '');
                console.log(`    ${dt} O:${c.open} C:${c.close}`);
            });
        }
    } else {
        console.log('  ❌ No IOC cache entry found!');
    }

    // ─── STEP 2: KOTAKBANK CANDLE DATA ─────────────────────────
    console.log('\n═══ STEP 2: KOTAKBANK OHLCV CANDLES (Feb 5-15) ═══\n');

    const kotakCache = await prisma.ohlcvCache.findFirst({
        where: { symbol: 'KOTAKBANK', interval: 'day' },
        orderBy: { createdAt: 'desc' }
    });

    if (kotakCache && kotakCache.data && Array.isArray(kotakCache.data)) {
        const filtered = kotakCache.data
            .filter(c => {
                const dt = String(c.timestamp || c.date || '');
                const d = dt.includes('T') ? dt.split('T')[0] : dt.split(' ')[0];
                return d >= '2026-02-01' && d <= '2026-02-15';
            })
            .sort((a, b) => new Date(a.timestamp || a.date) - new Date(b.timestamp || b.date));

        console.log('| Date       | Open     | High     | Low      | Close    | Volume     |');
        console.log('|------------|----------|----------|----------|----------|------------|');
        filtered.forEach(c => {
            const dt = String(c.timestamp || c.date || '');
            const d = dt.includes('T') ? dt.split('T')[0] : dt.split(' ')[0];
            console.log(`| ${d} | ${String(c.open).padStart(8)} | ${String(c.high).padStart(8)} | ${String(c.low).padStart(8)} | ${String(c.close).padStart(8)} | ${String(c.volume).padStart(10)} |`);
        });

        if (filtered.length === 0) {
            console.log('  ❌ No KOTAKBANK candles found in range!');
        }
    } else {
        console.log('  ❌ No KOTAKBANK cache entry found!');
    }

    // ─── STEP 3: STOCKS ADDED PER DAY ──────────────────────────
    console.log('\n═══ STEP 3: STOCKS ADDED PER DAY (Feb 1-20) ═══\n');

    const cat = await prisma.category.findFirst({ where: { key: 'SHORT_TERM_SWING_BO_UP' } });
    if (cat) {
        const entries = await prisma.stockCategory.findMany({
            where: {
                categoryId: cat.id,
                addedDate: {
                    gte: new Date('2026-02-01T00:00:00+05:30'),
                    lte: new Date('2026-02-20T23:59:59+05:30')
                }
            },
            include: { stock: true },
            orderBy: { addedDate: 'asc' }
        });

        // Group by date
        const byDate = {};
        entries.forEach(e => {
            const d = toISTDateString(e.addedDate);
            if (!byDate[d]) byDate[d] = [];
            byDate[d].push(e.stock?.symbol || 'unknown');
        });

        let totalStocksAdded = 0;
        Object.keys(byDate).sort().forEach(d => {
            totalStocksAdded += byDate[d].length;
            console.log(`  ${d}: ${byDate[d].length} stocks added → ${byDate[d].slice(0, 10).join(', ')}${byDate[d].length > 10 ? '...' : ''}`);
        });
        console.log(`\n  TOTAL STOCKS ADDED in Feb 1-20: ${totalStocksAdded}`);
        console.log(`  UNIQUE TRADING DAYS: ${Object.keys(byDate).length}`);
        console.log(`  AVG PER DAY: ${(totalStocksAdded / Object.keys(byDate).length).toFixed(1)}`);
        console.log(`\n  ⚠️  If "Stocks Checked" = 653 in 16 days,`);
        console.log(`      and total added = ${totalStocksAdded},`);
        if (totalStocksAdded < 100) {
            console.log(`      🚨 BUG CONFIRMED: 653 ≠ ${totalStocksAdded}. Re-checking stocks already processed!`);
        } else {
            console.log(`      ✅ Possibly correct: checking ~${(totalStocksAdded / Object.keys(byDate).length).toFixed(0)} per day`);
        }
    }

    // ─── STEP 4: ALREADY-IN-POSITION CHECK ─────────────────────
    console.log('\n═══ STEP 4: DUPLICATE POSITION CHECK ═══\n');

    // Check the latest backtest run for duplicate symbols
    const latestRun = await prisma.backtestRun.findFirst({
        where: { categoryKey: 'SHORT_TERM_SWING_BO_UP' },
        orderBy: { createdAt: 'desc' }
    });

    if (latestRun) {
        const trades = await prisma.backtestTrade.findMany({
            where: { backtestRunId: latestRun.id },
            orderBy: { signalDate: 'asc' }
        });

        // Check for overlapping positions (same symbol bought while still holding)
        const overlaps = [];
        for (let i = 0; i < trades.length; i++) {
            for (let j = i + 1; j < trades.length; j++) {
                if (trades[i].symbol === trades[j].symbol) {
                    const exitI = trades[i].exitDate;
                    const entryJ = trades[j].entryDate || trades[j].signalDate;
                    if (exitI && entryJ && entryJ < exitI) {
                        overlaps.push({
                            symbol: trades[i].symbol,
                            trade1: `#${trades[i].tradeNumber} (${toISTDateString(trades[i].signalDate)} → ${toISTDateString(exitI)})`,
                            trade2: `#${trades[j].tradeNumber} (entry ${toISTDateString(entryJ)} while #${trades[i].tradeNumber} still open)`
                        });
                    }
                }
            }
        }

        if (overlaps.length > 0) {
            console.log(`  🚨 FOUND ${overlaps.length} OVERLAPPING POSITIONS:`);
            overlaps.forEach(o => {
                console.log(`    ${o.symbol}: ${o.trade1} ↔ ${o.trade2}`);
            });
        } else {
            console.log('  ✅ No overlapping positions found. Duplicate check is working.');
        }

        // Show duplicate symbols
        const symbolCounts = {};
        trades.forEach(t => { symbolCounts[t.symbol] = (symbolCounts[t.symbol] || 0) + 1; });
        const dupes = Object.entries(symbolCounts).filter(([_, c]) => c > 1);
        if (dupes.length > 0) {
            console.log(`\n  Symbols traded multiple times (non-overlapping):`);
            dupes.forEach(([sym, cnt]) => console.log(`    ${sym}: ${cnt} trades`));
        }
    }

    // ─── STEP 5: maxHoldDays CONFIG ────────────────────────────
    console.log('\n═══ STEP 5: maxHoldDays CONFIGURATION ═══\n');

    try {
        const strategyManager = require('../services/labs/strategyManager.cjs');
        const config = strategyManager.getStrategyConfig('SHORT_TERM_SWING_BO_UP');
        console.log(`  maxHoldDays: ${config.maxHoldDays || 'NOT SET (default 20)'}`);
        console.log(`  direction: ${config.direction}`);
        console.log(`  validDays: ${JSON.stringify(config.validDays)}`);
        console.log(`  avoidMonths: ${JSON.stringify(config.avoidMonths)}`);
        if (config.positionSizing) {
            console.log(`  positionSizing: ${JSON.stringify(config.positionSizing)}`);
        }
    } catch (e) {
        console.log(`  ⚠️ Could not load strategyManager: ${e.message}`);
        console.log('  Checking backtestEngine default...');
        console.log('  Default in backtestEngine.cjs: maxHoldDays = config.maxHoldDays || 20');
    }

    // ─── STEP 6: SINGLE-STOCK TRACE (IOC) ──────────────────────
    console.log('\n═══ STEP 6: SINGLE-STOCK TRACE — IOC ═══\n');

    if (cat) {
        // When was IOC added?
        const iocEntry = await prisma.stockCategory.findFirst({
            where: {
                categoryId: cat.id,
                stock: { symbol: 'IOC' }
            },
            include: { stock: true },
            orderBy: { addedDate: 'desc' }
        });

        if (iocEntry) {
            console.log(`  Category Addition Date: ${toISTDateString(iocEntry.addedDate)}`);
        } else {
            console.log('  ❌ IOC not found in SHORT_TERM_SWING_BO_UP!');
        }
    }

    if (latestRun) {
        const iocTrade = await prisma.backtestTrade.findFirst({
            where: { backtestRunId: latestRun.id, symbol: 'IOC' },
            orderBy: { signalDate: 'asc' }
        });

        if (iocTrade) {
            console.log(`  Signal Date:    ${toISTDateString(iocTrade.signalDate)}`);
            console.log(`  Entry Date:     ${toISTDateString(iocTrade.entryDate)}`);
            console.log(`  Entry Price:    ₹${iocTrade.entryPrice}`);
            console.log(`  Target Price:   ₹${iocTrade.targetPrice?.toFixed(2) || 'N/A'}`);
            console.log(`  Stop Price:     ₹${iocTrade.stopPrice?.toFixed(2) || 'N/A'}`);
            console.log(`  Quantity:       ${iocTrade.quantity}`);
            console.log(`  Position Value: ₹${iocTrade.positionValue?.toFixed(2) || 'N/A'}`);
            console.log(`  Exit Date:      ${iocTrade.exitDate ? toISTDateString(iocTrade.exitDate) : 'STILL OPEN'}`);
            console.log(`  Exit Price:     ${iocTrade.exitPrice ? '₹' + iocTrade.exitPrice.toFixed(2) : 'N/A'}`);
            console.log(`  Exit Reason:    ${iocTrade.exitReason || 'N/A'}`);
            console.log(`  Days Held:      ${iocTrade.daysHeld || 'N/A'}`);
            console.log(`  P&L:            ₹${iocTrade.pnl?.toFixed(2) || 'N/A'}`);
            console.log(`  P&L %:          ${iocTrade.pnlPercent?.toFixed(2) || 'N/A'}%`);
            console.log(`  Outcome:        ${iocTrade.outcome || 'N/A'}`);

            // Now cross-reference entry price with candle data
            if (iocCache && iocCache.data) {
                const entryDateStr = toISTDateString(iocTrade.entryDate);
                const signalDateStr = toISTDateString(iocTrade.signalDate);

                const signalCandle = iocCache.data.find(c => {
                    const dt = String(c.timestamp || c.date || '');
                    const d = dt.includes('T') ? dt.split('T')[0] : dt.split(' ')[0];
                    return d === signalDateStr;
                });

                const entryCandle = iocCache.data.find(c => {
                    const dt = String(c.timestamp || c.date || '');
                    const d = dt.includes('T') ? dt.split('T')[0] : dt.split(' ')[0];
                    return d === entryDateStr;
                });

                console.log('\n  ─── CROSS-REFERENCE ───');
                if (signalCandle) {
                    console.log(`  Signal Day (${signalDateStr}) Candle: O=${signalCandle.open} H=${signalCandle.high} L=${signalCandle.low} C=${signalCandle.close}`);
                } else {
                    console.log(`  Signal Day (${signalDateStr}) Candle: ❌ NOT FOUND IN CACHE`);
                }
                if (entryCandle) {
                    console.log(`  Entry Day  (${entryDateStr}) Candle: O=${entryCandle.open} H=${entryCandle.high} L=${entryCandle.low} C=${entryCandle.close}`);
                } else {
                    console.log(`  Entry Day  (${entryDateStr}) Candle: ❌ NOT FOUND IN CACHE`);
                }

                console.log(`\n  DB Entry Price: ₹${iocTrade.entryPrice}`);
                if (signalCandle) {
                    console.log(`  Signal Day Close: ₹${signalCandle.close}`);
                    if (Math.abs(iocTrade.entryPrice - signalCandle.close) < 0.5) {
                        console.log('  🚨 MATCH: Entry Price = Signal Day CLOSE (should be Entry Day OPEN!)');
                    }
                }
                if (entryCandle) {
                    console.log(`  Entry Day Open: ₹${entryCandle.open}`);
                    if (Math.abs(iocTrade.entryPrice - entryCandle.open) < 0.5) {
                        console.log('  ✅ MATCH: Entry Price = Entry Day OPEN (correct!)');
                    } else {
                        console.log(`  🚨 MISMATCH: Entry Price ₹${iocTrade.entryPrice} ≠ Entry Day Open ₹${entryCandle.open}`);
                        console.log(`    Difference: ₹${Math.abs(iocTrade.entryPrice - entryCandle.open).toFixed(2)} (${(Math.abs(iocTrade.entryPrice - entryCandle.open) / entryCandle.open * 100).toFixed(2)}%)`);
                    }
                }
            }
        } else {
            console.log('  ❌ No IOC trade found in latest backtest run');
        }
    }

    // ─── STEP 7: GAP FILTER CHECK ──────────────────────────────
    console.log('\n═══ STEP 7: GAP/ENTRY RANGE FILTER ═══\n');

    if (latestRun) {
        const allTrades = await prisma.backtestTrade.findMany({
            where: { backtestRunId: latestRun.id },
            orderBy: { signalDate: 'asc' }
        });

        console.log(`  Total trades in latest run: ${allTrades.length}`);

        // Check each trade for gap between signal close and entry open
        let gapsFound = 0;
        for (const t of allTrades.slice(0, 10)) { // Check first 10
            const signalDateStr = toISTDateString(t.signalDate);
            const entryDateStr = toISTDateString(t.entryDate);

            // Look up both candles
            const cache = await prisma.ohlcvCache.findFirst({
                where: { symbol: t.symbol, interval: 'day' },
                orderBy: { createdAt: 'desc' }
            });

            if (cache && cache.data) {
                const signalCandle = cache.data.find(c => {
                    const dt = String(c.timestamp || c.date || '');
                    return (dt.includes('T') ? dt.split('T')[0] : dt.split(' ')[0]) === signalDateStr;
                });
                const entryCandle = cache.data.find(c => {
                    const dt = String(c.timestamp || c.date || '');
                    return (dt.includes('T') ? dt.split('T')[0] : dt.split(' ')[0]) === entryDateStr;
                });

                if (signalCandle && entryCandle) {
                    const gapPct = ((entryCandle.open - signalCandle.close) / signalCandle.close * 100).toFixed(2);
                    const flag = Math.abs(gapPct) > 3 ? '🚨' : '✅';
                    console.log(`  ${flag} ${t.symbol.padEnd(12)} Signal Close: ₹${signalCandle.close.toFixed(2).padStart(8)} → Entry Open: ₹${entryCandle.open.toFixed(2).padStart(8)} | Gap: ${gapPct.padStart(6)}%  | Entry Used: ₹${t.entryPrice}`);
                    if (Math.abs(gapPct) > 3) gapsFound++;
                }
            }
        }

        if (gapsFound > 0) {
            console.log(`\n  ⚠️  ${gapsFound} trades entered with >3% gap — needs entry range filter!`);
        } else {
            console.log('\n  ✅ All checked trades had reasonable gaps (<3%)');
        }
    }

    console.log('\n═══════════════════════════════════════════════════');
    console.log('  VERIFICATION COMPLETE');
    console.log('═══════════════════════════════════════════════════');

    await prisma.$disconnect();
}

main().catch(e => {
    console.error('Fatal error:', e);
    process.exit(1);
});
