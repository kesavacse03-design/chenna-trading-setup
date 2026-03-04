/**
 * Quick verification - show 5 sample trades with full details
 */
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function getRawCandles(symbol, date) {
    const targetDateStr = typeof date === 'string' ? date.split('T')[0] : new Date(date).toISOString().split('T')[0];

    const cached = await prisma.ohlcvCache.findFirst({
        where: { symbol, interval: '5m' }
    });

    if (!cached || !cached.data) return [];

    return cached.data
        .filter(c => c.timestamp && c.timestamp.split('T')[0] === targetDateStr)
        .sort((a, b) => a.timestamp.localeCompare(b.timestamp));
}

async function verify() {
    // Sample trades from our backtest results (manually picked from different days)
    const sampleTrades = [
        { date: '2026-01-02', symbol: 'CUMMINSIND', entryTime: '09:41', outcome: 'WIN' },
        { date: '2026-01-06', symbol: 'HINDPETRO', entryTime: '09:48', outcome: 'WIN' },
        { date: '2026-01-07', symbol: 'MPHASIS', entryTime: '09:55', outcome: 'WIN' },
        { date: '2026-01-02', symbol: 'INDUSINDBK', entryTime: '09:38', outcome: 'LOSS' },
        { date: '2026-01-06', symbol: 'VEDL', entryTime: '09:48', outcome: 'LOSS' },
    ];

    console.log('═'.repeat(80));
    console.log('DETAILED TRADE VERIFICATION - 5 SAMPLE TRADES');
    console.log('═'.repeat(80));

    for (let i = 0; i < sampleTrades.length; i++) {
        const t = sampleTrades[i];
        console.log(`\n${'─'.repeat(80)}`);
        console.log(`TRADE #${i + 1}: ${t.symbol} on ${t.date} (${t.outcome})`);
        console.log(`${'─'.repeat(80)}`);

        const candles = await getRawCandles(t.symbol, t.date);
        console.log(`\nTotal candles for day: ${candles.length}`);

        // Show first few candles (Opening Range formation)
        console.log(`\n📊 OPENING RANGE FORMATION (First 10 candles):`);
        candles.slice(0, 10).forEach((c, idx) => {
            const isGreen = c.close > c.open;
            const time = c.timestamp.split('T')[1].substring(0, 8);
            console.log(`  ${idx + 1}. ${time} | O:${c.open} H:${c.high} L:${c.low} C:${c.close} V:${c.volume} [${isGreen ? 'GREEN' : 'RED'}]`);
        });

        // Find and show entry candle
        const entryIdx = candles.findIndex(c => c.timestamp.split('T')[1].substring(0, 5) === t.entryTime);
        if (entryIdx !== -1) {
            console.log(`\n🎯 ENTRY CANDLE (${t.entryTime}):`);
            const ec = candles[entryIdx];
            console.log(`  Time: ${ec.timestamp}`);
            console.log(`  O:${ec.open} H:${ec.high} L:${ec.low} C:${ec.close} V:${ec.volume}`);

            // Show candles around entry (context)
            console.log(`\n📈 CANDLES AROUND ENTRY (${entryIdx - 2} to ${entryIdx + 5}):`);
            const start = Math.max(0, entryIdx - 2);
            const end = Math.min(candles.length, entryIdx + 6);
            for (let j = start; j < end; j++) {
                const c = candles[j];
                const time = c.timestamp.split('T')[1].substring(0, 8);
                const marker = j === entryIdx ? '→ ENTRY' : '';
                console.log(`  ${time} | O:${c.open} H:${c.high} L:${c.low} C:${c.close} ${marker}`);
            }
        }

        // Verification checks
        console.log(`\n✅ VERIFICATION CHECKS:`);

        // Check 1: Entry time is after market open + pattern formation
        const entryMins = parseInt(t.entryTime.split(':')[0]) * 60 + parseInt(t.entryTime.split(':')[1]);
        const marketOpenMins = 9 * 60 + 15;
        const minsAfterOpen = entryMins - marketOpenMins;
        console.log(`  Entry ${minsAfterOpen} minutes after market open: ${minsAfterOpen >= 15 ? '✅ VALID' : '⚠️ TOO EARLY'}`);

        // Check 2: Entry is within time window
        console.log(`  Entry within 15-45 min window: ${minsAfterOpen >= 15 && minsAfterOpen <= 45 ? '✅ VALID' : '⚠️'}`);

        // Check 3: Candle exists at entry time
        console.log(`  Entry candle exists: ${entryIdx !== -1 ? '✅ YES' : '❌ NO'}`);
    }

    console.log('\n' + '═'.repeat(80));
    console.log('VERIFICATION COMPLETE');
    console.log('═'.repeat(80));
}

verify().finally(() => prisma.$disconnect());
