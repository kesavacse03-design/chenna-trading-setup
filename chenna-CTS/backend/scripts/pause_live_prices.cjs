const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function pauseLivePrices() {
    try {
        // Disable live prices for DOWNSIDE_LOM_SWING
        await prisma.category.update({
            where: { key: 'DOWNSIDE_LOM_SWING' },
            data: { livePriceEnabled: false }
        });

        console.log('\n✅ Live prices DISABLED for DOWNSIDE_LOM_SWING');
        console.log('   Next live price update will skip this category');
        console.log('   You can now run Time-Travel backtest!\n');

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

pauseLivePrices();
