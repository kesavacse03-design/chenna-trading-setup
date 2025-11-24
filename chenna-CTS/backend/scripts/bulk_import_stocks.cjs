// Bulk Import Stocks from Text File
// Reads a file with format: SYMBOL, DATE, CATEGORY - DIRECTION

const fs = require('fs');
const path = require('path');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function importFromFile(filePath) {
    console.log('╔══════════════════════════════════════════════════╗');
    console.log('║   BULK STOCK IMPORT FROM FILE                     ║');
    console.log('╚══════════════════════════════════════════════════╝\n');

    try {
        // 1. Read the file
        if (!fs.existsSync(filePath)) {
            throw new Error(`File not found: ${filePath}`);
        }

        const fileContent = fs.readFileSync(filePath, 'utf-8');
        const lines = fileContent.split('\n').filter(line => line.trim());

        console.log(`Found ${lines.length} lines in file\n`);

        // 2. Load NSE instruments
        const nseJsonPath = path.join(__dirname, '../NSE.json');
        if (!fs.existsSync(nseJsonPath)) {
            throw new Error('NSE.json not found');
        }

        const nseData = JSON.parse(fs.readFileSync(nseJsonPath, 'utf-8'));
        const instruments = Array.isArray(nseData) ? nseData : nseData.data || [];

        console.log(`Loaded ${instruments.length} instruments from NSE.json\n`);

        // 3. Parse and import each stock
        let imported = 0;
        let skipped = 0;
        let errors = 0;

        for (const line of lines) {
            try {
                // Parse: "SYMBOL, DATE, CATEGORY - DIRECTION"
                const parts = line.split(',').map(p => p.trim());

                if (parts.length < 3) {
                    console.warn(`⚠ Skipping invalid line: ${line}`);
                    skipped++;
                    continue;
                }

                const symbol = parts[0].toUpperCase();
                const date = parts[1];
                const categoryPart = parts[2];

                // Extract category (remove direction like "- UP")
                const category = categoryPart.split('-')[0].trim();

                // Find instrument in NSE.json
                const instrument = instruments.find(i =>
                    i.symbol === symbol ||
                    i.trading_symbol === symbol
                );

                if (!instrument) {
                    console.warn(`⚠ ${symbol}: Not found in NSE.json`);
                    skipped++;
                    continue;
                }

                // Find or create stock
                let stock = await prisma.stock.findFirst({
                    where: { symbol: symbol }
                });

                if (!stock) {
                    stock = await prisma.stock.create({
                        data: {
                            symbol: symbol,
                            name: instrument.name || symbol,
                            exchange: instrument.exchange || 'NSE',
                            instrumentKey: instrument.instrument_key,
                        }
                    });
                }

                // Find or create category
                let dbCategory = await prisma.category.findFirst({
                    where: {
                        OR: [
                            { name: { contains: category } },
                            { key: category.replace(/\s+/g, '_').toUpperCase() }
                        ]
                    }
                });

                if (!dbCategory) {
                    // Create new category if it doesn't exist
                    const categoryKey = category.replace(/\s+/g, '_').toUpperCase();
                    dbCategory = await prisma.category.create({
                        data: {
                            key: categoryKey,
                            name: category,
                            description: `Auto-created from import: ${category}`,
                        }
                    });
                    console.log(`✓ Created new category: ${category}`);
                }

                // Check if stock already in category
                const existing = await prisma.stockCategory.findFirst({
                    where: {
                        stockId: stock.id,
                        categoryId: dbCategory.id,
                    }
                });

                if (!existing) {
                    await prisma.stockCategory.create({
                        data: {
                            stockId: stock.id,
                            categoryId: dbCategory.id,
                            addedDate: new Date(date),
                        }
                    });

                    console.log(`✓ ${symbol} → ${category} (${date})`);
                    imported++;
                } else {
                    console.log(`⚠ ${symbol} already in ${category}`);
                    skipped++;
                }

            } catch (error) {
                console.error(`✗ Error processing line "${line}": ${error.message}`);
                errors++;
            }
        }

        console.log('\n╔══════════════════════════════════════════════════╗');
        console.log('║   IMPORT COMPLETE                                 ║');
        console.log('╚══════════════════════════════════════════════════╝');
        console.log(`✓ Imported: ${imported}`);
        console.log(`⚠ Skipped: ${skipped}`);
        console.log(`✗ Errors: ${errors}`);
        console.log(`Total: ${lines.length} lines processed\n`);

        await prisma.$disconnect();

        return { imported, skipped, errors, total: lines.length };

    } catch (error) {
        console.error('\n❌ Import failed:', error.message);
        await prisma.$disconnect();
        throw error;
    }
}

// Get file path from command line or use default
const filePath = process.argv[2] || path.join(__dirname, '../load-stocks1.txt');

console.log(`Reading from: ${filePath}\n`);

importFromFile(filePath)
    .then((result) => {
        console.log('✅ Import completed successfully!');
        process.exit(0);
    })
    .catch((error) => {
        console.error('❌ Import failed:', error.message);
        process.exit(1);
    });
