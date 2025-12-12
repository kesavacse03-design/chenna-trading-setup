const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function diagnose() {
    try {
        // Check cache data format
        const sample = await prisma.ohlcvCache.findFirst({
            where: { interval: 'day' },
            orderBy: { createdAt: 'desc' }
        });

        if (!sample) {
            console.log('No OHLCV cache found!');
            return;
        }

        console.log('=== OHLCV Cache Data Diagnosis ===');
        console.log('Symbol:', sample.symbol);
        console.log('Data type:', typeof sample.data);
        console.log('Is array:', Array.isArray(sample.data));

        let data = sample.data;

        // Check if it's a string that needs parsing
        if (typeof data === 'string') {
            console.log('Data is string, length:', data.length);
            console.log('First 100 chars:', data.substring(0, 100));

            // Try parsing
            try {
                data = JSON.parse(data);
                console.log('✅ Parsed successfully, now is array:', Array.isArray(data));
            } catch (e) {
                console.log('❌ Parse failed:', e.message);
            }
        }

        if (Array.isArray(data) && data.length > 0) {
            console.log('Array length:', data.length);
            console.log('First element type:', typeof data[0]);
            console.log('First element:', JSON.stringify(data[0]).substring(0, 200));

            // Check if elements are strings that need parsing
            if (typeof data[0] === 'string') {
                console.log('❌ BUG: Array contains strings, not objects!');
                console.log('  This causes JSON parse errors');
            }
        }

        // Check a few more samples
        const samples = await prisma.ohlcvCache.findMany({
            where: { interval: 'day' },
            take: 5,
            orderBy: { createdAt: 'desc' },
            select: { symbol: true, data: true }
        });

        console.log('\n=== Sample of 5 stocks ===');
        for (const s of samples) {
            const d = s.data;
            const isArray = Array.isArray(d);
            const firstElemType = isArray && d.length > 0 ? typeof d[0] : 'N/A';
            console.log(`${s.symbol}: isArray=${isArray}, firstElemType=${firstElemType}`);
        }

    } catch (err) {
        console.error('Error:', err);
    } finally {
        await prisma.$disconnect();
    }
}

diagnose();
