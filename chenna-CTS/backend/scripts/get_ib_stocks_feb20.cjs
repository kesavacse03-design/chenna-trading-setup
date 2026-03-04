const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const targetDate = new Date('2026-02-19T00:00:00.000Z');

    const ibStocks = await prisma.stockCategory.findMany({
        where: {
            category: { key: 'INTRADAY_BOOST' },
            addedDate: targetDate
        },
        include: { stock: true }
    });

    const hpsStocks = await prisma.stockCategory.findMany({
        where: {
            category: { key: 'HIGH_POWERED_STOCKS' },
            addedDate: targetDate
        },
        include: { stock: true }
    });

    const hpsSymbols = new Set(hpsStocks.map(s => s.stock?.symbol));

    let out = [];
    out.push(`All stocks in INTRADAY_BOOST category on 2026-02-19 (Thursday):\n`);
    out.push(`Symbol | LTP | Pre Close | % Change | Sector | Date Added | In HPS?`);
    out.push("-".repeat(80));

    for (const item of ibStocks) {
        if (!item.stock) continue;
        const sym = item.stock.symbol;
        const sector = item.sector || 'N/A';
        const dateStr = item.addedDate ? item.addedDate.toISOString().split('T')[0] : 'N/A';
        const inHps = hpsSymbols.has(sym) ? 'YES' : 'NO';

        let ltp = 'N/A', preClose = 'N/A', pctChange = 'N/A';
        if (item.meta && typeof item.meta === 'object') {
            if (item.meta.LTP !== undefined) ltp = item.meta.LTP;
            if (item.meta.Prev_Close !== undefined) preClose = item.meta.Prev_Close;
            if (item.meta.Pct_Change !== undefined) pctChange = item.meta.Pct_Change.toFixed(2) + '%';
        }

        out.push(`${sym} | ${ltp} | ${preClose} | ${pctChange} | ${sector} | ${dateStr} | ${inHps}`);
    }

    out.push(`\nTotal stocks in IB that day: ${ibStocks.length}`);
    const ibInHps = ibStocks.filter(s => s.stock && hpsSymbols.has(s.stock.symbol)).length;
    out.push(`Total in HIGH_POWERED_STOCKS: ${ibInHps}`);

    console.log(out.join('\n'));
}

main().catch(console.error).finally(() => prisma.$disconnect());
