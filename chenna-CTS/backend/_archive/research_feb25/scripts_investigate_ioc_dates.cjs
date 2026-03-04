/**
 * Investigate IOC addedDate vs signalDate discrepancy:
 * addedDate = Feb 3, signalDate = Feb 2
 * Hypothesis: timezone issue in addedDate query
 */
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

function toISTDateString(date) {
    if (!date) return '';
    const d = new Date(date);
    d.setMinutes(d.getMinutes() + 330);
    return d.toISOString().split('T')[0];
}

(async () => {
    console.log('=== IOC addedDate Investigation ===\n');

    const cat = await prisma.category.findFirst({ where: { key: 'SHORT_TERM_SWING_BO_UP' } });
    if (!cat) { console.log('Category not found!'); return; }

    // Get IOC's stock record
    const iocStock = await prisma.stock.findFirst({ where: { symbol: 'IOC' } });
    if (!iocStock) { console.log('IOC stock not found!'); return; }

    // Get ALL IOC entries in this category
    const entries = await prisma.stockCategory.findMany({
        where: {
            categoryId: cat.id,
            stockId: iocStock.id
        },
        orderBy: { addedDate: 'asc' }
    });

    console.log(`IOC entries in SHORT_TERM_SWING_BO_UP: ${entries.length}`);
    entries.forEach(e => {
        console.log(`  Raw addedDate: ${e.addedDate.toISOString()}`);
        console.log(`  IST addedDate: ${toISTDateString(e.addedDate)}`);
        console.log(`  UTC date part: ${e.addedDate.toISOString().split('T')[0]}`);
    });

    // Now check the SWING backtest query logic
    // The backtest sets date to something like new Date('2026-02-02T00:00:00.000+05:30')
    // which becomes 2026-02-01T18:30:00.000Z in UTC
    // Then dayStart = 2026-02-01T18:30 with setHours(0,0,0,0) = 2026-02-01T00:00:00 UTC (IST Jan 31!)
    // dayEnd = 2026-02-01T23:59:59 UTC
    // If addedDate is stored as 2026-02-02T18:30Z (which is Feb 3 IST), it won't match!

    console.log('\n=== Date Query Simulation ===\n');

    // Simulate what the backtest does for Feb 2
    const simulatedDate = new Date('2026-02-02T00:00:00.000+05:30');
    console.log(`Simulated Date Input: 2026-02-02T00:00:00.000+05:30`);
    console.log(`As UTC: ${simulatedDate.toISOString()}`);

    const dayStart = new Date(simulatedDate);
    dayStart.setHours(0, 0, 0, 0);
    console.log(`dayStart (setHours 0,0,0,0): ${dayStart.toISOString()}`);

    const dayEnd = new Date(simulatedDate);
    dayEnd.setHours(23, 59, 59, 999);
    console.log(`dayEnd (setHours 23,59,59): ${dayEnd.toISOString()}`);

    // What stocks would this query return?
    const matchedStocks = await prisma.stockCategory.findMany({
        where: {
            categoryId: cat.id,
            addedDate: { gte: dayStart, lte: dayEnd }
        },
        include: { stock: true }
    });

    console.log(`\nStocks returned by query for Feb 2:`);
    matchedStocks.forEach(s => {
        console.log(`  ${s.stock?.symbol.padEnd(15)} addedDate: ${s.addedDate.toISOString()} (IST: ${toISTDateString(s.addedDate)})`);
    });

    // Check Feb 3
    const simDate3 = new Date('2026-02-03T00:00:00.000+05:30');
    const day3Start = new Date(simDate3);
    day3Start.setHours(0, 0, 0, 0);
    const day3End = new Date(simDate3);
    day3End.setHours(23, 59, 59, 999);

    console.log(`\nFeb 3 query range: ${day3Start.toISOString()} to ${day3End.toISOString()}`);
    const matchedStocks3 = await prisma.stockCategory.findMany({
        where: {
            categoryId: cat.id,
            addedDate: { gte: day3Start, lte: day3End }
        },
        include: { stock: true }
    });

    console.log(`Stocks returned for Feb 3: ${matchedStocks3.length}`);
    const iocInFeb3 = matchedStocks3.find(s => s.stock?.symbol === 'IOC');
    if (iocInFeb3) {
        console.log(`  ✅ IOC IS in Feb 3 query (addedDate: ${iocInFeb3.addedDate.toISOString()})`);
    } else {
        console.log(`  ❌ IOC is NOT in Feb 3 query!`);
    }

    const iocInFeb2 = matchedStocks.find(s => s.stock?.symbol === 'IOC');
    if (iocInFeb2) {
        console.log(`  🚨 IOC IS in Feb 2 query (addedDate: ${iocInFeb2.addedDate.toISOString()}) — SHOULD NOT BE!`);
    } else {
        console.log(`  ✅ IOC is NOT in Feb 2 query — correct (added Feb 3)`);
    }

    await prisma.$disconnect();
})();
