/**
 * INTRADAY_BOOST Strategy (TradeCode Methodology)
 * 
 * N-Pattern Detection for Daily Data
 * 
 * NOTE: Includes Auto-Fetch from Upstox (Robust ISO Date Handling)
 */

const fs = require('fs').promises;
const path = require('path');
const fetch = require('node-fetch');
const prisma = require('../../lib/prisma.cjs');
const { isValidTradingDay } = require('../dataValidator.cjs');

const CONFIG = {
    name: 'INTRADAY_BOOST_DAILY',
    displayName: 'N-Pattern Breakout',
    category: 'INTRADAY_BOOST',
    targetPercent: 1.5,
    stopPercent: 1.5,
    minBreakoutPercent: 0.5,
    minVolumeMultiple: 1.5,
    rules: [
        'Stock in INTRADAY_BOOST = high momentum detected',
        'BULLISH_BREAKOUT: Close > Previous High + Volume surge',
        'PULLBACK_BUY: Retest of breakout level + hold',
        'BREAKDOWN: Close < Previous Low on high volume',
        'Mostly LONG trades (~80%), some SHORT (~20%)'
    ]
};

/**
 * Get valid Upstox Access Token from File
 */
async function getUpstoxAccessToken() {
    try {
        const tokenPath = path.join(__dirname, '../../auth/tokens.json');
        try {
            await fs.access(tokenPath);
        } catch {
            return null;
        }

        const data = await fs.readFile(tokenPath, 'utf8');
        const tokens = JSON.parse(data);
        return tokens.access_token;
    } catch (e) {
        return null;
    }
}

/**
 * Robust Fetch from Upstox with Strict Date Formatting
 */
async function fetchFromUpstox(symbol, addedDate) {
    try {
        const accessToken = await getUpstoxAccessToken();
        if (!accessToken) {
            return { success: false, error: 'No valid Upstox access token', source: 'AUTH_ERROR' };
        }

        let dateStr;
        if (addedDate instanceof Date) {
            dateStr = addedDate.toISOString().split('T')[0];
        } else if (typeof addedDate === 'string') {
            if (/^\d{2}-\d{2}-\d{4}$/.test(addedDate)) {
                const [day, month, year] = addedDate.split('-');
                dateStr = `${year}-${month}-${day}`;
            } else if (/^\d{4}-\d{2}-\d{2}$/.test(addedDate)) {
                dateStr = addedDate;
            } else {
                const parsed = new Date(addedDate);
                if (!isNaN(parsed.getTime())) dateStr = parsed.toISOString().split('T')[0];
                else throw new Error(`Invalid date format: ${addedDate}`);
            }
        }

        const targetDate = new Date(dateStr);
        const fromDate = new Date(targetDate);
        fromDate.setDate(fromDate.getDate() - 30);

        const fromStr = fromDate.toISOString().split('T')[0];
        const toStr = dateStr;

        let instrument;
        try {
            instrument = await prisma.instrument.findFirst({
                where: { tradingSymbol: symbol, exchange: 'NSE_EQ' }
            });
            if (!instrument) {
                instrument = await prisma.instrument.findFirst({
                    where: { tradingSymbol: symbol }
                });
            }
        } catch (dbErr) {
            return { success: false, error: `DB Error: ${dbErr.message}`, source: 'DB_ERROR' };
        }

        if (!instrument) {
            return { success: false, error: `Instrument not found for ${symbol}`, source: 'ERROR_INSTRUMENT_NOT_FOUND' };
        }

        const url = `https://api.upstox.com/v2/historical-candle/${instrument.instrumentKey}/day/${toStr}/${fromStr}`;

        const response = await fetch(url, {
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Accept': 'application/json'
            }
        });

        if (!response.ok) {
            const errorText = await response.text();
            return { success: false, error: `Upstox API error: ${response.status}`, source: 'UPSTOX_API_ERROR' };
        }

        const data = await response.json();
        if (!data.data || !data.data.candles || data.data.candles.length === 0) {
            return { success: false, error: `No candles returned for ${symbol}`, source: 'UPSTOX_NO_DATA' };
        }

        const candles = data.data.candles.map(c => ({
            date: c[0].split('T')[0],
            open: c[1], high: c[2], low: c[3], close: c[4], volume: c[5]
        })).sort((a, b) => new Date(a.date) - new Date(b.date));

        await appendToCSVCache(symbol, candles);

        return { success: true, candles: candles, source: 'UPSTOX_FETCHED' };

    } catch (error) {
        return { success: false, error: error.message, source: 'UPSTOX_ERROR' };
    }
}

