/**
 * PRE_MARKET Opening Range Breakout Strategy (TradeCode)
 * 
 * CORRECT TRADECODE METHODOLOGY:
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 * 
 * PRE_MARKET stocks are added because of UNUSUAL PRE-MARKET ACTIVITY
 * (volume analysis vs last 5 days). They are NOT filtered by gap %.
 * 
 * THREE PATTERNS (adapted for daily data):
 * 
 * 1. GAP UP BULLISH (LONG):
 *    - Stock gaps UP (any amount) at open
 *    - Day closes HIGHER than open (bullish day)
 *    → LONG trade, target +3%, stop = gap fill (PDC)
 * 
 * 2. GAP DOWN REVERSAL (LONG):
 *    - Stock gaps DOWN at open
 *    - Day closes ABOVE Previous Day Close (PDC)
 *    → LONG trade (reversal), entry = PDC, target +3%, stop = day low
 * 
 * 3. GAP UP FAILED (SHORT):
 *    - Stock gaps UP >2% at open
 *    - Day closes BELOW both open AND PDC (bearish)
 *    → SHORT trade, target = PDC, stop = day high
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const fs = require('fs').promises;
const path = require('path');
const { isValidTradingDay } = require('../dataValidator.cjs');

const CONFIG = {
    name: 'PRE_MARKET_OR_BREAKOUT',
    displayName: 'Opening Range Breakout (TradeCode)',
    category: 'PRE_MARKET',

    // NO minimum gap % - stocks are in list due to unusual activity!
    // The gap % is just used to determine which pattern applies

    // Target/Stop parameters
    targetPercent: 3.0,     // +3% target for most patterns
    stopPercent: 2.0,       // 2% stop loss

    // Rules for UI display
    rules: [
        'Stock in PRE_MARKET = unusual pre-market activity detected',
        'Gap UP + Bullish close → LONG (OR breakout)',
        'Gap DOWN + Close > PDC → LONG (reversal)',
        'Gap UP >2% + Failed close → SHORT (gap fill)',
        'Mostly LONG trades (~70%), some SHORT (~30%)'
    ]
};

// NSE Trading Holidays 2024-2025 (to filter out fake data)
const NSE_HOLIDAYS = [
    // 2024 Holidays
    '2024-01-26', // Republic Day
    '2024-03-08', // Maha Shivaratri
    '2024-03-25', // Holi
    '2024-03-29', // Good Friday
    '2024-04-11', // Ugadi
    '2024-04-14', // Dr. Ambedkar Jayanti
    '2024-04-17', // Ram Navami
    '2024-04-21', // Mahavir Jayanti
    '2024-05-23', // Buddha Purnima
    '2024-06-17', // Eid-ul-Fitr
    '2024-07-17', // Muharram
    '2024-08-15', // Independence Day
    '2024-10-02', // Gandhi Jayanti
    '2024-11-01', // Diwali (Laxmi Puja)
    '2024-11-15', // Guru Nanak Jayanti
    '2024-12-25', // Christmas
    // 2025 Holidays
    '2025-01-26', // Republic Day
    '2025-02-26', // Maha Shivaratri
    '2025-03-14', // Holi
    '2025-03-31', // Eid-ul-Fitr (check actual date)
    '2025-04-10', // Mahavir Jayanti
    '2025-04-14', // Dr. Ambedkar Jayanti
    '2025-04-18', // Good Friday
    '2025-05-12', // Buddha Purnima
    '2025-08-15', // Independence Day
    '2025-08-27', // Janmashtami (approx)
    '2025-10-02', // Gandhi Jayanti
    '2025-10-20', // Dussehra
    '2025-10-21', // Diwali (Laxmi Puja)
    '2025-11-05', // Guru Nanak Jayanti
    '2025-12-25', // Christmas
];

/**
 * Check if a date is an NSE trading holiday
 */
function isNSEHoliday(dateStr) {
    return NSE_HOLIDAYS.includes(dateStr);
}


/**
 * Load daily OHLC data for a stock from CSV cache
 */
