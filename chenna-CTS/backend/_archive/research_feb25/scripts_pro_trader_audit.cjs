/**
 * PRO TRADER DEEP AUDIT — 5 Stock Verification
 * 
 * For each trade in the latest backtest:
 * 1. Fetch OHLCV from DB cache
 * 2. Compare Entry Price vs actual Day+1 OPEN
 * 3. Verify P&L math: (exit - entry) / entry * 100
 * 4. Check stop/target calculation sanity
 * 5. Verify exit price is within candle range
 * 6. Check gap between signal close and entry open
 * 7. Verify signal date is within backtest period
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

function toISTDateString(date) {
    if (!date) return '';
    const d = new Date(date);
    d.setMinutes(d.getMinutes() + 330);
    return d.toISOString().split('T')[0];
}

function findCandle(data, dateStr) {
    if (!data || !Array.isArray(data)) return null;
    return data.find(c => {
        const ts = String(c.timestamp || c.date || '');
        const d = ts.includes('T') ? ts.split('T')[0] : ts.split(' ')[0];
        return d === dateStr;
    });
}

async function main() {
    console.log('═══════════════════════════════════════════════════');
    console.log('  PRO TRADER DEEP AUDIT — 5 Stock Verification');
    console.log('═══════════════════════════════════════════════════\n');

    // Get latest backtest run
    const run = await prisma.backtestRun.findFirst({
        where: { categoryKey: 'SHORT_TERM_SWING_BO_UP' },
        orderBy: { createdAt: 'desc' }
    });

    if (!run) {
        console.log('❌ No backtest run found!');
        return;
    }

    console.log(`Run ID: ${run.id}`);
    console.log(`Period: ${toISTDateString(run.startDate)} → ${toISTDateString(run.endDate)}`);
    console.log(`Created: ${run.createdAt.toISOString()}`);
    console.log(`Status: ${run.status}`);
    console.log(`Execution Mode: ${run.executionMode}`);
    console.log();

    // Get all trades
    const trades = await prisma.backtestTrade.findMany({
        where: { backtestRunId: run.id },
        orderBy: { tradeNumber: 'asc' }
    });

    console.log(`Total Trades: ${trades.length}\n`);

    let bugsFound = 0;
    const auditResults = [];

    // Audit each trade (up to 5 for focused analysis, all for summary)  
    const samplesToAudit = trades.slice(0, Math.min(trades.length, 13)); // Audit ALL trades

    for (const trade of samplesToAudit) {
        const signalDateStr = toISTDateString(trade.signalDate);
        const entryDateStr = toISTDateString(trade.entryDate);
        const exitDateStr = trade.exitDate ? toISTDateString(trade.exitDate) : null;

        console.log(`═══ Trade #${trade.tradeNumber}: ${trade.symbol} ═══`);
        console.log(`  Signal Date: ${signalDateStr}`);
        console.log(`  Entry Date:  ${entryDateStr}`);
        console.log(`  Entry Price: ₹${trade.entryPrice}`);
        console.log(`  Target:      ₹${trade.targetPrice?.toFixed(2) || 'N/A'}`);
        console.log(`  Stop:        ₹${trade.stopPrice?.toFixed(2) || 'N/A'}`);
        console.log(`  Exit Date:   ${exitDateStr || 'OPEN'}`);
        console.log(`  Exit Price:  ${trade.exitPrice ? '₹' + trade.exitPrice.toFixed(2) : 'N/A'}`);
        console.log(`  Exit Reason: ${trade.exitReason || 'N/A'}`);
        console.log(`  P&L:         ${trade.pnlPercent?.toFixed(2) || '0.00'}%`);
        console.log(`  Outcome:     ${trade.outcome || 'N/A'}`);

        // CHECK 1: Signal date within backtest period
        const startStr = toISTDateString(run.startDate);
        const endStr = toISTDateString(run.endDate);
        if (signalDateStr < startStr || signalDateStr > endStr) {
            console.log(`  🚨 BUG 1: Signal ${signalDateStr} is OUTSIDE backtest period ${startStr}→${endStr}`);
            bugsFound++;
        }

        // CHECK 2: Entry date = Signal date + 1 trading day
        if (entryDateStr <= signalDateStr) {
            console.log(`  🚨 BUG 2: Entry ${entryDateStr} ≤ Signal ${signalDateStr} — TIME TRAVEL!`);
            bugsFound++;
        }

        // Fetch OHLCV data
        const cache = await prisma.ohlcvCache.findFirst({
            where: { symbol: trade.symbol, interval: 'day' },
            orderBy: { createdAt: 'desc' }
        });

        if (!cache || !cache.data) {
            console.log(`  ⚠️ No OHLCV cache for ${trade.symbol}`);
            console.log();
            continue;
        }

        const signalCandle = findCandle(cache.data, signalDateStr);
        const entryCandle = findCandle(cache.data, entryDateStr);
        const exitCandle = exitDateStr ? findCandle(cache.data, exitDateStr) : null;

        // CHECK 3: Entry price vs actual Day+1 OPEN
        if (signalCandle) {
            console.log(`  Signal Candle (${signalDateStr}): O=${signalCandle.open} H=${signalCandle.high} L=${signalCandle.low} C=${signalCandle.close}`);
        } else {
            console.log(`  ⚠️ Signal candle (${signalDateStr}) NOT in cache!`);
        }

        if (entryCandle) {
            console.log(`  Entry Candle  (${entryDateStr}): O=${entryCandle.open} H=${entryCandle.high} L=${entryCandle.low} C=${entryCandle.close}`);

            const actualOpen = entryCandle.open;
            const diff = Math.abs(trade.entryPrice - actualOpen);
            const diffPct = (diff / actualOpen * 100).toFixed(2);

            if (diff > 0.5) {
                console.log(`  🚨 BUG 3: Entry Price ₹${trade.entryPrice} ≠ Day+1 Open ₹${actualOpen} (diff: ₹${diff.toFixed(2)} = ${diffPct}%)`);

                // Where did the entry price come from?
                if (signalCandle && Math.abs(trade.entryPrice - signalCandle.close) < 0.5) {
                    console.log(`        → Entry = Signal Day CLOSE ₹${signalCandle.close} (Day+1 update FAILED)`);
                } else if (signalCandle && Math.abs(trade.entryPrice - signalCandle.open) < 0.5) {
                    console.log(`        → Entry = Signal Day OPEN ₹${signalCandle.open} (completely wrong date!)`);
                } else {
                    // Check stock's lastPrice
                    const stock = await prisma.stock.findFirst({ where: { symbol: trade.symbol } });
                    if (stock) {
                        console.log(`        → Stock DB lastPrice: ₹${stock.lastPrice}, close: ₹${stock.close}`);
                        if (Math.abs(trade.entryPrice - (stock.lastPrice || 0)) < 1) {
                            console.log(`        → Entry = STALE stock.lastPrice (fallback used, OHLCV fetch FAILED)`);
                        }
                    }
                }
                bugsFound++;
            } else {
                console.log(`  ✅ Entry Price matches Day+1 Open (diff: ₹${diff.toFixed(2)})`);
            }

            // CHECK 3b: Gap between signal close and entry open
            if (signalCandle) {
                const gapPct = ((actualOpen - signalCandle.close) / signalCandle.close * 100).toFixed(2);
                if (Math.abs(gapPct) > 3) {
                    console.log(`  ⚠️ LARGE GAP: Signal Close ₹${signalCandle.close} → Entry Open ₹${actualOpen} = ${gapPct}%`);
                }
            }
        } else {
            console.log(`  ⚠️ Entry candle (${entryDateStr}) NOT in cache!`);
        }

        // CHECK 4: P&L math verification
        if (trade.exitPrice && trade.entryPrice && trade.exitReason !== 'BACKTEST_END') {
            const expectedPnlPct = ((trade.exitPrice - trade.entryPrice) / trade.entryPrice) * 100;
            const actualPnlPct = trade.pnlPercent || 0;

            if (Math.abs(expectedPnlPct - actualPnlPct) > 0.1) {
                console.log(`  🚨 BUG 4: P&L MATH WRONG!`);
                console.log(`        Expected: (₹${trade.exitPrice} - ₹${trade.entryPrice}) / ₹${trade.entryPrice} = ${expectedPnlPct.toFixed(2)}%`);
                console.log(`        DB shows: ${actualPnlPct.toFixed(2)}%`);
                bugsFound++;
            }

            // CHECK 4b: Outcome consistency
            if (expectedPnlPct > 0 && trade.outcome === 'LOSS') {
                console.log(`  🚨 BUG 4b: P&L positive but outcome=${trade.outcome}!`);
                bugsFound++;
            }
            if (expectedPnlPct < 0 && trade.outcome === 'WIN') {
                console.log(`  🚨 BUG 4b: P&L negative but outcome=${trade.outcome}!`);
                bugsFound++;
            }
        }

        // CHECK 5: Exit price within candle range (if not BACKTEST_END)
        if (exitCandle && trade.exitReason !== 'BACKTEST_END') {
            if (trade.exitPrice < exitCandle.low || trade.exitPrice > exitCandle.high) {
                console.log(`  🚨 BUG 5: Exit ₹${trade.exitPrice?.toFixed(2)} OUTSIDE candle range [₹${exitCandle.low}, ₹${exitCandle.high}]`);
                bugsFound++;
            }
        }

        // CHECK 6: Stop/Target sanity for LONG
        if (trade.stopPrice && trade.targetPrice && trade.entryPrice) {
            if (trade.stopPrice > trade.entryPrice) {
                console.log(`  🚨 BUG 6: Stop ₹${trade.stopPrice?.toFixed(2)} ABOVE entry ₹${trade.entryPrice} for LONG!`);
                bugsFound++;
            }
            if (trade.targetPrice < trade.entryPrice) {
                console.log(`  🚨 BUG 6: Target ₹${trade.targetPrice?.toFixed(2)} BELOW entry ₹${trade.entryPrice} for LONG!`);
                bugsFound++;
            }

            // Risk/Reward ratio
            const risk = trade.entryPrice - trade.stopPrice;
            const reward = trade.targetPrice - trade.entryPrice;
            if (risk > 0) {
                const rr = (reward / risk).toFixed(1);
                console.log(`  R:R = ${rr}:1 (Risk: ₹${risk.toFixed(2)}, Reward: ₹${reward.toFixed(2)})`);
            }
        }

        // CHECK 7: TRAILING_STOP_PROFIT — exit should be between original stop and target
        if (trade.exitReason === 'TRAILING_STOP_PROFIT' && trade.exitPrice) {
            if (trade.exitPrice < trade.entryPrice) {
                console.log(`  🚨 BUG 7: TRAILING_STOP_PROFIT exit ₹${trade.exitPrice?.toFixed(2)} is BELOW entry ₹${trade.entryPrice} — should be STOP/LOSS!`);
                bugsFound++;
            }
        }

        console.log();
    }

    // SUMMARY
    console.log('═══════════════════════════════════════════════════');
    console.log(`  AUDIT SUMMARY: ${bugsFound} bugs found in ${samplesToAudit.length} trades`);
    console.log('═══════════════════════════════════════════════════');

    // Count trade issues by type
    let wrongEntryCount = 0;
    let trailingStopBelowEntry = 0;
    let pnlMathWrong = 0;

    for (const trade of trades) {
        const entryDateStr = toISTDateString(trade.entryDate);
        const cache = await prisma.ohlcvCache.findFirst({
            where: { symbol: trade.symbol, interval: 'day' },
            orderBy: { createdAt: 'desc' }
        });
        if (cache?.data) {
            const entryCandle = findCandle(cache.data, entryDateStr);
            if (entryCandle && Math.abs(trade.entryPrice - entryCandle.open) > 0.5) {
                wrongEntryCount++;
            }
        }

        if (trade.exitReason === 'TRAILING_STOP_PROFIT' && trade.exitPrice < trade.entryPrice) {
            trailingStopBelowEntry++;
        }

        if (trade.exitPrice && trade.exitReason !== 'BACKTEST_END') {
            const expectedPnl = ((trade.exitPrice - trade.entryPrice) / trade.entryPrice) * 100;
            if (Math.abs(expectedPnl - (trade.pnlPercent || 0)) > 0.1) {
                pnlMathWrong++;
            }
        }
    }

    console.log(`  Wrong entry prices:          ${wrongEntryCount}/${trades.length}`);
    console.log(`  TRAILING_STOP below entry:   ${trailingStopBelowEntry}/${trades.length}`);
    console.log(`  P&L math errors:             ${pnlMathWrong}/${trades.length}`);

    await prisma.$disconnect();
}

main().catch(e => {
    console.error('Fatal:', e);
    process.exit(1);
});
