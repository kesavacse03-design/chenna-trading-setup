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
    console.log(' 1H BREAKOUT CLASSIFICATION STUDY (Types A, B, C, D)');
    console.log('═══════════════════════════════════════════════════════\n');

    const cat = await prisma.category.findUnique({ where: { key: 'SHORT_TERM_SWING_BO_UP' } });
    if (!cat) process.exit(1);

    const stockEntries = await prisma.stockCategory.findMany({
        where: {
            categoryId: cat.id,
            addedDate: { gte: new Date('2025-08-01T00:00:00Z') } // Last ~6-7 months for 30min availability
        },
        include: { stock: true }
    });

    // Deduplicate
    const uniqueMap = new Map();
    for (const sc of stockEntries) {
        const dStr = toISTDateString(sc.addedDate);
        uniqueMap.set(`${sc.stock.symbol}_${dStr}`, { symbol: sc.stock.symbol, instrumentKey: sc.stock.instrumentKey, addedDate: dStr });
    }
    const targetStocks = Array.from(uniqueMap.values()).sort((a, b) => a.addedDate.localeCompare(b.addedDate));

    console.log(`Found ${targetStocks.length} unique signals since Aug 2025.\n`);

    const stats = {
        TYPE_A: { count: 0, wins: 0, sumPnl: 0, times: {} },
        TYPE_B: { count: 0, wins: 0, sumPnl: 0, times: {} },
        TYPE_C: { count: 0, wins: 0, sumPnl: 0 },
        TYPE_D: { count: 0, wins: 0, sumPnl: 0 },
        ERRORS: 0
    };

    let processed = 0;

    for (const req of targetStocks) {
        try {
            const signalDateObj = new Date(req.addedDate + 'T00:00:00+05:30');

            // Fetch daily data from T-15 to T+20 to get the 5-day history and 10-day forward returns
            const dailyFrom = toISTDateString(new Date(signalDateObj.getTime() - 20 * 86400000));
            const dailyTo = toISTDateString(new Date(signalDateObj.getTime() + 25 * 86400000));

            const dailyData = await priceService.fetchFromUpstox(req.instrumentKey, dailyFrom, dailyTo, 'day');
            if (!dailyData || dailyData.length === 0) {
                stats.ERRORS++;
                continue;
            }

            const dailyCandles = dailyData.map(c => ({
                date: String(c.timestamp || c.date).split('T')[0].split(' ')[0],
                close: parseFloat(c.close),
                high: parseFloat(c.high)
            })).sort((a, b) => a.date.localeCompare(b.date));

            const signalIdx = dailyCandles.findIndex(c => c.date === req.addedDate);
            if (signalIdx < 5 || signalIdx + 10 >= dailyCandles.length) {
                stats.ERRORS++; // Not enough history or future data
                continue;
            }

            // Resistance = HIGHEST DAILY CLOSE in the 5 trading days before signal date
            const prior5 = dailyCandles.slice(signalIdx - 5, signalIdx);
            const resistance = Math.max(...prior5.map(c => c.close));

            // 10-day forward return calculation (Unmanaged Close-to-Close)
            const signalClose = dailyCandles[signalIdx].close;
            const day10Close = dailyCandles[signalIdx + 10].close;
            const pnlPct = ((day10Close - signalClose) / signalClose) * 100;
            const isWin = pnlPct > 0;

            // Fetch 30min data for Signal Date and Signal Date + 1 (in case breakout happens at EOD)
            const minFrom = req.addedDate;
            const minNextDay = new Date(signalDateObj.getTime() + 5 * 86400000); // Pad +5 days to ensure we get "next" candles
            const minToStr = toISTDateString(minNextDay);

            const minData = await priceService.fetchFromUpstox(req.instrumentKey, minFrom, minToStr, '30minute');
            if (!minData || minData.length === 0) {
                stats.ERRORS++;
                continue;
            }

            // Build 1H candles
            const byDay = {};
            for (const c of minData) {
                let ts = String(c.timestamp || c.date);
                const dateStr = ts.includes('T') ? ts.split('T')[0] : ts.split(' ')[0];
                if (!byDay[dateStr]) byDay[dateStr] = [];
                byDay[dateStr].push(c);
            }

            const hourly = [];
            for (const date of Object.keys(byDay).sort()) {
                const dayCandles = byDay[date].sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
                for (let i = 0; i < dayCandles.length; i += 2) {
                    const c1 = dayCandles[i];
                    if (i + 1 < dayCandles.length) {
                        const c2 = dayCandles[i + 1];
                        hourly.push({
                            timestamp: c1.timestamp,
                            dateStr: date,
                            open: parseFloat(c1.open),
                            high: Math.max(parseFloat(c1.high), parseFloat(c2.high)),
                            low: Math.min(parseFloat(c1.low), parseFloat(c2.low)),
                            close: parseFloat(c2.close)
                        });
                    } else {
                        hourly.push({
                            timestamp: c1.timestamp,
                            dateStr: date,
                            open: parseFloat(c1.open),
                            high: parseFloat(c1.high),
                            low: parseFloat(c1.low),
                            close: parseFloat(c1.close)
                        });
                    }
                }
            }

            // Find breakout 1H candle ONLY on signal day
            let breakoutIdx = -1;
            for (let i = 0; i < hourly.length; i++) {
                if (hourly[i].dateStr === req.addedDate && hourly[i].close > resistance) {
                    breakoutIdx = i;
                    break;
                }
            }

            if (breakoutIdx === -1) {
                // TYPE D: Never Broke
                stats.TYPE_D.count++;
                if (isWin) stats.TYPE_D.wins++;
                stats.TYPE_D.sumPnl += pnlPct;
            } else {
                // We have a breakout on the signal date. Look at NEXT candle.
                const bCandle = hourly[breakoutIdx];
                const bTime = new Date(bCandle.timestamp).toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit' });

                if (breakoutIdx + 1 >= hourly.length) {
                    stats.ERRORS++;
                    continue; // No next candle data available
                }

                const nextCandle = hourly[breakoutIdx + 1];

                if (nextCandle.low >= resistance) {
                    // TYPE A: Break & Hold
                    stats.TYPE_A.count++;
                    if (isWin) stats.TYPE_A.wins++;
                    stats.TYPE_A.sumPnl += pnlPct;
                    stats.TYPE_A.times[bTime] = (stats.TYPE_A.times[bTime] || 0) + 1;
                } else if (nextCandle.low < resistance && nextCandle.close > resistance) {
                    // TYPE B: Break, Dip, Recover
                    stats.TYPE_B.count++;
                    if (isWin) stats.TYPE_B.wins++;
                    stats.TYPE_B.sumPnl += pnlPct;
                    stats.TYPE_B.times[bTime] = (stats.TYPE_B.times[bTime] || 0) + 1;
                } else if (nextCandle.close <= resistance) {
                    // TYPE C: Break & Fail
                    stats.TYPE_C.count++;
                    if (isWin) stats.TYPE_C.wins++;
                    stats.TYPE_C.sumPnl += pnlPct;
                }
            }
            processed++;
            if (processed % 10 === 0) process.stdout.write('.');
        } catch (e) {
            stats.ERRORS++;
        }
    }

    console.log('\n\n═══════════════════════════════════════════════════════');
    console.log(' FINAL RESULTS: 10-DAY FORWARD RETURNS');
    console.log('═══════════════════════════════════════════════════════\n');

    const printBucket = (name, data, totalSignals) => {
        const pct = ((data.count / totalSignals) * 100).toFixed(1);
        const wr = data.count > 0 ? ((data.wins / data.count) * 100).toFixed(1) : '0.0';
        const avgPnl = data.count > 0 ? (data.sumPnl / data.count).toFixed(2) : '0.00';

        console.log(`${name.padEnd(25)}: ${String(data.count).padStart(3)} signals | ${String(pct).padStart(4)}% of total | 10d WR: ${String(wr).padStart(4)}% | Avg PnL: ${String(avgPnl).padStart(5)}%`);
    };

    const totalValid = stats.TYPE_A.count + stats.TYPE_B.count + stats.TYPE_C.count + stats.TYPE_D.count;

    printBucket('TYPE A (Break & Hold)', stats.TYPE_A, totalValid);
    printBucket('TYPE B (Dip & Recover)', stats.TYPE_B, totalValid);
    printBucket('TYPE C (Break & Fail)', stats.TYPE_C, totalValid);
    printBucket('TYPE D (Never Broke)', stats.TYPE_D, totalValid);

    console.log(`\nNote: Excluded/Errors: ${stats.ERRORS} signals (due to missing 30min data or incomplete 10-day history)`);

    console.log('\nBreakout Timing for Confirmed Trades (Types A & B):');
    const confirmedTimes = {};
    for (const t of Object.keys(stats.TYPE_A.times)) confirmedTimes[t] = (confirmedTimes[t] || 0) + stats.TYPE_A.times[t];
    for (const t of Object.keys(stats.TYPE_B.times)) confirmedTimes[t] = (confirmedTimes[t] || 0) + stats.TYPE_B.times[t];

    Object.entries(confirmedTimes)
        .sort((a, b) => a[0].localeCompare(b[0]))
        .forEach(([time, count]) => {
            console.log(`  ${time}: ${count} breakouts`);
        });

    console.log('═══════════════════════════════════════════════════════');
    process.exit(0);
}

main().catch(e => { console.error('FATAL:', e); process.exit(1); });
