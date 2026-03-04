/**
 * Phase 1-2 Verification Script
 * 
 * Purpose: Verify data is REAL, not simulated
 * 
 * Tasks:
 * 1. Show 3 detailed trade breakdowns with raw OHLCV
 * 2. Export all trades to CSV
 * 3. Show distributions by month
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const labsDataService = require('./services/labsDataService.cjs');
const fs = require('fs');
const path = require('path');

const PARAMS = {
    targetPercent: 2.0,
    stopPercent: -1.5,
    maxDays: 15
};

async function verifyPhase1Data() {
    console.log('\n' + '═'.repeat(80));
    console.log('📋 PHASE 1-2 VERIFICATION');
    console.log('═'.repeat(80));

    // 1. Load category stocks
    const category = await prisma.category.findFirst({
        where: { key: 'DOWNSIDE_LOM_SWING' }
    });

    const categoryStocks = await prisma.stockCategory.findMany({
        where: { categoryId: category.id },
        include: { stock: true }
    });

    const stocks = categoryStocks.map(cs => ({
        symbol: cs.stock?.symbol,
        addedDate: cs.addedDate || cs.createdAt,
        stockId: cs.stockId
    })).filter(s => s.symbol);

    console.log(`\n📦 Total stocks in category: ${stocks.length}`);

    // 2. Fetch price data
    const stocksWithDates = stocks.map(s => ({
        symbol: s.symbol,
        listedDate: s.addedDate
    }));

    const priceData = await labsDataService.getHistoricalData(stocksWithDates, { days: 400 });

    // 3. Simulate all trades
    const allTrades = [];
    const skipped = { beforeData: 0, afterData: 0, noData: 0 };

    for (const stock of stocks) {
        const candles = priceData[stock.symbol];
        if (!candles || candles.length < 30) {
            skipped.noData++;
            continue;
        }

        // Find addedDate index
        const entryIdx = findDateIndex(candles, stock.addedDate);
        if (entryIdx === -1) {
            skipped.beforeData++;
            continue;
        }
        if (entryIdx >= candles.length - PARAMS.maxDays) {
            skipped.afterData++;
            continue;
        }

        const entryCandle = candles[entryIdx];
        const entryPrice = entryCandle.close;
        const targetPrice = entryPrice * (1 + PARAMS.targetPercent / 100);
        const stopPrice = entryPrice * (1 + PARAMS.stopPercent / 100);

        let outcome = 'TIMEOUT';
        let exitIdx = entryIdx + PARAMS.maxDays;
        let exitPrice = entryPrice;
        let daysHeld = PARAMS.maxDays;

        for (let day = 1; day <= PARAMS.maxDays; day++) {
            const idx = entryIdx + day;
            if (idx >= candles.length) break;

            const dayCandle = candles[idx];
            if (dayCandle.high >= targetPrice) {
                outcome = 'SUCCESS';
                exitIdx = idx;
                exitPrice = targetPrice;
                daysHeld = day;
                break;
            }
            if (dayCandle.low <= stopPrice) {
                outcome = 'FAILURE';
                exitIdx = idx;
                exitPrice = stopPrice;
                daysHeld = day;
                break;
            }
            exitPrice = dayCandle.close;
            exitIdx = idx;
        }

        const returnPercent = ((exitPrice - entryPrice) / entryPrice) * 100;

        // Analyze patterns
        const lookback = candles.slice(Math.max(0, entryIdx - 10), entryIdx);
        const atSupport = analyzePricePosition(lookback, entryCandle);
        const entryCandleType = entryCandle.close >= entryCandle.open ? 'BULLISH' : 'BEARISH';

        allTrades.push({
            symbol: stock.symbol,
            addedDate: formatDate(stock.addedDate),
            entryPrice: Math.round(entryPrice * 100) / 100,
            exitDate: formatDate(candles[exitIdx].timestamp || candles[exitIdx].date),
            exitPrice: Math.round(exitPrice * 100) / 100,
            outcome,
            returnPercent: Math.round(returnPercent * 100) / 100,
            daysHeld,
            atSupport,
            entryCandleType,
            rawCandles: candles.slice(entryIdx - 5, exitIdx + 5),
            entryIdx,
            exitIdx,
            targetPrice,
            stopPrice
        });
    }

    console.log(`✅ Analyzed: ${allTrades.length} trades`);
    console.log(`❌ Skipped: ${skipped.beforeData} (before data) + ${skipped.afterData} (after data) + ${skipped.noData} (no data)`);

    // TASK 1: Show 3 detailed breakdowns
    const successTrade = allTrades.find(t => t.outcome === 'SUCCESS');
    const failureTrade = allTrades.find(t => t.outcome === 'FAILURE');
    const randomTrade = allTrades[Math.floor(Math.random() * allTrades.length)];

    console.log('\n' + '═'.repeat(80));
    console.log('📊 TASK 1: DETAILED TRADE BREAKDOWNS');
    console.log('═'.repeat(80));

    if (successTrade) {
        showDetailedBreakdown(successTrade, priceData[successTrade.symbol], 'SUCCESS');
    }
    if (failureTrade) {
        showDetailedBreakdown(failureTrade, priceData[failureTrade.symbol], 'FAILURE');
    }
    if (randomTrade) {
        showDetailedBreakdown(randomTrade, priceData[randomTrade.symbol], 'RANDOM');
    }

    // TASK 2: Export to CSV
    console.log('\n' + '═'.repeat(80));
    console.log('📁 TASK 2: EXPORTING TO CSV');
    console.log('═'.repeat(80));

    const csvPath = await exportToCSV(allTrades);
    console.log(`\n✅ CSV exported to: ${csvPath}`);

    // TASK 3: Show distributions
    console.log('\n' + '═'.repeat(80));
    console.log('📈 TASK 3: DISTRIBUTIONS');
    console.log('═'.repeat(80));

    showDistributions(allTrades);

    await prisma.$disconnect();

    return { allTrades, csvPath };
}

function findDateIndex(candles, targetDate) {
    const target = new Date(targetDate).toDateString();
    const targetTime = new Date(targetDate).getTime();

    const getCandleTime = (candle) => {
        const dateStr = candle.timestamp || candle.date;
        return new Date(dateStr).getTime();
    };

    const firstCandleTime = getCandleTime(candles[0]);
    const lastCandleTime = getCandleTime(candles[candles.length - 1]);

    if (targetTime < firstCandleTime) return -1;
    if (targetTime > lastCandleTime) return -1;

    for (let i = 0; i < candles.length; i++) {
        const candleDate = candles[i].timestamp || candles[i].date;
        if (new Date(candleDate).toDateString() === target) {
            return i;
        }
    }

    // Find closest within 3 days
    let closestIdx = -1;
    let closestDiff = Infinity;
    for (let i = 0; i < candles.length; i++) {
        const diff = Math.abs(getCandleTime(candles[i]) - targetTime);
        if (diff < closestDiff && diff < 3 * 24 * 60 * 60 * 1000) {
            closestDiff = diff;
            closestIdx = i;
        }
    }
    return closestIdx;
}

function formatDate(date) {
    const d = new Date(date);
    return d.toISOString().split('T')[0];
}

function analyzePricePosition(lookback, entryCandle) {
    if (!lookback.length) return 'UNKNOWN';
    const highs = lookback.map(c => c.high);
    const lows = lookback.map(c => c.low);
    const high = Math.max(...highs);
    const low = Math.min(...lows);
    const range = high - low;
    if (range === 0) return 'FLAT';

    const entryPrice = entryCandle.close;
    const position = (entryPrice - low) / range;

    if (position < 0.33) return 'AT_SUPPORT';
    if (position > 0.67) return 'AT_RESISTANCE';
    return 'MID_RANGE';
}

function showDetailedBreakdown(trade, candles, type) {
    console.log(`\n${'─'.repeat(80)}`);
    console.log(`📌 ${type} TRADE: ${trade.symbol}`);
    console.log(`${'─'.repeat(80)}`);

    console.log(`\nA) BASIC INFO:`);
    console.log(`   Symbol:     ${trade.symbol}`);
    console.log(`   AddedDate:  ${trade.addedDate}`);
    console.log(`   EntryPrice: ₹${trade.entryPrice}`);
    console.log(`   ExitDate:   ${trade.exitDate}`);
    console.log(`   ExitPrice:  ₹${trade.exitPrice}`);
    console.log(`   Outcome:    ${trade.outcome}`);
    console.log(`   Return:     ${trade.returnPercent}%`);
    console.log(`   DaysHeld:   ${trade.daysHeld}`);

    console.log(`\nB) RAW OHLCV DATA (AddedDate -5 to +15):`);
    console.log(`   ${'Date'.padEnd(12)} ${'Open'.padStart(10)} ${'High'.padStart(10)} ${'Low'.padStart(10)} ${'Close'.padStart(10)} ${'Volume'.padStart(12)}`);
    console.log(`   ${'-'.repeat(68)}`);

    const entryIdx = trade.entryIdx;
    const startIdx = Math.max(0, entryIdx - 5);
    const endIdx = Math.min(candles.length - 1, entryIdx + 15);

    for (let i = startIdx; i <= endIdx; i++) {
        const c = candles[i];
        const date = formatDate(c.timestamp || c.date);
        const marker = i === entryIdx ? ' ◄ENTRY' : '';
        const isEntry = i === entryIdx;
        const isExit = i === trade.exitIdx;
        const prefix = isEntry ? '>>>' : (isExit ? '<<<' : '   ');

        console.log(`${prefix}${date.padEnd(12)} ${c.open.toFixed(2).padStart(10)} ${c.high.toFixed(2).padStart(10)} ${c.low.toFixed(2).padStart(10)} ${c.close.toFixed(2).padStart(10)} ${Math.round(c.volume).toString().padStart(12)}${marker}`);
    }

    console.log(`\nC) STEP-BY-STEP CALCULATION:`);
    console.log(`   Entry Price:  ₹${trade.entryPrice}`);
    console.log(`   Target Price: ₹${trade.targetPrice.toFixed(2)} (+${PARAMS.targetPercent}%)`);
    console.log(`   Stop Price:   ₹${trade.stopPrice.toFixed(2)} (${PARAMS.stopPercent}%)`);

    for (let day = 1; day <= Math.min(trade.daysHeld, 5); day++) {
        const c = candles[entryIdx + day];
        if (!c) break;
        const hitTarget = c.high >= trade.targetPrice;
        const hitStop = c.low <= trade.stopPrice;
        console.log(`   Day ${day}: High=${c.high.toFixed(2)}, Low=${c.low.toFixed(2)} ${hitTarget ? '→ HIT TARGET ✅' : (hitStop ? '→ HIT STOP ❌' : '')}`);
    }

    console.log(`\nD) PATTERN ANALYSIS:`);
    console.log(`   At Support?:    ${trade.atSupport}`);
    console.log(`   Entry Candle:   ${trade.entryCandleType}`);
    console.log(`   Pre-entry Trend: ${candles[entryIdx - 5]?.close > candles[entryIdx]?.close ? 'FALLING' : 'RISING'}`);
}

async function exportToCSV(trades) {
    const headers = 'Symbol,AddedDate,EntryPrice,ExitDate,ExitPrice,Outcome,ReturnPercent,DaysHeld,AtSupport,EntryCandleType';
    const rows = trades.map(t =>
        `${t.symbol},${t.addedDate},${t.entryPrice},${t.exitDate},${t.exitPrice},${t.outcome},${t.returnPercent},${t.daysHeld},${t.atSupport},${t.entryCandleType}`
    );

    const csv = [headers, ...rows].join('\n');
    const csvPath = path.join(__dirname, 'phase1_complete_results.csv');

    fs.writeFileSync(csvPath, csv);

    console.log(`\nCSV Preview (first 10 rows):`);
    console.log(headers);
    rows.slice(0, 10).forEach(r => console.log(r));
    console.log('...');

    return csvPath;
}

function showDistributions(trades) {
    // AddedDate distribution by month
    const byMonth = {};
    const successByMonth = {};

    trades.forEach(t => {
        const month = t.addedDate.substring(0, 7); // YYYY-MM
        byMonth[month] = (byMonth[month] || 0) + 1;
        if (t.outcome === 'SUCCESS') {
            successByMonth[month] = (successByMonth[month] || 0) + 1;
        }
    });

    console.log('\n📅 ADDED DATE DISTRIBUTION:');
    console.log(`${'Month'.padEnd(10)} ${'Count'.padStart(8)} ${'Success'.padStart(8)} ${'Rate'.padStart(8)}`);
    console.log('-'.repeat(38));

    Object.keys(byMonth).sort().forEach(month => {
        const count = byMonth[month];
        const success = successByMonth[month] || 0;
        const rate = ((success / count) * 100).toFixed(1);
        console.log(`${month.padEnd(10)} ${count.toString().padStart(8)} ${success.toString().padStart(8)} ${(rate + '%').padStart(8)}`);
    });

    // Success rate summary
    const totalSuccess = trades.filter(t => t.outcome === 'SUCCESS').length;
    const totalFailure = trades.filter(t => t.outcome === 'FAILURE').length;
    const totalTimeout = trades.filter(t => t.outcome === 'TIMEOUT').length;

    console.log(`\n📊 OUTCOME SUMMARY:`);
    console.log(`   SUCCESS:  ${totalSuccess} (${(totalSuccess / trades.length * 100).toFixed(1)}%)`);
    console.log(`   FAILURE:  ${totalFailure} (${(totalFailure / trades.length * 100).toFixed(1)}%)`);
    console.log(`   TIMEOUT:  ${totalTimeout} (${(totalTimeout / trades.length * 100).toFixed(1)}%)`);

    // By entry candle
    console.log(`\n🕯️ SUCCESS RATE BY ENTRY CANDLE:`);
    const byCandle = { BULLISH: { total: 0, success: 0 }, BEARISH: { total: 0, success: 0 } };
    trades.forEach(t => {
        const type = t.entryCandleType;
        byCandle[type].total++;
        if (t.outcome === 'SUCCESS') byCandle[type].success++;
    });

    Object.keys(byCandle).forEach(type => {
        const { total, success } = byCandle[type];
        const rate = total > 0 ? ((success / total) * 100).toFixed(1) : 'N/A';
        console.log(`   ${type}: ${success}/${total} = ${rate}%`);
    });

    // By support position
    console.log(`\n📍 SUCCESS RATE BY SUPPORT POSITION:`);
    const byPosition = {};
    trades.forEach(t => {
        const pos = t.atSupport;
        if (!byPosition[pos]) byPosition[pos] = { total: 0, success: 0 };
        byPosition[pos].total++;
        if (t.outcome === 'SUCCESS') byPosition[pos].success++;
    });

    Object.keys(byPosition).forEach(pos => {
        const { total, success } = byPosition[pos];
        const rate = total > 0 ? ((success / total) * 100).toFixed(1) : 'N/A';
        console.log(`   ${pos}: ${success}/${total} = ${rate}%`);
    });
}

verifyPhase1Data()
    .then(result => {
        console.log('\n' + '═'.repeat(80));
        console.log('✅ VERIFICATION COMPLETE');
        console.log('═'.repeat(80));
        console.log(`\nCSV file: ${result.csvPath}`);
        console.log(`Total trades verified: ${result.allTrades.length}`);
    })
    .catch(console.error);
