/**
 * Bulk Cache Job for V5 Strategy Data
 * Caches daily and 30-min data for all required stocks to ensure
 * zero API calls during strategy studies.
 */

const prisma = require('../lib/prisma.cjs');
const priceService = require('../services/priceService.cjs');
const { synthesize15Min } = require('./synthesizeCandles.cjs');
const fs = require('fs');
const path = require('path');

const PROGRESS_FILE = path.join(__dirname, '../cache/bulk_cache_progress.json');
const MAX_API_CALLS_PER_DAY = 1000;

function toISTDateString(date) {
    const d = new Date(date);
    d.setMinutes(d.getMinutes() + 330);
    return d.toISOString().split('T')[0];
}

async function loadProgress() {
    try {
        if (fs.existsSync(PROGRESS_FILE)) {
            const data = fs.readFileSync(PROGRESS_FILE, 'utf8');
            return JSON.parse(data);
        }
    } catch (err) {
        console.error('Failed to load progress file:', err);
    }
    return {
        completedDaily: [],
        completed30Min: [],
        completed15Min: [],
        apiCallsUsedToday: 0,
        lastRunDate: toISTDateString(new Date())
    };
}

function saveProgress(progress) {
    try {
        const dir = path.dirname(PROGRESS_FILE);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(PROGRESS_FILE, JSON.stringify(progress, null, 2));
    } catch (err) {
        console.error('Failed to save progress:', err);
    }
}

