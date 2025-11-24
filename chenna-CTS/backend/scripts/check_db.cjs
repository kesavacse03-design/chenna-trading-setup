const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkDatabase() {
    try {
        console.log('Checking database connection...\n');

        // Check stocks
        const stockCount = await prisma.stock.count();
        console.log(`✓ Database connected!`);
        console.log(`✓ Total stocks in DB: ${stockCount}\n`);

        // Check categories
        const categories = await prisma.category.findMany({
            include: {
                stocks: true
            }
        });

        console.log('Categories:');
        if (categories.length === 0) {
            console.log('  ⚠ No categories found!\n');
        } else {
            categories.forEach(cat => {
                console.log(`  ${cat.name}: ${cat.stocks.length} stocks`);
            });
        }

        // Check if DOWNSIDE LOM SWING exists
        const downsideCat = categories.find(c => c.name.includes('DOWNSIDE') || c.key === 'DOWNSIDE_LOM_SWING');
        if (downsideCat) {
            console.log(`\n✓ DOWNSIDE LOM SWING category found with ${downsideCat.stocks.length} stocks`);
            if (downsideCat.stocks.length > 0) {
                console.log('  First 5 stocks:');
                downsideCat.stocks.slice(0, 5).forEach(async (sc) => {
                    const stock = await prisma.stock.findUnique({ where: { id: sc.stockId } });
                    console.log(`    - ${stock?.symbol || 'Unknown'}`);
                });
            }
        } else {
            console.log('\n⚠ DOWNSIDE LOM SWING category NOT found!');
        }

        await prisma.$disconnect();
        process.exit(0);
    } catch (error) {
        console.error('✗ Database error:', error.message);
        console.error('Full error:', error);
        await prisma.$disconnect();
        process.exit(1);
    }
}

checkDatabase();
