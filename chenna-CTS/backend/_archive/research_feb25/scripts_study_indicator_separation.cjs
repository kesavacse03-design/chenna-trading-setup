const path = require('path');
const fs = require('fs');
const priceService = require('../services/priceService.cjs');
const prisma = require('../lib/prisma.cjs');

// Indicators
function calcSMA(closes, period) {
    if (closes.length < period) return null;
    return closes.slice(-period).reduce((a, b) => a + b, 0) / period;
}

function calcEMA(closes, period) {
    if (closes.length < period) return null;
    const k = 2 / (period + 1);
    let ema = closes.slice(0, period).reduce((a, b) => a + b, 0) / period;
    for (let i = period; i < closes.length; i++) ema = closes[i] * k + ema * (1 - k);
    return ema;
}

function calcRSI(closes, period = 14) {
    if (closes.length <= period) return null;
    let gains = 0, losses = 0;
    for (let i = 1; i <= period; i++) {
        const diff = closes[i] - closes[i - 1];
        if (diff > 0) gains += diff; else losses -= diff;
    }
    let avgGain = gains / period; let avgLoss = losses / period;
    for (let i = period + 1; i < closes.length; i++) {
        const diff = closes[i] - closes[i - 1];
        avgGain = (avgGain * (period - 1) + (diff > 0 ? diff : 0)) / period;
        avgLoss = (avgLoss * (period - 1) + (diff < 0 ? -diff : 0)) / period;
    }
    if (avgLoss === 0) return 100;
    return 100 - (100 / (1 + avgGain / avgLoss));
}

function calcMACD(closes) {
    if (closes.length < 26) return { macd: 0, signal: 0, histFast: 0, histSlow: 0 };
    const ema12Arr = [];
    const ema26Arr = [];
    for (let i = 26; i <= closes.length; i++) {
        ema12Arr.push(calcEMA(closes.slice(0, i), 12));
        ema26Arr.push(calcEMA(closes.slice(0, i), 26));
    }
    const macdLine = ema12Arr.map((v, i) => v - ema26Arr[i]);
    const signalLine = calcEMA(macdLine, 9);
    const currMacd = macdLine[macdLine.length - 1];
    const prevMacd = macdLine[macdLine.length - 2];
    const currSig = signalLine;
    let prevSig = 0;
    if (macdLine.length > 9) {
        prevSig = calcEMA(macdLine.slice(0, macdLine.length - 1), 9);
    }
    return {
        macd: currMacd,
        signal: currSig,
        isBullish: currMacd > currSig,
        isRising: (currMacd - currSig) > (prevMacd - prevSig)
    };
}

function calcATR(candles, period = 14) {
    if (candles.length <= period) return null;
    let trs = [];
    for (let i = 1; i < candles.length; i++) {
        const h = candles[i].high, l = candles[i].low, pc = candles[i - 1].close;
        trs.push(Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc)));
    }
    let atr = trs.slice(0, period).reduce((a, b) => a + b, 0) / period;
    for (let i = period; i < trs.length; i++) {
        atr = (atr * (period - 1) + trs[i]) / period;
    }
    return atr;
}

function calcADX(candles, period = 14) {
    if (candles.length <= period * 2) return null;
    let trs = [], pdms = [], ndms = [];
    for (let i = 1; i < candles.length; i++) {
        const h = candles[i].high, l = candles[i].low, pc = candles[i - 1].close;
        const ph = candles[i - 1].high, pl = candles[i - 1].low;
        trs.push(Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc)));
        const upMove = h - ph; const downMove = pl - l;
        pdms.push((upMove > downMove && upMove > 0) ? upMove : 0);
        ndms.push((downMove > upMove && downMove > 0) ? downMove : 0);
    }

    let smoothTR = trs.slice(0, period).reduce((a, b) => a + b, 0);
    let smoothPDM = pdms.slice(0, period).reduce((a, b) => a + b, 0);
    let smoothNDM = ndms.slice(0, period).reduce((a, b) => a + b, 0);

    let dxs = [];
    for (let i = period; i < trs.length; i++) {
        smoothTR = smoothTR - (smoothTR / period) + trs[i];
        smoothPDM = smoothPDM - (smoothPDM / period) + pdms[i];
        smoothNDM = smoothNDM - (smoothNDM / period) + ndms[i];

        const pdi = 100 * (smoothPDM / smoothTR);
        const ndi = 100 * (smoothNDM / smoothTR);
        const dx = 100 * (Math.abs(pdi - ndi) / (pdi + ndi || 1));
        dxs.push(dx);
    }

    if (dxs.length < period) return null;
    return dxs.slice(-period).reduce((a, b) => a + b, 0) / period;
}

function toISTDateString(date) {
    const d = new Date(date);
    d.setMinutes(d.getMinutes() + 330);
    return d.toISOString().split('T')[0];
}

