const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    console.log("Checking LiveSnapshot for INTRADAY_BOOST...");
    const snaps = await prisma.liveSnapshot.findMany({
        where: {
            category: 'INTRADAY_BOOST',
            fetchedAt: {
                gte: new Date('2026-01-01T00:00:00.000Z')
            }
        },
        select: {
            symbol: true,
            fetchedAt: true
        }
    });

    console.log(`Total snapshots found: ${snaps.length}`);

    // Group by date
    const byDate = {};
    for (const s of snaps) {
        const dStr = s.fetchedAt.toISOString().split('T')[0];
        if (!byDate[dStr]) byDate[dStr] = new Set();
        byDate[dStr].add(s.symbol);
    }

    const dates = Object.keys(byDate).sort();
    console.log(`Unique dates: ${dates.length}`);
    if (dates.length > 0) {
        const sum = dates.reduce((acc, d) => acc + byDate[d].size, 0);
        console.log(`Average stocks per day: ${(sum / dates.length).toFixed(1)}`);

        console.log("\nSample top 10 stocks for 3 dates:");
        for (let i = 0; i < Math.min(3, dates.length); i++) {
            const d = dates[dates.length - 1 - i]; // Most recent dates
            const arr = Array.from(byDate[d]).slice(0, 10);
            console.log(`${d}: ${arr.join(', ')}`);
        }
    }
}
main().finally(() => prisma.$disconnect());
