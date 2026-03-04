const prisma = require('../lib/prisma.cjs');

async function run() {
    try {
        // First, discover the table structure
        console.log('--- Checking TradingSignal table ---');

        // Try Prisma model first
        try {
            const count = await prisma.tradingSignal.count();
            console.log(`TradingSignal count: ${count}`);

            // Get column info by reading one record
            if (count > 0) {
                const sample = await prisma.tradingSignal.findFirst();
                console.log('Sample signal keys:', Object.keys(sample));
                console.log('Sample signal:', JSON.stringify(sample, null, 2));
            } else {
                console.log('Table is empty. Attempting insert...');
            }
        } catch (e) {
            console.error('Prisma model error:', e.message);
            // Try raw SQL
            try {
                const tables = await prisma.$queryRaw`
                    SELECT table_name FROM information_schema.tables 
                    WHERE table_schema = 'public' AND table_name LIKE '%signal%'
                `;
                console.log('Signal-related tables:', tables);
            } catch (e2) {
                console.error('Raw query failed:', e2.message);
            }
        }

        // Now insert a test signal
        console.log('\n--- Inserting Test Signal ---');
        const { v4: uuidv4 } = require('uuid');
        const signalId = uuidv4();
        const now = new Date();

        const testSignal = {
            signalId: signalId,
            categoryKey: 'SHORT_TERM_SWING_BO_DOWN',
            type: 'LONG',
            symbol: 'RELIANCE',
            signalDate: now,
            entryPrice: 1250.00,
            targetPrice: 1300.00,
            stopPrice: 1225.00,
            confidenceScore: 0.85,
            tier: 2,
            tierName: 'TIER 2 (FRESH)',
            suggestedPositionSize: 25000,
            suggestedQuantity: 20,
            userAction: null,
            entryChecklist: {
                dayValid: true,
                monthValid: true,
                candleColor: 'GREEN',
                priceInRange: true
            }
        };

        try {
            const result = await prisma.tradingSignal.create({
                data: testSignal
            });
            console.log('✅ Signal inserted successfully!');
            console.log('Result:', JSON.stringify(result, null, 2));
        } catch (e) {
            console.error('Insert via Prisma failed:', e.message);

            // Try with fewer fields
            console.log('Trying minimal insert...');
            try {
                const result = await prisma.tradingSignal.create({
                    data: {
                        signalId: signalId,
                        categoryKey: 'SHORT_TERM_SWING_BO_DOWN',
                        type: 'LONG',
                        symbol: 'RELIANCE',
                        signalDate: now,
                        entryPrice: 1250.00,
                        targetPrice: 1300.00,
                        stopPrice: 1225.00,
                        confidenceScore: 0.85,
                        tier: 2,
                        tierName: 'TIER 2 (FRESH)',
                        suggestedPositionSize: 25000,
                        suggestedQuantity: 20
                    }
                });
                console.log('✅ Minimal signal inserted!');
                console.log('Result:', JSON.stringify(result, null, 2));
            } catch (e2) {
                console.error('Minimal insert also failed:', e2.message);
            }
        }

        // Verify
        const today = await prisma.tradingSignal.findMany({
            where: {
                signalDate: { gte: new Date(now.toISOString().split('T')[0]) }
            }
        });
        console.log(`\nToday's signals count: ${today.length}`);
        today.forEach(s => console.log(`  ${s.symbol} Tier:${s.tier} Action:${s.userAction}`));

    } catch (e) {
        console.error('Fatal:', e.message);
    } finally {
        await prisma.$disconnect();
    }
}

run();
