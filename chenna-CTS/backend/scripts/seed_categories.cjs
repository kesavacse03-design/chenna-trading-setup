const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

const INITIAL_CATEGORIES = [
    // Swing Categories
    {
        key: 'DOWNSIDE_LOM_SWING',
        name: 'DOWNSIDE LOM SWING',
        description: 'Stocks showing downside momentum for swing trading'
    },
    {
        key: 'UPSIDE_LOM_SWING',
        name: 'UPSIDE LOM SWING',
        description: 'Stocks showing upside momentum for swing trading'
    },
    {
        key: 'SHORT_TERM_SWING_BO_UP',
        name: 'SHORT TERM SWING BO - UP',
        description: 'Short term breakout stocks moving up'
    },
    {
        key: 'SHORT_TERM_SWING_BO_DOWN',
        name: 'SHORT TERM SWING BO - DOWN',
        description: 'Short term breakout stocks moving down'
    },
    {
        key: 'LONG_TERM_SWING_BO_UP',
        name: 'LONG TERM SWING BO UP',
        description: 'Long term breakout stocks moving up'
    },
    {
        key: 'LONG_TERM_SWING_BO_DOWN',
        name: 'LONG TERM SWING BO - DOWN',
        description: 'Long term breakout stocks moving down'
    },
    {
        key: 'MULTI_RESISTANCE_BO',
        name: 'MULTI RESISTANCE BO',
        description: 'Stocks breaking out of multiple resistance levels'
    },
    {
        key: 'MULTI_SUPPORT_BO',
        name: 'MULTI SUPPORT BO',
        description: 'Stocks breaking down from multiple support levels'
    },
    // Intraday Categories
    {
        key: 'DOWNSIDE_LOM_INTRA',
        name: 'DOWNSIDE LOM INTRA',
        description: 'Intraday stocks showing downside momentum'
    },
    {
        key: 'UPSIDE_LOM_INTRA',
        name: 'UPSIDE LOM INTRA',
        description: 'Intraday stocks showing upside momentum'
    },
    {
        key: 'HIGH_POWERED_STOCKS',
        name: 'HIGH POWERED STOCKS',
        description: 'High momentum stocks'
    },
    {
        key: 'INTRADAY_BOOST',
        name: 'INTRADAY BOOST',
        description: 'Stocks suitable for intraday trading'
    },
    {
        key: 'DAILY_CONTRACTION',
        name: 'DAILY CONTRACTION',
        description: 'Stocks showing daily price contraction'
    },
    {
        key: 'PRE_MARKET',
        name: 'PRE MARKET',
        description: 'Pre-market movers'
    }
];

async function seedCategories() {
    console.log('🌱 Seeding Categories...');

    for (const cat of INITIAL_CATEGORIES) {
        await prisma.category.upsert({
            where: { key: cat.key },
            update: {
                name: cat.name,
                description: cat.description
            },
            create: {
                key: cat.key,
                name: cat.name,
                description: cat.description
            }
        });
        console.log(`✅ Upserted category: ${cat.name}`);
    }

    console.log('✨ Category Seeding Complete!');
    await prisma.$disconnect();
}

seedCategories().catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
});
