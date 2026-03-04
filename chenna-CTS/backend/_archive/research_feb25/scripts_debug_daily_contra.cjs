const prisma = require('../lib/prisma.cjs');

async function debug() {
    try {
        console.log('Debugging DAILY_CONTRACTION query...');

        // 1. Get Cat
        const cat = await prisma.category.findUnique({ where: { key: 'DAILY_CONTRACTION' } });
        console.log('Category:', cat);

        if (!cat) return;

        // 2. Count
        const count = await prisma.stockCategory.count({ where: { categoryId: cat.id } });
        console.log('Count:', count);

        // 3. Simple Find
        try {
            const simple = await prisma.stockCategory.findFirst({
                where: { categoryId: cat.id }
            });
            console.log('Simple result:', simple);
        } catch (e) { console.error('Simple failed:', e); }

        // 4. OrderBy
        try {
            const ordered = await prisma.stockCategory.findFirst({
                where: { categoryId: cat.id },
                orderBy: { addedDate: 'desc' }
            });
            console.log('OrderBy result:', ordered);
        } catch (e) { console.error('OrderBy failed:', e); }

        // 5. Select
        try {
            const selected = await prisma.stockCategory.findFirst({
                where: { categoryId: cat.id },
                select: {
                    addedDate: true,
                    stock: { select: { symbol: true } }
                }
            });
            console.log('Select result:', selected);
        } catch (e) { console.error('Select failed:', e); }

    } catch (e) {
        console.error('Fatal:', e);
    } finally {
        await prisma.$disconnect();
    }
}

debug();
