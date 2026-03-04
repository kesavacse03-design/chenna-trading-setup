const { PrismaClient } = require('@prisma/client');
const priceService = require('../services/priceService.cjs');

const prisma = new PrismaClient();

async function main() {
    const symbol = 'RELIANCE';
    const dateStr = '2026-02-05'; // Today's date

    console.log(`[TEST] Starting isolation test for ${symbol} on ${dateStr}`);

    // 1. Get DB Key
    const instrument = await prisma.instrument.findFirst({
        where: { tradingSymbol: symbol }
    });
    const dbKey = instrument?.instrumentKey;
    const stock = await prisma.stock.findFirst({
        where: { symbol: symbol }
    });
    const stockKey = stock?.instrumentKey;

    console.log(`[TEST] Instrument DB Key: ${dbKey}`);
    console.log(`[TEST] Stock DB Key: ${stockKey}`);

    // Choose one (should be same)
    const rawKey = dbKey || stockKey;

    // 2. Define usage logic
    const fromDate = dateStr;
    const nextDate = new Date(dateStr);
    nextDate.setDate(nextDate.getDate() + 1);
    const toDate = nextDate.toISOString().split('T')[0];

    // 3. Test Multiple Keys
    const keysToTry = [
        { label: 'Raw DB Key', key: rawKey },
        { label: 'Encoded DB Key', key: rawKey ? encodeURIComponent(rawKey) : null },
        { label: 'Old Format (NSE_EQ|RELIANCE)', key: 'NSE_EQ|RELIANCE' },
        { label: 'Token Format (NSE_EQ|2885)', key: 'NSE_EQ|2885' }
    ];

    console.log(`[TEST] Testing fetch with keys...`);

    for (const item of keysToTry) {
        if (!item.key) continue;
        console.log(`\n[TEST] --------------------------------------------------`);
        console.log(`[TEST] Trying ${item.label}: "${item.key}"`);

        try {
            // Force fetch
            const candles = await priceService.fetchPrice(
                symbol,
                item.key,
                fromDate,
                toDate,
                '1minute'
            );

            if (candles && candles.length > 0) {
                console.log(`[TEST] ✅ SUCCESS! Got ${candles.length} candles.`);
                console.log('[TEST] First:', JSON.stringify(candles[0]));
                break;
            } else {
                console.log(`[TEST] ❌ FAILED (0 candles returned)`);
            }

        } catch (error) {
            console.error(`[TEST] ❌ ERROR: ${error.message}`);
        }
    }
}

main()
    .catch(e => console.error(e))
    .finally(async () => {
        await prisma.$disconnect();
    });
