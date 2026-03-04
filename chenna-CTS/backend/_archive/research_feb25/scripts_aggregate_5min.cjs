/**
 * Import 5-Minute Data using Upstox Intraday Candle Data V3 API
 * 
 * Based on user's screenshot: https://api.upstox.com/v3/historical-candle/intraday
 * Path: /:instrument_key/:unit/:interval
 * For 5-min: unit=minutes, interval=5
 */

const { PrismaClient } = require('@prisma/client');
const fs = require('fs').promises;
const path = require('path');
const prisma = new PrismaClient();

class RateLimiter {
    constructor(intervalMs = 1000) {
        this.intervalMs = intervalMs;
        this.lastCall = 0;
    }

    async wait() {
        const now = Date.now();
        const elapsed = now - this.lastCall;
        if (elapsed < this.intervalMs) {
            await new Promise(r => setTimeout(r, this.intervalMs - elapsed));
        }
        this.lastCall = Date.now();
    }
}

const rateLimiter = new RateLimiter(1000);

async function getAccessToken() {
    const tokenPath = path.join(__dirname, '../auth/tokens.json');
    const data = await fs.readFile(tokenPath, 'utf8');
    const tokens = JSON.parse(data);
    return tokens.access_token;
}

// Fetch using V3 Intraday API
async function fetch5MinDataV3(instrumentKey, token) {
    await rateLimiter.wait();

    // V3 API format: /v3/historical-candle/intraday/:instrument_key/:unit/:interval
    // For 5-min: unit=minutes, interval=5
    const url = `https://api.upstox.com/v3/historical-candle/intraday/${encodeURIComponent(instrumentKey)}/minutes/5`;

    try {
        const response = await fetch(url, {
            headers: {
                'Authorization': `Bearer ${token}`,
                'Accept': 'application/json'
            }
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`V3 API error: ${response.status} - ${errorText.substring(0, 200)}`);
        }

        const result = await response.json();

        if (result.status !== 'success' || !result.data || !result.data.candles) {
            return [];
        }

        const candles = result.data.candles.map(c => ({
            timestamp: c[0],
            open: c[1],
            high: c[2],
            low: c[3],
            close: c[4],
            volume: c[5],
            oi: c[6] || 0
        }));

        return candles;

    } catch (error) {
        console.error(`Error fetching ${instrumentKey}:`, error.message);
        throw error;
    }
}

// Try V2 Historical API with day interval and aggregate to 5-min
async function fetchAndAggregateFrom1Min(symbol) {
    // Get existing 1-min data from cache (stored as '5m' interval oddly)
    const cached = await prisma.ohlcvCache.findFirst({
        where: { symbol, interval: '5m' }
    });

    if (!cached || !cached.data || cached.data.length === 0) {
        return [];
    }

    // Aggregate 5 consecutive 1-min candles into 1 5-min candle
    const candles1Min = cached.data.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
    const candles5Min = [];

    for (let i = 0; i < candles1Min.length; i += 5) {
        const chunk = candles1Min.slice(i, i + 5);
        if (chunk.length === 0) continue;

        // Get minute from first candle's timestamp
        const firstTimestamp = chunk[0].timestamp;
        const minute = parseInt(firstTimestamp.split('T')[1].split(':')[1]);

        // Only start aggregation on 0, 5, 10, 15... minute marks
        if (minute % 5 !== 0 && i === 0) {
            // Skip until we hit a proper 5-min boundary
            continue;
        }

        // Aggregate OHLCV
        const candle5Min = {
            timestamp: chunk[0].timestamp,
            open: chunk[0].open,
            high: Math.max(...chunk.map(c => c.high)),
            low: Math.min(...chunk.map(c => c.low)),
            close: chunk[chunk.length - 1].close,
            volume: chunk.reduce((sum, c) => sum + (c.volume || 0), 0),
            oi: chunk[chunk.length - 1].oi || 0
        };

        candles5Min.push(candle5Min);
    }

    return candles5Min;
}