async function loadDailyData(symbol) {
    const csvPath = path.join(__dirname, '../../cache/historical', `${symbol}.csv`);

    try {
        const content = await fs.readFile(csvPath, 'utf8');
        const lines = content.trim().split('\n');

        if (lines.length < 2) return [];

        // Parse CSV (format: date,open,high,low,close,volume)
        const candles = lines.slice(1).map(line => {
            const parts = line.split(',');
            return {
                date: parts[0],
                open: parseFloat(parts[1]),
                high: parseFloat(parts[2]),
                low: parseFloat(parts[3]),
                close: parseFloat(parts[4]),
                volume: parseInt(parts[5]) || 0
            };
        }).filter(c => !isNaN(c.open) && !isNaN(c.close));

        // Sort by date ascending
        candles.sort((a, b) => new Date(a.date) - new Date(b.date));

        return candles;
    } catch (error) {
        return [];
    }
}

/**
 * Analyze PRE_MARKET stock for TradeCode patterns
 * 
 * THREE PATTERNS:
 * 1. GAP_UP_BULLISH (LONG) - Gap up + bullish close
 * 2. GAP_DOWN_REVERSAL (LONG) - Gap down but closes above PDC
 * 3. GAP_UP_FAILED (SHORT) - Gap up >2% but closes below PDC
 * 
 * @param {Object} today - Today's OHLC
 * @param {Object} yesterday - Yesterday's OHLC (PDC = Previous Day Close)
 * @returns {Object|null} - Trade result or null if no pattern matches
 */
function analyzePreMarketPattern(today, yesterday) {
    if (!today || !yesterday) return null;

    // Validate trading day
    const dayCheck = isValidTradingDay(today.date);
    if (!dayCheck.valid) return null;

    const prevClose = yesterday.close;  // PDC - Previous Day Close
    const todayOpen = today.open;
    const todayClose = today.close;
    const todayHigh = today.high;
    const todayLow = today.low;

    // Calculate gap percentage
    const gapPercent = ((todayOpen - prevClose) / prevClose) * 100;

    // Calculate day's performance
    const dayChange = ((todayClose - todayOpen) / todayOpen) * 100;
    const closeVsPDC = ((todayClose - prevClose) / prevClose) * 100;

    let pattern = null;
    let direction = null;
    let entryPrice = null;
    let targetPrice = null;
    let stopPrice = null;
    let reason = null;

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // PATTERN 1: GAP UP BULLISH (LONG)
    // Gap UP + Bullish close (close > open)
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    if (gapPercent > 0 && todayClose > todayOpen) {
        pattern = 'GAP_UP_BULLISH';
        direction = 'LONG';
        entryPrice = todayOpen;
        targetPrice = todayOpen * (1 + CONFIG.targetPercent / 100);  // +3%
        stopPrice = prevClose;  // Stop at gap fill (PDC)
        reason = `Gap Up ${gapPercent.toFixed(1)}% + Bullish close`;
    }

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // PATTERN 2: GAP DOWN REVERSAL (LONG)
    // Gap DOWN + Close ABOVE PDC (reversal)
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    else if (gapPercent < 0 && todayClose > prevClose) {
        pattern = 'GAP_DOWN_REVERSAL';
        direction = 'LONG';
        entryPrice = prevClose;  // Entry at PDC cross
        targetPrice = prevClose * (1 + CONFIG.targetPercent / 100);  // +3%
        stopPrice = todayLow;  // Stop at day's low
        reason = `Gap Down ${gapPercent.toFixed(1)}% + Reversed above PDC`;
    }

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // PATTERN 3: GAP UP FAILED (SHORT)
    // Gap UP >2% + Close BELOW PDC (failed gap)
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    else if (gapPercent >= 2 && todayClose < prevClose) {
        pattern = 'GAP_UP_FAILED';
        direction = 'SHORT';
        entryPrice = todayOpen;
        targetPrice = prevClose;  // Gap fill = target
        stopPrice = todayHigh;  // Stop at day's high
        reason = `Gap Up ${gapPercent.toFixed(1)}% FAILED - closed below PDC`;
    }

    // No pattern matched
    if (!pattern) return null;

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // CALCULATE OUTCOME
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    let outcome, exitPrice, exitReason, pnl;

    if (direction === 'LONG') {
        const targetHit = todayHigh >= targetPrice;
        const stopHit = todayLow <= stopPrice;

        if (targetHit && stopHit) {
            // Both hit - assume stop hit first (conservative)
            outcome = 'LOSS';
            exitPrice = stopPrice;
            exitReason = 'STOP_HIT';
            pnl = ((exitPrice - entryPrice) / entryPrice) * 100;
        } else if (targetHit) {
            outcome = 'WIN';
            exitPrice = targetPrice;
            exitReason = 'TARGET_HIT';
            pnl = ((exitPrice - entryPrice) / entryPrice) * 100;
        } else if (stopHit) {
            outcome = 'LOSS';
            exitPrice = stopPrice;
            exitReason = 'STOP_HIT';
            pnl = ((exitPrice - entryPrice) / entryPrice) * 100;
        } else {
            // Neither hit - exit at close
            exitPrice = todayClose;
            exitReason = 'EOD';
            pnl = ((exitPrice - entryPrice) / entryPrice) * 100;
            outcome = pnl > 0 ? 'WIN' : 'LOSS';
        }
    } else {
        // SHORT trade
        const targetHit = todayLow <= targetPrice;
        const stopHit = todayHigh >= stopPrice;

        if (targetHit && stopHit) {
            outcome = 'LOSS';
            exitPrice = stopPrice;
            exitReason = 'STOP_HIT';
            pnl = ((entryPrice - exitPrice) / entryPrice) * 100;
        } else if (targetHit) {
            outcome = 'WIN';
            exitPrice = targetPrice;
            exitReason = 'TARGET_HIT';
            pnl = ((entryPrice - exitPrice) / entryPrice) * 100;
        } else if (stopHit) {
            outcome = 'LOSS';
            exitPrice = stopPrice;
            exitReason = 'STOP_HIT';
            pnl = ((entryPrice - exitPrice) / entryPrice) * 100;
        } else {
            exitPrice = todayClose;
            exitReason = 'EOD';
            pnl = ((entryPrice - exitPrice) / entryPrice) * 100;
            outcome = pnl > 0 ? 'WIN' : 'LOSS';
        }
    }

    return {
        date: today.date,
        signal: true,
        pattern,
        direction,
        gapPercent: (gapPercent > 0 ? '+' : '') + gapPercent.toFixed(2) + '%',
        closeVsPDC: (closeVsPDC > 0 ? '+' : '') + closeVsPDC.toFixed(2) + '%',
        entryPrice: entryPrice.toFixed(2),
        targetPrice: targetPrice.toFixed(2),
        stopPrice: stopPrice.toFixed(2),
        exitPrice: exitPrice.toFixed(2),
        outcome,
        exitReason,
        reason,
        pnl: (pnl > 0 ? '+' : '') + pnl.toFixed(2) + '%'
    };
}

