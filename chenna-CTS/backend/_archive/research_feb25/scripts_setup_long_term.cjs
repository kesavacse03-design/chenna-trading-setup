const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function setup() {
    console.log('Setting up LONG_TERM_BO_UP...');

    // 1. Create Category
    const categoryKey = 'LONG_TERM_BO_UP';
    let category = await prisma.category.findUnique({ where: { key: categoryKey } });

    if (!category) {
        category = await prisma.category.create({
            data: {
                key: categoryKey,
                name: 'Long Term Breakout Up',
                description: 'Long term bullish breakout strategy'
            }
        });
        console.log('Created Category:', category.name);
    }

    // 2. Create Config
    const config = await prisma.categoryConfig.upsert({
        where: { categoryKey },
        update: {},
        create: {
            categoryKey,
            categoryName: 'Long Term Breakout Up',
            type: 'SWING',
            version: '1.0',
            active: true,
            analyzed: true,
            targetPercent: 10.0, // Long term target
            stopPercent: -5.0,   // Long term stop
            priceTiers: {
                tier1: { maxPrice: 500, name: 'Tier 1', candlePattern: 'GREEN_ONLY', expectedSuccess: 0.6, positionMultiplier: 1.5 },
                tier2: { maxPrice: 2000, name: 'Tier 2', candlePattern: 'GREEN_ONLY', expectedSuccess: 0.6, positionMultiplier: 1.0 },
                tier3: { name: 'Tier 3', candlePattern: 'GREEN_ONLY', expectedSuccess: 0.6, positionMultiplier: 0.75 }
            }
        }
    });
    console.log('Created Config:', config.categoryName);

    // 3. Copy Stocks
    const sourceCategory = await prisma.category.findUnique({ where: { key: 'SHORT_TERM_SWING_BO_DOWN' } });
    if (!sourceCategory) {
        console.error('Source category SHORT_TERM_SWING_BO_DOWN not found');
        return;
    }

    const sourceStocks = await prisma.stockCategory.findMany({
        where: { categoryId: sourceCategory.id }
    });

    console.log(`Found ${sourceStocks.length} stocks in source category`);

    let added = 0;
    for (const sc of sourceStocks) {
        try {
            await prisma.stockCategory.create({
                data: {
                    stockId: sc.stockId,
                    categoryId: category.id,
                    addedDate: sc.addedDate,
                    isNew: sc.isNew
                }
            });
            added++;
        } catch (e) {
            // Ignore duplicates
        }
    }

    console.log(`Added ${added} stocks to LONG_TERM_BO_UP`);
}

setup()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
