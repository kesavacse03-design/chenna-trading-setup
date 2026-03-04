const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    try {
        const categories = await prisma.category.findMany({
            include: { stocks: true }
        });
        for (const cat of categories) {
            console.log(`Category: ${cat.key || cat.id} | Stocks: ${cat.stocks.length}`);
        }
    } catch (e) {
        console.error("Error:", e.message);
    }
}

main().finally(() => prisma.$disconnect());
