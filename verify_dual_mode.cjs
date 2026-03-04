
const dailyStrategy = require('./chenna-CTS/backend/services/labs/intradayBoostDailyStrategy.cjs');
const prisma = require('./chenna-CTS/backend/lib/prisma.cjs');

async function verifyDailyBacktest() {
    console.log('1. Testing Daily Strategy for HIGH_POWERED_STOCKS...');

    // Test Range: Jan 2026 - Feb 2026
    const startDate = '2026-01-01';
    const endDate = '2026-02-10';

    try {
        console.log(`Running runBacktestDaily for HIGH_POWERED_STOCKS ${startDate} to ${endDate}...`);
        const result = await dailyStrategy.runBacktestDaily('HIGH_POWERED_STOCKS', startDate, endDate);

        console.log('--- Result Stats ---');
        console.log(`Total Trades: ${result.stats.totalTrades}`);
        console.log(`Winners: ${result.stats.winners}`);
        console.log(`P&L: ${result.stats.totalPnl}%`);

        if (result.trades.length > 0) {
            console.log(`Example Trade: ${result.trades[0].symbol} on ${result.trades[0].date}`);
            const d = new Date(result.trades[0].date);
            const start = new Date(startDate);
            const end = new Date(endDate);

            if (d >= start && d <= end) {
                console.log('✅ Trade Date is within range.');
            } else {
                console.log('❌ Trade Date OUT OF RANGE!');
            }
        } else {
            console.log('⚠️ No trades found. Checking Skip Report...');
            if (result.skipReport && result.skipReport.data.length > 0) {
                console.log('Top 5 Skip Reasons:');
                result.skipReport.data.slice(0, 5).forEach(s => console.log(`- ${s.symbol} (${s.date}): ${s.reason} - ${JSON.stringify(s.details)}`));
            }
        }

    } catch (e) {
        console.error('❌ Error testing daily strategy:', e);
    }
}

if (require.main === module) {
    verifyDailyBacktest()
        .then(() => prisma.$disconnect())
        .catch(e => { console.error(e); prisma.$disconnect(); });
}
