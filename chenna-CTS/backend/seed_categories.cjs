// Seed script: Ensure INTRADAY_BOOST exists in the categories table
const prisma = require('./lib/prisma.cjs');

async function seed() {
    const existing = await prisma.category.findMany();
    console.log('Existing categories:', existing.map(c => c.key).join(', ') || 'NONE');

    const requiredCategories = [
        {
            key: 'INTRADAY_BOOST',
            name: 'Intraday Boost',
            description: 'ORB + N-Pattern intraday signals using V2.1 strategy',
            enabled: true,
            scanningEnabled: true,
            signalGenerationEnabled: true,
            livePriceEnabled: true
        },
        {
            key: 'HIGH_POWERED_STOCKS',
            name: 'High Powered Stocks',
            description: 'High momentum stocks for intraday trading',
            enabled: true,
            scanningEnabled: true,
            signalGenerationEnabled: true,
            livePriceEnabled: true
        },
        {
            key: 'SHORT_TERM_SWING_BO_UP',
            name: 'Short Term Swing - Breakout Up',
            description: 'Short-term swing breakout (bullish)',
            enabled: true,
            scanningEnabled: false,
            signalGenerationEnabled: true,
            livePriceEnabled: false
        },
        {
            key: 'SHORT_TERM_SWING_BO_DOWN',
            name: 'Short Term Swing - Breakout Down',
            description: 'Short-term swing breakdown (bearish)',
            enabled: true,
            scanningEnabled: false,
            signalGenerationEnabled: true,
            livePriceEnabled: false
        },
        {
            key: 'LONG_TERM_SWING_BO_UP',
            name: 'Long Term Swing - Breakout Up',
            description: 'Long-term swing breakout (bullish)',
            enabled: true,
            scanningEnabled: false,
            signalGenerationEnabled: true,
            livePriceEnabled: false
        }
    ];

    for (const cat of requiredCategories) {
        const exists = existing.find(c => c.key === cat.key);
        if (!exists) {
            await prisma.category.create({ data: cat });
            console.log(`  ✅ Created: ${cat.key}`);
        } else {
            console.log(`  ⏩ Exists: ${cat.key}`);
        }
    }

    console.log('\nDone! Controller page should now show categories.');
    await prisma.$disconnect();
}

seed().catch(e => { console.error('ERROR:', e.message); process.exit(1); });
