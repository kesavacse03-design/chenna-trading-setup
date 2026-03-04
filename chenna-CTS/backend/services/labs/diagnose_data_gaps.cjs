const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const fs = require('fs').promises;
const path = require('path');

async function diagnoseDataGaps() {
    console.log('DATA DIAGNOSTIC FOR INTRADAY_BOOST');
    console.log('═'.repeat(60));

    // 1. Get Stocks from DB
    const category = await prisma.category.findUnique({
        where: { key: 'INTRADAY_BOOST' },
        include: {
            stocks: {
                include: {
                    stock: { select: { symbol: true } }
                }
            }
        }
    });

    if (!category) {
        console.log('Category INTRADAY_BOOST not found');
        return;
    }

    const stocks = category.stocks.map(cs => ({
        symbol: cs.stock.symbol,
        addedDate: cs.addedDate, // Keep as Date object to check raw
        addedDateStr: cs.addedDate ? cs.addedDate.toISOString().split('T')[0] : 'NULL'
    }));

    // 2. Analyze DB Dates
    console.log('\n--- Database Date Analysis ---');
    const byDate = {};
    const sampleDates = [];

    stocks.forEach(s => {
        const dateStr = s.addedDateStr;
        if (!byDate[dateStr]) byDate[dateStr] = [];
        byDate[dateStr].push(s.symbol);

        if (sampleDates.length < 5 && s.addedDate) sampleDates.push({ symbol: s.symbol, raw: s.addedDate, iso: dateStr });
    });

    console.log('Sample Checks:');
    sampleDates.forEach(d => console.log(`  ${d.symbol}: Raw=${d.raw} (${typeof d.raw}), ISO=${d.iso}`));

    console.log('\nStocks grouped by addedDate:');
    Object.entries(byDate)
        .sort((a, b) => a[0].localeCompare(b[0]))
        .forEach(([date, symbols]) => {
            console.log(`  ${date}: ${symbols.length} stocks`);
        });

    // 3. Check CSV Coverage
    console.log('\n--- CSV Cache Analysis ---');
    const csvDir = path.join(__dirname, '../../cache/historical');
    let csvStats = { total: 0, hasData: 0, missingData: 0, missingAddedDate: 0 };

    for (const stock of stocks) {
        csvStats.total++;
        const csvPath = path.join(csvDir, `${stock.symbol}.csv`);

        try {
            await fs.access(csvPath);
            const content = await fs.readFile(csvPath, 'utf8');
            const lines = content.trim().split('\n');

            if (lines.length > 1) {
                csvStats.hasData++;
                const dates = lines.slice(1).map(l => l.split(',')[0]);

                // Compare with addedDate
                if (stock.addedDateStr !== 'NULL' && !dates.includes(stock.addedDateStr)) {
                    // console.log(`  ⚠️ ${stock.symbol}: CSV exists but missing ${stock.addedDateStr}. Range: ${dates[0]} to ${dates[dates.length - 1]}`);
                    csvStats.missingAddedDate++;
                }
            } else {
                csvStats.missingData++;
            }
        } catch (e) {
            csvStats.missingData++;
        }
    }

    console.log(`  Total stocks: ${csvStats.total}`);
    console.log(`  Have CSV data: ${csvStats.hasData}`);
    console.log(`  Missing CSV file: ${csvStats.missingData}`);
    console.log(`  CSV exists but missing addedDate: ${csvStats.missingAddedDate}`);

    await prisma.$disconnect();
}

diagnoseDataGaps()
    .catch(e => {
        console.error(e);
        process.exit(1);
    });
