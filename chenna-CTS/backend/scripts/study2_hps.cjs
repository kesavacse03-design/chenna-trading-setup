const prisma = require('../lib/prisma.cjs');
const confirmationService = require('../services/confirmationService.cjs');

async function runStudy2() {
    console.log("=== HIGH_POWERED_STOCKS STUDY ===");

    // 1. Get stats
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const hpsCat = await prisma.category.findUnique({ where: { key: 'HIGH_POWERED_STOCKS' } });
    const ibCat = await prisma.category.findUnique({ where: { key: 'INTRADAY_BOOST' } });

    if (!hpsCat || !ibCat) {
        console.log("Missing categories in DB.");
        return;
    }

    const hpsStocks = await prisma.stockCategory.findMany({
        where: {
            categoryId: hpsCat.id,
            addedDate: { gte: thirtyDaysAgo }
        },
        include: { stock: true }
    });

    const ibStocks = await prisma.stockCategory.findMany({
        where: {
            categoryId: ibCat.id,
            addedDate: { gte: thirtyDaysAgo }
        },
        include: { stock: true }
    });

    console.log(`HPS Results: ${hpsStocks.length}`);
    console.log(`IB Results: ${ibStocks.length}`);

    let overlapCount = 0;
    const overlapDates = {};

    hpsStocks.forEach(hps => {
        if (!hps.addedDate) return;
        const hpsDateStr = hps.addedDate.toISOString().split('T')[0];
        const match = ibStocks.find(ib =>
            ib.stock.symbol === hps.stock.symbol &&
            ib.addedDate &&
            ib.addedDate.toISOString().split('T')[0] === hpsDateStr
        );

        if (match) {
            overlapCount++;
            if (!overlapDates[hpsDateStr]) overlapDates[hpsDateStr] = [];
            overlapDates[hpsDateStr].push(hps.stock.symbol);
        }
    });

    console.log(`\nOverlap Count (HPS also in IB on same day): ${overlapCount}`);
    if (hpsStocks.length > 0) {
        console.log(`Overlap Percentage: ${((overlapCount / hpsStocks.length) * 100).toFixed(2)}%`);
    }

    // Format output of overlaps
    console.log("\nOverlap Summary by Date:");
    for (const d of Object.keys(overlapDates).sort()) {
        console.log(`${d}: ${overlapDates[d].length} stocks`);
    }

    // Prepare backtest data
    const hpsDates = [...new Set(hpsStocks.map(s => s.addedDate ? s.addedDate.toISOString().split('T')[0] : null).filter(Boolean))];

    let totalHpsSetups = 0;
    let hpsWins = 0;
    let hpsLosses = 0;

    let overlapWins = 0;
    let overlapLosses = 0;

    console.log("\nSimulating ORB on HPS stocks...");

    for (const dStr of hpsDates) {
        // Run confirmationService logic
        const dateObj = new Date(dStr);
        // We will call the underlying simulation for HPS
        const resultsInfo = await confirmationService.confirmIntradaySignals(dStr, dStr);

        totalHpsSetups += hpsStocks.filter(h => h.addedDate && h.addedDate.toISOString().split('T')[0] === dStr).length;
        // The service usually applies to INTRA/SWING. Since we just ran bulk cache, let's output a summary based on scanner execution
    }
}

runStudy2().catch(e => console.error(e));
