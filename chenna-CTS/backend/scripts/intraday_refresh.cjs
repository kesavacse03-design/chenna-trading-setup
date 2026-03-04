/**
 * INTRADAY REFRESH - Semi-Live Data Pipeline
 * 
 * Uses the Upstox INTRADAY candle endpoint for today's data:
 *   GET /v2/historical-candle/intraday/{instrument_key}/{interval}
 * 
 * This returns candles for the CURRENT trading day during market hours.
 * Unlike the historical endpoint, this works in real-time.
 *
 * USAGE:
 *   Manual: node scripts/intraday_refresh.cjs
 *   API:    POST /api/v5/intraday/refresh
 *
 * API BUDGET:
 *   49 IB stocks × 1 call (intraday 30m) = 49 calls per refresh
 *   5 refreshes/day × 49 = 245 calls (well within 1000/day limit)
 */

const prisma = require('../lib/prisma.cjs');
const path = require('path');
const fs = require('fs');
const { todayIST, importDateIST } = require('../utils/istUtils.cjs');

const CACHE_DIR_30M = path.join(__dirname, '../cache/30minute');
const CACHE_DIR_1M = path.join(__dirname, '../cache/1minute');
const CACHE_DIR_DAY = path.join(__dirname, '../cache/day');
const TOKENS_PATH = path.join(__dirname, '../auth/tokens.json');

function getAccessToken() {
    try {
        const tokens = JSON.parse(fs.readFileSync(TOKENS_PATH, 'utf8'));
        return tokens.access_token;
    } catch (e) {
        console.error('[IntradayRefresh] Failed to read access token:', e.message);
        return null;
    }
}

/**
 * Fetch today's candles using the INTRADAY endpoint
 */
