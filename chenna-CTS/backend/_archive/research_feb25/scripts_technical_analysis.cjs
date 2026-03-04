/**
 * MULTI-TIMEFRAME TECHNICAL ANALYSIS
 * 
 * For each stock in MULTI_SUPPORT_BO and MULTI_RESISTANCE_BO:
 * - Computes EMA 20/50/200, RSI 14, MACD on DAILY candles
 * - Checks weekly trend (EMA 20 weekly)
 * - Detects trendline patterns (HH/HL vs LH/LL)
 * - Identifies key technical conditions at signal time
 * - Correlates all indicators with 10-day outcome
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const fs = require('fs');
const path = require('path');
const priceService = require('../services/priceService.cjs');

function toISTDateString(date) {
    const d = new Date(date);
    d.setMinutes(d.getMinutes() + 330);
    return d.toISOString().split('T')[0];
}

function candleDateStr(candle) {
    const ts = String(candle.timestamp || candle.date || '');
    return ts.includes('T') ? ts.split('T')[0] : ts.split(' ')[0];
}

// ============ TECHNICAL INDICATORS ============

function calcEMA(candles, period) {
    if (candles.length < period) return [];
    const k = 2 / (period + 1);
    const emas = [];
    // SMA for initial value
    let sum = 0;
    for (let i = 0; i < period; i++) sum += candles[i].close;
    emas[period - 1] = sum / period;
    for (let i = period; i < candles.length; i++) {
        emas[i] = candles[i].close * k + emas[i - 1] * (1 - k);
    }
    return emas;
}

function calcRSI(candles, period = 14) {
    if (candles.length < period + 1) return [];
    const rsis = new Array(candles.length).fill(null);
    let avgGain = 0, avgLoss = 0;

    for (let i = 1; i <= period; i++) {
        const chg = candles[i].close - candles[i - 1].close;
        if (chg > 0) avgGain += chg; else avgLoss += Math.abs(chg);
    }
    avgGain /= period;
    avgLoss /= period;
    rsis[period] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);

    for (let i = period + 1; i < candles.length; i++) {
        const chg = candles[i].close - candles[i - 1].close;
        avgGain = (avgGain * (period - 1) + (chg > 0 ? chg : 0)) / period;
        avgLoss = (avgLoss * (period - 1) + (chg < 0 ? Math.abs(chg) : 0)) / period;
        rsis[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
    }
    return rsis;
}

function calcMACD(candles) {
    const ema12 = calcEMA(candles, 12);
    const ema26 = calcEMA(candles, 26);
    const macdLine = [];
    for (let i = 0; i < candles.length; i++) {
        macdLine[i] = (ema12[i] && ema26[i]) ? ema12[i] - ema26[i] : null;
    }
    // Signal line = 9-period EMA of MACD
    const validMacd = macdLine.filter(v => v !== null);
    if (validMacd.length < 9) return { line: macdLine, signal: [], histogram: [] };

    const signal = new Array(candles.length).fill(null);
    const k = 2 / 10;
    let firstValidIdx = macdLine.findIndex(v => v !== null);
    // SMA of first 9 valid MACD values
    let sum = 0, count = 0;
    for (let i = firstValidIdx; i < candles.length && count < 9; i++) {
        if (macdLine[i] !== null) { sum += macdLine[i]; count++; if (count === 9) signal[i] = sum / 9; }
    }
    let lastSigIdx = signal.findIndex(v => v !== null);
    if (lastSigIdx >= 0) {
        for (let i = lastSigIdx + 1; i < candles.length; i++) {
            if (macdLine[i] !== null) signal[i] = macdLine[i] * k + signal[i - 1] * (1 - k);
            else signal[i] = signal[i - 1];
        }
    }
    const histogram = macdLine.map((v, i) => (v !== null && signal[i] !== null) ? v - signal[i] : null);
    return { line: macdLine, signal, histogram };
}

function detectTrendPattern(candles, sigIdx) {
    // Check last 20 candles before signal for HH/HL or LH/LL pattern
    const lookback = Math.min(20, sigIdx);
    if (lookback < 10) return 'UNKNOWN';

    const slice = candles.slice(sigIdx - lookback, sigIdx + 1);

    // Find swing highs and lows (simple: local max/min over 3-bar window)
    const swingHighs = [];
    const swingLows = [];
    for (let i = 2; i < slice.length - 1; i++) {
        if (slice[i].high > slice[i - 1].high && slice[i].high > slice[i - 2].high &&
            slice[i].high > slice[i + 1].high) {
            swingHighs.push(slice[i].high);
        }
        if (slice[i].low < slice[i - 1].low && slice[i].low < slice[i - 2].low &&
            slice[i].low < slice[i + 1].low) {
            swingLows.push(slice[i].low);
        }
    }

    if (swingHighs.length < 2 || swingLows.length < 2) return 'NO_PATTERN';

    const lastH = swingHighs.slice(-2);
    const lastL = swingLows.slice(-2);
    const hhPattern = lastH[1] > lastH[0]; // Higher High
    const hlPattern = lastL[1] > lastL[0]; // Higher Low
    const lhPattern = lastH[1] < lastH[0]; // Lower High
    const llPattern = lastL[1] < lastL[0]; // Lower Low

    if (hhPattern && hlPattern) return 'UPTREND';      // HH + HL
    if (lhPattern && llPattern) return 'DOWNTREND';     // LH + LL
    if (hhPattern && llPattern) return 'EXPANDING';     // HH + LL (broadening)
    if (lhPattern && hlPattern) return 'CONTRACTING';   // LH + HL (triangle/consolidation)
    return 'MIXED';
}

// Build weekly candles from daily
function buildWeeklyCandles(dailyCandles) {
    const weekly = [];
    let current = null;
    for (const c of dailyCandles) {
        const d = new Date(c.timestamp || c.date);
        const weekStart = new Date(d);
        weekStart.setDate(d.getDate() - d.getDay());
        const weekKey = toISTDateString(weekStart);

        if (!current || current.weekKey !== weekKey) {
            if (current) weekly.push(current);
            current = {
                weekKey,
                timestamp: c.timestamp || c.date,
                open: c.open, high: c.high, low: c.low, close: c.close,
                volume: parseInt(c.volume || 0)
            };
        } else {
            current.high = Math.max(current.high, c.high);
            current.low = Math.min(current.low, c.low);
            current.close = c.close;
            current.volume += parseInt(c.volume || 0);
        }
    }
    if (current) weekly.push(current);
    return weekly;
}

async function analyzeCategory(categoryKey) {
    const out = [];
    const log = (msg) => out.push(msg);

    log('================================================================');
    log(`MULTI-TIMEFRAME TECHNICAL ANALYSIS: ${categoryKey}`);
    log('================================================================');

    const catStocks = await prisma.stockCategory.findMany({
        where: { category: { key: categoryKey } },
        include: { stock: true },
        orderBy: { addedDate: 'asc' }
    });
    log(`Total stocks: ${catStocks.length}`);

    // Aggregates for each indicator
    const results = {
        total: 0,
        // EMA position
        aboveEma20: { wins: 0, total: 0 }, belowEma20: { wins: 0, total: 0 },
        aboveEma50: { wins: 0, total: 0 }, belowEma50: { wins: 0, total: 0 },
        aboveEma200: { wins: 0, total: 0 }, belowEma200: { wins: 0, total: 0 },
        // EMA alignment (bullish = 20>50>200)
        emaBullish: { wins: 0, total: 0 }, emaBearish: { wins: 0, total: 0 }, emaMixed: { wins: 0, total: 0 },
        // RSI zones
        rsiOversold: { wins: 0, total: 0 }, rsiNeutral: { wins: 0, total: 0 }, rsiOverbought: { wins: 0, total: 0 },
        // MACD
        macdBullish: { wins: 0, total: 0 }, macdBearish: { wins: 0, total: 0 },
        macdHistoRising: { wins: 0, total: 0 }, macdHistoFalling: { wins: 0, total: 0 },
        // Trendline
        uptrend: { wins: 0, total: 0 }, downtrend: { wins: 0, total: 0 },
        contracting: { wins: 0, total: 0 }, expanding: { wins: 0, total: 0 },
        // Weekly EMA20
        weeklyAboveEma20: { wins: 0, total: 0 }, weeklyBelowEma20: { wins: 0, total: 0 },
        // Combo filters
        bestCombo: { wins: 0, total: 0 },
        worstCombo: { wins: 0, total: 0 },
        // Per stock details
        allStocks: []
    };

    let processed = 0;
    for (const cs of catStocks) {
        const symbol = cs.stock.symbol;
        const instrumentKey = cs.stock.instrumentKey;
        const addedDate = cs.addedDate ? toISTDateString(cs.addedDate) : null;
        if (!addedDate || !instrumentKey) continue;

        // Fetch 250 daily candles (1 year) for proper EMA200
        const sigDate = new Date(cs.addedDate);
        const fromDate = new Date(sigDate);
        fromDate.setDate(fromDate.getDate() - 365);
        const toDate = new Date(sigDate);
        toDate.setDate(toDate.getDate() + 30);

        let candles;
        try {
            candles = await priceService.fetchPrice(symbol, instrumentKey, toISTDateString(fromDate), toISTDateString(toDate));
        } catch (e) { continue; }
        if (!candles || candles.length < 50) continue;

        candles.sort((a, b) => new Date(a.timestamp || a.date) - new Date(b.timestamp || b.date));
        const sigIdx = candles.findIndex(c => candleDateStr(c) === addedDate);
        if (sigIdx < 30) continue;

        results.total++;
        processed++;

        // Compute indicators
        const ema20 = calcEMA(candles, 20);
        const ema50 = calcEMA(candles, 50);
        const ema200 = calcEMA(candles, 200);
        const rsi = calcRSI(candles, 14);
        const macd = calcMACD(candles);

        // Weekly candles and EMA20
        const weeklyCandles = buildWeeklyCandles(candles.slice(0, sigIdx + 1));
        const weeklyEma20 = calcEMA(weeklyCandles, 20);

        // Values at signal
        const sigClose = candles[sigIdx].close;
        const e20 = ema20[sigIdx];
        const e50 = ema50[sigIdx];
        const e200 = ema200[sigIdx];
        const rsiVal = rsi[sigIdx];
        const macdVal = macd.line[sigIdx];
        const macdSig = macd.signal[sigIdx];
        const macdHist = macd.histogram[sigIdx];
        const macdHistPrev = sigIdx > 0 ? macd.histogram[sigIdx - 1] : null;
        const weeklyE20 = weeklyEma20.length > 0 ? weeklyEma20[weeklyEma20.length - 1] : null;
        const weeklyClose = weeklyCandles.length > 0 ? weeklyCandles[weeklyCandles.length - 1].close : null;

        // Trendline pattern
        const trendPattern = detectTrendPattern(candles, sigIdx);

        // Entry = Day+1 open
        const entryCandle = sigIdx + 1 < candles.length ? candles[sigIdx + 1] : null;
        const entryPrice = entryCandle ? entryCandle.open : sigClose;

        // 10-day outcome
        const post10 = sigIdx + 11 < candles.length ? candles[sigIdx + 11] : null;
        const post10Chg = post10 ? ((post10.close - entryPrice) / entryPrice * 100) : null;
        const isWin = post10Chg !== null && post10Chg > 0;

        // Classify and aggregate
        const addToGroup = (group) => { group.total++; if (isWin) group.wins++; };

        // EMA position
        if (e20) { if (sigClose > e20) addToGroup(results.aboveEma20); else addToGroup(results.belowEma20); }
        if (e50) { if (sigClose > e50) addToGroup(results.aboveEma50); else addToGroup(results.belowEma50); }
        if (e200) { if (sigClose > e200) addToGroup(results.aboveEma200); else addToGroup(results.belowEma200); }

        // EMA alignment
        if (e20 && e50 && e200) {
            if (e20 > e50 && e50 > e200) addToGroup(results.emaBullish);
            else if (e20 < e50 && e50 < e200) addToGroup(results.emaBearish);
            else addToGroup(results.emaMixed);
        }

        // RSI zones
        if (rsiVal !== null) {
            if (rsiVal < 30) addToGroup(results.rsiOversold);
            else if (rsiVal > 70) addToGroup(results.rsiOverbought);
            else addToGroup(results.rsiNeutral);
        }

        // MACD
        if (macdVal !== null && macdSig !== null) {
            if (macdVal > macdSig) addToGroup(results.macdBullish);
            else addToGroup(results.macdBearish);
        }
        if (macdHist !== null && macdHistPrev !== null) {
            if (macdHist > macdHistPrev) addToGroup(results.macdHistoRising);
            else addToGroup(results.macdHistoFalling);
        }

        // Trend pattern
        if (trendPattern === 'UPTREND') addToGroup(results.uptrend);
        else if (trendPattern === 'DOWNTREND') addToGroup(results.downtrend);
        else if (trendPattern === 'CONTRACTING') addToGroup(results.contracting);
        else if (trendPattern === 'EXPANDING') addToGroup(results.expanding);

        // Weekly
        if (weeklyE20 && weeklyClose) {
            if (weeklyClose > weeklyE20) addToGroup(results.weeklyAboveEma20);
            else addToGroup(results.weeklyBelowEma20);
        }

        // Best combo: RSI<40 + MACD rising + above weekly EMA20
        if (rsiVal !== null && rsiVal < 40 && macdHist !== null && macdHistPrev !== null && macdHist > macdHistPrev && weeklyE20 && weeklyClose && weeklyClose > weeklyE20) {
            addToGroup(results.bestCombo);
        }
        // Worst combo: RSI>60 + MACD falling + below weekly EMA20
        if (rsiVal !== null && rsiVal > 60 && macdHist !== null && macdHistPrev !== null && macdHist < macdHistPrev && weeklyE20 && weeklyClose && weeklyClose < weeklyE20) {
            addToGroup(results.worstCombo);
        }

        // Detail labels
        const emaLabel = (e20 && e50 && e200) ? (e20 > e50 && e50 > e200 ? 'BULL' : e20 < e50 && e50 < e200 ? 'BEAR' : 'MIX') : '??';
        const rsiLabel = rsiVal !== null ? rsiVal.toFixed(0) : '??';
        const macdLabel = (macdVal !== null && macdSig !== null) ? (macdVal > macdSig ? 'BUL' : 'BEA') : '??';
        const histLabel = (macdHist !== null && macdHistPrev !== null) ? (macdHist > macdHistPrev ? 'UP' : 'DN') : '??';
        const weekLabel = (weeklyE20 && weeklyClose) ? (weeklyClose > weeklyE20 ? 'ABV' : 'BLW') : '??';
        const outcome = post10Chg !== null ? (post10Chg >= 0 ? '+' : '') + post10Chg.toFixed(1) + '%' : 'OPEN';

        results.allStocks.push({
            symbol, addedDate, entryPrice: Math.round(entryPrice),
            emaLabel, rsiLabel, macdLabel, histLabel, trendPattern: trendPattern.substring(0, 5),
            weekLabel, post10Chg, outcome
        });

        if (processed % 25 === 0) console.log(`  ${categoryKey}: ${processed}/${catStocks.length}`);
    }

    // Print results
    const wr = (g) => `${g.wins}/${g.total} (${g.total > 0 ? (g.wins / g.total * 100).toFixed(0) : '?'}%)`;

    log('');
    log(`Processed: ${results.total}`);
    log('');
    log('===== DAILY EMA POSITION (price vs EMA at signal) =====');
    log(`  Above EMA20:  ${wr(results.aboveEma20)}`);
    log(`  Below EMA20:  ${wr(results.belowEma20)}`);
    log(`  Above EMA50:  ${wr(results.aboveEma50)}`);
    log(`  Below EMA50:  ${wr(results.belowEma50)}`);
    log(`  Above EMA200: ${wr(results.aboveEma200)}`);
    log(`  Below EMA200: ${wr(results.belowEma200)}`);

    log('');
    log('===== EMA ALIGNMENT (daily 20>50>200 = bullish) =====');
    log(`  Bullish (20>50>200): ${wr(results.emaBullish)}`);
    log(`  Bearish (20<50<200): ${wr(results.emaBearish)}`);
    log(`  Mixed:               ${wr(results.emaMixed)}`);

    log('');
    log('===== RSI 14 ZONES =====');
    log(`  Oversold (RSI<30):   ${wr(results.rsiOversold)}`);
    log(`  Neutral (30-70):     ${wr(results.rsiNeutral)}`);
    log(`  Overbought (RSI>70): ${wr(results.rsiOverbought)}`);

    log('');
    log('===== MACD =====');
    log(`  MACD > Signal (bullish): ${wr(results.macdBullish)}`);
    log(`  MACD < Signal (bearish): ${wr(results.macdBearish)}`);
    log(`  Histogram rising:        ${wr(results.macdHistoRising)}`);
    log(`  Histogram falling:       ${wr(results.macdHistoFalling)}`);

    log('');
    log('===== TRENDLINE PATTERNS (HH/HL vs LH/LL) =====');
    log(`  UPTREND (HH+HL):    ${wr(results.uptrend)}`);
    log(`  DOWNTREND (LH+LL):  ${wr(results.downtrend)}`);
    log(`  CONTRACTING (LH+HL): ${wr(results.contracting)}`);
    log(`  EXPANDING (HH+LL):  ${wr(results.expanding)}`);

    log('');
    log('===== WEEKLY EMA20 =====');
    log(`  Price ABOVE weekly EMA20: ${wr(results.weeklyAboveEma20)}`);
    log(`  Price BELOW weekly EMA20: ${wr(results.weeklyBelowEma20)}`);

    log('');
    log('===== COMBO FILTERS =====');
    log(`  BEST (RSI<40 + MACD rising + weekly above EMA20): ${wr(results.bestCombo)}`);
    log(`  WORST (RSI>60 + MACD falling + weekly below EMA20): ${wr(results.worstCombo)}`);

    // Per-stock table
    log('');
    log('PER-STOCK TECHNICAL STATE:');
    log('SYMBOL        ADDED       ENTRY   EMA  RSI  MACD HIST TREND  WEEK  10d OUTCOME');
    const sorted = results.allStocks.sort((a, b) => (a.post10Chg ?? -999) - (b.post10Chg ?? -999));
    for (const s of sorted) {
        log(`${s.symbol.padEnd(14)}${s.addedDate} ${String(s.entryPrice).padStart(6)} ${s.emaLabel.padEnd(5)}${s.rsiLabel.padStart(4)} ${s.macdLabel.padEnd(4)} ${s.histLabel.padEnd(4)} ${s.trendPattern.padEnd(7)}${s.weekLabel.padEnd(4)} ${s.outcome.padStart(7)}`);
    }

    return { out, results };
}

async function main() {
    console.log('Multi-timeframe technical analysis starting...');
    console.log('Fetching 1-year daily data for ~253 stocks...');

    const support = await analyzeCategory('MULTI_SUPPORT_BO');
    console.log('SUPPORT done: ' + support.results.total + ' stocks');

    const resistance = await analyzeCategory('MULTI_RESISTANCE_BO');
    console.log('RESISTANCE done: ' + resistance.results.total + ' stocks');

    const allOutput = [...support.out, '', '', ...resistance.out];
    const outPath = path.join(__dirname, 'technical_analysis.txt');
    fs.writeFileSync(outPath, allOutput.join('\n'), 'utf8');
    console.log('Saved: ' + outPath + ' (' + allOutput.length + ' lines)');

    await prisma.$disconnect();
}

main().catch(e => { console.error(e); prisma.$disconnect(); });
