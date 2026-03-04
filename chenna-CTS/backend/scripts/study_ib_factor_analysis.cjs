const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const path = require('path');
const fs = require('fs');

const CACHE_DIR_30M = path.join(__dirname, '../cache/30minute');
const CACHE_DIR_DAY = path.join(__dirname, '../cache/day');

function load30mCache(symbol) {
    const cleanKey = symbol.replace(/[^a-zA-Z0-9_-]/g, '_');
    const p = path.join(CACHE_DIR_30M, `${cleanKey}_master.json`);
    if (!fs.existsSync(p)) return null;
    try {
        const raw = JSON.parse(fs.readFileSync(p, 'utf8'));
        const byDay = {};
        for (const c of raw) {
            const parts = String(c.timestamp || c.date).split('T');
            const d = parts[0];
            const t = parts[1].substring(0, 8);
            if (!byDay[d]) byDay[d] = [];
            byDay[d].push({ ...c, timeStr: t });
        }
        return byDay;
    } catch (e) { return null; }
}

function loadDayCache(symbol) {
    const cleanKey = symbol.replace(/[^a-zA-Z0-9_-]/g, '_');
    const p = path.join(CACHE_DIR_DAY, `${cleanKey}_master.json`);
    if (!fs.existsSync(p)) return null;
    try {
        const raw = JSON.parse(fs.readFileSync(p, 'utf8'));
        return raw.map(c => ({
            date: String(c.timestamp || c.date).split('T')[0],
            close: parseFloat(c.close),
            open: parseFloat(c.open),
            high: parseFloat(c.high),
            low: parseFloat(c.low),
            volume: parseFloat(c.volume)
        })).sort((a, b) => a.date.localeCompare(b.date));
    } catch (e) { return null; }
}

function calcSMA(data, period) {
    let sum = 0;
    for (let i = 0; i < period; i++) sum += data[i];
    return sum / period;
}

function calcEMA(data, period, index) {
    if (index < period - 1) return null;
    let multiplier = 2 / (period + 1);
    let ema = calcSMA(data.slice(index - period + 1, index + 1), period);
    for (let i = index - period + 1; i <= index; i++) {
        ema = (data[i] - ema) * multiplier + ema;
    }
    return ema;
}

function calcADV20(dayData, targetDateIdx) {
    if (targetDateIdx < 20) return null;
    let sumVol = 0;
    for (let i = targetDateIdx - 20; i < targetDateIdx; i++) sumVol += dayData[i].volume || 0;
    return sumVol / 20;
}

function calcRSI(candles, index, period = 14) {
    if (index < period) return 50;
    let gains = 0, losses = 0;
    for (let i = index - period + 1; i <= index; i++) {
        let diff = parseFloat(candles[i].close) - parseFloat(candles[i - 1].close);
        if (diff >= 0) gains += diff;
        else losses -= diff;
    }
    let avgGain = gains / period, avgLoss = losses / period;
    if (avgLoss === 0) return 100;
    let rs = avgGain / avgLoss;
    return 100 - (100 / (1 + rs));
}

function calcADX(candles, index, period = 14) {
    if (index < period * 2) return 20; // Default weak trend if insufficient data
    let trs = [], pdms = [], ndms = [];
    for (let i = index - period * 2 + 1; i <= index; i++) {
        const h = parseFloat(candles[i].high), l = parseFloat(candles[i].low), c_prev = parseFloat(candles[i - 1].close);
        const h_prev = parseFloat(candles[i - 1].high), l_prev = parseFloat(candles[i - 1].low);
        trs.push(Math.max(h - l, Math.abs(h - c_prev), Math.abs(l - c_prev)));
        const um = h - h_prev, dm = l_prev - l;
        pdms.push((um > dm && um > 0) ? um : 0);
        ndms.push((dm > um && dm > 0) ? dm : 0);
    }

    // Smooth ATR, PDM, NDM using Wilder's Smoothing
    const smooth = (arr) => {
        let s = [calcSMA(arr.slice(0, period), period)];
        for (let i = 1; i <= period; i++) s.push((s[i - 1] * (period - 1) + arr[period + i - 1]) / period);
        return s;
    };

    const s_tr = smooth(trs).slice(-1)[0] || 1;
    const s_pdm = smooth(pdms).slice(-1)[0] || 0;
    const s_ndm = smooth(ndms).slice(-1)[0] || 0;

    const pdi = (s_pdm / s_tr) * 100;
    const ndi = (s_ndm / s_tr) * 100;
    const dx = Math.abs(pdi - ndi) / (pdi + ndi || 1) * 100;
    return dx; // Returns approx raw DX, good enough for separation proxy
}

