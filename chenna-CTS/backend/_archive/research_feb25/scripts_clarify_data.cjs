// CLARIFY: What OHLC data do we actually have?
const { PrismaClient } = require('@prisma/client');

async function clarifyData() {
    const prisma = new PrismaClient();

    console.log('═'.repeat(60));
    console.log('QUESTION 1: WHAT INTERVALS EXIST IN DATABASE?');
    console.log('═'.repeat(60));

    try {
        // Get interval breakdown using Prisma groupBy (safer)
        const intervals = await prisma.ohlcvCache.groupBy({
            by: ['interval'],
            _count: { _all: true }
        });

        console.log('\nINTERVALS IN OhlcvCache:');
        intervals.forEach(i => {
            console.log(`  ${(i.interval || 'null').padEnd(12)} : ${i._count._all} entries`);
        });

        // Total entries
        const total = await prisma.ohlcvCache.count();
        console.log(`\nTotal entries: ${total}`);

        // Unique symbols total
        const allSymbols = await prisma.ohlcvCache.findMany({
            select: { symbol: true },
            distinct: ['symbol']
        });
        console.log(`Unique symbols (all intervals): ${allSymbols.length}`);

        console.log('\n' + '═'.repeat(60));
        console.log('QUESTION 2: STOCKS BY INTERVAL');
        console.log('═'.repeat(60));

        // Get unique symbols for each interval
        for (const intv of intervals) {
            const stocks = await prisma.ohlcvCache.findMany({
                where: { interval: intv.interval },
                select: { symbol: true },
                distinct: ['symbol']
            });
            console.log(`\n${(intv.interval || 'null').toUpperCase()} (${stocks.length} unique symbols):`);
            console.log(`  ${stocks.slice(0, 15).map(s => s.symbol).join(', ')}${stocks.length > 15 ? '...' : ''}`);
        }

        console.log('\n' + '═'.repeat(60));
        console.log('QUESTION 3: SAMPLE DATA STRUCTURE');
        console.log('═'.repeat(60));

        // Sample entry for 'day' interval
        const sample = await prisma.ohlcvCache.findFirst({
            where: { interval: 'day' }
        });

        if (sample) {
            console.log('\nSample DAILY entry:');
            console.log(`  Symbol: ${sample.symbol}`);
            console.log(`  Interval: ${sample.interval}`);
            console.log(`  From: ${sample.fromDate?.toISOString?.()?.slice(0, 10) || 'N/A'}`);
            console.log(`  To: ${sample.toDate?.toISOString?.()?.slice(0, 10) || 'N/A'}`);

            // Check data structure
            let dataArray = sample.data;
            if (typeof dataArray === 'string') {
                dataArray = JSON.parse(dataArray);
            }

            if (Array.isArray(dataArray)) {
                console.log(`  Candles count: ${dataArray.length}`);
                if (dataArray.length > 0) {
                    console.log(`  First candle:`, JSON.stringify(dataArray[0]).slice(0, 150));
                    console.log(`  Last candle:`, JSON.stringify(dataArray[dataArray.length - 1]).slice(0, 150));
                }
            }
        }

        // Also check CSV cache in cache/historical folder
        console.log('\n' + '═'.repeat(60));
        console.log('QUESTION 4: CSV CACHE (cache/historical)');
        console.log('═'.repeat(60));

        const fs = require('fs').promises;
        const path = require('path');
        const cacheDir = path.join(__dirname, '../cache/historical');

        try {
            const files = await fs.readdir(cacheDir);
            const csvFiles = files.filter(f => f.endsWith('.csv'));
            console.log(`\nCSV cache files: ${csvFiles.length}`);
            console.log(`Sample files: ${csvFiles.slice(0, 10).join(', ')}${csvFiles.length > 10 ? '...' : ''}`);

            // Check a sample CSV
            if (csvFiles.length > 0) {
                const sampleCsv = await fs.readFile(path.join(cacheDir, csvFiles[0]), 'utf8');
                const lines = sampleCsv.trim().split('\n');
                console.log(`\nSample CSV (${csvFiles[0]}): ${lines.length} lines`);
                console.log(`  Header: ${lines[0]}`);
                if (lines.length > 1) console.log(`  First row: ${lines[1]}`);
                if (lines.length > 2) console.log(`  Last row: ${lines[lines.length - 1]}`);
            }
        } catch (e) {
            console.log('CSV cache not accessible:', e.message);
        }

    } finally {
        await prisma.$disconnect();
    }
}

clarifyData().catch(console.error);
