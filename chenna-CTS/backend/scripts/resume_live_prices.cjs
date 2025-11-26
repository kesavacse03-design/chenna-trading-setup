const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function resumeLivePrices() {
    try {
        // Re-enable live prices for DOWNSIDE_LOM_SWING
        await prisma.category.update({
            where: { key: 'DOWNSIDE_LOM_SWING' },
            data: { livePriceEnabled: true }
        });

        console.log('\n✅ Live prices RESUMED for DOWNSIDE_LOM_SWING');
        console.log('   Next live price update will include this category\n');

        // Show current status
        const categories = await prisma.category.findMany({
            select: { key: true, livePriceEnabled: true }
        });

        console.log('Current Status:');
        categories.forEach(cat => {
            console.log(`  ${cat.key}: ${cat.livePriceEnabled ? '✅ LIVE' : '⏸️  PAUSED'}`);
        });

    } catch (error) {
        console.error('❌ Error:', error.message);
    } finally {
        await prisma.$disconnect();
    }
}

resumeLivePrices();