async function runBulkCache() {
    console.log(`\n${'═'.repeat(80)}`);
    console.log(` V5 BULK CACHE JOB STARTED`);
    console.log(`${'═'.repeat(80)}\n`);

    const progress = await loadProgress();
    const todayStr = toISTDateString(new Date());

    // Reset API counter if it's a new day
    if (progress.lastRunDate !== todayStr) {
        progress.apiCallsUsedToday = 0;
        progress.lastRunDate = todayStr;
    }

    // 1. Get categories (ALL active trading categories)
    const targetCategories = [
        'INTRADAY_BOOST',
        'HIGH_POWERED_STOCKS',
        'UPSIDE_LOM_INTRA',
        'DOWNSIDE_LOM_INTRA',
        'UPSIDE_LOM_SWING',
        'DOWNSIDE_LOM_SWING',
        'MULTI_RESISTANCE_BO',
        'MULTI_SUPPORT_BO',
        'SHORT_TERM_SWING_BO_DOWN',
        'SHORT_TERM_SWING_BO_UP',
        'LONG_TERM_SWING_BO_UP',
        'LONG_TERM_SWING_BO_DOWN'
    ];

    const cats = await prisma.category.findMany({
        where: { key: { in: targetCategories } }
    });

    const catIds = cats.map(c => c.id);

    // 2. Get unique stocks across these categories
    const stockEntries = await prisma.stockCategory.findMany({
        where: { categoryId: { in: catIds } },
        include: { stock: true }
    });

    const uniqueStocksMap = new Map();
    for (const e of stockEntries) {
        if (e.stock && e.stock.symbol) {
            if (!uniqueStocksMap.has(e.stock.symbol)) {
                uniqueStocksMap.set(e.stock.symbol, {
                    symbol: e.stock.symbol,
                    instrumentKey: e.stock.instrumentKey || e.stock.symbol,
                    isLomIntra: false
                });
            }
            const catInfo = cats.find(c => c.id === e.categoryId);
            if (catInfo && (catInfo.key === 'UPSIDE_LOM_INTRA' || catInfo.key === 'DOWNSIDE_LOM_INTRA')) {
                uniqueStocksMap.get(e.stock.symbol).isLomIntra = true;
            }
        }
    }

    const uniqueStocks = Array.from(uniqueStocksMap.values());

    // Add NIFTY 50
    const jobs = [{ symbol: 'NIFTY50', instrumentKey: 'NSE_INDEX|Nifty 50' }, ...uniqueStocks];

    console.log(`Total unique symbols across 12 categories (incl NIFTY50): ${jobs.length}`);

    // Date ranges
    const today = new Date();
    const toDateStr = todayStr;

    const oneYearAgo = new Date(today);
    oneYearAgo.setDate(oneYearAgo.getDate() - 365);
    const dailyFromStr = toISTDateString(oneYearAgo);

    const sixMonthsAgo = new Date(today);
    sixMonthsAgo.setDate(sixMonthsAgo.getDate() - 180);
    const min30FromStr = toISTDateString(sixMonthsAgo);

    const int15FromStr = min30FromStr; // For LOM INTRA 15-min

    let newlyCachedDaily = 0;
    let newlyCached30m = 0;
    let newlyCached15m = 0;
    let apiCallsThisRun = 0;

    console.log(`Caching Daily: ${dailyFromStr} to ${toDateStr}`);
    console.log(`Caching 30-min: ${min30FromStr} to ${toDateStr}`);
    console.log(`Caching 15-min (LOM_INTRA only): ${int15FromStr} to ${toDateStr}\n`);

    for (let i = 0; i < jobs.length; i++) {
        const item = jobs[i];

        if (progress.apiCallsUsedToday >= MAX_API_CALLS_PER_DAY) {
            console.log(`\n⚠️ DAILY API LIMIT REACHED (${MAX_API_CALLS_PER_DAY}). Stopping job. Please resume tomorrow.`);
            break;
        }

        console.log(`[${i + 1}/${jobs.length}] Processing ${item.symbol}...`);

        // Helper to save master cache
        const saveMasterCache = (symbol, interval, dataArray) => {
            if (!dataArray || dataArray.length === 0) return;
            const uniq = {};
            for (const c of dataArray) {
                const ts = String(c.timestamp || c.date);
                uniq[ts] = c;
            }
            const dedupedData = Object.values(uniq);
            dedupedData.sort((a, b) => new Date(a.timestamp || a.date).getTime() - new Date(b.timestamp || b.date).getTime());

            let dataToSave = dedupedData;
            let folderInterval = interval;
            if (interval === '1minute') {
                folderInterval = '15minute';
                dataToSave = synthesize15Min(dedupedData);
            }

            const cleanKey = symbol.replace(/[^a-zA-Z0-9_-]/g, '_');
            const saveDir = path.join(__dirname, `../cache/${folderInterval}`);
            if (!fs.existsSync(saveDir)) fs.mkdirSync(saveDir, { recursive: true });

            fs.writeFileSync(path.join(saveDir, `${cleanKey}_master.json`), JSON.stringify(dataToSave));
        };

        // A) Daily Cache (Full 365 days in one request)
        if (!progress.completedDaily.includes(item.symbol)) {
            try {
                const initialCount = priceService.rateLimiter.requestsToday;
                const data = await priceService.fetchFromUpstox(item.instrumentKey, dailyFromStr, toDateStr, 'day', item.symbol);
                const callsMade = priceService.rateLimiter.requestsToday - initialCount;

                if (callsMade > 0) {
                    apiCallsThisRun += callsMade;
                    progress.apiCallsUsedToday += callsMade;
                    newlyCachedDaily++;
                    await new Promise(r => setTimeout(r, 250)); // Sleep nicely
                }

                if (data && data.length > 0) {
                    saveMasterCache(item.symbol, 'day', data);
                    progress.completedDaily.push(item.symbol);
                    saveProgress(progress);
                } else {
                    console.log(`   └─ No daily data returned for ${item.symbol}`);
                }
            } catch (err) {
                console.error(`   └─ Error fetching Daily for ${item.symbol}: ${err.message}`);
                await new Promise(r => setTimeout(r, 1000));
            }
        }

        // B) 30-min Cache (Chunked into 60-day blocks)
        if (!progress.completed30Min.includes(item.symbol)) {
            try {
                let merged30Min = [];
                let chunkEndObj = new Date(toDateStr + 'T00:00:00Z');
                const absoluteStart = new Date(min30FromStr + 'T00:00:00Z');
                let chunkError = false;

                while (chunkEndObj > absoluteStart) {
                    let chunkStartObj = new Date(chunkEndObj.getTime());
                    chunkStartObj.setDate(chunkStartObj.getDate() - 60); // 60-day chunk
                    if (chunkStartObj < absoluteStart) chunkStartObj = new Date(absoluteStart.getTime());

                    const pStart = chunkStartObj.toISOString().split('T')[0];
                    const pEnd = chunkEndObj.toISOString().split('T')[0];

                    const initialCount = priceService.rateLimiter.requestsToday;
                    const dataChunk = await priceService.fetchFromUpstox(item.instrumentKey, pStart, pEnd, '30minute', item.symbol);
                    const callsMade = priceService.rateLimiter.requestsToday - initialCount;

                    if (callsMade > 0) {
                        apiCallsThisRun += callsMade;
                        progress.apiCallsUsedToday += callsMade;
                        await new Promise(r => setTimeout(r, 250));
                    }

                    if (dataChunk && dataChunk.length > 0) {
                        merged30Min = merged30Min.concat(dataChunk);
                    }

                    if (chunkStartObj.getTime() === absoluteStart.getTime()) {
                        break;
                    }
                    chunkEndObj = new Date(chunkStartObj.getTime());
                    chunkEndObj.setDate(chunkEndObj.getDate() - 1);
                }

                if (merged30Min.length > 0) {
                    saveMasterCache(item.symbol, '30minute', merged30Min);
                    progress.completed30Min.push(item.symbol);
                    newlyCached30m++;
                    saveProgress(progress);
                } else if (!chunkError) {
                    console.log(`   └─ No 30-min data returned for ${item.symbol}`);
                }
            } catch (err) {
                console.error(`   └─ Error fetching 30-min for ${item.symbol}: ${err.message}`);
                await new Promise(r => setTimeout(r, 1000));
            }
        }

        // C) 15-min Cache (Chunked into 60-day blocks, fetched as 1minute) - Only for LOM_INTRA stocks
        if (item.isLomIntra && (!progress.completed15Min || !progress.completed15Min.includes(item.symbol))) {
            try {
                let merged1Min = [];
                // API rate limit issues on 1-min Data limit historical fetch to usually 30 days
                // To avoid massive payloads, let's chunk it efficiently 
                // However, fetching 180 days of 1-minute data natively is heavy, 
                // so we rely on the 30-day chunks safely here
                let chunkEndObj = new Date(toDateStr + 'T00:00:00Z');
                const absoluteStart = new Date(int15FromStr + 'T00:00:00Z');
                let chunkError = false;

                while (chunkEndObj > absoluteStart) {
                    let chunkStartObj = new Date(chunkEndObj.getTime());
                    chunkStartObj.setDate(chunkStartObj.getDate() - 30); // 30-day chunk for 1min data
                    if (chunkStartObj < absoluteStart) chunkStartObj = new Date(absoluteStart.getTime());

                    const pStart = chunkStartObj.toISOString().split('T')[0];
                    const pEnd = chunkEndObj.toISOString().split('T')[0];

                    const initialCount = priceService.rateLimiter.requestsToday;
                    // Fetch as 1minute instead of 15minute to synthesize it
                    const dataChunk = await priceService.fetchFromUpstox(item.instrumentKey, pStart, pEnd, '1minute', item.symbol);
                    const callsMade = priceService.rateLimiter.requestsToday - initialCount;

                    if (callsMade > 0) {
                        apiCallsThisRun += callsMade;
                        progress.apiCallsUsedToday += callsMade;
                        await new Promise(r => setTimeout(r, 250));
                    }

                    if (dataChunk && dataChunk.length > 0) {
                        merged1Min = merged1Min.concat(dataChunk);
                    }

                    if (chunkStartObj.getTime() === absoluteStart.getTime()) {
                        break;
                    }
                    chunkEndObj = new Date(chunkStartObj.getTime());
                    chunkEndObj.setDate(chunkEndObj.getDate() - 1);
                }

                if (merged1Min.length > 0) {
                    // Passed as 1minute, will be synthesized and saved as 15minute inside saveMasterCache
                    saveMasterCache(item.symbol, '1minute', merged1Min);
                    progress.completed15Min = progress.completed15Min || [];
                    progress.completed15Min.push(item.symbol);
                    newlyCached15m++;
                    saveProgress(progress);
                } else if (!chunkError) {
                    console.log(`   └─ No 1-min data returned for ${item.symbol}`);
                }
            } catch (err) {
                console.error(`   └─ Error fetching 1-min for ${item.symbol}: ${err.message}`);
                await new Promise(r => setTimeout(r, 1000));
            }
        }
    }

    const totalCachedDaily = progress.completedDaily.length;
    const totalCached30m = progress.completed30Min.length;
    const totalCached15m = (progress.completed15Min || []).length;

    console.log(`\n${'═'.repeat(80)}`);
    console.log(` BULK CACHING REPORT`);
    console.log(`${'═'.repeat(80)}`);
    console.log(`Total unique symbols across 12 categories: ${jobs.length - 1}`);
    console.log(`Already cached Daily before this run: ${totalCachedDaily - newlyCachedDaily}`);
    console.log(`Daily files created/updated this run: ${newlyCachedDaily}`);
    console.log(`Already cached 30-min before this run: ${totalCached30m - newlyCached30m}`);
    console.log(`30-min files created/updated this run: ${newlyCached30m}`);
    console.log(`Already cached 15-min before this run: ${totalCached15m - newlyCached15m}`);
    console.log(`15-min files created/updated this run: ${newlyCached15m}`);
    console.log(`Pending Daily: ${jobs.length - totalCachedDaily}`);
    console.log(`Pending 30-min: ${jobs.length - totalCached30m}`);
    console.log(`API calls used this run: ${apiCallsThisRun}`);
    console.log(`Total API calls used today: ${progress.apiCallsUsedToday}/${MAX_API_CALLS_PER_DAY}`);
    console.log(`${'═'.repeat(80)}\n`);

    process.exit(0);
}

runBulkCache().catch(err => {
    console.error('Fatal Error:', err);
    process.exit(1);
});
