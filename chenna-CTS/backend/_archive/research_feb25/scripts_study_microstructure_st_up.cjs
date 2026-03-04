const path = require('path');
const fs = require('fs');
const priceService = require('../services/priceService.cjs');
const prisma = require('../lib/prisma.cjs');

function toISTDateString(date) {
    const d = new Date(date);
    d.setMinutes(d.getMinutes() + 330);
    return d.toISOString().split('T')[0];
}

async function main() {
    console.log('═══════════════════════════════════════════════════════');
    console.log(' MICROSTRUCTURE & LIMIT ORDER STUDY (ST_SWING_BO_UP) ');
    console.log('═══════════════════════════════════════════════════════');

    const cat = await prisma.category.findUnique({ where: { key: 'SHORT_TERM_SWING_BO_UP' } });
    if (!cat) process.exit(1);

    const stockEntries = await prisma.stockCategory.findMany({
        where: { categoryId: cat.id },
        include: { stock: true }
    });

    const uniqueMap = new Map();
    for (const sc of stockEntries) {
        const dStr = toISTDateString(sc.addedDate);
        uniqueMap.set(`${sc.stock.symbol}_${dStr}`, {
            symbol: sc.stock.symbol,
            instrumentKey: sc.stock.instrumentKey,
            addedDate: dStr
        });
    }
    const targetStocks = Array.from(uniqueMap.values());
    console.log(`\n\u2705 Found ${targetStocks.length} original signals to study...`);

    let totalValidSignals = 0;

    // Study A Stats
    let sA = { count: 0, rangeSum: 0, upWickSum: 0, lowWickSum: 0, bodySum: 0, closePosSum: 0, gapSum: 0, lowVsSigSum: 0 };
    let bestEntrySumPct = 0;
    let bestPnlSumPct = 0;
    let bestWins = 0;

    // Study B Stats
    let earlyLows = 0; // Green close
    let lateLows = 0; // Red close

    // Study C Stats
    let exhaustionSignals = 0;
    let exhausIsBest = 0;

    // Study D Stats
    const dStats = {
        opt1: { fills: 0, wins: 0, sumPnl: 0 },
        opt2: { fills: 0, wins: 0, sumPnl: 0 },
        opt3: { fills: 0, wins: 0, sumPnl: 0 },
        opt4: { fills: 0, wins: 0, sumPnl: 0 }
    };

    const BATCH_SIZE = 5;
    for (let i = 0; i < targetStocks.length; i += BATCH_SIZE) {
        process.stdout.write('.');
        const batch = targetStocks.slice(i, i + BATCH_SIZE);
        for (const s of batch) {
            const fetchFrom = toISTDateString(new Date(new Date(s.addedDate).getTime() - 5 * 86400000));
            const fetchTo = toISTDateString(new Date(new Date(s.addedDate).getTime() + 30 * 86400000));

            const raw = await priceService.fetchPrice(s.symbol, s.instrumentKey, fetchFrom, fetchTo);
            if (!raw || raw.length === 0) continue;

            const candles = raw.map(c => ({
                date: String(c.timestamp || c.date).split('T')[0].split(' ')[0],
                open: parseFloat(c.open), high: parseFloat(c.high),
                low: parseFloat(c.low), close: parseFloat(c.close),
                volume: parseFloat(c.volume || 0)
            })).sort((a, b) => a.date.localeCompare(b.date));

            const sigIdx = candles.findIndex(c => c.date === s.addedDate);
            if (sigIdx === -1 || sigIdx + 10 >= candles.length) continue; // need 10 days of holding

            totalValidSignals++;

            const sig = candles[sigIdx];
            const sigClose = sig.close;
            const sigVol = sig.volume;
            const day10Close = candles[sigIdx + 10].close;

            // --- STUDY A: Microstructure & Optimal Entry ---
            let bestEntryPrice = Infinity;
            let bestEntryDay = -1;

            for (let d = 1; d <= 5; d++) {
                const c = candles[sigIdx + d];
                const prev = candles[sigIdx + d - 1];

                // Day stats
                const hL = c.high - c.low;
                if (hL > 0) {
                    sA.rangeSum += (hL / c.low) * 100;
                    sA.upWickSum += ((c.high - Math.max(c.open, c.close)) / hL) * 100;
                    sA.lowWickSum += ((Math.min(c.open, c.close) - c.low) / hL) * 100;
                    sA.bodySum += (Math.abs(c.close - c.open) / hL) * 100;
                    sA.closePosSum += ((c.close - c.low) / hL) * 100;
                }
                sA.gapSum += ((c.open - prev.close) / prev.close) * 100;
                sA.lowVsSigSum += ((c.low - sigClose) / sigClose) * 100;
                sA.count++;

                // Optimal
                if (c.low < bestEntryPrice) {
                    bestEntryPrice = c.low;
                    bestEntryDay = d;
                }

                // --- STUDY B: Low of Day ---
                if (c.close >= c.open) earlyLows++;
                else lateLows++;
            }

            bestEntrySumPct += ((bestEntryPrice - sigClose) / sigClose) * 100;
            const bestPnl = ((day10Close - bestEntryPrice) / bestEntryPrice) * 100;
            bestPnlSumPct += bestPnl;
            if (bestPnl > 0) bestWins++;

            // --- STUDY C: Volume Exhaustion ---
            let exhausDay = -1;
            for (let d = 1; d <= 5; d++) {
                if (sigVol > 0 && candles[sigIdx + d].volume < sigVol * 0.5) {
                    exhausDay = d;
                    break;
                }
            }
            if (exhausDay !== -1) {
                exhaustionSignals++;
                if (exhausDay === bestEntryDay) exhausIsBest++;
            }

            // --- STUDY D: Dip Buy Limits ---

            // Limit 1: Signal Close - 1%
            const l1 = sigClose * 0.99;
            for (let d = 1; d <= 5; d++) {
                if (candles[sigIdx + d].low <= l1) {
                    dStats.opt1.fills++;
                    const pnl = ((day10Close - l1) / l1) * 100;
                    dStats.opt1.sumPnl += pnl;
                    if (pnl > 0) dStats.opt1.wins++;
                    break;
                }
            }

            // Limit 2: Signal Close - 2%
            const l2 = sigClose * 0.98;
            for (let d = 1; d <= 5; d++) {
                if (candles[sigIdx + d].low <= l2) {
                    dStats.opt2.fills++;
                    const pnl = ((day10Close - l2) / l2) * 100;
                    dStats.opt2.sumPnl += pnl;
                    if (pnl > 0) dStats.opt2.wins++;
                    break;
                }
            }

            // Limit 3: Day+1 Low
            const l3 = candles[sigIdx + 1].low;
            // Order placed on Day+2, valid Day 2 to 5
            for (let d = 2; d <= 5; d++) {
                if (candles[sigIdx + d].low <= l3) {
                    dStats.opt3.fills++;
                    const pnl = ((day10Close - l3) / l3) * 100;
                    dStats.opt3.sumPnl += pnl;
                    if (pnl > 0) dStats.opt3.wins++;
                    break;
                }
            }

            // Limit 4: Lowest of Day 1 & 2
            const l4 = Math.min(candles[sigIdx + 1].low, candles[sigIdx + 2].low);
            for (let d = 3; d <= 5; d++) {
                if (candles[sigIdx + d].low <= l4) {
                    dStats.opt4.fills++;
                    const pnl = ((day10Close - l4) / l4) * 100;
                    dStats.opt4.sumPnl += pnl;
                    if (pnl > 0) dStats.opt4.wins++;
                    break;
                }
            }
        }
    }

    let outStr = '';
    outStr += '\n\n═══════════════════════════════════════════════════════\n';
    outStr += ` ANALYSIS RESULTS FOR ${totalValidSignals} VALID SIGNALS\n`;
    outStr += '═══════════════════════════════════════════════════════\n';

    outStr += '\n[STUDY A] The First 3-5 Days Microstructure\n';
    outStr += `Avg Intraday Range:  ${(sA.rangeSum / sA.count).toFixed(2)}%\n`;
    outStr += `Avg Upper Wick Pct:  ${(sA.upWickSum / sA.count).toFixed(2)}%\n`;
    outStr += `Avg Lower Wick Pct:  ${(sA.lowWickSum / sA.count).toFixed(2)}%\n`;
    outStr += `Avg Body Pct:        ${(sA.bodySum / sA.count).toFixed(2)}%\n`;
    outStr += `Avg Close Position:  ${(sA.closePosSum / sA.count).toFixed(2)}%\n`;
    outStr += `Avg Gap From Prev:   ${(sA.gapSum / sA.count).toFixed(2)}%\n`;
    outStr += `Avg Low vs SigClose: ${(sA.lowVsSigSum / sA.count).toFixed(2)}%\n\n`;

    outStr += `OPTIMAL ENTRY (Hindsight Day 1-5 Lowest Low)\n`;
    outStr += `Best Entry Avg Pct Below Signal: ${(bestEntrySumPct / totalValidSignals).toFixed(2)}%\n`;
    outStr += `If filled exactly at best entry, holding to Day 10:\n`;
    outStr += `   Best Possible Win Rate: ${(bestWins / totalValidSignals * 100).toFixed(1)}%\n`;
    outStr += `   Best Possible Avg P&L%: ${(bestPnlSumPct / totalValidSignals).toFixed(2)}%\n`;

    outStr += '\n[STUDY B] The Low-of-Day Pattern\n';
    outStr += `Of the ${sA.count} days in the observation window:\n`;
    outStr += `   Green Closes (Early Dip likely): ${earlyLows} (${(earlyLows / sA.count * 100).toFixed(1)}%)\n`;
    outStr += `   Red Closes (Late Bleed likely):  ${lateLows} (${(lateLows / sA.count * 100).toFixed(1)}%)\n`;

    outStr += '\n[STUDY C] The Volume Exhaustion Point\n';
    outStr += `Signals showing >= 50% volume drop by Day 5: ${exhaustionSignals}\n`;
    if (exhaustionSignals > 0) {
        outStr += `Exhaustion Day WAS the Optimal Entry Low: ${exhausIsBest} times (${(exhausIsBest / exhaustionSignals * 100).toFixed(1)}%)\n`;
    }

    outStr += '\n[STUDY D] The "Dip Buy" Limit Analysis\n';
    const printOpt = (name, opt) => {
        const hitRate = (opt.fills / totalValidSignals * 100).toFixed(1);
        const winRate = opt.fills ? (opt.wins / opt.fills * 100).toFixed(1) : 0;
        const avgPnl = opt.fills ? (opt.sumPnl / opt.fills).toFixed(2) : 0;
        outStr += `${name.padEnd(30)} => Fills: ${String(opt.fills).padStart(3)} (${hitRate}%) | Win: ${winRate}% | Avg PnL: ${avgPnl}%\n`;
    };

    printOpt('Option 1 (Signal - 1%)', dStats.opt1);
    printOpt('Option 2 (Signal - 2%)', dStats.opt2);
    printOpt('Option 3 (Day+1 Low)', dStats.opt3);
    printOpt('Option 4 (Min of Day 1&2 Lows)', dStats.opt4);

    outStr += '\n═══════════════════════════════════════════════════════\n';

    console.log(outStr);
    fs.writeFileSync(path.join(__dirname, '..', 'outputs', 'microstructure_results.txt'), outStr);
    console.log('✅ Results saved to outputs/microstructure_results.txt');

    await prisma.$disconnect();
    process.exit(0);
}

main().catch(e => { console.error('FATAL:', e); process.exit(1); });
