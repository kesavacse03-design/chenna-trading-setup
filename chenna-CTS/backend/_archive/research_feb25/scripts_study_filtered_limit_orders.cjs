const path = require('path');
const fs = require('fs');
const priceService = require('../services/priceService.cjs');
const prisma = require('../lib/prisma.cjs');

function toISTDateString(date) {
    const d = new Date(date);
    d.setMinutes(d.getMinutes() + 330);
    return d.toISOString().split('T')[0];
}

function calcSMA(closes, period) {
    if (closes.length < period) return null;
    const slice = closes.slice(closes.length - period);
    return slice.reduce((a, b) => a + b, 0) / period;
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
    if (closes.length < period + 1) return null;
    let gains = 0, losses = 0;
    for (let i = 1; i <= period; i++) {
        const diff = closes[i] - closes[i - 1];
        if (diff > 0) gains += diff; else losses -= diff;
    }
    let avgGain = gains / period, avgLoss = losses / period;
    for (let i = period + 1; i < closes.length; i++) {
        const diff = closes[i] - closes[i - 1];
        avgGain = (avgGain * (period - 1) + (diff > 0 ? diff : 0)) / period;
        avgLoss = (avgLoss * (period - 1) + (diff < 0 ? -diff : 0)) / period;
    }
    if (avgLoss === 0) return 100;
    return 100 - (100 / (1 + avgGain / avgLoss));
}

function classifyStage(price, sma50, sma200) {
    if (!sma50 || !sma200) return 'UNKNOWN';
    if (price > sma50 && sma50 > sma200) return 'STAGE_2';
    if (price > sma50 && sma50 < sma200) return 'STAGE_1';
    if (price < sma50 && sma50 > sma200) return 'STAGE_3';
    if (price < sma50 && sma50 < sma200) return 'STAGE_4';
    return 'UNKNOWN';
}

const NIFTY_SYMBOL = 'NIFTY 50';
const NIFTY_INSTRUMENT_KEY = 'NSE_INDEX|Nifty 50';
let niftyCandles = null;

async function fetchNiftyData() {
    process.stdout.write('\n📊 Fetching NIFTY 50 data...');
    const data = await priceService.fetchPrice(NIFTY_SYMBOL, NIFTY_INSTRUMENT_KEY, '2022-01-01', toISTDateString(new Date()));
    if (!data || data.length === 0) {
        console.error('Failed to get NIFTY data.');
        process.exit(1);
    }
    data.sort((a, b) => new Date(a.timestamp || a.date) - new Date(b.timestamp || b.date));
    niftyCandles = data.map(c => ({
        date: String(c.timestamp || c.date).includes('T') ? String(c.timestamp || c.date).split('T')[0] : String(c.timestamp || c.date).split(' ')[0],
        close: parseFloat(c.close)
    }));
    console.log(` ✅ Got ${niftyCandles.length} candles`);
}

function checkNiftyGate(signalDateStr) {
    if (!niftyCandles) return false;
    let idx = niftyCandles.findIndex(c => c.date >= signalDateStr);
    let niftyIdx = (idx === -1) ? niftyCandles.length - 1 : (niftyCandles[idx].date === signalDateStr ? idx : Math.max(0, idx - 1));
    if (niftyIdx < 20) return false;
    const closes = niftyCandles.slice(0, niftyIdx + 1).map(c => c.close);
    const niftyClose = closes[closes.length - 1];
    const niftyEMA20 = calcEMA(closes, 20);
    return niftyClose > (niftyEMA20 * 0.98);
}