/**
 * Bulk Fetch Missing Data efficiently
 */
async function bulkFetchMissingData(stocks) {
    console.log(`\n[BulkFetch] Checking data availability for ${stocks.length} stocks...`);
    const missing = [];

    // Filter out "Today" from missing check if market is open? 
    // Actually, if it's today, we might want to skip fetching historical if it won't have today's close yet.
    // But let's stick to the user request handling "Today" in the analysis loop.
    // Here we just fetch if cache is absolutely missing.

    for (const stock of stocks) {
        if (!stock.addedDate) continue;
        const exists = await checkDataExistsInCache(stock.symbol, stock.addedDate);
        if (!exists) missing.push(stock);
    }

    if (missing.length === 0) return;

    console.log(`[BulkFetch] Fetching data for ${missing.length} missing stocks...`);
    let success = 0, fail = 0;

    for (let i = 0; i < missing.length; i++) {
        const stock = missing[i];
        if (i % 10 === 0) console.log(`[BulkFetch] ${i}/${missing.length}...`);

        const result = await fetchFromUpstox(stock.symbol, stock.addedDate);
        if (result.success) success++;
        else fail++;

        await new Promise(r => setTimeout(r, 200));
    }
    console.log(`[BulkFetch] Done. Success: ${success}, Failed: ${fail}`);
}

async function checkDataExistsInCache(symbol, dateStr) {
    const data = await loadDailyData(symbol);
    const idx = data.findIndex(c => c.date === dateStr);
    return idx >= 1;
}

async function appendToCSVCache(symbol, candles) {
    const csvPath = path.join(__dirname, '../../cache/historical', `${symbol}.csv`);
    try {
        const newLines = candles.map(c => {
            const d = typeof c.date === 'string' ? c.date : new Date(c.date).toISOString().split('T')[0];
            return `${d},${c.open},${c.high},${c.low},${c.close},${c.volume}`;
        });

        let fileExists = false;
        try { await fs.access(csvPath); fileExists = true; } catch { }

        if (fileExists) {
            const content = await fs.readFile(csvPath, 'utf8');
            const lines = content.trim().split('\n');
            const header = lines[0];
            const existingData = lines.slice(1);
            const allAndNew = [...existingData, ...newLines];
            const map = new Map();
            allAndNew.forEach(l => map.set(l.split(',')[0], l));
            const sorted = Array.from(map.values()).sort((a, b) => new Date(a.split(',')[0]) - new Date(b.split(',')[0]));
            await fs.writeFile(csvPath, [header, ...sorted].join('\n'));
        } else {
            await fs.writeFile(csvPath, ['date,open,high,low,close,volume', ...newLines].join('\n'));
        }
    } catch (e) { console.error(`Cache update failed for ${symbol}: ${e.message}`); }
}

async function getOHLCForStock(symbol, date) {
    const data = await loadDailyData(symbol);
    const idx = data.findIndex(c => c.date === date);
    if (idx >= 1) {
        return {
            source: 'CSV_CACHE',
            today: data[idx],
            yesterday: data[idx - 1],
            avgVolume: getAvgVolume(data, idx)
        };
    }
    return { source: 'NO_DATA', error: `Data missing for ${symbol} on ${date}` };
}

async function loadDailyData(symbol) {
    const csvPath = path.join(__dirname, '../../cache/historical', `${symbol}.csv`);
    try {
        const content = await fs.readFile(csvPath, 'utf8');
        const lines = content.trim().split('\n');
        if (lines.length < 2) return [];
        return lines.slice(1).map(l => {
            const p = l.split(',');
            return { date: p[0], open: parseFloat(p[1]), high: parseFloat(p[2]), low: parseFloat(p[3]), close: parseFloat(p[4]), volume: parseInt(p[5]) };
        }).filter(c => !isNaN(c.close)).sort((a, b) => new Date(a.date) - new Date(b.date));
    } catch { return []; }
}

function getAvgVolume(candles, idx, lookback = 10) {
    if (idx < lookback) return 0;
    return candles.slice(idx - lookback, idx).reduce((s, c) => s + c.volume, 0) / lookback;
}

