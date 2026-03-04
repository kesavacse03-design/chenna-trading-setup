const fs = require('fs');
const path = require('path');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const BASE_DIR = __dirname;
const CACHE_DIR = path.join(BASE_DIR, '../cache/30minute');

function load30mCache(symbol) {
    const safeKey = symbol.replace(/[^a-zA-Z0-9_-]/g, '_');
    const p = path.join(CACHE_DIR, `${safeKey}_master.json`);
    if (!fs.existsSync(p)) return null;
    try {
        const d = JSON.parse(fs.readFileSync(p, 'utf8'));
        // Parse dates for easy day grouping
        return d.map(c => {
            const rawDate = new Date(c.timestamp || c.date);
            // Format IST
            const istStr = rawDate.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', hour12: false });
            // istStr looks like "10/02/2026, 09:15:00"
            const [dStr, tStr] = istStr.split(', ');
            const [dd, mm, yyyy] = dStr.split('/');
            const dayStr = `${yyyy}-${mm}-${dd}`;

            return {
                day: dayStr,
                time: tStr,
                open: parseFloat(c.open),
                high: parseFloat(c.high),
                low: parseFloat(c.low),
                close: parseFloat(c.close),
                volume: parseFloat(c.volume)
            };
        });
    } catch (e) { return null; }
}