/**
 * Get PRE_MARKET stocks from database WITH their added dates
 * CRITICAL: For intraday categories, stocks are only valid on their addedDate
 */
async function getPreMarketStocks() {
    const category = await prisma.category.findUnique({
        where: { key: 'PRE_MARKET' },
        include: {
            stocks: {
                include: { stock: true }
            }
        }
    });

    if (!category) return [];

    return category.stocks.map(cs => ({
        symbol: cs.stock.symbol,
        name: cs.stock.name,
        // addedDate is the ONLY date this stock is valid for trading
        addedDate: cs.addedDate ? cs.addedDate.toISOString().split('T')[0] : null
    }));
}

/**
 * Run full backtest for all PRE_MARKET stocks
 */
async function runFullBacktest(startDate = null, endDate = null) {
    console.log('═'.repeat(60));
    console.log('PRE_MARKET OPENING RANGE BREAKOUT');
    console.log('TradeCode Methodology');
    console.log('═'.repeat(60));

    console.log('\nPATTERNS:');
    console.log('  1. GAP_UP_BULLISH → LONG (gap up + bullish close)');
    console.log('  2. GAP_DOWN_REVERSAL → LONG (gap down + close > PDC)');
    console.log('  3. GAP_UP_FAILED → SHORT (gap up >2% + close < PDC)');
    console.log(`\n  Target: +${CONFIG.targetPercent}%  |  Stop: ${CONFIG.stopPercent}%`);

    const stocks = await getPreMarketStocks();
    console.log(`\nStocks to test: ${stocks.length}`);
    console.log(`\nIMPORTANT: Each stock is only valid on its addedDate!`);

    const allTrades = [];
    let stocksWithData = 0;
    let stocksWithoutData = 0;
    let stocksNoAddedDate = 0;
    let stocksNoDataForAddedDate = 0;

    for (const stock of stocks) {
        // CRITICAL: For intraday categories, stock is ONLY valid on addedDate
        if (!stock.addedDate) {
            stocksNoAddedDate++;
            continue;
        }

        const candles = await loadDailyData(stock.symbol);

        if (candles.length < 2) {
            stocksWithoutData++;
            continue;
        }

        stocksWithData++;

        // Find the candle for the addedDate
        const addedDateIdx = candles.findIndex(c => c.date === stock.addedDate);

        if (addedDateIdx < 1) {
            // No data for addedDate, or it's the first candle (no previous day)
            stocksNoDataForAddedDate++;
            continue;
        }

        const today = candles[addedDateIdx];
        const yesterday = candles[addedDateIdx - 1];

        // Analyze for TradeCode patterns on this specific date
        const trade = analyzePreMarketPattern(today, yesterday);

        if (trade) {
            trade.symbol = stock.symbol;
            trade.addedDate = stock.addedDate;
            allTrades.push(trade);
        }
    }

    console.log(`\nStocks with data: ${stocksWithData}`);
    console.log(`Stocks without data: ${stocksWithoutData}`);
    console.log(`Stocks without addedDate: ${stocksNoAddedDate}`);
    console.log(`Stocks with no data for addedDate: ${stocksNoDataForAddedDate}`);

    // Pattern breakdown
    const gapUpBullish = allTrades.filter(t => t.pattern === 'GAP_UP_BULLISH');
    const gapDownReversal = allTrades.filter(t => t.pattern === 'GAP_DOWN_REVERSAL');
    const gapUpFailed = allTrades.filter(t => t.pattern === 'GAP_UP_FAILED');

    // Calculate statistics
    const winners = allTrades.filter(t => t.outcome === 'WIN');
    const losers = allTrades.filter(t => t.outcome === 'LOSS');
    const winRate = allTrades.length > 0 ? (winners.length / allTrades.length) * 100 : 0;

    const avgWin = winners.length > 0
        ? winners.reduce((sum, t) => sum + parseFloat(t.pnl), 0) / winners.length
        : 0;
    const avgLoss = losers.length > 0
        ? losers.reduce((sum, t) => sum + parseFloat(t.pnl), 0) / losers.length
        : 0;

    const totalPnl = allTrades.reduce((sum, t) => sum + parseFloat(t.pnl), 0);

    // Exit reason breakdown
    const targetHits = allTrades.filter(t => t.exitReason === 'TARGET_HIT').length;
    const stopHits = allTrades.filter(t => t.exitReason === 'STOP_HIT').length;
    const eodExits = allTrades.filter(t => t.exitReason === 'EOD').length;

    // Count trades per symbol
    const tradesBySymbol = {};
    for (const trade of allTrades) {
        tradesBySymbol[trade.symbol] = (tradesBySymbol[trade.symbol] || 0) + 1;
    }
    const multiTradeStocks = Object.entries(tradesBySymbol)
        .filter(([_, count]) => count > 1)
        .sort((a, b) => b[1] - a[1]);

    console.log('\n' + '═'.repeat(60));
    console.log('RESULTS BY PATTERN');
    console.log('═'.repeat(60));

    console.log(`\nTotal Signals: ${allTrades.length}`);
    console.log(`\n  LONG patterns:`);
    console.log(`    ├─ GAP_UP_BULLISH: ${gapUpBullish.length}`);
    console.log(`    └─ GAP_DOWN_REVERSAL: ${gapDownReversal.length}`);
    console.log(`\n  SHORT patterns:`);
    console.log(`    └─ GAP_UP_FAILED: ${gapUpFailed.length}`);
    console.log(`\nWinners: ${winners.length} (${winRate.toFixed(1)}%)`);
    console.log(`Losers: ${losers.length}`);
    console.log(`\nExit Breakdown:`);
    console.log(`  Target Hit: ${targetHits}`);
    console.log(`  Stop Hit: ${stopHits}`);
    console.log(`  EOD Exit: ${eodExits}`);
    console.log(`\nP&L Statistics:`);
    console.log(`  Average Win: +${avgWin.toFixed(2)}%`);
    console.log(`  Average Loss: ${avgLoss.toFixed(2)}%`);
    console.log(`  Total P&L: ${totalPnl.toFixed(2)}%`);

    // Expectancy
    const expectancy = (winRate / 100 * avgWin) + ((100 - winRate) / 100 * avgLoss);
    console.log(`  Expectancy: ${expectancy.toFixed(3)}% per trade`);

    // Explain trade count vs stock count
    if (multiTradeStocks.length > 0) {
        console.log('\n' + '─'.repeat(60));
        console.log('WHY MORE TRADES THAN STOCKS?');
        console.log('─'.repeat(60));
        console.log(`\nUnique stocks: ${Object.keys(tradesBySymbol).length}`);
        console.log(`Total trades: ${allTrades.length}`);
        console.log(`\nStocks with multiple gap signals:`);
        multiTradeStocks.slice(0, 5).forEach(([symbol, count]) => {
            const dates = allTrades
                .filter(t => t.symbol === symbol)
                .map(t => t.date)
                .join(', ');
            console.log(`  ${symbol}: ${count} trades (${dates})`);
        });
    }

    console.log('\n' + '═'.repeat(60));
    console.log('CONCLUSION');
    console.log('═'.repeat(60));

    // Use expectancy (positive edge) as primary metric, not just win rate
    if (expectancy > 0 && totalPnl > 0) {
        console.log('✅ OPENING RANGE BREAKOUT STRATEGY WORKS for PRE_MARKET');
        console.log(`   Positive expectancy: +${expectancy.toFixed(3)}% per trade`);
    } else if (expectancy > -0.1) {
        console.log('⚠️  STRATEGY MARGINAL for PRE_MARKET');
        console.log('   Needs more data to confirm edge.');
    } else {
        console.log('❌ STRATEGY UNPROFITABLE for PRE_MARKET');
        console.log('   Negative expectancy - adjust parameters.');
    }

    return {
        trades: allTrades,
        stats: {
            totalTrades: allTrades.length,
            winners: winners.length,
            losers: losers.length,
            winRate,
            avgWin,
            avgLoss,
            totalPnl,
            expectancy,
            exitBreakdown: {
                targetHit: targetHits,
                stopHit: stopHits,
                eod: eodExits
            }
        }
    };
}

