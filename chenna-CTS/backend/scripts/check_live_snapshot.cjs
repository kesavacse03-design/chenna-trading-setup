const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkLiveSnapshots() {
    console.log("Checking LiveSnapshot table for latest data...");

    const latest = await prisma.liveSnapshot.findMany({
        orderBy: { fetchedAt: 'desc' },
        take: 10
    });

    console.log("Latest LiveSnapshot entries:");
    latest.forEach(s => {
        console.log(`- ${s.symbol} | Cat: ${s.category} | Sect: ${s.sector} | ${s.fetchedAt.toISOString()}`);
    });

    await prisma.$disconnect();
}

checkLiveSnapshots().catch(console.error);