async function main() {
    const cat = await prisma.category.findUnique({ where: { key: 'SHORT_TERM_SWING_BO_UP' } });
    const stockEntries = await prisma.stockCategory.findMany({
        where: { categoryId: cat.id, addedDate: { gte: new Date('2025-08-01T00:00:00Z') } },
        include: { stock: true }
    });

    const uniqueMap = new Map();
    for (const sc of stockEntries) {
        uniqueMap.set(`${sc.stock.symbol}_${toISTDateString(sc.addedDate)}`, {
            symbol: sc.stock.symbol, instrumentKey: sc.stock.instrumentKey, addedDate: toISTDateString(sc.addedDate)
        });
    }
    const targetStocks = Array.from(uniqueMap.values()).sort((a, b) => a.addedDate.localeCompare(b.addedDate));

    console.log(`Analyzing ${targetStocks.length} historical signals...\n`);

    const results = { winners: [], losers: [] };
    let processed = 0;

    for (const req of targetStocks) {
        try {
            const signalDateObj = new Date(req.addedDate + 'T00:00:00+05:30');
            const dailyFrom = toISTDateString(new Date(signalDateObj.getTime() - 150 * 86400000));
            const dailyTo = toISTDateString(new Date(signalDateObj.getTime() + 25 * 86400000));

            const dailyData = await priceService.fetchFromUpstox(req.instrumentKey, dailyFrom, dailyTo, 'day', req.symbol);
            if (!dailyData || dailyData.length === 0) continue;

            const dailyC = dailyData.map(c => ({
                date: String(c.timestamp || c.date).split('T')[0].split(' ')[0], open: parseFloat(c.open), high: parseFloat(c.high), low: parseFloat(c.low), close: parseFloat(c.close), volume: parseFloat(c.volume)
            })).sort((a, b) => a.date.localeCompare(b.date));

            const sIdx = dailyC.findIndex(c => c.date === req.addedDate);
            if (sIdx < 50 || sIdx + 10 >= dailyC.length) continue;

            const preC = dailyC.slice(0, sIdx + 1);
            const closes = preC.map(c => c.close);
            const sCandle = preC[sIdx];
            const p10Close = dailyC[sIdx + 10].close;
            const isWinner = p10Close > sCandle.close;

            const resLevel = Math.max(...dailyC.slice(sIdx - 5, sIdx).map(c => c.close));
            let tests = 0;
            for (let i = Math.max(0, sIdx - 20); i < sIdx; i++) {
                if (dailyC[i].high >= resLevel * 0.99) tests++;
            }

            const trange = sCandle.high - sCandle.low;

            const metric = {
                rsi14: calcRSI(closes, 14),
                rsi7: calcRSI(closes, 7),
                ema5_gt_10: calcEMA(closes, 5) > calcEMA(closes, 10),
                ema9_gt_21: calcEMA(closes, 9) > calcEMA(closes, 21),
                macd: calcMACD(closes),
                dist20: ((sCandle.close - calcSMA(closes, 20)) / calcSMA(closes, 20)) * 100,
                dist50: ((sCandle.close - calcSMA(closes, 50)) / calcSMA(closes, 50)) * 100,
                adx: calcADX(preC, 14),
                volRatio: sCandle.volume / (preC.slice(-21, -1).reduce((a, b) => a + b.volume, 0) / 20),
                bodyPct: trange > 0 ? (Math.abs(sCandle.close - sCandle.open) / trange) * 100 : 0,
                wickPct: trange > 0 ? ((sCandle.high - Math.max(sCandle.open, sCandle.close)) / trange) * 100 : 0,
                closePos: trange > 0 ? ((sCandle.close - sCandle.low) / trange) * 100 : 0,
                atrPct: (calcATR(preC, 14) / sCandle.close) * 100,
                ret5d: ((sCandle.close - dailyC[sIdx - 5].close) / dailyC[sIdx - 5].close) * 100,
                ret10d: ((sCandle.close - dailyC[sIdx - 10].close) / dailyC[sIdx - 10].close) * 100,
                testCount: tests,
                isWinner
            };

            // 1H Data
            const minFrom = req.addedDate;
            const minToStr = toISTDateString(new Date(signalDateObj.getTime() + 5 * 86400000));
            const minData = await priceService.fetchFromUpstox(req.instrumentKey, minFrom, minToStr, '30minute', req.symbol);

            if (minData && minData.length > 0) {
                const hourly = [];
                for (let i = 0; i < minData.length; i += 2) {
                    if (i + 1 < minData.length) {
                        hourly.push({
                            timestamp: minData[i].timestamp, dateStr: String(minData[i].timestamp).split('T')[0],
                            close: parseFloat(minData[i + 1].close), vol: parseFloat(minData[i].volume) + parseFloat(minData[i + 1].volume)
                        });
                    }
                }

                let bIdx = hourly.findIndex(h => h.dateStr === req.addedDate && h.close > resLevel);
                if (bIdx !== -1) {
                    metric.type = (bIdx + 1 < hourly.length && hourly[bIdx + 1].close > resLevel) ? 'A' : 'C'; // simplified logic for Failure Analysis
                    if (!metric.type) metric.type = 'D';
                } else metric.type = 'D';
            }

            if (isWinner) results.winners.push(metric); else results.losers.push(metric);

            processed++;
            if (processed % 20 === 0) process.stdout.write('.');
        } catch (e) { }
    }

    const wCnt = results.winners.length;
    const lCnt = results.losers.length;

    const avg = (arr, key) => arr.map(x => x[key]).filter(x => x != null).reduce((a, b) => a + b, 0) / arr.length;
    const boolPct = (arr, key) => (arr.filter(x => x[key]).length / arr.length) * 100;

    console.log('\n\nINDICATOR                      | WINNERS (avg) | LOSERS (avg) | DIFFERENCE');
    console.log('─────────────────────────────────────────────────────────────────────────');

    const fields = [
        { k: 'rsi14', n: 'RSI(14)' }, { k: 'rsi7', n: 'RSI(7) — short term momentum' },
        { k: 'ema5_gt_10', n: 'EMA 5 vs EMA 10 (crossover?)', fmt: boolPct, s: '%' },
        { k: 'ema9_gt_21', n: 'EMA 9 vs EMA 21 (swing cross)', fmt: boolPct, s: '%' },
        { k: 'macdBullish', n: 'MACD line vs Signal line', calc: arr => (arr.filter(x => x.macd.isBullish).length / arr.length) * 100, s: '% bullish' },
        { k: 'macdRising', n: 'MACD histogram direction', calc: arr => (arr.filter(x => x.macd.isRising).length / arr.length) * 100, s: '% rising' },
        { k: 'dist20', n: 'Price vs SMA 20 distance %' },
        { k: 'dist50', n: 'Price vs SMA 50 distance %' },
        { k: 'adx', n: 'ADX(14) — trend strength' },
        { k: 'volRatio', n: 'Volume ratio (signal / 20d avg)' },
        { k: 'bodyPct', n: 'Signal candle body % of range' },
        { k: 'wickPct', n: 'Signal candle upper wick %' },
        { k: 'closePos', n: '(close-low)/(high-low)' },
        { k: 'atrPct', n: 'ATR(14) as % of price' },
        { k: 'ret5d', n: 'Prior 5-day return %' },
        { k: 'ret10d', n: 'Prior 10-day return %' },
        { k: 'testCount', n: 'Number of times tested res (20d)' }
    ];

    const diffs = [];

    for (let f of fields) {
        const wVal = f.calc ? f.calc(results.winners) : (f.fmt ? f.fmt(results.winners, f.k) : avg(results.winners, f.k));
        const lVal = f.calc ? f.calc(results.losers) : (f.fmt ? f.fmt(results.losers, f.k) : avg(results.losers, f.k));
        const diff = Math.abs(wVal - lVal);
        const sign = wVal > lVal ? '+' : '';
        diffs.push({ name: f.n, diff, w: wVal, l: lVal, rel: (wVal - lVal) / Math.abs(lVal || 1) });

        let suffix = f.s || '';
        console.log(`${f.n.padEnd(30)} | ${wVal.toFixed(2).padStart(8)}${suffix.padEnd(4)} | ${lVal.toFixed(2).padStart(8)}${suffix.padEnd(3)}| ${sign}${(wVal - lVal).toFixed(2)}`);
    }

    console.log('\nTOP 5 SEPARATORS (By Relative % Difference):');
    diffs.sort((a, b) => Math.abs(b.rel) - Math.abs(a.rel)).slice(0, 5).forEach(d => {
        console.log(` - ${d.name}: Winners ${d.w.toFixed(2)}, Losers ${d.l.toFixed(2)} (Gap: ${(d.rel * 100).toFixed(1)}%)`);
    });

    console.log('\nFAILURE ANALYSIS:');
    console.log(`Total signals: ${wCnt + lCnt}`);
    console.log(`Winners (10d): ${wCnt} (${((wCnt / (wCnt + lCnt)) * 100).toFixed(1)}%)`);
    console.log(`Losers (10d):  ${lCnt} (${((lCnt / (wCnt + lCnt)) * 100).toFixed(1)}%)`);
    console.log(`Of the LOSERS:`);
    console.log(`  How many were Type A (held 1H)?                  ${results.losers.filter(x => x.type === 'A').length}`);
    console.log(`  How many were Type C (failed 1H)?                ${results.losers.filter(x => x.type === 'C').length}`);
    console.log(`  How many had RSI > 70 (overheated)?              ${results.losers.filter(x => x.rsi14 > 70).length}`);
    console.log(`  How many had price > 8% above SMA50 (extended)?  ${results.losers.filter(x => x.dist50 > 8).length}`);
    console.log(`  How many had prior 5-day return > 10%?           ${results.losers.filter(x => x.ret5d > 10).length}`);
    console.log(`  How many had volume < 1.0x avg (weak breakout)?  ${results.losers.filter(x => x.volRatio < 1.0).length}`);
    console.log(`  How many had ADX < 20 (no trend)?                ${results.losers.filter(x => x.adx < 20).length}`);

    process.exit(0);
}

main().catch(console.error);
