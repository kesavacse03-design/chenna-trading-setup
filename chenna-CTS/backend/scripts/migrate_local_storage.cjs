const fs = require('fs');
const path = require('path');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

const STOCKS_FILE_PATH = path.resolve(__dirname, '../../../cts_stocks.json');

// Map JSON category names to DB keys if necessary
// The seed script used keys like 'DOWNSIDE_LOM_SWING' but names like 'DOWNSIDE LOM SWING'
const CATEGORY_MAP = {
    'DOWNSIDE LOM SWING': 'DOWNSIDE_LOM_SWING',
    'SHORT TERM SWING BO - UP': 'SHORT_TERM_SWING_BO_UP',
    'LONG TERM SWING BO - DOWN': 'LONG_TERM_SWING_BO_DOWN',
    'HIGH POWERED STOCKS': 'HIGH_POWERED_STOCKS',
    'INTRADAY BOOST': 'INTRADAY_BOOST',
    'PRE MARKET': 'PRE_MARKET'
};

async function migrateStocks() {
    console.log('🚀 Starting Stock Migration...');

    if (!fs.existsSync(STOCKS_FILE_PATH)) {
        console.error(`❌ cts_stocks.json not found at: ${STOCKS_FILE_PATH}`);
        process.exit(1);
    }

    const rawData = fs.readFileSync(STOCKS_FILE_PATH, 'utf-8');
    const stockList = JSON.parse(rawData);

    console.log(`📊 Found ${stockList.length} entries in cts_stocks.json`);

    let linked = 0;
    let skipped = 0;

    for (const item of stockList) {
        const symbol = item.stockName; // Correct field name from JSON
        const categoryName = item.category; // Correct field name from JSON

        if (!symbol || !categoryName) {
            console.warn(`⚠️ Invalid item: ${JSON.stringify(item)}`);
            skipped++;
            continue;
        }

        // 1. Find Stock
        const stock = await prisma.stock.findUnique({
            where: { symbol: symbol }
        });

        if (!stock) {
            console.warn(`⚠️ Stock not found in DB: ${symbol}`);
            skipped++;
            continue;
        }

        // 2. Find Category
        // Normalize category name for matching
        const normalizedCategory = categoryName.toUpperCase().replace(/\s+/g, '_');

        // Enhanced mapping
        const EXTENDED_MAP = {
            ...CATEGORY_MAP,
            'GENERAL': 'HIGH_POWERED_STOCKS', // Map GENERAL to High Powered or a default
            'SHORT_TERM_SWING_BO_UP': 'SHORT_TERM_SWING_BO_UP',
            'LONG_TERM_SWING_BO_DOWN': 'LONG_TERM_SWING_BO_DOWN',
            'INTRADAY_BOOST': 'INTRADAY_BOOST',
            'PRE_MARKET': 'PRE_MARKET'
        };

        // Try to find by:
        // 1. Exact Name
        // 2. Mapped Key
        // 3. Normalized Key (replace spaces with underscores)
        // 4. Case-insensitive name match (via findFirst)

        let category = await prisma.category.findFirst({
            where: {
                OR: [
                    { name: categoryName },
                    { key: EXTENDED_MAP[categoryName] || categoryName },
                    { key: normalizedCategory },
                    { name: { equals: categoryName, mode: 'insensitive' } },
                    { key: { equals: categoryName, mode: 'insensitive' } }
                ]
            }
        });

        if (!category) {
            console.warn(`⚠️ Category not found: ${categoryName}`);
            skipped++;
            continue;
        }

        // 3. Link them
        try {
            await prisma.stockCategory.upsert({
                where: {
                    stockId_categoryId: {
                        stockId: stock.id,
                        categoryId: category.id
                    }
                },
                update: {},
                create: {
                    stockId: stock.id,
                    categoryId: category.id
                }
            });
            linked++;
            process.stdout.write(`\r🔗 Linked ${linked} stocks...`);
        } catch (e) {
            console.error(`❌ Error linking ${symbol} to ${categoryName}:`, e.message);
        }
    }

    console.log('\n\n✅ Migration Complete!');
    console.log(`Linked: ${linked}`);
    console.log(`Skipped: ${skipped}`);

    await prisma.$disconnect();
}

migrateStocks().catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
});