function analyzeIntradayBoostPattern(today, yesterday, avgVolume) {
    if (!today || !yesterday) return null;
    const dayCheck = isValidTradingDay(today.date);
    if (!dayCheck.valid) return null;

    const { open, close, high, low, volume } = today;
    const { high: pHigh, low: pLow, close: pClose } = yesterday;

    const volRatio = avgVolume > 0 ? volume / avgVolume : 1;
    const hasVol = volRatio >= CONFIG.minVolumeMultiple;
    const gapPercent = ((open - pClose) / pClose) * 100;

    let pattern = null, direction = null, entry = null, target = null, stop = null, reason = null;

    const breakoutPct = ((close - pHigh) / pHigh) * 100;
    if (close > pHigh && breakoutPct >= CONFIG.minBreakoutPercent && hasVol) {
        pattern = 'BULLISH_BREAKOUT'; direction = 'LONG';
        entry = pHigh * (1 + CONFIG.minBreakoutPercent / 100);
        target = entry * (1 + CONFIG.targetPercent / 100);
        stop = entry * (1 - CONFIG.stopPercent / 100);
        reason = `Breakout +${breakoutPct.toFixed(1)}% + Vol`;
    } else if (open > pClose && low <= pHigh && close > open) {
        pattern = 'PULLBACK_BUY'; direction = 'LONG';
        entry = pHigh;
        target = entry * (1 + CONFIG.targetPercent / 100);
        stop = entry * (1 - CONFIG.stopPercent / 100);
        reason = 'Pullback support + bullish close';
    } else if (close < pLow) {
        const breakdownPct = ((pLow - close) / pLow) * 100;
        if (breakdownPct >= CONFIG.minBreakoutPercent && hasVol) {
            pattern = 'BREAKDOWN_SHORT'; direction = 'SHORT';
            entry = pLow * (1 - CONFIG.minBreakoutPercent / 100);
            target = entry * (1 - CONFIG.targetPercent / 100);
            stop = entry * (1 + CONFIG.stopPercent / 100);
            reason = `Breakdown -${breakdownPct.toFixed(1)}% + Vol`;
        }
    }

    if (!pattern) return null;

    let outcome, exitP, exitR, pnl;
    if (direction === 'LONG') {
        if (high >= target && low <= stop) { outcome = 'LOSS'; exitP = stop; exitR = 'STOP_HIT'; }
        else if (high >= target) { outcome = 'WIN'; exitP = target; exitR = 'TARGET_HIT'; }
        else if (low <= stop) { outcome = 'LOSS'; exitP = stop; exitR = 'STOP_HIT'; }
        else { outcome = close > entry ? 'WIN' : 'LOSS'; exitP = close; exitR = 'EOD'; }
        pnl = ((exitP - entry) / entry) * 100;
    } else {
        if (low <= target && high >= stop) { outcome = 'LOSS'; exitP = stop; exitR = 'STOP_HIT'; }
        else if (low <= target) { outcome = 'WIN'; exitP = target; exitR = 'TARGET_HIT'; }
        else if (high >= stop) { outcome = 'LOSS'; exitP = stop; exitR = 'STOP_HIT'; }
        else { outcome = entry > close ? 'WIN' : 'LOSS'; exitP = close; exitR = 'EOD'; }
        pnl = ((entry - exitP) / entry) * 100;
    }

    return {
        date: today.date, signal: true, pattern, direction,
        volumeRatio: volRatio.toFixed(2) + 'x',
        gapPercent: gapPercent.toFixed(2) + '%',
        entryPrice: entry.toFixed(2), targetPrice: target.toFixed(2), stopPrice: stop.toFixed(2),
        exitPrice: exitP.toFixed(2), outcome, exitReason: exitR, reason,
        pnl: (pnl > 0 ? '+' : '') + pnl.toFixed(2) + '%'
    };
}

function getNoSignalReason(today, yesterday, avgVol) {
    const reasons = [];
    const details = {};
    const volRatio = avgVol > 0 ? today.volume / avgVol : 0;
    const gapPercent = ((today.open - yesterday.close) / yesterday.close) * 100;

    details.volumeRatio = volRatio.toFixed(2) + 'x';
    details.gapPercent = gapPercent.toFixed(2) + '%';

    // Pattern Breakout Check
    const brokeHigh = today.close > yesterday.high;
    const brokeLow = today.close < yesterday.low;
    details.hasBreakout = (brokeHigh || brokeLow) ? 'Yes' : 'No';

    if (volRatio < CONFIG.minVolumeMultiple) reasons.push('VOLUME_TOO_LOW');
    if (!brokeHigh && !brokeLow) reasons.push('NO_BREAKOUT_PATTERN');

    return { primary: reasons[0] || 'NO_PATTERN_MATCH', details };
}

