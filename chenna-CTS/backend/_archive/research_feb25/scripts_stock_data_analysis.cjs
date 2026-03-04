/**
 * FULL CATEGORY STOCK ANALYSIS v3
 * 
 * Uses ALL stocks from StockCategory table (120 + 133)
 * Uses addedDate as the signal date
 * Fetches full OHLCV range: 20 days before, 30 days after
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

async function analyzeCategory(categoryKey) {
    const out = [];
    const log = (msg) => out.push(msg);

    log('================================================================');
    log(`FULL ANALYSIS: ${categoryKey}`);
    log('================================================================');

    // Get ALL stocks in this category
    const catStocks = await prisma.stockCategory.findMany({
        where: { category: { key: categoryKey } },
        include: { stock: true },
        orderBy: { addedDate: 'asc' }
    });
    log(`Total stocks in category: ${catStocks.length}`);

    const aggregate = {
        total: 0, errors: 0,
        upAfter5: 0, downAfter5: 0,
        upAfter10: 0, downAfter10: 0,
        upAfter20: 0, downAfter20: 0,
        sumChange5: 0, sumChange10: 0, sumChange20: 0,
        preTrendUp: { wins: 0, total: 0, sumChg: 0 },
        preTrendDown: { wins: 0, total: 0, sumChg: 0 },
        preTrendFlat: { wins: 0, total: 0, sumChg: 0 },
        volSpikeWins: 0, volSpikeTotal: 0,
        noVolSpikeWins: 0, noVolSpikeTotal: 0,
        greenWins: 0, greenTotal: 0,
        redWins: 0, redTotal: 0,
        smallGapWins: 0, smallGapTotal: 0,
        largeGapWins: 0, largeGapTotal: 0,
        // By month
        months: {},
        // By price bucket
        priceBuckets: {},
        // Stock details for sorting
        allStocks: []
    };

    let processed = 0;
    for (const cs of catStocks) {
        const symbol = cs.stock.symbol;
        const instrumentKey = cs.stock.instrumentKey;
        const addedDate = cs.addedDate ? toISTDateString(cs.addedDate) : null;

        if (!addedDate || !instrumentKey) {
            aggregate.errors++;
            continue;
        }

        // Fetch 60 days before and 40 days after addedDate
        const sigDate = new Date(cs.addedDate);
        const fromDate = new Date(sigDate);
        fromDate.setDate(fromDate.getDate() - 60);
        const toDate = new Date(sigDate);
        toDate.setDate(toDate.getDate() + 45);

        let candles;
        try {
            candles = await priceService.fetchPrice(
                symbol, instrumentKey,
                toISTDateString(fromDate), toISTDateString(toDate)
            );
        } catch (e) {
            aggregate.errors++;
            continue;
        }

        if (!candles || candles.length < 15) {
            aggregate.errors++;
            continue;
        }

        candles.sort((a, b) => new Date(a.timestamp || a.date) - new Date(b.timestamp || b.date));

        const sigIdx = candles.findIndex(c => candleDateStr(c) === addedDate);
        if (sigIdx < 0) {
            // Try closest date
            aggregate.errors++;
            continue;
        }

        aggregate.total++;
        processed++;
        const sigCandle = candles[sigIdx];
        const sigClose = sigCandle.close;
        const sigOpen = sigCandle.open;
        const isGreen = sigClose > sigOpen;
        const sigVol = parseInt(sigCandle.volume || 0);

        // Volume
        const volSlice = candles.slice(Math.max(0, sigIdx - 20), sigIdx);
        const avgVol = volSlice.length > 0 ? Math.round(volSlice.reduce((s, c) => s + parseInt(c.volume || 0), 0) / volSlice.length) : 0;
        const volRatio = avgVol > 0 ? sigVol / avgVol : 0;
        const isVolSpike = volRatio > 1.2;

        // Entry = Day+1 open
        const entryCandle = sigIdx + 1 < candles.length ? candles[sigIdx + 1] : null;
        const entryPrice = entryCandle ? entryCandle.open : sigClose;

        // Gap
        const gapPct = entryCandle ? ((entryCandle.open - sigClose) / sigClose * 100) : null;
        const isSmallGap = gapPct !== null && Math.abs(gapPct) <= 2;

        // Pre-trend
        const pre5 = sigIdx >= 5 ? candles[sigIdx - 5] : null;
        const pre10 = sigIdx >= 10 ? candles[sigIdx - 10] : null;
        const pre10Chg = pre10 ? ((sigClose - pre10.close) / pre10.close * 100) : null;
        const preTrend = pre10Chg !== null ? (pre10Chg > 2 ? 'UP' : pre10Chg < -2 ? 'DOWN' : 'FLAT') : '??';

        // Post-trend
        const post5 = sigIdx + 6 < candles.length ? candles[sigIdx + 6] : null;
        const post10 = sigIdx + 11 < candles.length ? candles[sigIdx + 11] : null;
        const post20 = sigIdx + 21 < candles.length ? candles[sigIdx + 21] : null;
        const post5Chg = post5 ? ((post5.close - entryPrice) / entryPrice * 100) : null;
        const post10Chg = post10 ? ((post10.close - entryPrice) / entryPrice * 100) : null;
        const post20Chg = post20 ? ((post20.close - entryPrice) / entryPrice * 100) : null;

        const isWin10 = post10Chg !== null && post10Chg > 0;

        // Month tracking
        const month = addedDate.substring(0, 7); // YYYY-MM
        if (!aggregate.months[month]) aggregate.months[month] = { total: 0, wins: 0, sumChg: 0 };
        aggregate.months[month].total++;
        if (post10Chg !== null) {
            aggregate.months[month].sumChg += post10Chg;
            if (isWin10) aggregate.months[month].wins++;
        }

        // Price bucket
        const pBucket = entryPrice < 200 ? '<200' : entryPrice < 500 ? '200-500' : entryPrice < 1000 ? '500-1K' : entryPrice < 2000 ? '1K-2K' : entryPrice < 5000 ? '2K-5K' : '5K+';
        if (!aggregate.priceBuckets[pBucket]) aggregate.priceBuckets[pBucket] = { total: 0, wins: 0, sumChg: 0 };
        aggregate.priceBuckets[pBucket].total++;
        if (post10Chg !== null) {
            aggregate.priceBuckets[pBucket].sumChg += post10Chg;
            if (isWin10) aggregate.priceBuckets[pBucket].wins++;
        }

        // Aggregate counts
        if (post5Chg !== null) { aggregate.sumChange5 += post5Chg; if (post5Chg > 0) aggregate.upAfter5++; else aggregate.downAfter5++; }
        if (post10Chg !== null) { aggregate.sumChange10 += post10Chg; if (post10Chg > 0) aggregate.upAfter10++; else aggregate.downAfter10++; }
        if (post20Chg !== null) { aggregate.sumChange20 += post20Chg; if (post20Chg > 0) aggregate.upAfter20++; else aggregate.downAfter20++; }

        if (preTrend === 'UP') { aggregate.preTrendUp.total++; if (isWin10) aggregate.preTrendUp.wins++; if (post10Chg !== null) aggregate.preTrendUp.sumChg += post10Chg; }
        if (preTrend === 'DOWN') { aggregate.preTrendDown.total++; if (isWin10) aggregate.preTrendDown.wins++; if (post10Chg !== null) aggregate.preTrendDown.sumChg += post10Chg; }
        if (preTrend === 'FLAT') { aggregate.preTrendFlat.total++; if (isWin10) aggregate.preTrendFlat.wins++; if (post10Chg !== null) aggregate.preTrendFlat.sumChg += post10Chg; }

        if (isVolSpike) { aggregate.volSpikeTotal++; if (isWin10) aggregate.volSpikeWins++; }
        else { aggregate.noVolSpikeTotal++; if (isWin10) aggregate.noVolSpikeWins++; }

        if (isGreen) { aggregate.greenTotal++; if (isWin10) aggregate.greenWins++; }
        else { aggregate.redTotal++; if (isWin10) aggregate.redWins++; }

        if (isSmallGap) { aggregate.smallGapTotal++; if (isWin10) aggregate.smallGapWins++; }
        else if (gapPct !== null) { aggregate.largeGapTotal++; if (isWin10) aggregate.largeGapWins++; }

        // Per-stock detail
        let outcome = 'OPEN';
        if (post10Chg !== null) outcome = post10Chg > 3 ? 'BIG_WIN' : post10Chg > 0 ? 'SMALL_WIN' : post10Chg > -3 ? 'SMALL_LOSS' : 'BIG_LOSS';

        aggregate.allStocks.push({
            symbol, addedDate, entryPrice: Math.round(entryPrice * 100) / 100,
            preTrend, pre10Chg: pre10Chg ? Math.round(pre10Chg * 100) / 100 : null,
            candle: isGreen ? 'GRN' : 'RED', volRatio: Math.round(volRatio * 10) / 10,
            gap: gapPct ? Math.round(gapPct * 100) / 100 : null,
            post5: post5Chg ? Math.round(post5Chg * 100) / 100 : null,
            post10: post10Chg ? Math.round(post10Chg * 100) / 100 : null,
            post20: post20Chg ? Math.round(post20Chg * 100) / 100 : null,
            outcome
        });

        // Progress
        if (processed % 20 === 0) console.log(`  ${categoryKey}: ${processed}/${catStocks.length} processed...`);
    }

    // Print aggregate
    log('');
    log(`Processed: ${aggregate.total} | Errors: ${aggregate.errors}`);

    const n5 = aggregate.upAfter5 + aggregate.downAfter5;
    const n10 = aggregate.upAfter10 + aggregate.downAfter10;
    const n20 = aggregate.upAfter20 + aggregate.downAfter20;
    log('');
    log('OUTCOME AFTER ENTRY (Day+1 Open):');
    log(`  5d:  UP ${aggregate.upAfter5}/${n5} (${n5 > 0 ? (aggregate.upAfter5 / n5 * 100).toFixed(0) : '?'}%) Avg: ${n5 > 0 ? (aggregate.sumChange5 / n5).toFixed(2) : '?'}%`);
    log(`  10d: UP ${aggregate.upAfter10}/${n10} (${n10 > 0 ? (aggregate.upAfter10 / n10 * 100).toFixed(0) : '?'}%) Avg: ${n10 > 0 ? (aggregate.sumChange10 / n10).toFixed(2) : '?'}%`);
    log(`  20d: UP ${aggregate.upAfter20}/${n20} (${n20 > 0 ? (aggregate.upAfter20 / n20 * 100).toFixed(0) : '?'}%) Avg: ${n20 > 0 ? (aggregate.sumChange20 / n20).toFixed(2) : '?'}%`);

    log('');
    log('A) PRE-TREND (10d prior):');
    const pU = aggregate.preTrendUp, pD = aggregate.preTrendDown, pF = aggregate.preTrendFlat;
    log(`  UP:   ${pU.wins}/${pU.total} win (${pU.total > 0 ? (pU.wins / pU.total * 100).toFixed(0) : '?'}%) AvgChg: ${pU.total > 0 ? (pU.sumChg / pU.total).toFixed(2) : '?'}%`);
    log(`  DOWN: ${pD.wins}/${pD.total} win (${pD.total > 0 ? (pD.wins / pD.total * 100).toFixed(0) : '?'}%) AvgChg: ${pD.total > 0 ? (pD.sumChg / pD.total).toFixed(2) : '?'}%`);
    log(`  FLAT: ${pF.wins}/${pF.total} win (${pF.total > 0 ? (pF.wins / pF.total * 100).toFixed(0) : '?'}%) AvgChg: ${pF.total > 0 ? (pF.sumChg / pF.total).toFixed(2) : '?'}%`);

    log('');
    log('B) VOLUME SPIKE (>1.2x avg):');
    log(`  WITH: ${aggregate.volSpikeWins}/${aggregate.volSpikeTotal} win (${aggregate.volSpikeTotal > 0 ? (aggregate.volSpikeWins / aggregate.volSpikeTotal * 100).toFixed(0) : '?'}%)`);
    log(`  NO:   ${aggregate.noVolSpikeWins}/${aggregate.noVolSpikeTotal} win (${aggregate.noVolSpikeTotal > 0 ? (aggregate.noVolSpikeWins / aggregate.noVolSpikeTotal * 100).toFixed(0) : '?'}%)`);

    log('');
    log('C) CANDLE COLOR:');
    log(`  GREEN: ${aggregate.greenWins}/${aggregate.greenTotal} win (${aggregate.greenTotal > 0 ? (aggregate.greenWins / aggregate.greenTotal * 100).toFixed(0) : '?'}%)`);
    log(`  RED:   ${aggregate.redWins}/${aggregate.redTotal} win (${aggregate.redTotal > 0 ? (aggregate.redWins / aggregate.redTotal * 100).toFixed(0) : '?'}%)`);

    log('');
    log('D) GAP FILTER (Day+1 open vs close):');
    log(`  Small (<=2%): ${aggregate.smallGapWins}/${aggregate.smallGapTotal} win (${aggregate.smallGapTotal > 0 ? (aggregate.smallGapWins / aggregate.smallGapTotal * 100).toFixed(0) : '?'}%)`);
    log(`  Large (>2%):  ${aggregate.largeGapWins}/${aggregate.largeGapTotal} win (${aggregate.largeGapTotal > 0 ? (aggregate.largeGapWins / aggregate.largeGapTotal * 100).toFixed(0) : '?'}%)`);

    log('');
    log('E) BY MONTH:');
    for (const [m, d] of Object.entries(aggregate.months).sort()) {
        const wr = d.total > 0 ? (d.wins / d.total * 100).toFixed(0) : '?';
        const avg = d.total > 0 ? (d.sumChg / d.total).toFixed(2) : '?';
        log(`  ${m}: ${d.wins}/${d.total} win (${wr}%) Avg10d: ${avg}%`);
    }

    log('');
    log('F) BY PRICE BUCKET:');
    for (const [b, d] of Object.entries(aggregate.priceBuckets)) {
        const wr = d.total > 0 ? (d.wins / d.total * 100).toFixed(0) : '?';
        const avg = d.total > 0 ? (d.sumChg / d.total).toFixed(2) : '?';
        log(`  Rs ${b}: ${d.wins}/${d.total} win (${wr}%) Avg10d: ${avg}%`);
    }

    // Per-stock table (sorted by post10 change)
    log('');
    log('PER-STOCK DETAIL (sorted by 10d change):');
    log('SYMBOL         ADDED      ENTRY    PRE10  TREND  CLR  VOL  GAP    5d     10d    20d    OUTCOME');
    const sorted = aggregate.allStocks.sort((a, b) => (a.post10 ?? -999) - (b.post10 ?? -999));
    for (const s of sorted) {
        const sym = s.symbol.padEnd(14);
        const ep = String(s.entryPrice).padStart(8);
        const p10 = s.pre10Chg !== null ? (s.pre10Chg >= 0 ? '+' : '') + s.pre10Chg.toFixed(1) + '%' : '  N/A';
        const c5 = s.post5 !== null ? (s.post5 >= 0 ? '+' : '') + s.post5.toFixed(1) + '%' : 'OPEN';
        const c10 = s.post10 !== null ? (s.post10 >= 0 ? '+' : '') + s.post10.toFixed(1) + '%' : 'OPEN';
        const c20 = s.post20 !== null ? (s.post20 >= 0 ? '+' : '') + s.post20.toFixed(1) + '%' : 'OPEN';
        const gp = s.gap !== null ? (s.gap >= 0 ? '+' : '') + s.gap.toFixed(1) + '%' : 'N/A';
        log(`${sym} ${s.addedDate} ${ep} ${p10.padStart(7)} ${s.preTrend.padEnd(5)} ${s.candle} ${String(s.volRatio).padStart(4)}x ${gp.padStart(6)} ${c5.padStart(7)} ${c10.padStart(7)} ${c20.padStart(7)} ${s.outcome}`);
    }

    return { out, aggregate };
}

async function main() {
    console.log('Starting FULL category analysis...');
    console.log('This will fetch OHLCV data for ~253 stocks - may take 10-15 minutes');

    const support = await analyzeCategory('MULTI_SUPPORT_BO');
    console.log('MULTI_SUPPORT_BO done (' + support.aggregate.total + ' stocks)');

    const resistance = await analyzeCategory('MULTI_RESISTANCE_BO');
    console.log('MULTI_RESISTANCE_BO done (' + resistance.aggregate.total + ' stocks)');

    const allOutput = [...support.out, '', '', ...resistance.out];
    const outPath = path.join(__dirname, 'full_analysis_v3.txt');
    fs.writeFileSync(outPath, allOutput.join('\n'), 'utf8');
    console.log('Saved to: ' + outPath);
    console.log('Lines: ' + allOutput.length);

    await prisma.$disconnect();
}

main().catch(e => { console.error(e); prisma.$disconnect(); });
