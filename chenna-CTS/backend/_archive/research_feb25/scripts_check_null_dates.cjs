const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

async function check() {
    const cat = await p.category.findFirst({ where: { key: 'PRE_MARKET' } });
    if (!cat) { console.log('No PRE_MARKET'); return; }

    const all = await p.stockCategory.findMany({
        where: { categoryId: cat.id },
        include: { stock: true }
    });

    const nullDates = all.filter(s => !s.addedDate);
    console.log('Total stocks:', all.length);
    console.log('NULL addedDate count:', nullDates.length);

    if (nullDates.length > 0) {
        console.log('First 10 NULL addedDate stocks:');
        nullDates.slice(0, 10).forEach(s => console.log('  -', s.stock?.symbol));
    }

    // Check specific stocks
    console.log('\nSpecific stocks:');
    const check = ['POWER', 'TATASTEEL', 'ONGC', 'ITC', 'BEL', 'WIPRO'];
    for (const sym of check) {
        const found = all.find(s => s.stock?.symbol?.includes(sym));
        if (found) {
            console.log(`${sym}: addedDate = ${found.addedDate || 'NULL'}`);
        } else {
            console.log(`${sym}: NOT IN PRE_MARKET`);
        }
    }

    await p.$disconnect();
}

check().catch(console.error);
