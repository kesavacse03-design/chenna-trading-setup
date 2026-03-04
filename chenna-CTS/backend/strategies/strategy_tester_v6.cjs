const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const priceService = require('../services/priceService.cjs');
const { EMA } = require('technicalindicators');
const fs = require('fs');

const args = process.argv.slice(2);
const params = {};
args.forEach(arg => {
    if (arg.startsWith('--')) {
        const parts = arg.split('=');
        if (parts.length === 2) params[parts[0].replace('--', '')] = parts[1];
    }
});

const TARGET_DATE = params.date || '2026-03-02';
const CATEGORY = params.category || 'INTRADAY_BOOST';
const TIMEFRAME = parseInt(params.timeframe || '3');
const OR_METHOD = params.orMethod || 'dynamic';
const MODE = params.mode || 'AUTO';
const OUT_MD = params.outMarkdown;

const mdLog = [];
function log(msg) {
    console.log(msg);
    mdLog.push(msg);
}

async function fetch1MinCandles(symbol, instrumentKey, dateStr) {
    const fromDate = new Date(`${dateStr}T00:00:00Z`);
    const toDate = new Date(fromDate.getTime() + 24 * 60 * 60 * 1000);
    const cached = await prisma.ohlcvCache.findFirst({
        where: { symbol, interval: '1minute', fromDate: { lte: fromDate }, toDate: { gte: toDate } },
        orderBy: { createdAt: 'desc' }
    });

    let raw = [];
    if (cached && cached.data) raw = typeof cached.data === 'string' ? JSON.parse(cached.data) : cached.data;
    else if (instrumentKey) {
        try { raw = await priceService.fetchPrice(symbol, instrumentKey, dateStr, dateStr, '1minute'); } catch (e) { }
    }

    return raw.map(c => {
        let ts = c.timestamp || c.date;
        if (Array.isArray(c)) ts = c[0], c = { open: c[1], high: c[2], low: c[3], close: c[4], volume: c[5] };
        return {
            timestamp: new Date(ts),
            timeStr: String(ts).substring(11, 19),
            open: parseFloat(c.open), high: parseFloat(c.high), low: parseFloat(c.low), close: parseFloat(c.close), volume: parseFloat(c.volume)
        };
    }).filter(c => {
        const tMins = c.timestamp.getHours() * 60 + c.timestamp.getMinutes();
        return c.close > 0 && c.timestamp.toISOString().startsWith(dateStr) && tMins >= 9 * 60 + 15 && tMins <= 15 * 60 + 30;
    }).sort((a, b) => a.timestamp - b.timestamp);
}

function aggregateCandles(candles1m, tf) {
    if (candles1m.length === 0) return [];
    const result = [];
    let cur = null, count = 0;
    for (const c of candles1m) {
        if (!cur) {
            cur = { timestamp: c.timestamp, timeStr: String(c.timestamp.getHours()).padStart(2, '0') + ':' + String(c.timestamp.getMinutes()).padStart(2, '0'), open: c.open, high: c.high, low: c.low, close: c.close, volume: c.volume };
            count = 1;
        } else {
            cur.high = Math.max(cur.high, c.high); cur.low = Math.min(cur.low, c.low); cur.close = c.close; cur.volume += c.volume; count++;
        }
        if (count === tf) {
            result.push({ ...cur, color: cur.close >= cur.open ? 'GREEN' : 'RED', bodyRange: Math.abs(cur.close - cur.open), fullRange: cur.high - cur.low });
            cur = null; count = 0;
        }
    }
    return result;
}

function determineTrend(candles, emaPeriod = 10) {
    if (candles.length < emaPeriod) return candles.map(c => ({ ...c, ema10: null }));
    const emaValues = EMA.calculate({ period: emaPeriod, values: candles.map(c => c.close) });
    return candles.map((c, i) => ({ ...c, ema10: i < emaPeriod - 1 ? null : emaValues[i - emaPeriod + 1] }));
}

function findRetracementSwing(candles, breakoutIdx, startIdx, direction) {
    let swingPrice = direction === 'LONG' ? 999999 : 0;
    for (let i = startIdx; i <= breakoutIdx; i++) {
        if (direction === 'LONG') swingPrice = Math.min(swingPrice, candles[i].low);
        else swingPrice = Math.max(swingPrice, candles[i].high);
    }
    return swingPrice;
}

