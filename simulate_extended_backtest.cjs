
const { generateIntradaySignalsV21, simulateIntradayTradeV21 } = require('./chenna-CTS/backend/services/labs/intradayStrategyV2_1.cjs');
const prisma = require('./chenna-CTS/backend/lib/prisma.cjs');

const DATES_TO_TEST = [
    // December 2025 (Sample)
    '2025-12-08', '2025-12-10',
    '2025-12-15', '2025-12-17',
    '2025-12-22', '2025-12-24',

    // January 2026 (Sample)
    '2026-01-05', '2026-01-07',
    '2026-01-12', '2026-01-14',
    '2026-01-19', '2026-01-21',
    '2026-01-27', '2026-01-29'
];

const FIXED_STOCKS = [
    // Mixed Sector Basket (High Volatility)
    { symbol: 'ADANIENT', instrumentKey: 'NSE_EQ|INE742F01042' },
    { symbol: 'ADANIPORTS', instrumentKey: 'NSE_EQ|INE742F01042' },
    { symbol: 'RELIANCE', instrumentKey: 'NSE_EQ|INE002A01018' },
    { symbol: 'SBIN', instrumentKey: 'NSE_EQ|INE062A01020' },
    { symbol: 'ICICIBANK', instrumentKey: 'NSE_EQ|INE090A01021' },
    { symbol: 'INFY', instrumentKey: 'NSE_EQ|INE009A01021' },
    { symbol: 'TATASTEEL', instrumentKey: 'NSE_EQ|INE081A01012' },
    { symbol: 'BAJFINANCE', instrumentKey: 'NSE_EQ|INE296A01024' },
    { symbol: 'TATAMOTORS', instrumentKey: 'NSE_EQ|INE155A01022' },
    { symbol: 'SUNPHARMA', instrumentKey: 'NSE_EQ|INE044A01036' },
    { symbol: 'HDFCBANK', instrumentKey: 'NSE_EQ|INE040A01034' },
    { symbol: 'AXISBANK', instrumentKey: 'NSE_EQ|INE238A01034' },
    { symbol: 'TITAN', instrumentKey: 'NSE_EQ|INE280A01028' },
    { symbol: 'MARUTI', instrumentKey: 'NSE_EQ|INE585B01010' },
    { symbol: 'ULTRACEMCO', instrumentKey: 'NSE_EQ|INE481G01011' },
    { symbol: 'LT', instrumentKey: 'NSE_EQ|INE018A01030' },
    { symbol: 'WIPRO', instrumentKey: 'NSE_EQ|INE075A01022' },
    { symbol: 'TECHM', instrumentKey: 'NSE_EQ|INE669C01036' },
    { symbol: 'INDUSINDBK', instrumentKey: 'NSE_EQ|INE095A01012' },
    { symbol: 'BHARTIARTL', instrumentKey: 'NSE_EQ|INE397D01024' }
];

const STRATEGY_MODE = 'COMBO_SPEED';

async function runExtendedBacktest() {
    console.log(`--- STARTING EXTENDED BACKTEST (${STRATEGY_MODE}) ---`);
    console.log(`| Symbol | Date | Entry Time | Entry Price | Exit Time | Exit Price | Outcome | PnL% | Exit Reason |`);
    console.log(`|---|---|---|---|---|---|---|---|---|`);

    let totalSignals = 0;

    // Track per-month stats
    const monthStats = {
        '2025-12': { signals: 0, wins: 0, pnl: 0 },
        '2026-01': { signals: 0, wins: 0, pnl: 0 }
    };

    for (const date of DATES_TO_TEST) {
        const monthKey = date.substring(0, 7);
        // Single Pass with Fixed Stocks
        const cat = 'INTRADAY_BOOST';
        try {
            const res = await generateIntradaySignalsV21(cat, date, STRATEGY_MODE, true, FIXED_STOCKS);

            if (res.signals.length > 0) {
                for (const s of res.signals) {
                    const trade = await simulateIntradayTradeV21(s, date, { EXIT_TIME: '15:15' });
                    const pnl = parseFloat(trade.pnlPercent || 0);

                    console.log(`| ${s.symbol} | ${date} | ${s.entryTime} | ${s.entryPrice} | ${trade.exitTime} | ${(trade.exitPrice || 0).toFixed(2)} | ${trade.outcome} | ${pnl}% | ${trade.exitReason} |`);

                    // Update Stats
                    totalSignals++;
                    if (monthStats[monthKey]) {
                        monthStats[monthKey].signals++;
                        monthStats[monthKey].pnl += pnl;
                        if (trade.outcome === 'WIN') monthStats[monthKey].wins++;
                    }
                }
            }
        } catch (e) {
            // condense logs
        }
    }
}

if (require.main === module) {
    runExtendedBacktest()
        .then(() => prisma.$disconnect())
        .catch(e => { console.error(e); prisma.$disconnect(); });
}
