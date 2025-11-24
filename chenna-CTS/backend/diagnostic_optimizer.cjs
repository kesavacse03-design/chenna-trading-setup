// Diagnostic: Check what the optimizer query returns
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function diagnose() {
    const category = 'LONGTERM SWING BO UP';

    console.log(`Looking for category: "${category}"`);

    const dbCategory = await prisma.category.findFirst({
        where: {
            OR: [
                { key: category },
                { name: { contains: category } }
            ]
        },
        include: {
            stocks: {
                include: { stock: true }
            }
        }
    });

    if (!dbCategory) {
        console.log('❌ Category not found!');

        // List all categories
        const all = await prisma.category.findMany();
        console.log('\nAvailable categories:');
        all.forEach(c => console.log(`  - ${c.name} (key: ${c.key || 'N/A'})`));
    } else {
        console.log('✓ Category found:', dbCategory.name);
        console.log(`  Stocks linked: ${dbCategory.stocks.length}`);

        if (dbCategory.stocks.length > 0) {
            console.log('\nSample stocks:');
            dbCategory.stocks.slice(0, 5).forEach(sc => {
                console.log(`  - ${sc.stock.symbol} (added: ${sc.addedDate})`);
            });
        }
    }

    await prisma.$disconnect();
}

diagnose().catch(console.error);
