const path = require('path');
const fs = require('fs');
const priceService = require('../services/priceService.cjs');
const prisma = require('../lib/prisma.cjs');

// Helpers for Technical Indicators
function calcSMA(closes, period) {
    if (closes.length < period) return null;
    const slice = closes.slice(closes.length - period);
    const sum = slice.reduce((a, b) => a + b, 0);
    return sum / period;
}

function calcEMA(closes, period) {
    if (closes.length < period) return null;
    const k = 2 / (period + 1);
    let ema = closes.slice(0, period).reduce((a, b) => a + b, 0) / period;
    for (let i = period; i < closes.length; i++) {
        ema = closes[i] * k + ema * (1 - k);
    }
    return ema;
}

function calcRSI(closes, period = 14) {
    if (closes.length <= period) return null;
    let gains = 0, losses = 0;
    for (let i = 1; i <= period; i++) {
        const diff = closes[i] - closes[i - 1];
        if (diff >= 0) gains += diff;
        else losses -= diff;
    }
    let avgGain = gains / period;
    let avgLoss = losses / period;
    for (let i = period + 1; i < closes.length; i++) {
        const diff = closes[i] - closes[i - 1];
        if (diff >= 0) {
            avgGain = (avgGain * 13 + diff) / period;
            avgLoss = (avgLoss * 13) / period;
        } else {
            avgGain = (avgGain * 13) / period;
            avgLoss = (avgLoss * 13 - diff) / period;
        }
    }
    if (avgLoss === 0) return 100;
    const rs = avgGain / avgLoss;
    return 100 - (100 / (1 + rs));
}

function classifyStage(currentPrice, sma50, sma200) {
    if (!sma50 || !sma200) return 'UNKNOWN';
    if (currentPrice > sma50 && sma50 > sma200) return 'STAGE_2';
    if (currentPrice < sma50 && sma50 < sma200) return 'STAGE_4';
    if (currentPrice > sma50 && sma50 < sma200) return 'STAGE_1';
    if (currentPrice < sma50 && sma50 > sma200) return 'STAGE_3';
    return 'UNKNOWN';
}

function toISTDateString(date) {
    const d = new Date(date);
    d.setMinutes(d.getMinutes() + 330);
    return d.toISOString().split('T')[0];
}