async function main() {
    console.log('═══════════════════════════════════════════════════════');
    console.log(' FILTERED LIMIT ORDER STUDY (ST_SWING_BO_UP) ');
    console.log('═══════════════════════════════════════════════════════');

    await fetchNiftyData();

    const cat = await prisma.category.findUnique({ where: { key: 'SHORT_TERM_SWING_BO_UP' } });
    if (!cat) process.exit(1);

    const stockEntries = await prisma.stockCategory.findMany({
        where: { categoryId: cat.id },
        include: { stock: true }
    });

    const uniqueMap = new Map();
    for (const sc of stockEntries) {
        const dStr = toISTDateString(sc.addedDate);
        if (!uniqueMap.has(sc.stock.symbol)) {
            uniqueMap.set(sc.stock.symbol, {
                symbol: sc.stock.symbol,
                instrumentKey: sc.stock.instrumentKey,
                signals: new Set()
            });
        }
        uniqueMap.get(sc.stock.symbol).signals.add(dStr);
    }
    const groupedStocks = Array.from(uniqueMap.values());
    console.log(`\n\u2705 Found ${groupedStocks.length} unique stocks with total ${stockEntries.length} signals...`);

    let totalProcessedSignals = 0;
    let filteredSignalsCount = 0;

    const stats = {
        opt1: { fills: 0, wins: 0, sumPnl: 0 },
        opt2: { fills: 0, wins: 0, sumPnl: 0, sumStopDist: 0, sumMaxGain: 0, sumRR: 0, rrGt2: 0, rrGt3: 0 },
        opt3: { fills: 0, wins: 0, sumPnl: 0 },
        opt4: { fills: 0, wins: 0, sumPnl: 0, sumStopDist: 0, sumMaxGain: 0, sumRR: 0, rrGt2: 0, rrGt3: 0 }
    };

    for (const stock of groupedStocks) {
        process.stdout.write('.');
        const signalsArr = Array.from(stock.signals).sort();
        const earliestSignal = new Date(signalsArr[0]);
        const fetchFrom = toISTDateString(new Date(earliestSignal.getTime() - 365 * 86400000));
        const fetchTo = toISTDateString(new Date());

        const raw = await priceService.fetchPrice(stock.symbol, stock.instrumentKey, fetchFrom, fetchTo);
        if (!raw || raw.length === 0) continue;

        const allCandles = raw.map(c => ({
            date: String(c.timestamp || c.date).split('T')[0].split(' ')[0],
            open: parseFloat(c.open), high: parseFloat(c.high),
            low: parseFloat(c.low), close: parseFloat(c.close)
        })).sort((a, b) => a.date.localeCompare(b.date));

        for (const sigDate of Array.from(stock.signals)) {
            const sigIdx = allCandles.findIndex(c => c.date === sigDate);
            if (sigIdx === -1 || sigIdx + 10 >= allCandles.length || sigIdx < 200) continue;

            const historyCandles = allCandles.slice(0, sigIdx + 1);
            const closes = historyCandles.map(c => c.close);

            const sigCandle = allCandles[sigIdx];
            const price = sigCandle.close;

            // GATE 1: Stage 2
            const sma50 = calcSMA(closes, 50);
            const sma200 = calcSMA(closes, 200);
            if (classifyStage(price, sma50, sma200) !== 'STAGE_2') continue;

            // GATE 2: RSI 60-70
            const rsi = calcRSI(closes, 14);
            if (!rsi || rsi < 60 || rsi > 70) continue;

            // GATE 3: NIFTY
            if (!checkNiftyGate(sigDate)) continue;

            totalProcessedSignals++;
            filteredSignalsCount++;

            const sigClose = sigCandle.close;
            const day10Close = allCandles[sigIdx + 10].close;

            // --- STUDY E & F: Filtered Limit Analysis ---
            const calcLimit = (optKey, limitPrice, startDay, endDay) => {
                for (let d = startDay; d <= endDay; d++) {
                    const currentCandle = allCandles[sigIdx + d];
                    if (currentCandle.low <= limitPrice) {
                        stats[optKey].fills++;

                        // Exact unmanaged P&L% held to Day 10
                        const pnlPct = ((day10Close - limitPrice) / limitPrice) * 100;
                        stats[optKey].sumPnl += pnlPct;
                        if (pnlPct > 0) stats[optKey].wins++;

                        // Study F Metrics (Opt 2 & 4 only)
                        if (optKey === 'opt2' || optKey === 'opt4') {
                            // Find Max Gain in 10 days
                            let maxHigh = -Infinity;
                            for (let x = d; x <= 10; x++) {
                                if (sigIdx + x >= allCandles.length) break;
                                maxHigh = Math.max(maxHigh, allCandles[sigIdx + x].high);
                            }
                            const maxGainPct = ((maxHigh - limitPrice) / limitPrice) * 100;

                            // Structure Stop Logic
                            let rawStop = optKey === 'opt4' ? Math.min(allCandles[sigIdx + 1].low, allCandles[sigIdx + 2].low) : currentCandle.low;
                            let stopDistPct = ((limitPrice - rawStop) / limitPrice) * 100;

                            // Minimum stop distance bounded to 1.5% to avoid divide-by-zero math errors
                            stopDistPct = Math.max(1.5, stopDistPct);

                            const rrRatio = maxGainPct > 0 ? (maxGainPct / stopDistPct) : 0;

                            stats[optKey].sumStopDist += stopDistPct;
                            stats[optKey].sumMaxGain += maxGainPct;
                            stats[optKey].sumRR += rrRatio;
                            if (rrRatio > 2.0) stats[optKey].rrGt2++;
                            if (rrRatio > 3.0) stats[optKey].rrGt3++;
                        }
                        break;
                    }
                }
            };

            // Limit 1: Signal Close - 1%
            calcLimit('opt1', sigClose * 0.99, 1, 5);
            // Limit 2: Signal Close - 2%
            calcLimit('opt2', sigClose * 0.98, 1, 5);
            // Limit 3: Day+1 Low (placed day 2)
            calcLimit('opt3', allCandles[sigIdx + 1].low, 2, 5);
            // Limit 4: Min of Day 1 & 2 Lows (placed day 3)
            const l4 = Math.min(allCandles[sigIdx + 1].low, allCandles[sigIdx + 2].low);
            calcLimit('opt4', l4, 3, 5);
        }
    }

    let outStr = '';
    outStr += '\n\n═══════════════════════════════════════════════════════\n';
    outStr += ` FILTERED LIMIT ORDER STUDY RESULTS\n`;
    outStr += '═══════════════════════════════════════════════════════\n';
    outStr += `Signals evaluated after Stage 2, RSI (60-70), NIFTY gates: ${filteredSignalsCount}\n\n`;

    outStr += '[STUDY E] Filtered Limit Order Performance\n';

    const printOpt = (name, opt) => {
        const hitRate = filteredSignalsCount ? (opt.fills / filteredSignalsCount * 100).toFixed(1) : 0;
        const winRate = opt.fills ? (opt.wins / opt.fills * 100).toFixed(1) : 0;
        const avgPnl = opt.fills ? (opt.sumPnl / opt.fills).toFixed(2) : 0;
        outStr += `${name.padEnd(30)} => Fills: ${String(opt.fills).padStart(3)} (${hitRate}%) | Win: ${winRate}% | Avg PnL: ${avgPnl}%\n`;
    };

    printOpt('Option 1 (Limit @ -1.0%)', stats.opt1);
    printOpt('Option 2 (Limit @ -2.0%)', stats.opt2);
    printOpt('Option 3 (Limit @ Day+1 Low)', stats.opt3);
    printOpt('Option 4 (Limit @ Min D1,D2)', stats.opt4);

    outStr += '\n[STUDY F] Risk/Reward with Limit Entry (Filtered Only)\n';

    const printRR = (name, opt) => {
        outStr += `\n>> ${name}\n`;
        if (opt.fills === 0) {
            outStr += `No fills to calculate R:R.\n`;
            return;
        }
        const avgStop = (opt.sumStopDist / opt.fills).toFixed(2);
        const avgMaxGain = (opt.sumMaxGain / opt.fills).toFixed(2);
        const avgRR = (opt.sumRR / opt.fills).toFixed(2);
        const pctGt2 = (opt.rrGt2 / opt.fills * 100).toFixed(1);
        const pctGt3 = (opt.rrGt3 / opt.fills * 100).toFixed(1);

        outStr += `Avg stop distance (bounded 1.5%): ${avgStop}%\n`;
        outStr += `Avg max gain (by Day 10):         ${avgMaxGain}%\n`;
        outStr += `Avg R:R ratio:                    ${avgRR}\n`;
        outStr += `Trades where R:R > 2.0:           ${opt.rrGt2} out of ${opt.fills} (${pctGt2}%)\n`;
        outStr += `Trades where R:R > 3.0:           ${opt.rrGt3} out of ${opt.fills} (${pctGt3}%)\n`;
    };

    printRR('Option 2 (Signal Close - 2.0%)', stats.opt2);
    printRR('Option 4 (Min of Day 1 & Day 2 Lows)', stats.opt4);

    outStr += '\n═══════════════════════════════════════════════════════\n';

    console.log(outStr);
    fs.writeFileSync(path.join(__dirname, '..', 'outputs', 'filtered_limit_study.txt'), outStr);
    console.log('✅ Results saved to outputs/filtered_limit_study.txt\n');

    await prisma.$disconnect();
    process.exit(0);
}

main().catch(e => { console.error('FATAL:', e); process.exit(1); });
