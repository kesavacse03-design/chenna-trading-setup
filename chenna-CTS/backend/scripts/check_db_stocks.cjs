// Check database stocks by category
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkStocks() {
    try {
        const cats = await prisma.category.findMany({
            include: {
                stocks: {
                    include: {
                        stock: true
                    }
                }
            },
            orderBy: { name: 'asc' }
        });

        console.log('\n=== DATABASE STOCK COUNT BY CATEGORY ===\n');

        for (const c of cats) {
            console.log(`${c.name} (${c.key}): ${c.stocks.length} stocks`);
            if (c.stocks.length > 0 && c.stocks.length <= 10) {
                c.stocks.forEach(s => {
                    console.log(`  - ${s.stock.symbol} (${s.stock.name || 'N/A'})`);
                });
            }
        }

        // Find the 3 missing stocks
        console.log('\n=== CHECKING FOR SPECIFIC STOCKS ===\n');
        const stocksToFind = ['ADANIGREEN', 'ADANIPORTS', 'ANGELONE'];

        for (const sym of stocksToFind) {
            const stock = await prisma.stock.findUnique({
                where: { symbol: sym },
                include: {
                    categories: {
                        include: {
                            category: true
                        }
                    }
                }
            });

            if (stock) {
                console.log(`${sym}: Found in database`);
                if (stock.categories.length > 0) {
                    stock.categories.forEach(c => {
                        console.log(`  → Linked to: ${c.category.name} (${c.category.key})`);
                    });
                } else {
                    console.log(`  ⚠️ NOT linked to any category!`);
                }
            } else {
                console.log(`${sym}: ❌ NOT in database`);
            }
        }

    } catch (err) {
        console.error('Error:', err);
    } finally {
        await prisma.$disconnect();
    }
}

checkStocks();