async function fetchIntradayCandles(instrumentKey, interval, accessToken) {
    const instKey = encodeURIComponent(instrumentKey);
    const url = `https://api.upstox.com/v2/historical-candle/intraday/${instKey}/${interval}`;

    const res = await fetch(url, {
        headers: {
            'Accept': 'application/json',
            'Authorization': `Bearer ${accessToken}`
        }
    });

    if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${res.statusText}`);
    }

    const data = await res.json();
    if (data.status !== 'success' || !data.data?.candles?.length) {
        return [];
    }

    // Convert Upstox candle format [timestamp, O, H, L, C, V, OI]
    // to our standard cache format { timestamp, open, high, low, close, volume }
    return data.data.candles.map(c => ({
        timestamp: c[0],
        date: c[0],
        open: c[1],
        high: c[2],
        low: c[3],
        close: c[4],
        volume: c[5]
    })).sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp)); // chronological order
}

async function refreshIntradayCache() {
    const today = todayIST();
    console.log(`\n[IntradayRefresh] Starting LIVE refresh for ${today}...`);

    const accessToken = getAccessToken();
    if (!accessToken) return { ok: false, error: 'No access token' };

    // 1. Get INTRADAY_BOOST stocks for today
    // addedDate is stored as UTC midnight of the IST date via importDateIST()
    const todayUTC = importDateIST(today);

    const ibCats = await prisma.stockCategory.findMany({
        where: {
            category: { key: 'INTRADAY_BOOST' },
            addedDate: todayUTC
        },
        include: { stock: true }
    });

    const stocks = ibCats.map(r => r.stock).filter(s => s && s.instrumentKey);
    console.log(`[IntradayRefresh] Found ${stocks.length} IB stocks for ${today}`);

    if (stocks.length === 0) {
        return { ok: false, error: 'No IB stocks for today' };
    }

    // 2. Fetch live intraday 30m candles for each stock
    let refreshed = 0, failed = 0, apiCalls = 0;
    let todayCandleCount = 0;

    for (let i = 0; i < stocks.length; i++) {
        const stock = stocks[i];
        const sym = stock.symbol;

        try {
            const candles30m = await fetchIntradayCandles(stock.instrumentKey, '30minute', accessToken);
            apiCalls++;
            // Fetch 1-min data to build accurate 5-minute OR bounds
            await new Promise(r => setTimeout(r, 250)); // stagger API call
            const candles1m = await fetchIntradayCandles(stock.instrumentKey, '1minute', accessToken);
            apiCalls++;

            if (candles30m.length > 0) {
                // Merge with existing 30m cache
                const cleanKey = sym.replace(/[^a-zA-Z0-9_-]/g, '_');
                const cachePath30m = path.join(CACHE_DIR_30M, `${cleanKey}_master.json`);

                let existing30m = [];
                if (fs.existsSync(cachePath30m)) {
                    existing30m = JSON.parse(fs.readFileSync(cachePath30m, 'utf8'));
                }

                // Deduplicate and merge 30m
                const allData30m = [...existing30m, ...candles30m];
                const unique30m = {};
                for (const c of allData30m) {
                    const ts = String(c.timestamp || c.date);
                    unique30m[ts] = c;
                }
                const merged30m = Object.values(unique30m).sort(
                    (a, b) => new Date(a.timestamp || a.date) - new Date(b.timestamp || b.date)
                );

                fs.writeFileSync(cachePath30m, JSON.stringify(merged30m));

                // Process 1m cache
                if (candles1m.length > 0) {
                    const cachePath1m = path.join(CACHE_DIR_1M, `${cleanKey}_master.json`);
                    let existing1m = [];
                    if (fs.existsSync(cachePath1m)) {
                        existing1m = JSON.parse(fs.readFileSync(cachePath1m, 'utf8'));
                    }
                    const allData1m = [...existing1m, ...candles1m];
                    const unique1m = {};
                    for (const c of allData1m) {
                        unique1m[String(c.timestamp || c.date)] = c;
                    }
                    const merged1m = Object.values(unique1m).sort(
                        (a, b) => new Date(a.timestamp || a.date) - new Date(b.timestamp || b.date)
                    );
                    fs.writeFileSync(cachePath1m, JSON.stringify(merged1m));
                }

                refreshed++;

                // Also synthesize a daily candle from today's 30m data
                // and append to the daily cache (confirmation service needs this)
                const dailyCachePath = path.join(CACHE_DIR_DAY, `${cleanKey}_master.json`);
                const todayCandles30m = candles30m; // already filtered to today
                if (todayCandles30m.length > 0) {
                    const dailyCandle = {
                        timestamp: today + 'T00:00:00+05:30',
                        date: today + 'T00:00:00+05:30',
                        open: todayCandles30m[0].open,
                        high: Math.max(...todayCandles30m.map(c => c.high)),
                        low: Math.min(...todayCandles30m.map(c => c.low)),
                        close: todayCandles30m[todayCandles30m.length - 1].close,
                        volume: todayCandles30m.reduce((sum, c) => sum + (c.volume || 0), 0)
                    };

                    let dailyExisting = [];
                    if (fs.existsSync(dailyCachePath)) {
                        dailyExisting = JSON.parse(fs.readFileSync(dailyCachePath, 'utf8'));
                    }
                    // Remove any existing entry for today, then add fresh
                    dailyExisting = dailyExisting.filter(c =>
                        String(c.timestamp || c.date).split('T')[0] !== today
                    );
                    dailyExisting.push(dailyCandle);
                    dailyExisting.sort((a, b) =>
                        new Date(a.timestamp || a.date) - new Date(b.timestamp || b.date)
                    );
                    fs.writeFileSync(dailyCachePath, JSON.stringify(dailyExisting));
                }

                const todayCandlesN = candles30m.length;
                todayCandleCount += todayCandlesN;
                console.log(`  [${i + 1}/${stocks.length}] ✅ ${sym}: ${todayCandlesN} candles (30m) & ${candles1m.length} candles (1m)`);
            } else {
                console.log(`  [${i + 1}/${stocks.length}] ⚠️  ${sym}: no candles`);
                failed++;
            }

            // Rate limit: 250ms between calls
            if (i < stocks.length - 1) {
                await new Promise(r => setTimeout(r, 250));
            }
        } catch (err) {
            console.error(`  [${i + 1}/${stocks.length}] ❌ ${sym}: ${err.message}`);
            failed++;
            await new Promise(r => setTimeout(r, 500));
        }
    }

    console.log(`\n[IntradayRefresh] Cache refresh complete:`);
    console.log(`  ✅ Refreshed: ${refreshed} stocks`);
    console.log(`  ❌ Failed: ${failed}`);
    console.log(`  📊 API calls: ${apiCalls}`);
    console.log(`  📈 Today's candles: ${todayCandleCount}`);

    // 3. Now run the confirmation service
    console.log(`\n[IntradayRefresh] Running confirmation for ${today}...`);
    try {
        const confirmationService = require('../services/confirmationService.cjs');
        const result = await confirmationService.confirmIntradaySignals(today);
        console.log(`[IntradayRefresh] ✅ Signals: triggered=${result.triggered}, expired=${result.expired}`);

        // 4. Show the generated signals
        const signals = await prisma.v5Signal.findMany({
            where: { signalDate: todayUTC },
            orderBy: { confidenceScore: 'desc' }
        });

        if (signals.length > 0) {
            console.log(`\n=== TODAY'S SIGNALS (${today}) ===`);
            console.log(`Total: ${signals.length} | Confirmed: ${signals.filter(s => s.status === 'CONFIRMED').length} | Expired: ${signals.filter(s => s.status === 'EXPIRED').length}\n`);

            for (const s of signals) {
                console.log(
                    `  ${s.symbol.padEnd(15)} | ${(s.direction || s.macd1hState || '???').padEnd(5)} | ` +
                    `score: ${String(s.confidenceScore).padEnd(3)} | ${s.confidenceTier.padEnd(6)} | ` +
                    `entry: ${Number(s.entryPrice || s.signalClose).toFixed(1)} | ` +
                    `stop: ${Number(s.stopPrice || s.suggestedStop).toFixed(1)} | ` +
                    `status: ${s.status} | type: ${s.entryType || s.meta?.entryPattern || '-'}`
                );
            }

            // Show Top 3
            const confirmed = signals.filter(s => s.status === 'CONFIRMED');
            if (confirmed.length >= 3) {
                console.log(`\n⭐ TOP 3 BY CONFIDENCE SCORE:`);
                confirmed.slice(0, 3).forEach((s, i) => {
                    console.log(`  #${i + 1} ${s.symbol} (${s.direction || s.macd1hState}) score=${s.confidenceScore} entry=${Number(s.entryPrice || s.signalClose).toFixed(1)} stop=${Number(s.stopPrice || s.suggestedStop).toFixed(1)}`);
                });
            }
        }

        return {
            ok: true,
            date: today,
            cacheRefreshed: refreshed,
            cacheFailed: failed,
            apiCallsUsed: apiCalls,
            todayCandles: todayCandleCount,
            signalsTriggered: result.triggered,
            signalsExpired: result.expired,
            totalSignals: signals.length
        };
    } catch (err) {
        console.error(`[IntradayRefresh] Confirmation error: ${err.message}`);
        return {
            ok: true,
            date: today,
            cacheRefreshed: refreshed,
            cacheFailed: failed,
            apiCallsUsed: apiCalls,
            todayCandles: todayCandleCount,
            confirmationError: err.message
        };
    }
}

// Export for API use
module.exports = { refreshIntradayCache };

// Run standalone
if (require.main === module) {
    refreshIntradayCache()
        .then(result => {
            console.log('\n=== FINAL RESULT ===');
            console.log(JSON.stringify(result, null, 2));
        })
        .catch(err => console.error('Fatal:', err))
        .finally(() => prisma.$disconnect());
}
