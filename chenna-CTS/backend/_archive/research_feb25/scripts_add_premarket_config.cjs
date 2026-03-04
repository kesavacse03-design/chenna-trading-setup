/**
 * Add PRE_MARKET to CategoryConfig table
 * 
 * The backtest engine looks up config in the database, not strategyManager
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function addPreMarketConfig() {
    console.log('Adding PRE_MARKET to CategoryConfig table...');

    // Check if already exists
    const existing = await prisma.categoryConfig.findUnique({
        where: { categoryKey: 'PRE_MARKET' }
    });

    if (existing) {
        console.log('PRE_MARKET config already exists, updating...');
        const updated = await prisma.categoryConfig.update({
            where: { categoryKey: 'PRE_MARKET' },
            data: {
                displayName: 'Gap Up Short (Gap Fill)',
                type: 'intraday',
                targetPercent: -3.0, // SHORT: Gap fill = previous close (~3% down from gap)
                stopPercent: 2.0,   // SHORT: Stop above OR high
                maxHoldDays: 1,     // Same day exit
                validDays: [1, 2, 3, 4, 5], // All weekdays (gap plays happen any day)
                avoidMonths: [],    // No month restriction for gap plays
                priceTiers: {
                    tier1: { minPrice: 0, maxPrice: 500, positionMultiplier: 1.5 },
                    tier2: { minPrice: 500, maxPrice: 2000, positionMultiplier: 1.0 },
                    tier3: { minPrice: 2000, maxPrice: 999999, positionMultiplier: 0.75 }
                },
                expectedSuccessRate: 85.7
            }
        });
        console.log('✅ PRE_MARKET config updated:', updated.id);
    } else {
        const created = await prisma.categoryConfig.create({
            data: {
                categoryKey: 'PRE_MARKET',
                displayName: 'Gap Up Short (Gap Fill)',
                type: 'intraday',
                targetPercent: -3.0, // SHORT: Gap fill = previous close
                stopPercent: 2.0,   // SHORT: Stop above OR high
                maxHoldDays: 1,     // Same day exit
                validDays: [1, 2, 3, 4, 5], // All weekdays
                avoidMonths: [],
                priceTiers: {
                    tier1: { minPrice: 0, maxPrice: 500, positionMultiplier: 1.5 },
                    tier2: { minPrice: 500, maxPrice: 2000, positionMultiplier: 1.0 },
                    tier3: { minPrice: 2000, maxPrice: 999999, positionMultiplier: 0.75 }
                },
                expectedSuccessRate: 85.7
            }
        });
        console.log('✅ PRE_MARKET config created:', created.id);
    }

    // List all configs
    const all = await prisma.categoryConfig.findMany({
        select: { categoryKey: true, displayName: true }
    });
    console.log('\nAll category configs:');
    for (const c of all) {
        console.log(`  - ${c.categoryKey}: ${c.displayName}`);
    }
}

addPreMarketConfig()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