async function getCategoryStocks(categoryKey) {
    const cat = await prisma.category.findUnique({ where: { key: categoryKey }, include: { stocks: { include: { stock: { select: { symbol: true, name: true } } } } } });
    if (!cat) return [];
    return cat.stocks.map(s => ({
        symbol: s.stock.symbol, name: s.stock.name,
        addedDate: s.addedDate ? s.addedDate.toISOString().split('T')[0] : null
    }));
}

async function runBacktestDaily(category, startDate, endDate) {
    console.log(`${category} DAILY BACKTEST (${startDate} to ${endDate})`);
    const stocks = await getCategoryStocks(category);

    // Filter stocks by date range
    const start = new Date(startDate);
    const end = new Date(endDate);

    const validStocks = stocks.filter(s => {
        if (!s.addedDate) return false;
        const d = new Date(s.addedDate);
        return d >= start && d <= end;
    });

    console.log(`Filtered ${stocks.length} stocks to ${validStocks.length} within range.`);

    await bulkFetchMissingData(validStocks);

    const trades = [];
    const skipReport = {
        data: [],
    };

    const todayStr = new Date().toISOString().split('T')[0];

    for (const s of validStocks) {
        if (!s.addedDate) {
            skipReport.data.push({ symbol: s.symbol, date: 'N/A', category: 'NO_ADDED_DATE', reason: 'NULL Date', details: '-' });
            continue;
        }

        // Special "Today" Handling
        if (s.addedDate === todayStr) {
            skipReport.data.push({
                symbol: s.symbol, date: s.addedDate,
                category: 'TODAY', reason: 'MARKET_STILL_OPEN',
                details: 'Will be tested tomorrow after market close'
            });
            continue;
        }

        const dc = isValidTradingDay(s.addedDate);
        if (!dc.valid) {
            skipReport.data.push({
                symbol: s.symbol, date: s.addedDate,
                category: dc.reason === 'WEEKEND' ? 'WEEKEND' : 'HOLIDAY',
                reason: dc.reason,
                details: dc.holiday || '-'
            });
            continue;
        }

        const ohlc = await getOHLCForStock(s.symbol, s.addedDate);
        if (ohlc.source.includes('NO_DATA') || ohlc.source.includes('ERROR')) {
            skipReport.data.push({
                symbol: s.symbol, date: s.addedDate,
                category: 'NO_DATA', reason: ohlc.source,
                details: ohlc.error
            });
            continue;
        }

        const trade = analyzeIntradayBoostPattern(ohlc.today, ohlc.yesterday, ohlc.avgVolume);
        if (trade) {
            trade.symbol = s.symbol;
            trade.addedDate = s.addedDate;
            trade.source = ohlc.source;
            trades.push(trade);
        } else {
            const r = getNoSignalReason(ohlc.today, ohlc.yesterday, ohlc.avgVolume);
            skipReport.data.push({
                symbol: s.symbol, date: s.addedDate,
                category: 'NO_SIGNAL', reason: r.primary,
                volumeRatio: r.details.volumeRatio,
                gapPercent: r.details.gapPercent,
                hasBreakout: r.details.hasBreakout,
                details: '-'
            });
        }
    }

    // Sort Trades by Date (Ascending), then Symbol
    trades.sort((a, b) => {
        const da = new Date(a.date);
        const db = new Date(b.date);
        if (da < db) return -1;
        if (da > db) return 1;
        return a.symbol.localeCompare(b.symbol);
    });

    const output = {
        trades,
        skipReport,
        stats: {
            totalTrades: trades.length,
            winners: trades.filter(t => t.outcome === 'WIN').length,
            losers: trades.filter(t => t.outcome === 'LOSS').length,
            winRate: trades.length ? (trades.filter(t => t.outcome === 'WIN').length / trades.length) * 100 : 0,
            totalPnl: trades.reduce((s, t) => s + parseFloat(t.pnl), 0)
        }
    };

    console.log(`\nResults: ${output.stats.totalTrades} Trades, ${output.stats.winners} Wins, P&L: ${output.stats.totalPnl.toFixed(2)}%`);
    return output;
}

module.exports = { CONFIG, runBacktestDaily, analyzeIntradayBoostPattern, loadDailyData, getCategoryStocks };

if (require.main === module) {
    runFullBacktest().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
}