/**
 * Generate signal for a specific stock on a specific date
 * (For live signal generation)
 */
async function generateSignal(symbol, ohlcData, context = {}) {
    if (!ohlcData || ohlcData.length < 2) return null;

    const today = ohlcData[ohlcData.length - 1];
    const yesterday = ohlcData[ohlcData.length - 2];

    const result = analyzeGapFill(today, yesterday);

    if (!result) return null;

    return {
        symbol,
        category: CONFIG.category,
        strategy: CONFIG.name,
        strategyDisplay: CONFIG.displayName,
        direction: CONFIG.direction,
        entryPrice: parseFloat(result.entryPrice),
        targetPrice: parseFloat(result.targetPrice),
        stopPrice: parseFloat(result.stopPrice),
        gapPercent: parseFloat(result.gapPercent),
        reason: `Gap Up +${result.gapPercent}% - SHORT for gap fill to ${result.targetPrice}`,
        confidence: calculateConfidence(parseFloat(result.gapPercent)),
        timestamp: new Date().toISOString()
    };
}

/**
 * Calculate confidence based on gap size
 */
function calculateConfidence(gapPercent) {
    // Smaller gaps (3-5%) are more likely to fill
    if (gapPercent >= 3 && gapPercent <= 5) return 75;
    if (gapPercent > 5 && gapPercent <= 7) return 65;
    if (gapPercent > 7) return 55;
    return 50;
}

/**
 * Get strategy configuration for UI
 */
function getConfig() {
    return CONFIG;
}

module.exports = {
    CONFIG,
    generateSignal,
    getConfig,
    runFullBacktest,
    analyzePreMarketPattern,
    loadDailyData,
    getPreMarketStocks
};

// Run backtest if called directly
if (require.main === module) {
    runFullBacktest()
        .then(() => process.exit(0))
        .catch(err => {
            console.error(err);
            process.exit(1);
        });
}