async function main() {
    console.log('═══════════════════════════════════════════════════════');
    console.log(' COMBINED EDGE STUDY: FILTERS + 1H CONFIRM + LIMIT ENTRY');
    console.log('═══════════════════════════════════════════════════════\n');

    const cat = await prisma.category.findUnique({ where: { key: 'SHORT_TERM_SWING_BO_UP' } });
    if (!cat) process.exit(1);

    const stockEntries = await prisma.stockCategory.findMany({
        where: {
            categoryId: cat.id,
            addedDate: { gte: new Date('2025-08-01T00:00:00Z') }
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

    console.log(`Analyzing ${targetStocks.length} unique signals since Aug 2025...\n`);

    // Fetch NIFTY Data upfront for Gate 3
    const todayStr = '2026-02-28';
    const niftyFrom = '2024-01-01'; // Get plenty of history
    const niftyData = await priceService.fetchFromUpstox('NSE_INDEX|Nifty 50', niftyFrom, todayStr, 'day');
    const niftyMap = new Map(); // Date -> { close, ema20 }

    if (niftyData && niftyData.length > 0) {
        let nCloses = [];
        for (let i = 0; i < niftyData.length; i++) {
            const dateStr = String(niftyData[i].timestamp || niftyData[i].date).split('T')[0].split(' ')[0];
            const c = parseFloat(niftyData[i].close);
            nCloses.push(c);

            let e20 = null;
            if (nCloses.length >= 20) {
                e20 = calcEMA(nCloses, 20);
            }
            niftyMap.set(dateStr, { close: c, ema20: e20 });
        }
    }

    const stats = {
        filtered: {
            total: 0,
            TYPE_A: { count: 0, wins: 0, sumPnl: 0 },
            TYPE_B: { count: 0, wins: 0, sumPnl: 0 },
            TYPE_C: { count: 0, wins: 0, sumPnl: 0 },
            TYPE_D: { count: 0, wins: 0, sumPnl: 0 }
        },
        limitOrders: { // Only applied to FILTERED TYPE A
            totalAttempted: 0,
            filled: 0,
            wins: 0,
            sumPnl: 0,
            sumRiskReward: 0
        },
        errors: 0
    };

    let processed = 0;

    for (const req of targetStocks) {
        try {
            const signalDateObj = new Date(req.addedDate + 'T00:00:00+05:30');

            // 1. Fetch Daily Data (~300 days back for 200 SMA, 25 days forward for resolution)
            const dailyFrom = toISTDateString(new Date(signalDateObj.getTime() - 300 * 86400000));
            const dailyTo = toISTDateString(new Date(signalDateObj.getTime() + 25 * 86400000));

            const dailyData = await priceService.fetchFromUpstox(req.instrumentKey, dailyFrom, dailyTo, 'day');
            if (!dailyData || dailyData.length === 0) {
                stats.errors++;
                continue;
            }

            const dailyCandles = dailyData.map(c => ({
                date: String(c.timestamp || c.date).split('T')[0].split(' ')[0],
                open: parseFloat(c.open),
                high: parseFloat(c.high),
                low: parseFloat(c.low),
                close: parseFloat(c.close)
            })).sort((a, b) => a.date.localeCompare(b.date));

            const signalIdx = dailyCandles.findIndex(c => c.date === req.addedDate);
            if (signalIdx < 200 || signalIdx + 10 >= dailyCandles.length) {
                stats.errors++; // Not enough history or future data
                continue;
            }

            // ─── STAGE & RSI FILTERS ───
            const historyToSignal = dailyCandles.slice(0, signalIdx + 1);
            const closesToSignal = historyToSignal.map(c => c.close);
            const signalCandle = dailyCandles[signalIdx];

            const sma50 = calcSMA(closesToSignal, 50);
            const sma200 = calcSMA(closesToSignal, 200);
            const stage = classifyStage(signalCandle.close, sma50, sma200);

            const rsi = calcRSI(closesToSignal, 14);

            const niftyInfo = niftyMap.get(req.addedDate);
            const niftyPass = niftyInfo && niftyInfo.ema20 && niftyInfo.close > (niftyInfo.ema20 * 0.98);

            // ONLY PROCEED IF FILTERED
            if (stage !== 'STAGE_2' || !rsi || rsi < 60 || rsi > 70 || !niftyPass) {
                continue; // Skip unfiltered signals
            }

            stats.filtered.total++;

            // ─── 1H CLASSIFICATION (TYPES A, B, C, D) ───
            const prior5 = dailyCandles.slice(signalIdx - 5, signalIdx);
            const resistance = Math.max(...prior5.map(c => c.close));

            const pnlPct = ((dailyCandles[signalIdx + 10].close - signalCandle.close) / signalCandle.close) * 100;
            const isWin = pnlPct > 0;

            const minFrom = req.addedDate;
            const minNextDay = new Date(signalDateObj.getTime() + 5 * 86400000);
            const minToStr = toISTDateString(minNextDay);

            const minData = await priceService.fetchFromUpstox(req.instrumentKey, minFrom, minToStr, '30minute');
            if (!minData || minData.length === 0) {
                stats.errors++;
                continue;
            }

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

            let breakoutIdx = -1;
            for (let i = 0; i < hourly.length; i++) {
                if (hourly[i].dateStr === req.addedDate && hourly[i].close > resistance) {
                    breakoutIdx = i;
                    break;
                }
            }

            let typeClass = 'NONE';
            if (breakoutIdx === -1) {
                stats.filtered.TYPE_D.count++;
                if (isWin) stats.filtered.TYPE_D.wins++;
                stats.filtered.TYPE_D.sumPnl += pnlPct;
                typeClass = 'TYPE_D';
            } else {
                if (breakoutIdx + 1 >= hourly.length) continue;
                const nextCandle = hourly[breakoutIdx + 1];

                if (nextCandle.low >= resistance) {
                    stats.filtered.TYPE_A.count++;
                    if (isWin) stats.filtered.TYPE_A.wins++;
                    stats.filtered.TYPE_A.sumPnl += pnlPct;
                    typeClass = 'TYPE_A';
                } else if (nextCandle.low < resistance && nextCandle.close > resistance) {
                    stats.filtered.TYPE_B.count++;
                    if (isWin) stats.filtered.TYPE_B.wins++;
                    stats.filtered.TYPE_B.sumPnl += pnlPct;
                    typeClass = 'TYPE_B';
                } else if (nextCandle.close <= resistance) {
                    stats.filtered.TYPE_C.count++;
                    if (isWin) stats.filtered.TYPE_C.wins++;
                    stats.filtered.TYPE_C.sumPnl += pnlPct;
                    typeClass = 'TYPE_C';
                }
            }

            // ─── LIMIT ORDER FILL SIMULATION (ONLY FOR TYPE A) ───
            if (typeClass === 'TYPE_A') {
                stats.limitOrders.totalAttempted++;

                const signalClose = signalCandle.close;
                const limitPrice = signalClose * 0.98; // Option 2: 2% pullback

                let fillPrice = null;
                let fillIdx = -1;

                // Check Day 1 and Day 2 for Limit Fill
                for (let j = 1; j <= 2; j++) {
                    if (signalIdx + j >= dailyCandles.length) break;
                    const c = dailyCandles[signalIdx + j];

                    if (c.open <= limitPrice) {
                        fillPrice = c.open; // Gap through fill
                        fillIdx = signalIdx + j;
                        break;
                    } else if (c.low <= limitPrice) {
                        fillPrice = limitPrice; // Direct touch
                        fillIdx = signalIdx + j;
                        break;
                    }
                }

                if (fillPrice) {
                    stats.limitOrders.filled++;
                    const stopLossPrice = fillPrice * 0.98; // Bounded 2% structure stop
                    let active = true;
                    let exitPrice = 0;

                    // Simple Unmanaged 10-Day Hold or Stop Hit from Fill
                    for (let n = fillIdx; n <= fillIdx + 10 && n < dailyCandles.length && active; n++) {
                        const tc = dailyCandles[n];

                        // Check Stop Loss First
                        if (n === fillIdx) {
                            // On fill day, check if low went below stop after fill (best estimate)
                            if (tc.low <= stopLossPrice) {
                                exitPrice = stopLossPrice;
                                active = false;
                            }
                        } else {
                            if (tc.open <= stopLossPrice) {
                                exitPrice = tc.open; // Gap down slippage
                                active = false;
                            } else if (tc.low <= stopLossPrice) {
                                exitPrice = stopLossPrice;
                                active = false;
                            }
                        }

                        if (!active) break;

                        // Time Exhaustion Exit
                        if (n === fillIdx + 10) {
                            exitPrice = tc.close;
                            active = false;
                        }
                    }

                    if (exitPrice === 0) exitPrice = dailyCandles[dailyCandles.length - 1].close; // Fallback

                    const loPnlPct = ((exitPrice - fillPrice) / fillPrice) * 100;
                    if (loPnlPct > 0) stats.limitOrders.wins++;
                    stats.limitOrders.sumPnl += loPnlPct;
                }
            }

            processed++;
            if (processed % 5 === 0) process.stdout.write('.');
        } catch (e) {
            stats.errors++;
        }
    }

    console.log('\n\n═══════════════════════════════════════════════════════');
    console.log(' FINAL COMBINED STACKED EDGE RESULTS');
    console.log('═══════════════════════════════════════════════════════\n');

    const printFilteredBucket = (name, data) => {
        const wr = data.count > 0 ? ((data.wins / data.count) * 100).toFixed(1) : '0.0';
        const avgPnl = data.count > 0 ? (data.sumPnl / data.count).toFixed(2) : '0.00';
        console.log(`${name.padEnd(25)}: ${String(data.count).padStart(3)} signals | 10d WR: ${String(wr).padStart(4)}% | Avg PnL: ${String(avgPnl).padStart(5)}%`);
    };

    console.log(`Phase 1: Apply Filters (Stage 2 + RSI + NIFTY Buffer)`);
    console.log(`Total Filtered Signals: ${stats.filtered.total}\n`);

    console.log(`Phase 2: Add 1H Structural Confirmations (Types A/B/C/D)`);
    printFilteredBucket('FILTERED + TYPE A', stats.filtered.TYPE_A);
    printFilteredBucket('FILTERED + TYPE B', stats.filtered.TYPE_B);
    printFilteredBucket('FILTERED + TYPE C', stats.filtered.TYPE_C);
    printFilteredBucket('FILTERED + TYPE D', stats.filtered.TYPE_D);

    console.log(`\nPhase 3: Add Limit Order Execution (Signal Close - 2.0%)`);
    const lo = stats.limitOrders;
    const fillRate = ((lo.filled / lo.totalAttempted) * 100).toFixed(1);
    const loWr = lo.filled > 0 ? ((lo.wins / lo.filled) * 100).toFixed(1) : '0.0';
    const loAvgPnl = lo.filled > 0 ? (lo.sumPnl / lo.filled).toFixed(2) : '0.00';

    console.log(`FILTERED + TYPE A + LIMIT ENTRY:`);
    console.log(`  Attempted Limit Orders: ${lo.totalAttempted}`);
    console.log(`  Filled Limit Orders   : ${lo.filled} (${fillRate}% Fill Rate)`);
    console.log(`  Limit Order Win Rate  : ${loWr}%`);
    console.log(`  Average Unmanaged P&L : ${loAvgPnl}%`);

    console.log('\n═══════════════════════════════════════════════════════');
    process.exit(0);
}

main().catch(e => { console.error('FATAL:', e); process.exit(1); });
