const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function setup() {
    console.log('Setting up UPSIDE_LOM_SWING...');

    const categoryKey = 'UPSIDE_LOM_SWING';

    // 1. Create Category
    let category = await prisma.category.findUnique({ where: { key: categoryKey } });

    if (!category) {
        category = await prisma.category.create({
            data: {
                key: categoryKey,
                name: 'Upside LOM Swing',
                description: 'Bullish swing strategy targeting low of month breakouts'
            }
        });
        console.log('Created Category:', category.name);
    } else {
        console.log('Category already exists:', category.name);
    }

    // 2. Create Config (Bullish strategy - GREEN candles, higher targets)
    const config = await prisma.categoryConfig.upsert({
        where: { categoryKey },
        update: {},
        create: {
            categoryKey,
            categoryName: 'Upside LOM Swing',
            type: 'SWING',
            version: '1.0',
            active: true,
            analyzed: true,
            targetPercent: 3.0,  // Higher target for bullish moves
            stopPercent: -2.0,   // Slightly wider stop
            priceTiers: {
                tier1: { maxPrice: 200, name: 'Tier 1', candlePattern: 'GREEN_ONLY', expectedSuccess: 0.6, positionMultiplier: 1.5 },
                tier2: { maxPrice: 1000, name: 'Tier 2', candlePattern: 'GREEN_ONLY', expectedSuccess: 0.55, positionMultiplier: 1.0 },
                tier3: { name: 'Tier 3', candlePattern: 'GREEN_ONLY', expectedSuccess: 0.5, positionMultiplier: 0.75 }
            }
        }
    });
    console.log('Config ready:', config.categoryName);

    // 3. Copy Stocks from SHORT_TERM (we'll use same stock universe initially)
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

    console.log(`Added ${added} stocks to UPSIDE_LOM_SWING`);
    console.log('Setup complete!');
}

setup()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
