const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

async function main() {
    // Find all models that contain category data
    const cats = await p.category.findMany({ take: 5 });
    console.log('Categories found:', cats.length);
    for (const c of cats) console.log('  ' + c.key + ': ' + c.name);

    const sc = await p.stockCategory.findMany({
        where: { category: { key: 'MULTI_SUPPORT_BO' } },
        include: { stock: true, category: true }
    });
    console.log('\nMULTI_SUPPORT_BO stocks:', sc.length);

    // Show addedDate distribution
    const dates = {};
    for (const s of sc) {
        const d = s.addedDate ? s.addedDate.toISOString().split('T')[0] : 'null';
        dates[d] = (dates[d] || 0) + 1;
    }
    console.log('By addedDate:');
    for (const [d, c] of Object.entries(dates).sort()) {
        console.log('  ' + d + ': ' + c + ' stocks');
    }

    // Sample
    console.log('\nSample stocks:');
    for (const s of sc.slice(0, 5)) {
        console.log('  ' + s.stock.symbol + ' added: ' + (s.addedDate ? s.addedDate.toISOString().split('T')[0] : 'null'));
    }

    // RESISTANCE
    const rc = await p.stockCategory.findMany({
        where: { category: { key: 'MULTI_RESISTANCE_BO' } },
        include: { stock: true }
    });
    console.log('\nMULTI_RESISTANCE_BO stocks:', rc.length);
    const rdates = {};
    for (const s of rc) {
        const d = s.addedDate ? s.addedDate.toISOString().split('T')[0] : 'null';
        rdates[d] = (rdates[d] || 0) + 1;
    }
    console.log('By addedDate:');
    for (const [d, c] of Object.entries(rdates).sort()) {
        console.log('  ' + d + ': ' + c + ' stocks');
    }

    await p.$disconnect();
}

main().catch(e => { console.error(e); p.$disconnect(); });