// Synthetic Sector Construction
const sectorDataCache = {};
const niftyDataCache = {};

async function buildSyntheticCache(dates) {
    const allStocks = await prisma.stock.findMany();

    // NIFTY 50
    const niftyPath = path.join(__dirname, '../cache/day/NIFTY50_2020-01-01_2026-12-31.json');
    let niftyData = [];
    if (fs.existsSync(niftyPath)) {
        niftyData = JSON.parse(fs.readFileSync(niftyPath, 'utf8')).data.map(c => ({
            date: String(c.timestamp || c.date).split('T')[0],
            close: parseFloat(c.close)
        })).sort((a, b) => a.date.localeCompare(b.date));
    }

    for (const d of dates) {
        sectorDataCache[d] = {};
        const sectorSums = {};
        const sectorCounts = {};

        for (const st of allStocks) {
            if (!st.sector) continue;
            const data = loadDayCache(st.symbol);
            if (!data) continue;

            const idx = data.findIndex(c => c.date === d);
            if (idx > 0) {
                const prevClose = data[idx - 1].close;
                const todayClose = data[idx].close;
                const pct = ((todayClose - prevClose) / prevClose) * 100;

                if (!sectorSums[st.sector]) sectorSums[st.sector] = 0, sectorCounts[st.sector] = 0;
                sectorSums[st.sector] += pct;
                sectorCounts[st.sector]++;
            }
        }

        for (const sName in sectorSums) {
            sectorDataCache[d][sName] = sectorSums[sName] / sectorCounts[sName];
        }

        // NIFTY
        const nIdx = niftyData.findIndex(c => c.date === d);
        if (nIdx > 0) {
            const pct = ((niftyData[nIdx].close - niftyData[nIdx - 1].close) / niftyData[nIdx - 1].close) * 100;
            niftyDataCache[d] = pct;
        }
    }
}

class FactorBucket {
    constructor() { this.win = 0; this.loss = 0; }
    add(isWin) { if (isWin) this.win++; else this.loss++; }
    pct() { return this.win + this.loss === 0 ? "0.0%" : ((this.win / (this.win + this.loss)) * 100).toFixed(1) + "%"; }
    total() { return this.win + this.loss; }
    format(label) { return `${label.padEnd(25)} | ${this.pct().padStart(6)} (${this.win}/${this.total()})`; }
}