async function saveToCache(symbol, data) {
    const fromDate = '2026-01-02';
    const toDate = '2026-01-20';

    try {
        await prisma.ohlcvCache.upsert({
            where: {
                symbol_interval_fromDate_toDate: {
                    symbol,
                    interval: '5min',
                    fromDate: new Date(fromDate),
                    toDate: new Date(toDate)
                }
            },
            create: {
                symbol,
                interval: '5min',
                fromDate: new Date(fromDate),
                toDate: new Date(toDate),
                data,
                source: 'aggregated_from_1min',
                expiresAt: null
            },
            update: {
                data,
                source: 'aggregated_from_1min',
                expiresAt: null
            }
        });
        return true;
    } catch (error) {
        console.error(`Error saving ${symbol}:`, error.message);
        return false;
    }
}

async function getIntradayStocks() {
    const category = await prisma.category.findFirst({
        where: { key: 'INTRADAY_BOOST' },
        include: {
            stocks: { include: { stock: true } }
        }
    });

    if (!category) return [];

    const seen = new Set();
    const stocks = [];

    for (const sc of category.stocks) {
        if (sc.stock && !seen.has(sc.stock.symbol)) {
            seen.add(sc.stock.symbol);
            stocks.push({ symbol: sc.stock.symbol });
        }
    }

    return stocks;
}

async function aggregateData() {
    console.log('═'.repeat(60));
    console.log('V2.2: Aggregate 5-Minute Data from Existing 1-Minute Data');
    console.log('═'.repeat(60));

    const stocks = await getIntradayStocks();
    console.log(`✓ Found ${stocks.length} unique stocks in INTRADAY_BOOST`);

    let successCount = 0;
    let errorCount = 0;
    let totalCandles = 0;

    console.log(`\n🚀 Aggregating 1-min → 5-min for ${stocks.length} stocks...\n`);

    for (let i = 0; i < stocks.length; i++) {
        const stock = stocks[i];

        try {
            const candles5Min = await fetchAndAggregateFrom1Min(stock.symbol);

            if (candles5Min.length > 0) {
                const saved = await saveToCache(stock.symbol, candles5Min);
                if (saved) {
                    successCount++;
                    totalCandles += candles5Min.length;
                }
            } else {
                errorCount++;
            }

            if ((i + 1) % 20 === 0 || i === stocks.length - 1) {
                console.log(`  [${i + 1}/${stocks.length}] ${stock.symbol}: ${candles5Min.length} 5-min candles`);
            }

        } catch (error) {
            console.error(`  ❌ ${stock.symbol}: ${error.message}`);
            errorCount++;
        }
    }

    console.log('\n' + '═'.repeat(60));
    console.log('AGGREGATION SUMMARY');
    console.log('═'.repeat(60));
    console.log(`✓ Stocks processed: ${successCount}`);
    console.log(`✓ Total 5-min candles: ${totalCandles}`);
    console.log(`❌ Errors/No data: ${errorCount}`);
    console.log(`📊 Avg candles/stock: ${successCount > 0 ? Math.round(totalCandles / successCount) : 0}`);
    console.log('═'.repeat(60));
}

async function verifyAggregation() {
    console.log('\n📋 VERIFICATION: Sample 5-minute candles...\n');

    // Get one stock to show sample
    const sample = await prisma.ohlcvCache.findFirst({
        where: { interval: '5min' }
    });

    if (sample && sample.data) {
        console.log(`Stock: ${sample.symbol}`);
        console.log(`Total 5-min candles: ${sample.data.length}`);
        console.log('\nFirst 5 candles:');
        sample.data.slice(0, 5).forEach((c, i) => {
            const time = c.timestamp.split('T')[1].substring(0, 8);
            console.log(`  ${i + 1}. ${time} | O:${c.open} H:${c.high} L:${c.low} C:${c.close} V:${c.volume}`);
        });
    }

    const total = await prisma.$queryRaw`
        SELECT 
            COUNT(DISTINCT symbol) as stocks,
            SUM(jsonb_array_length(data)) as total_candles
        FROM ohlcv_cache 
        WHERE interval = '5min'
    `;

    console.log('\n📊 Total 5-minute data aggregated:');
    console.log(`   Stocks: ${total[0]?.stocks || 0}`);
    console.log(`   Candles: ${total[0]?.total_candles || 0}`);
}

aggregateData()
    .then(() => verifyAggregation())
    .catch(console.error)
    .finally(() => prisma.$disconnect());