async function run() {
    console.log("Loading INTRADAY_BOOST stocks...");
    const cat = await prisma.category.findUnique({
        where: { key: 'INTRADAY_BOOST' },
        include: { stocks: { include: { stock: true } } }
    });

    if (!cat || !cat.stocks) {
        console.error("No stocks found!");
        return;
    }
    const symbols = cat.stocks.map(s => s.stock ? s.stock.symbol : (s.stockSymbol || s.symbol)).filter(Boolean);
    console.log(`Found ${symbols.length} symbols. Starting ORB Baseline simulation...`);

    let totalLongs = 0, longT1 = 0, longT2 = 0, longStops = 0, longEod = 0;
    let totalShorts = 0, shortT1 = 0, shortT2 = 0, shortStops = 0, shortEod = 0;

    // Track exact points to make sure R:R > 1 overall
    let grossProfitLong = 0;
    let grossLossLong = 0;
    let grossProfitShort = 0;
    let grossLossShort = 0;

    let totalDays = new Set();

    for (const sym of symbols) {
        const data = load30mCache(sym);
        if (!data) continue;

        // Group by day
        const byDay = {};
        for (const c of data) {
            if (!byDay[c.day]) byDay[c.day] = [];
            byDay[c.day].push(c);
        }

        for (const dayStr of Object.keys(byDay)) {
            totalDays.add(dayStr);
            const candles = byDay[dayStr];
            // Sort by time
            candles.sort((a, b) => a.time.localeCompare(b.time));

            // Need the 09:15 candle for ORB
            // Sometimes it's labelled 09:15, sometimes generic. We take the 1st candle of the day.
            if (candles.length < 5) continue; // Too short of a trading day

            const orCandle = candles[0];
            const orHigh = orCandle.high;
            const orLow = orCandle.low;
            const risk = orHigh - orLow;

            // Skip massive ORBs or tight ones (to avoid data anomalies or spread issues)
            const spreadPct = risk / orCandle.open;
            if (spreadPct < 0.003 || spreadPct > 0.03) continue; // Skip sub 0.3% spread or > 3% spread ORB

            let activeTrade = null;

            for (let i = 1; i < candles.length; i++) {
                const c = candles[i];

                // 1. Entry Phase
                if (!activeTrade) {
                    const breaksHigh = c.high > orHigh;
                    const breaksLow = c.low < orLow;

                    if (breaksHigh && breaksLow) {
                        // Ambiguous inside 30m, skip day
                        break;
                    }

                    if (breaksHigh) {
                        activeTrade = {
                            type: 'LONG',
                            entry: orHigh,
                            stop: orLow, // Risk = orHigh - orLow
                            risk: risk,
                            t1: orHigh + risk,
                            t2: orHigh + (risk * 2),
                            hitT1: false
                        };
                    } else if (breaksLow) {
                        activeTrade = {
                            type: 'SHORT',
                            entry: orLow,
                            stop: orHigh,
                            risk: risk,
                            t1: orLow - risk,
                            t2: orLow - (risk * 2),
                            hitT1: false
                        };
                    }
                }

                // 2. Management Phase
                if (activeTrade) {
                    const isLastCandle = (i === candles.length - 1 || c.time >= '15:00:00');

                    if (activeTrade.type === 'LONG') {
                        // Check stop
                        if (c.low <= activeTrade.stop) {
                            longStops++;
                            totalLongs++;
                            grossLossLong += activeTrade.risk;
                            break;
                        }

                        // Check T1
                        if (!activeTrade.hitT1 && c.high >= activeTrade.t1) {
                            activeTrade.hitT1 = true;
                            // Move stop to BE for remaining position?
                            // Let's assume strict 1:2 R:R test. So we don't care about T1. We just want to hit T2 or Stop.
                        }

                        // Check T2
                        if (c.high >= activeTrade.t2) {
                            longT2++;
                            totalLongs++;
                            grossProfitLong += (activeTrade.risk * 2);
                            break;
                        }

                        // Check EOD
                        if (isLastCandle) {
                            longEod++;
                            totalLongs++;
                            const pnl = c.close - activeTrade.entry;
                            if (pnl > 0) grossProfitLong += pnl;
                            else grossLossLong += Math.abs(pnl);
                            break;
                        }
                    } else {
                        // SHORT
                        if (c.high >= activeTrade.stop) {
                            shortStops++;
                            totalShorts++;
                            grossLossShort += activeTrade.risk;
                            break;
                        }

                        // Check T2
                        if (c.low <= activeTrade.t2) {
                            shortT2++;
                            totalShorts++;
                            grossProfitShort += (activeTrade.risk * 2);
                            break;
                        }

                        // Check EOD
                        if (isLastCandle) {
                            shortEod++;
                            totalShorts++;
                            const pnl = activeTrade.entry - c.close;
                            if (pnl > 0) grossProfitShort += pnl;
                            else grossLossShort += Math.abs(pnl);
                            break;
                        }
                    }
                }
            } // end candles
        }
    }

    console.log(`\n=== 30-MIN ORB BASELINE STUDY ===`);
    console.log(`Unique Trading Days Analyzed: ${totalDays.size}`);

    console.log(`\n--- LONG TRADES ---`);
    console.log(`Total: ${totalLongs}`);
    if (totalLongs > 0) {
        console.log(`Hits 1:2 Target (T2): ${longT2} [${((longT2 / totalLongs) * 100).toFixed(1)}%]`);
        console.log(`Stopped Out: ${longStops} [${((longStops / totalLongs) * 100).toFixed(1)}%]`);
        console.log(`EOD Muted Exit: ${longEod} [${((longEod / totalLongs) * 100).toFixed(1)}%]`);
        console.log(`Gross Profit Units (Long): +${grossProfitLong.toFixed(2)} R`);
        console.log(`Gross Loss Units (Long): -${grossLossLong.toFixed(2)} R`);
        console.log(`Net R (Long): ${(grossProfitLong - grossLossLong).toFixed(2)}`);
    }

    console.log(`\n--- SHORT TRADES ---`);
    console.log(`Total: ${totalShorts}`);
    if (totalShorts > 0) {
        console.log(`Hits 1:2 Target (T2): ${shortT2} [${((shortT2 / totalShorts) * 100).toFixed(1)}%]`);
        console.log(`Stopped Out: ${shortStops} [${((shortStops / totalShorts) * 100).toFixed(1)}%]`);
        console.log(`EOD Muted Exit: ${shortEod} [${((shortEod / totalShorts) * 100).toFixed(1)}%]`);
        console.log(`Gross Profit Units (Short): +${grossProfitShort.toFixed(2)} R`);
        console.log(`Gross Loss Units (Short): -${grossLossShort.toFixed(2)} R`);
        console.log(`Net R (Short): ${(grossProfitShort - grossLossShort).toFixed(2)}`);
    }

    const overallNetR = (grossProfitLong - grossLossLong) + (grossProfitShort - grossLossShort);
    const overallWinR = ((longT2 + shortT2) / (totalLongs + totalShorts)) * 100;

    console.log(`\n=== OVERALL SUMMARY ===`);
    console.log(`Combined Net R: ${overallNetR.toFixed(2)}`);
    console.log(`Combined T2 Hit Rate: ${overallWinR.toFixed(1)}%`);
    console.log(`Viability Check: ${overallNetR > 0 ? "PROFITABLE EXPECTANCY" : "NEGATIVE EXPECTANCY"}`);
}

run().catch(console.error).finally(() => prisma.$disconnect());