async function runFactorAnalysis() {
    const records = await prisma.stockCategory.findMany({
        where: { category: { key: 'INTRADAY_BOOST' } },
        include: { stock: true }
    });

    const uniqueMap = new Map();
    for (const r of records) uniqueMap.set(r.stock.symbol, r.stock);
    const universeStocks = Array.from(uniqueMap.values());

    // Explicit valid dates established in Module 2 tested data
    const allTradingDates = [
        '2025-10-31', '2025-11-20', '2025-12-19', '2026-01-08',
        '2026-02-13', '2026-02-16', '2026-02-17', '2026-02-18',
        '2026-02-19', '2026-02-20'
    ];

    console.log(`Building Caches...`);
    await buildSyntheticCache(allTradingDates);

    console.log(`Scanning 1:1 R:R Triggers across Universe...`);

    const factors = {
        sectorAlign: { aligned: new FactorBucket(), opposite: new FactorBucket() },
        sectorMag: { 'UP_+0.5_LONG': new FactorBucket(), 'DOWN_-0.5_SHORT': new FactorBucket(), 'AGAINST_UP_SHORT': new FactorBucket(), 'AGAINST_DOWN_LONG': new FactorBucket() },
        niftyAlign: { aligned: new FactorBucket(), opposite: new FactorBucket() },
        volume: { '<1x': new FactorBucket(), '1x-2x': new FactorBucket(), '>2x': new FactorBucket() },
        range: { '<0.5%': new FactorBucket(), '0.5%-1%': new FactorBucket(), '>1%': new FactorBucket() },
        meanRev: { 'Prev RED + Long': new FactorBucket(), 'Prev GRN + Short': new FactorBucket(), 'Trend Cont': new FactorBucket() },
        prevRng: { '<1%': new FactorBucket(), '1-2%': new FactorBucket(), '>2%': new FactorBucket() },
        gap: { '<0.5%': new FactorBucket(), '0.5-1%': new FactorBucket(), '>1%': new FactorBucket() },
        rsi: { '<50': new FactorBucket(), '50-70': new FactorBucket(), '>70': new FactorBucket() },
        ema20: { 'Within 1%': new FactorBucket(), '1-3% Above': new FactorBucket(), '>3% Above': new FactorBucket(), 'Below': new FactorBucket() },
        adx: { '<15': new FactorBucket(), '15-25': new FactorBucket(), '>25': new FactorBucket() },
        vwap: { 'Aligned': new FactorBucket(), 'Contradicts': new FactorBucket() }
    };

    let validTriggers = 0;

    for (const date of allTradingDates) {
        for (const stock of universeStocks) {
            const sym = stock.symbol;

            const data30 = load30mCache(sym);
            if (!data30 || !data30[date]) continue;
            const candles = data30[date];
            if (candles.length < 5) continue;

            const dataDay = loadDayCache(sym);
            if (!dataDay) continue;
            const targetDayIdx = dataDay.findIndex(c => c.date === date);
            if (targetDayIdx < 1) continue;

            const prevDay = dataDay[targetDayIdx - 1];
            const adv20 = calcADV20(dataDay, targetDayIdx) || candles[0].volume;
            const ema20 = calcEMA(dataDay.map(d => d.close), 20, targetDayIdx - 1) || candles[0].close;

            const c1 = candles[0];
            const orh = parseFloat(c1.high), orl = parseFloat(c1.low), orRange = orh - orl;
            if (orRange === 0) continue;

            const op = parseFloat(c1.open);
            const orRangePct = Math.abs((orRange / op) * 100);
            const gapPct = Math.abs(((op - prevDay.close) / prevDay.close) * 100);
            const pRange = Math.abs(((prevDay.high - prevDay.low) / prevDay.low) * 100);
            const pGreen = prevDay.close > prevDay.open;
            const pRed = prevDay.open > prevDay.close;

            let bIdx = -1, sType = null, boPrice = 0;
            for (let i = 1; i <= 5; i++) {
                if (!candles[i]) continue;
                const c = parseFloat(candles[i].close);
                if (c > orh) { bIdx = i; sType = 'LONG'; boPrice = c; break; }
                else if (c < orl) { bIdx = i; sType = 'SHORT'; boPrice = c; break; }
            }
            if (bIdx === -1 || bIdx + 1 >= candles.length) continue;

            const bCandle = candles[bIdx];
            const vRat = parseFloat(bCandle.volume) / (adv20 / 13);
            const rsi = calcRSI(candles, bIdx);
            const adx = calcADX(candles, bIdx);

            // VWAP Calc up to breakout
            let cumV = 0, cumPV = 0;
            for (let i = 0; i <= bIdx; i++) {
                let typ = (parseFloat(candles[i].high) + parseFloat(candles[i].low) + parseFloat(candles[i].close)) / 3;
                let vol = parseFloat(candles[i].volume);
                cumV += vol; cumPV += typ * vol;
            }
            const vwap = cumV > 0 ? cumPV / cumV : op;

            const baseStop = sType === 'LONG' ? parseFloat(bCandle.low) : parseFloat(bCandle.high);
            let touchedOR = false, piercedIntra = false, entryPrice = 0, entryType = 'RUNNER';

            // Track Entry logic
            for (let i = bIdx + 1; i < candles.length; i++) {
                const ch = parseFloat(candles[i].high), cl = parseFloat(candles[i].low);
                if (sType === 'LONG') {
                    if (!touchedOR && cl <= orh) { touchedOR = true; entryType = 'RETEST'; entryPrice = orh; if (cl <= baseStop) piercedIntra = true; }
                } else {
                    if (!touchedOR && ch >= orl) { touchedOR = true; entryType = 'RETEST'; entryPrice = orl; if (ch >= baseStop) piercedIntra = true; }
                }
            }

            if (touchedOR && piercedIntra) continue; // Toss out instant stop hunts
            if (entryType === 'RUNNER') entryPrice = parseFloat(candles[bIdx + 1].open);

            // ACTUAL 1:1 R:R (1.0)
            const trueRisk = Math.max(Math.abs(entryPrice - baseStop), entryPrice * 0.005);
            const targetPrice = sType === 'LONG' ? entryPrice + trueRisk : entryPrice - trueRisk;

            let isWin = false;
            for (let i = bIdx + 1; i < candles.length; i++) {
                const ch = parseFloat(candles[i].high), cl = parseFloat(candles[i].low);
                if (sType === 'LONG') {
                    if (cl <= baseStop) break;
                    if (ch >= targetPrice) { isWin = true; break; }
                } else {
                    if (ch >= baseStop) break;
                    if (cl <= targetPrice) { isWin = true; break; }
                }
            }

            validTriggers++;

            // Record Factor performance
            const sName = stock.sector || 'UNKNOWN';
            const sectorPerf = sectorDataCache[date] ? sectorDataCache[date][sName] : 0;
            const niftyPerf = niftyDataCache[date] || 0;

            // F1 Sector Alignment
            if (sectorPerf !== undefined) {
                const align = (sectorPerf > 0 && sType === 'LONG') || (sectorPerf < 0 && sType === 'SHORT');
                if (align) factors.sectorAlign.aligned.add(isWin); else factors.sectorAlign.opposite.add(isWin);

                if (sectorPerf > 0.5 && sType === 'LONG') factors.sectorMag['UP_+0.5_LONG'].add(isWin);
                if (sectorPerf < -0.5 && sType === 'SHORT') factors.sectorMag['DOWN_-0.5_SHORT'].add(isWin);
                if (sectorPerf > 0.5 && sType === 'SHORT') factors.sectorMag['AGAINST_UP_SHORT'].add(isWin);
                if (sectorPerf < -0.5 && sType === 'LONG') factors.sectorMag['AGAINST_DOWN_LONG'].add(isWin);
            }

            // F2 NIFTY
            const nAlign = (niftyPerf > 0 && sType === 'LONG') || (niftyPerf < 0 && sType === 'SHORT');
            if (nAlign) factors.niftyAlign.aligned.add(isWin); else factors.niftyAlign.opposite.add(isWin);

            // F3 Volume
            if (vRat < 1) factors.volume['<1x'].add(isWin); else if (vRat <= 2) factors.volume['1x-2x'].add(isWin); else factors.volume['>2x'].add(isWin);

            // F4 Range
            if (orRangePct < 0.5) factors.range['<0.5%'].add(isWin); else if (orRangePct <= 1.0) factors.range['0.5%-1%'].add(isWin); else factors.range['>1%'].add(isWin);

            // F5 Mean Reversion
            if (pRed && sType === 'LONG') factors.meanRev['Prev RED + Long'].add(isWin);
            else if (pGreen && sType === 'SHORT') factors.meanRev['Prev GRN + Short'].add(isWin);
            else factors.meanRev['Trend Cont'].add(isWin);

            // F6 Prev Day Range
            if (pRange < 1.0) factors.prevRng['<1%'].add(isWin); else if (pRange <= 2.0) factors.prevRng['1-2%'].add(isWin); else factors.prevRng['>2%'].add(isWin);

            // F7 Gap
            if (gapPct < 0.5) factors.gap['<0.5%'].add(isWin); else if (gapPct <= 1.0) factors.gap['0.5-1%'].add(isWin); else factors.gap['>1%'].add(isWin);

            // F8 RSI
            if (rsi < 50) factors.rsi['<50'].add(isWin); else if (rsi <= 70) factors.rsi['50-70'].add(isWin); else factors.rsi['>70'].add(isWin);

            // F9 EMA20
            const dist = ((op - ema20) / ema20) * 100;
            if (Math.abs(dist) <= 1.0) factors.ema20['Within 1%'].add(isWin);
            else if (dist > 1.0 && dist <= 3.0) factors.ema20['1-3% Above'].add(isWin);
            else if (dist > 3.0) factors.ema20['>3% Above'].add(isWin);
            else factors.ema20['Below'].add(isWin);

            // F10 ADX
            if (adx < 15) factors.adx['<15'].add(isWin); else if (adx <= 25) factors.adx['15-25'].add(isWin); else factors.adx['>25'].add(isWin);

            // F11 VWAP
            const vAlign = (op > vwap && sType === 'LONG') || (op < vwap && sType === 'SHORT');
            if (vAlign) factors.vwap['Aligned'].add(isWin); else factors.vwap['Contradicts'].add(isWin);
        }
    }

    console.log(`\n========================================`);
    console.log(`1.0 R:R FACTOR ANALYSIS (${validTriggers} Valid Triggers)`);
    console.log(`========================================\n`);

    for (const [factorName, buckets] of Object.entries(factors)) {
        console.log(`--- [ ${factorName.toUpperCase()} ] ---`);
        for (const [bName, buck] of Object.entries(buckets)) {
            console.log(buck.format(bName));
        }
        console.log("");
    }
}

runFactorAnalysis().then(() => prisma.$disconnect());
