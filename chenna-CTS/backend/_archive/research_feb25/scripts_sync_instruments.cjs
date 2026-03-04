const fs = require('fs');
const path = require('path');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

const NSE_FILE_PATH = path.resolve(__dirname, '../../../NSE (4).json/NSE (4).json');

async function syncInstruments() {
    console.log('🚀 Starting Instrument Sync...');

    if (!fs.existsSync(NSE_FILE_PATH)) {
        console.error(`❌ NSE.json not found at: ${NSE_FILE_PATH}`);
        process.exit(1);
    }

    console.log(`📂 Reading NSE.json from ${NSE_FILE_PATH}...`);
    const rawData = fs.readFileSync(NSE_FILE_PATH, 'utf-8');
    const instruments = JSON.parse(rawData);

    console.log(`📊 Found ${instruments.length} instruments in file.`);

    // Filter for relevant instruments (EQUITY only)
    // Based on inspection: exchange is 'NSE', segment is 'NSE_EQ'
    // instrument_type can be 'EQ' (Equity), 'BE' (Book Entry/T2T), 'SM' (SME)
    const stocks = instruments.filter(inst =>
        inst.segment === 'NSE_EQ' &&
        ['EQ', 'BE', 'SM'].includes(inst.instrument_type)
    );

    console.log(`🎯 Filtered down to ${stocks.length} NSE Equity instruments.`);

    let processed = 0;
    const batchSize = 100;

    // Process in batches
    for (let i = 0; i < stocks.length; i += batchSize) {
        const batch = stocks.slice(i, i + batchSize);

        const operations = batch.map(inst => {
            return prisma.stock.upsert({
                where: { symbol: inst.trading_symbol },
                update: {
                    name: inst.name,
                    exchange: inst.exchange,
                    instrumentKey: inst.instrument_key,
                    instrumentType: inst.instrument_type,
                    isin: inst.isin,
                },
                create: {
                    symbol: inst.trading_symbol,
                    name: inst.name,
                    exchange: inst.exchange,
                    instrumentKey: inst.instrument_key,
                    instrumentType: inst.instrument_type,
                    isin: inst.isin,
                }
            });
        });

        // Execute batch transaction
        try {
            await prisma.$transaction(operations);
            processed += batch.length;
            process.stdout.write(`\r⏳ Processed ${processed}/${stocks.length} stocks...`);
        } catch (error) {
            console.error(`\n❌ Error processing batch ${i} - ${i + batchSize}:`, error.message);
        }
    }

    console.log('\n\n✅ Instrument Sync Complete!');
    console.log(`Total Stocks Synced: ${processed}`);

    await prisma.$disconnect();
}

syncInstruments().catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
});
