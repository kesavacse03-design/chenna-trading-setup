// Compare a few stocks from import file with database
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkSampleStocks() {
    // Sample stocks from the screenshot
    const samples = [
        { symbol: 'TITAN', date: '2025-10-23', category: 'LONG_TERM_SWING_BO_UP' },
        { symbol: 'TATASTEEL', date: '2025-10-30', category: 'HIGH_POWERED_STOCKS' },
        { symbol: 'ADANIENT', date: '2025-10-20', category: 'MULTI_SUPPORT_BO' },
        { symbol: 'ADANIENSOL', date: '2025-10-30', category: 'INTRADAY_BOOST' },
        { symbol: 'ADANIPORTS', date: '2025-10-24', category: 'DOWNSIDE_LOM_INTRA' }
    ];

    console.log('\n=== CHECKING SAMPLE STOCKS FROM IMPORT FILE ===\n');

    for (const s of samples) {
        const stock = await prisma.stock.findUnique({
            where: { symbol: s.symbol },
            include: {
                categories: {
                    include: { category: true }
                }
            }
        });

        if (!stock) {
            console.log(`${s.symbol}: ❌ NOT in database at all`);
            continue;
        }

        console.log(`${s.symbol}: ✅ Exists in database`);

        // Check if linked to the expected category
        const linkedCat = stock.categories.find(c => c.category.key === s.category);
        if (linkedCat) {
            console.log(`  ✅ IS linked to ${s.category}`);
            console.log(`  ⚠️  Should be detected as DUPLICATE`);
        } else {
            console.log(`  ❌ NOT linked to ${s.category}`);
            if (stock.categories.length > 0) {
                console.log(`  → Actually linked to: ${stock.categories.map(c => c.category.key).join(', ')}`);
            } else {
                console.log(`  → NOT linked to ANY category`);
            }
            console.log(`  ✅ Correctly showing as READY (different category)`);
        }
        console.log('');
    }

    await prisma.$disconnect();
}

checkSampleStocks();
