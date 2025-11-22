// Fix incorrectly linked stocks
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function fixMisplacedStocks() {
    console.log('🔧 Fixing misplaced stocks...\n');

    try {
        // 1. Fix ADANIGREEN - should be in HIGH_POWERED_STOCKS only
        console.log('1️⃣ Fixing ADANIGREEN...');
        const adanigreen = await prisma.stock.findUnique({ where: { symbol: 'ADANIGREEN' } });
        const highPowered = await prisma.category.findUnique({ where: { key: 'HIGH_POWERED_STOCKS' } });

        if (adanigreen && highPowered) {
            // Delete all existing links
            await prisma.stockCategory.deleteMany({
                where: { stockId: adanigreen.id }
            });
            console.log('   ✅ Removed from wrong categories');

            // Add to correct category
            await prisma.stockCategory.create({
                data: {
                    stockId: adanigreen.id,
                    categoryId: highPowered.id
                }
            });
            console.log('   ✅ Added to HIGH_POWERED_STOCKS\n');
        }

        // 2. Fix ADANIPORTS - should be in DOWNSIDE_LOM_INTRA only
        console.log('2️⃣ Fixing ADANIPORTS...');
        const adaniports = await prisma.stock.findUnique({ where: { symbol: 'ADANIPORTS' } });
        const downsideIntra = await prisma.category.findUnique({ where: { key: 'DOWNSIDE_LOM_INTRA' } });

        if (adaniports && downsideIntra) {
            // Delete all existing links
            await prisma.stockCategory.deleteMany({
                where: { stockId: adaniports.id }
            });
            console.log('   ✅ Removed from wrong categories');

            // Add to correct category
            await prisma.stockCategory.create({
                data: {
                    stockId: adaniports.id,
                    categoryId: downsideIntra.id
                }
            });
            console.log('   ✅ Added to DOWNSIDE_LOM_INTRA\n');
        }

        // 3. Fix ANGELONE - should be in DAILY_CONTRACTION
        console.log('3️⃣ Fixing ANGELONE...');
        const angelone = await prisma.stock.findUnique({ where: { symbol: 'ANGELONE' } });
        const dailyContract = await prisma.category.findUnique({ where: { key: 'DAILY_CONTRACTION' } });

        if (angelone && dailyContract) {
            // Add to correct category
            await prisma.stockCategory.create({
                data: {
                    stockId: angelone.id,
                    categoryId: dailyContract.id
                }
            });
            console.log('   ✅ Added to DAILY_CONTRACTION\n');
        }

        console.log('✨ All stocks fixed!');

    } catch (err) {
        console.error('Error:', err);
    } finally {
        await prisma.$disconnect();
    }
}

fixMisplacedStocks();
