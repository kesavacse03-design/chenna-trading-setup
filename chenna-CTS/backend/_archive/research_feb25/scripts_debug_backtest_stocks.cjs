/**
 * CRITICAL DEBUG: Check why backtest is using wrong stock dates
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function debugBacktestStocks() {
    console.log('═'.repeat(70));
    console.log('BACKTEST STOCK DATE DEBUG REPORT');
    console.log('═'.repeat(70));

    // 1. Get PRE_MARKET category
    const category = await prisma.category.findFirst({
        where: { key: 'PRE_MARKET' }
    });

    if (!category) {
        console.log('ERROR: PRE_MARKET category not found!');
        await prisma.$disconnect();
        return;
    }

    console.log(`\n1. PRE_MARKET Category ID: ${category.id}`);

    // 2. Get ALL stocks in PRE_MARKET with their addedDates
    const allStocks = await prisma.stockCategory.findMany({
        where: { categoryId: category.id },
        include: { stock: true },
        orderBy: { addedDate: 'asc' }
    });

    console.log(`\n2. TOTAL STOCKS IN PRE_MARKET: ${allStocks.length}`);

    // 3. Show earliest 20 stocks by addedDate
    console.log('\n3. EARLIEST 20 STOCKS BY addedDate:');
    console.log('-'.repeat(60));
    console.log('Symbol               | addedDate            | Has addedDate?');
    console.log('-'.repeat(60));

    for (const sc of allStocks.slice(0, 20)) {
        const symbol = (sc.stock?.symbol || 'N/A').substring(0, 20).padEnd(20);
        const addedDate = sc.addedDate ? sc.addedDate.toISOString().split('T')[0] : 'NULL';
        const hasDate = sc.addedDate ? 'YES' : 'NO ⚠️';
        console.log(`${symbol} | ${addedDate.padEnd(20)} | ${hasDate}`);
    }

    // 4. Check specific stocks from CSV
    console.log('\n4. SPECIFIC STOCKS FROM CSV:');
    console.log('-'.repeat(60));

    const csvStocks = ['ONGC', 'COALINDI', 'ITC', 'POWERGRID', 'TATASTEEL', 'BEL', 'ETERNAL', 'WIPRO'];

    for (const sym of csvStocks) {
        const found = allStocks.find(sc => sc.stock?.symbol?.includes(sym));
        if (found) {
            const addedDate = found.addedDate ? found.addedDate.toISOString().split('T')[0] : 'NULL';
            console.log(`${sym.padEnd(15)} | addedDate: ${addedDate} | Symbol: ${found.stock?.symbol}`);
        } else {
            console.log(`${sym.padEnd(15)} | NOT FOUND IN PRE_MARKET! ⚠️`);
        }
    }

    // 5. Check for NULL addedDates
    const nullDates = allStocks.filter(sc => !sc.addedDate);
    console.log(`\n5. STOCKS WITH NULL addedDate: ${nullDates.length}`);
    if (nullDates.length > 0) {
        console.log('   ⚠️ WARNING: NULL dates will bypass the date filter!');
        console.log('   First 10 with NULL:');
        for (const sc of nullDates.slice(0, 10)) {
            console.log(`   - ${sc.stock?.symbol || 'N/A'}`);
        }
    }

    // 6. Simulate what backtest would get for 2025-12-01
    const simulationDate = new Date('2025-12-01T23:59:59.999Z');

    const stocksForDec1 = await prisma.stockCategory.findMany({
        where: {
            categoryId: category.id,
            addedDate: { lte: simulationDate }
        },
        include: { stock: true }
    });

    console.log(`\n6. STOCKS AVAILABLE FOR 2025-12-01 (with addedDate filter): ${stocksForDec1.length}`);

    if (stocksForDec1.length > 0) {
        console.log('   First 10:');
        for (const sc of stocksForDec1.slice(0, 10)) {
            const addedDate = sc.addedDate ? sc.addedDate.toISOString().split('T')[0] : 'NULL';
            console.log(`   - ${sc.stock?.symbol || 'N/A'} (added: ${addedDate})`);
        }
    }

    // 7. Check if POWERGRID appears in Dec 1 results (it shouldn't!)
    const powergridInDec1 = stocksForDec1.find(sc => sc.stock?.symbol?.includes('POWER'));
    if (powergridInDec1) {
        console.log(`\n⚠️ BUG CONFIRMED: POWERGRID found in 2025-12-01 query!`);
        console.log(`   Its addedDate: ${powergridInDec1.addedDate?.toISOString() || 'NULL'}`);
    } else {
        console.log(`\n✅ POWERGRID correctly NOT in 2025-12-01 query`);
    }

    // 8. Date distribution summary
    console.log('\n8. DATE DISTRIBUTION SUMMARY:');
    console.log('-'.repeat(60));

    const dateGroups = {};
    for (const sc of allStocks) {
        const dateKey = sc.addedDate ? sc.addedDate.toISOString().split('T')[0] : 'NULL';
        dateGroups[dateKey] = (dateGroups[dateKey] || 0) + 1;
    }

    const sortedDates = Object.entries(dateGroups).sort((a, b) => a[0].localeCompare(b[0]));
    for (const [date, count] of sortedDates.slice(0, 30)) {
        console.log(`${date}: ${count} stocks`);
    }

    console.log('\n' + '═'.repeat(70));
    console.log('END OF REPORT');
    console.log('═'.repeat(70));

    await prisma.$disconnect();
}

debugBacktestStocks().catch(console.error);
