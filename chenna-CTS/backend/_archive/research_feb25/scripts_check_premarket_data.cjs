// Check data coverage for PRE_MARKET stocks
const { PrismaClient } = require('@prisma/client');

async function checkAllPreMarketData() {
    const prisma = new PrismaClient();

    console.log('═'.repeat(60));
    console.log('PRE_MARKET DATA COVERAGE CHECK');
    console.log('═'.repeat(60));

    try {
        // Get all PRE_MARKET stocks
        const category = await prisma.category.findUnique({
            where: { key: 'PRE_MARKET' },
            include: {
                stocks: {
                    include: { stock: true }
                }
            }
        });

        if (!category) {
            console.log('ERROR: PRE_MARKET category not found!');
            return;
        }

        const stocks = category.stocks.map(cs => cs.stock.symbol);
        console.log(`\nTotal PRE_MARKET stocks: ${stocks.length}`);

        // Check OHLC data coverage
        const fs = require('fs').promises;
        const path = require('path');
        const csvDir = path.join(__dirname, '../cache/historical');

        let csvFiles = [];
        try {
            csvFiles = (await fs.readdir(csvDir)).filter(f => f.endsWith('.csv'));
        } catch (e) {
            console.log('CSV cache directory not found');
        }

        // Check each stock
        const stocksWithData = [];
        const stocksWithoutData = [];

        for (const symbol of stocks) {
            // Check CSV cache
            const csvExists = csvFiles.includes(`${symbol}.csv`);

            // Check database cache
            const dbEntry = await prisma.ohlcvCache.findFirst({
                where: {
                    symbol,
                    interval: 'day'
                }
            });

            if (csvExists || dbEntry) {
                stocksWithData.push(symbol);
            } else {
                stocksWithoutData.push(symbol);
            }
        }

        console.log(`\nStocks WITH daily data: ${stocksWithData.length}`);
        console.log(`Stocks WITHOUT daily data: ${stocksWithoutData.length}`);

        if (stocksWithoutData.length > 0) {
            console.log('\nMissing data for:');
            stocksWithoutData.forEach(s => console.log(`  - ${s}`));
        }

        // Check a specific stock's data quality
        console.log('\n' + '═'.repeat(60));
        console.log('SAMPLE DATA QUALITY CHECK');
        console.log('═'.repeat(60));

        if (stocksWithData.length > 0) {
            const sampleSymbol = stocksWithData[0];
            const csvPath = path.join(csvDir, `${sampleSymbol}.csv`);

            try {
                const csvContent = await fs.readFile(csvPath, 'utf8');
                const lines = csvContent.trim().split('\n');

                console.log(`\nSample: ${sampleSymbol}.csv`);
                console.log(`  Total candles: ${lines.length - 1}`);
                console.log(`  Header: ${lines[0]}`);
                console.log(`  First data row: ${lines[1]}`);
                console.log(`  Last data row: ${lines[lines.length - 1]}`);

                // Parse dates to show range
                const dates = lines.slice(1).map(l => l.split(',')[0]).sort();
                console.log(`  Date range: ${dates[0]} to ${dates[dates.length - 1]}`);
            } catch (e) {
                console.log(`Could not read CSV for ${sampleSymbol}`);
            }
        }

        // Summary
        console.log('\n' + '═'.repeat(60));
        console.log('SUMMARY');
        console.log('═'.repeat(60));
        console.log(`Total PRE_MARKET stocks: ${stocks.length}`);
        console.log(`Have DAILY data: ${stocksWithData.length} (${(stocksWithData.length / stocks.length * 100).toFixed(1)}%)`);
        console.log(`Missing DAILY data: ${stocksWithoutData.length} (${(stocksWithoutData.length / stocks.length * 100).toFixed(1)}%)`);

        if (stocksWithoutData.length === 0) {
            console.log('\n✅ ALL STOCKS HAVE DATA - Ready for full backtest!');
        } else {
            console.log('\n⚠️  Some stocks missing data - Need to fetch from Upstox');
        }

    } finally {
        await prisma.$disconnect();
    }
}

checkAllPreMarketData().catch(console.error);