async function runTester() {
    log(`### Strategy Tester V6 Run: ${TARGET_DATE} | ${CATEGORY} | ${OR_METHOD} | TF: ${TIMEFRAME}m`);

    const cat = await prisma.category.findUnique({ where: { key: CATEGORY } });
    if (!cat) return log('Category not found.');
    const sc = await prisma.stockCategory.findMany({
        where: { categoryId: cat.id, addedDate: new Date(`${TARGET_DATE}T00:00:00Z`) },
        include: { stock: true }
    });

    const stockStats = [];
    for (const mapping of sc) {
        const sym = mapping.stock.symbol;
        const IK = mapping.stock.instrumentKey || mapping.stock.instrument_key;
        const c1m = await fetch1MinCandles(sym, IK, TARGET_DATE);
        if (c1m.length < 50) continue;
        const cAgg = aggregateCandles(c1m, TIMEFRAME);
        if (cAgg.length < 10) continue;
        const finalCandles = determineTrend(cAgg, 10);
        const openVol = c1m.slice(0, 30).reduce((sum, c) => sum + c.volume, 0);
        const gapPct = c1m[0].open > 0 ? (Math.abs(c1m[0].open - c1m[0].close) / c1m[0].open) * 100 : 0; // naive gap for sorting
        stockStats.push({ sym, finalCandles, openVol, gapPct });
    }

    stockStats.sort((a, b) => b.openVol - a.openVol);
    const topStocks = stockStats.slice(0, 5);
    let csvOut = "Date,Symbol,Method,Mode,TradeDir,OR Width%,Entry,SL%,T1,T2,Result,ExitTime\n";

    for (const stat of topStocks) {
        const { sym, finalCandles, gapPct } = stat;
        log(`\n#### Stock: \`${sym}\``);
        log(`- Gap at open: ~${gapPct.toFixed(2)}%`);
        log(`- First candle (${TIMEFRAME}-min): ${finalCandles[0].timeStr} O: ${finalCandles[0].open} H: ${finalCandles[0].high} L: ${finalCandles[0].low} C: ${finalCandles[0].close} | Color: ${finalCandles[0].color}`);

        let orLockedIdx = -1, orHigh = -1, orLow = 9999999;

        if (OR_METHOD === 'dynamic') {
            const firstColor = finalCandles[0].color;
            orHigh = finalCandles[0].high; orLow = finalCandles[0].low; orLockedIdx = 0;
            for (let i = 1; i < finalCandles.length; i++) {
                orHigh = Math.max(orHigh, finalCandles[i].high); orLow = Math.min(orLow, finalCandles[i].low);
                if (finalCandles[i].color !== firstColor) { orLockedIdx = i; break; }
            }
        } else {
            for (let i = 0; i < finalCandles.length; i++) {
                orHigh = Math.max(orHigh, finalCandles[i].high); orLow = Math.min(orLow, finalCandles[i].low);
                const hM = finalCandles[i].timeStr.split(':').map(Number);
                if (hM[0] * 60 + hM[1] >= 9 * 60 + 45 - TIMEFRAME) { orLockedIdx = i; break; }
            }
        }

        if (orLockedIdx === -1 || orLockedIdx >= finalCandles.length - 1) {
            log(`- OR detected: Never locked or too late.`); continue;
        }

        const orWidth = ((orHigh - orLow) / orLow) * 100;
        log(`- OR detected: Locked at candle idx ${orLockedIdx} (Time: ${finalCandles[orLockedIdx].timeStr})`);
        log(`- OR High: ${orHigh.toFixed(2)} | OR Low: ${orLow.toFixed(2)}`);
        log(`- OR Width: ${orWidth.toFixed(2)}%`);

        let activeTrade = null;
        for (let i = orLockedIdx + 1; i < finalCandles.length; i++) {
            const c = finalCandles[i];
            if (!activeTrade) {
                const pureBreakUp = c.close > orHigh;
                const pureBreakDown = c.close < orLow;

                // Old method triggers entry just by crossing OR without 50% body logic.
                // Dynamic method requires decisive body
                let validEntry = false;
                if (OR_METHOD === 'dynamic') {
                    if (pureBreakUp && ((c.close - Math.max(c.open, orHigh)) / c.bodyRange) >= 0.5) validEntry = true;
                    if (pureBreakDown && ((Math.min(c.open, orLow) - c.close) / c.bodyRange) >= 0.5) validEntry = true;
                } else {
                    validEntry = pureBreakUp || pureBreakDown;
                }

                if (validEntry) {
                    const dir = pureBreakUp ? 'LONG' : 'SHORT';
                    const entry = c.close;
                    let sl = OR_METHOD === 'dynamic' ? findRetracementSwing(finalCandles, i, orLockedIdx, dir) : (dir === 'LONG' ? orLow : orHigh);
                    if (OR_METHOD === 'dynamic' && (dir === 'LONG' ? sl >= entry : sl <= entry)) sl = dir === 'LONG' ? orLow : orHigh;
                    const slPct = Math.abs((entry - sl) / entry) * 100;
                    const r = Math.abs(entry - sl);
                    const t1 = dir === 'LONG' ? entry + r : entry - r;
                    const t2 = dir === 'LONG' ? entry + 2 * r : entry - 2 * r;

                    log(`- ORB signal: ${dir} at ${c.timeStr}`);
                    log(`- Breakout candle: O:${c.open} H:${c.high} L:${c.low} C:${c.close}`);
                    log(`- EMA 10 at breakout: ${c.ema10 ? c.ema10.toFixed(2) : 'NA'}`);
                    if (c.ema10) log(`- Distance from EMA: ${(Math.abs((entry - c.ema10) / c.ema10) * 100).toFixed(2)}%`);
                    log(`- SL (retracement): ${sl.toFixed(2)}`);
                    log(`- SL %: ${slPct.toFixed(2)}%`);
                    log(`- T1 (1:1): ${t1.toFixed(2)}`);
                    log(`- T2 (1:2): ${t2.toFixed(2)}`);
                    log(`- Current price setup assumed entry at ${entry.toFixed(2)}`);

                    activeTrade = { dir, entry, sl, t1, t2, hitT1: false, hitT2: false, exitResult: null, exitTime: null };
                }
            } else {
                if (activeTrade.exitResult) continue;
                if (activeTrade.dir === 'LONG') {
                    if (c.low <= activeTrade.sl) { activeTrade.exitResult = 'LOSS SL'; activeTrade.exitTime = c.timeStr; }
                    else {
                        if (c.high >= activeTrade.t1) activeTrade.hitT1 = true;
                        if (c.high >= activeTrade.t2) { activeTrade.hitT2 = true; activeTrade.exitResult = 'WIN T2'; activeTrade.exitTime = c.timeStr; }
                    }
                } else {
                    if (c.high >= activeTrade.sl) { activeTrade.exitResult = 'LOSS SL'; activeTrade.exitTime = c.timeStr; }
                    else {
                        if (c.low <= activeTrade.t1) activeTrade.hitT1 = true;
                        if (c.low <= activeTrade.t2) { activeTrade.hitT2 = true; activeTrade.exitResult = 'WIN T2'; activeTrade.exitTime = c.timeStr; }
                    }
                }
            }
        }

        if (activeTrade) {
            if (!activeTrade.exitResult) {
                activeTrade.exitResult = activeTrade.hitT1 ? 'WIN T1 (EOD)' : 'STILL OPEN (EOD)';
                activeTrade.exitTime = '15:30';
            }
            log(`- Would T1 have hit? ${activeTrade.hitT1 ? 'yes' : 'no'} before ${activeTrade.exitTime}`);
            log(`- RESULT: **${activeTrade.exitResult}** at ${activeTrade.exitTime}`);
            const slPct = Math.abs((activeTrade.entry - activeTrade.sl) / activeTrade.entry) * 100;
            csvOut += `${TARGET_DATE},${sym},${OR_METHOD},${MODE},${activeTrade.dir},${orWidth.toFixed(2)},${activeTrade.entry.toFixed(2)},${slPct.toFixed(2)},${activeTrade.t1.toFixed(2)},${activeTrade.t2.toFixed(2)},${activeTrade.exitResult},${activeTrade.exitTime}\n`;
        } else {
            log(`- ORB signal: none`);
        }
    }

    if (OUT_MD) fs.writeFileSync(OUT_MD, mdLog.join('\n'));
    if (!fs.existsSync('../reports')) fs.mkdirSync('../reports');
    fs.writeFileSync(`../reports/strategy_test_${OR_METHOD}_${TARGET_DATE}.csv`, csvOut);
    console.log(`\nCSV saved to reports/strategy_test_${OR_METHOD}_${TARGET_DATE}.csv`);
}

runTester().catch(console.error).finally(() => prisma.$disconnect());
