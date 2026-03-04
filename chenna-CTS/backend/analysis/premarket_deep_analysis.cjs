/**
 * PRE_MARKET Deep Analysis Script
 * 
 * Step 1-5: Comprehensive backtest with detailed trade logging and failure analysis
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const fs = require('fs');
const path = require('path');

// Import the strategy
const preMarketStrategy = require('../services/labs/preMarketStrategy.cjs');

const OUTPUT_DIR = path.join(__dirname, '.');

/**
 * Get all PRE_MARKET stocks from database (DEDUPLICATED)
 */
async function getAllPreMarketStocks() {
    const category = await prisma.category.findUnique({
        where: { key: 'PRE_MARKET' },
        include: {
            stocks: {
                include: { stock: true }
            }
        }
    });

    if (!category) {
        console.log('[Analysis] PRE_MARKET category not found!');
        return [];
    }

    // DEDUPLICATION FIX: Use Set to ensure unique symbols only
    const seen = new Set();
    const uniqueStocks = [];

    for (const sc of category.stocks) {
        if (!seen.has(sc.stock.symbol)) {
            seen.add(sc.stock.symbol);
            uniqueStocks.push({
                symbol: sc.stock.symbol,
                name: sc.stock.name,
                addedDate: sc.addedDate,
                sector: sc.stock.sector || 'UNKNOWN'
            });
        }
    }

    console.log(`[Analysis] Category has ${category.stocks.length} entries, ${uniqueStocks.length} unique stocks`);
    return uniqueStocks;
}

/**
 * Get 1-minute candles for a stock on a date
 */
async function get1MinCandles(symbol, dateStr) {
    try {
        const cached = await prisma.ohlcvCache.findFirst({
            where: { symbol, interval: '1minute' },
            orderBy: { createdAt: 'desc' }
        });

        if (!cached || !cached.data) return [];

        let candles = typeof cached.data === 'string' ? JSON.parse(cached.data) : cached.data;
        const targetDate = new Date(dateStr).toDateString();

        return candles
            .filter(c => new Date(c.timestamp || c[0]).toDateString() === targetDate)
            .map(c => Array.isArray(c) ? {
                timestamp: c[0], open: +c[1], high: +c[2], low: +c[3], close: +c[4], volume: +c[5]
            } : {
                timestamp: c.timestamp, open: +c.open, high: +c.high, low: +c.low, close: +c.close, volume: +c.volume
            })
            .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
    } catch (e) {
        return [];
    }
}

/**
 * Get previous day close
 */
async function getPreviousClose(symbol, dateStr) {
    try {
        const cached = await prisma.ohlcvCache.findFirst({
            where: { symbol, interval: 'day' },
            orderBy: { createdAt: 'desc' }
        });

        if (!cached || !cached.data) return null;

        let candles = typeof cached.data === 'string' ? JSON.parse(cached.data) : cached.data;
        candles.sort((a, b) => new Date(b.timestamp || b[0]) - new Date(a.timestamp || a[0]));

        const targetDate = new Date(dateStr);
        targetDate.setHours(0, 0, 0, 0);

        for (const candle of candles) {
            const candleDate = new Date(candle.timestamp || candle[0]);
            candleDate.setHours(0, 0, 0, 0);

            if (candleDate < targetDate) {
                return Array.isArray(candle) ? +candle[4] : +candle.close;
            }
        }
        return null;
    } catch (e) {
        return null;
    }
}

/**
 * Get 20-day average volume
 */
async function getAvgVolume20Day(symbol, dateStr) {
    try {
        const cached = await prisma.ohlcvCache.findFirst({
            where: { symbol, interval: 'day' },
            orderBy: { createdAt: 'desc' }
        });

        if (!cached || !cached.data) return null;

        let candles = typeof cached.data === 'string' ? JSON.parse(cached.data) : cached.data;
        const targetDate = new Date(dateStr);

        const prior = candles
            .filter(c => new Date(c.timestamp || c[0]) < targetDate)
            .sort((a, b) => new Date(b.timestamp || b[0]) - new Date(a.timestamp || a[0]))
            .slice(0, 20);

        if (prior.length === 0) return null;

        const totalVol = prior.reduce((sum, c) => sum + (Array.isArray(c) ? +c[5] : +c.volume), 0);
        return totalVol / prior.length;
    } catch (e) {
        return null;
    }
}

/**
 * Get Nifty trend for a date
 */
async function getNiftyTrend(dateStr) {
    try {
        const cached = await prisma.ohlcvCache.findFirst({
            where: { symbol: 'NIFTY 50', interval: 'day' },
            orderBy: { createdAt: 'desc' }
        });

        if (!cached || !cached.data) return 'UNKNOWN';

        let candles = typeof cached.data === 'string' ? JSON.parse(cached.data) : cached.data;
        const targetDate = new Date(dateStr);
        targetDate.setHours(0, 0, 0, 0);

        const todayCandle = candles.find(c => {
            const d = new Date(c.timestamp || c[0]);
            d.setHours(0, 0, 0, 0);
            return d.getTime() === targetDate.getTime();
        });

        if (!todayCandle) return 'UNKNOWN';

        const open = Array.isArray(todayCandle) ? +todayCandle[1] : +todayCandle.open;
        const close = Array.isArray(todayCandle) ? +todayCandle[4] : +todayCandle.close;
        const change = ((close - open) / open) * 100;

        if (change > 0.3) return 'BULLISH';
        if (change < -0.3) return 'BEARISH';
        return 'SIDEWAYS';
    } catch (e) {
        return 'UNKNOWN';
    }
}

/**
 * Define Opening Range for gap plays
 */
function defineOpeningRangeGap(candles, maxCandles = 15) {
    if (candles.length < 2) return null;

    const firstCandle = candles[0];
    const isFirstGreen = firstCandle.close >= firstCandle.open;

    let orHigh = firstCandle.high;
    let orLow = firstCandle.low;
    let orEndIndex = 0;

    for (let i = 1; i < Math.min(candles.length, maxCandles); i++) {
        const candle = candles[i];
        const isGreen = candle.close >= candle.open;

        if (isGreen !== isFirstGreen) {
            orEndIndex = i;
            break;
        }

        orHigh = Math.max(orHigh, candle.high);
        orLow = Math.min(orLow, candle.low);
        orEndIndex = i;
    }

    return { high: orHigh, low: orLow, endIndex: orEndIndex };
}

/**
 * Run comprehensive backtest
 */
async function runComprehensiveBacktest(startDate, endDate) {
    console.log(`\n${'='.repeat(70)}`);
    console.log(`PRE_MARKET COMPREHENSIVE BACKTEST: ${startDate} to ${endDate}`);
    console.log(`${'='.repeat(70)}\n`);

    const stocks = await getAllPreMarketStocks();
    console.log(`[Analysis] Found ${stocks.length} stocks in PRE_MARKET category`);

    if (stocks.length === 0) {
        console.log('[Analysis] No stocks found. Trying to use all stocks with 1-min data...');
        // Fallback: get all stocks with 1-min data
        const allCaches = await prisma.ohlcvCache.findMany({
            where: { interval: '1minute' },
            select: { symbol: true }
        });
        const uniqueSymbols = [...new Set(allCaches.map(c => c.symbol))];
        stocks.push(...uniqueSymbols.map(s => ({ symbol: s, name: s, sector: 'UNKNOWN' })));
        console.log(`[Analysis] Using ${stocks.length} stocks with 1-min data`);
    }

    const trades = [];
    const start = new Date(startDate);
    const end = new Date(endDate);
    let tradingDays = 0;

    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        if (d.getDay() === 0 || d.getDay() === 6) continue;

        const dateStr = d.toISOString().split('T')[0];
        tradingDays++;

        const niftyTrend = await getNiftyTrend(dateStr);

        for (const stock of stocks) {
            const candles = await get1MinCandles(stock.symbol, dateStr);
            if (candles.length < 30) continue;

            const previousClose = await getPreviousClose(stock.symbol, dateStr);
            if (!previousClose) continue;

            const avgVolume = await getAvgVolume20Day(stock.symbol, dateStr) || 100000;

            // Calculate gap
            const todayOpen = candles[0].open;
            const gapPercent = ((todayOpen - previousClose) / previousClose) * 100;

            // Only consider gap ups >= 2% (relaxed for analysis)
            if (gapPercent < 2.0 || gapPercent > 10.0) continue;

            // Define Opening Range
            const or = defineOpeningRangeGap(candles, 15);
            if (!or || or.endIndex < 2) continue;

            // Look for breakdown signal
            for (let i = or.endIndex + 1; i < Math.min(candles.length, 60); i++) {
                const candle = candles[i];
                const candleTime = new Date(candle.timestamp);
                const timeStr = candleTime.toTimeString().substring(0, 5);

                // Entry window: 9:15 - 10:00
                if (timeStr > '10:00') break;

                // Check breakdown below OR low
                if (candle.close < or.low) {
                    // Breakdown candle analysis
                    const isBearish = candle.close < candle.open;
                    const bodyHigh = Math.max(candle.open, candle.close);
                    const bodyLow = Math.min(candle.open, candle.close);
                    const bodySize = bodyHigh - bodyLow;
                    const totalRange = candle.high - candle.low;
                    const bodyPercent = totalRange > 0 ? (bodySize / totalRange) * 100 : 0;

                    // Volume at entry
                    const volumeAtEntry = candle.volume;
                    const volumeRatio = volumeAtEntry / (avgVolume / 375); // Avg per minute

                    // Entry price, target, stop
                    const entryPrice = candle.close;
                    const targetPrice = previousClose; // Gap fill
                    const stopPrice = or.high * 1.003;

                    // Simulate trade
                    let exitPrice = entryPrice;
                    let exitReason = 'EOD_EXIT';
                    let exitTime = '15:15';

                    for (let j = i + 1; j < candles.length; j++) {
                        const exitCandle = candles[j];
                        const exitCandleTime = new Date(exitCandle.timestamp);
                        const exitTimeStr = exitCandleTime.toTimeString().substring(0, 5);

                        // Stop hit
                        if (exitCandle.high >= stopPrice) {
                            exitPrice = stopPrice;
                            exitReason = 'STOP_HIT';
                            exitTime = exitTimeStr;
                            break;
                        }

                        // Target hit (gap fill)
                        if (exitCandle.low <= targetPrice) {
                            exitPrice = targetPrice;
                            exitReason = 'TARGET_HIT';
                            exitTime = exitTimeStr;
                            break;
                        }

                        // Hard exit at 10:30
                        if (exitTimeStr >= '10:30') {
                            exitPrice = exitCandle.close;
                            exitReason = 'HARD_EXIT';
                            exitTime = exitTimeStr;
                            break;
                        }

                        // EOD exit
                        if (exitTimeStr >= '15:15') {
                            exitPrice = exitCandle.close;
                            exitReason = 'EOD_EXIT';
                            exitTime = exitTimeStr;
                            break;
                        }
                    }

                    // P&L (SHORT trade)
                    const pnlPercent = ((entryPrice - exitPrice) / entryPrice) * 100;
                    const outcome = pnlPercent > 0 ? 'WIN' : 'LOSS';

                    trades.push({
                        trade_id: trades.length + 1,
                        date: dateStr,
                        symbol: stock.symbol,
                        sector: stock.sector,
                        gap_percent: gapPercent.toFixed(2),
                        previous_close: previousClose.toFixed(2),
                        today_open: todayOpen.toFixed(2),
                        or_high: or.high.toFixed(2),
                        or_low: or.low.toFixed(2),
                        entry_time: timeStr,
                        entry_price: entryPrice.toFixed(2),
                        target_price: targetPrice.toFixed(2),
                        stop_price: stopPrice.toFixed(2),
                        exit_time: exitTime,
                        exit_price: exitPrice.toFixed(2),
                        outcome,
                        exit_reason: exitReason,
                        pnl_percent: pnlPercent.toFixed(2),
                        pnl_amount: ((pnlPercent / 100) * 10000).toFixed(2), // ₹10,000 position
                        volume_at_entry: volumeAtEntry,
                        avg_volume_20day: avgVolume.toFixed(0),
                        volume_ratio: volumeRatio.toFixed(2),
                        nifty_trend: niftyTrend,
                        breakdown_candle_bearish: isBearish ? 'YES' : 'NO',
                        breakdown_candle_body_percent: bodyPercent.toFixed(0)
                    });

                    break; // One signal per stock per day
                }
            }
        }
    }

    return { trades, tradingDays };
}

/**
 * Analyze failures
 */
function analyzeFailures(trades) {
    const losses = trades.filter(t => t.outcome === 'LOSS');

    const categories = {
        FALSE_BREAKOUT: [],
        LOW_VOLUME: [],
        GAP_TOO_SMALL: [],
        GAP_TOO_LARGE: [],
        MARKET_BULLISH: [],
        WEAK_BREAKDOWN: [],
        LATE_ENTRY: [],
        STOP_TOO_TIGHT: [],
        OTHER: []
    };

    for (const trade of losses) {
        const gap = parseFloat(trade.gap_percent);
        const volRatio = parseFloat(trade.volume_ratio);
        const bodyPct = parseFloat(trade.breakdown_candle_body_percent);
        const entryTime = trade.entry_time;

        // Categorize
        if (gap < 3.0) {
            categories.GAP_TOO_SMALL.push(trade);
        } else if (gap > 6.0) {
            categories.GAP_TOO_LARGE.push(trade);
        } else if (volRatio < 1.5) {
            categories.LOW_VOLUME.push(trade);
        } else if (trade.nifty_trend === 'BULLISH') {
            categories.MARKET_BULLISH.push(trade);
        } else if (bodyPct < 50) {
            categories.WEAK_BREAKDOWN.push(trade);
        } else if (entryTime > '09:45') {
            categories.LATE_ENTRY.push(trade);
        } else if (trade.exit_reason === 'STOP_HIT') {
            categories.STOP_TOO_TIGHT.push(trade);
        } else {
            categories.OTHER.push(trade);
        }
    }

    return { totalLosses: losses.length, categories };
}

/**
 * Analyze winners
 */
function analyzeWinners(trades) {
    const wins = trades.filter(t => t.outcome === 'WIN');
    const losses = trades.filter(t => t.outcome === 'LOSS');

    const avg = (arr, key) => arr.length === 0 ? 0 : arr.reduce((s, t) => s + parseFloat(t[key]), 0) / arr.length;

    return {
        total: wins.length,
        avgGapWin: avg(wins, 'gap_percent').toFixed(2),
        avgGapLoss: avg(losses, 'gap_percent').toFixed(2),
        avgVolRatioWin: avg(wins, 'volume_ratio').toFixed(2),
        avgVolRatioLoss: avg(losses, 'volume_ratio').toFixed(2),
        avgBodyPctWin: avg(wins, 'breakdown_candle_body_percent').toFixed(0),
        avgBodyPctLoss: avg(losses, 'breakdown_candle_body_percent').toFixed(0)
    };
}

/**
 * Generate summary report
 */
function generateSummary(trades, tradingDays) {
    const wins = trades.filter(t => t.outcome === 'WIN');
    const losses = trades.filter(t => t.outcome === 'LOSS');
    const winRate = trades.length > 0 ? (wins.length / trades.length) * 100 : 0;

    const avgWin = wins.length > 0 ? wins.reduce((s, t) => s + parseFloat(t.pnl_percent), 0) / wins.length : 0;
    const avgLoss = losses.length > 0 ? losses.reduce((s, t) => s + parseFloat(t.pnl_percent), 0) / losses.length : 0;

    const grossProfit = wins.reduce((s, t) => s + parseFloat(t.pnl_percent), 0);
    const grossLoss = Math.abs(losses.reduce((s, t) => s + parseFloat(t.pnl_percent), 0));
    const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? 999 : 0;

    const totalPnl = trades.reduce((s, t) => s + parseFloat(t.pnl_percent), 0);
    const totalPnlAmount = trades.reduce((s, t) => s + parseFloat(t.pnl_amount), 0);

    return {
        tradingDays,
        totalSignals: trades.length,
        wins: wins.length,
        losses: losses.length,
        winRate: winRate.toFixed(1) + '%',
        avgWin: '+' + avgWin.toFixed(2) + '%',
        avgLoss: avgLoss.toFixed(2) + '%',
        profitFactor: profitFactor.toFixed(2),
        totalPnl: (totalPnl > 0 ? '+' : '') + totalPnl.toFixed(2) + '%',
        totalPnlAmount: '₹' + totalPnlAmount.toFixed(0)
    };
}

/**
 * Export to CSV
 */
function exportToCSV(trades, filename) {
    if (trades.length === 0) {
        console.log('[Analysis] No trades to export');
        return;
    }

    const headers = Object.keys(trades[0]);
    const rows = trades.map(t => headers.map(h => t[h]).join(','));
    const csv = [headers.join(','), ...rows].join('\n');

    const filepath = path.join(OUTPUT_DIR, filename);
    fs.writeFileSync(filepath, csv);
    console.log(`[Analysis] Exported ${trades.length} trades to ${filepath}`);
}

/**
 * Main analysis function
 */
async function runAnalysis() {
    const startDate = '2026-01-02';
    const endDate = '2026-01-21';

    console.log('\n🔍 Starting PRE_MARKET Deep Analysis...\n');

    // Step 1: Run backtest
    console.log('STEP 1: Running Comprehensive Backtest...');
    const { trades, tradingDays } = await runComprehensiveBacktest(startDate, endDate);

    if (trades.length === 0) {
        console.log('\n❌ No trades generated. Check data availability.');
        return;
    }

    // Summary
    console.log('\n' + '='.repeat(70));
    console.log('BACKTEST SUMMARY');
    console.log('='.repeat(70));
    const summary = generateSummary(trades, tradingDays);
    console.log(JSON.stringify(summary, null, 2));

    // Step 2: Export CSV
    console.log('\nSTEP 2: Exporting Trade Log...');
    exportToCSV(trades, 'premarket_CORRECTED.csv');

    // Step 3: Failure Analysis
    console.log('\nSTEP 3: Analyzing Failures...');
    const failureAnalysis = analyzeFailures(trades);
    console.log('\nFAILURE ANALYSIS:');
    console.log(`Total Losses: ${failureAnalysis.totalLosses}`);
    for (const [category, arr] of Object.entries(failureAnalysis.categories)) {
        const pct = failureAnalysis.totalLosses > 0 ? (arr.length / failureAnalysis.totalLosses * 100).toFixed(0) : 0;
        console.log(`  ${category}: ${arr.length} trades (${pct}%)`);
    }

    // Step 5: Winner Analysis
    console.log('\nSTEP 5: Analyzing Winners...');
    const winnerAnalysis = analyzeWinners(trades);
    console.log('WINNER CHARACTERISTICS:');
    console.log(`  Avg Gap (Winners): ${winnerAnalysis.avgGapWin}% vs Losers: ${winnerAnalysis.avgGapLoss}%`);
    console.log(`  Avg Volume Ratio (Winners): ${winnerAnalysis.avgVolRatioWin}x vs Losers: ${winnerAnalysis.avgVolRatioLoss}x`);
    console.log(`  Avg Body % (Winners): ${winnerAnalysis.avgBodyPctWin}% vs Losers: ${winnerAnalysis.avgBodyPctLoss}%`);

    // Generate full report
    const report = {
        summary,
        failureAnalysis: {
            totalLosses: failureAnalysis.totalLosses,
            breakdown: Object.fromEntries(
                Object.entries(failureAnalysis.categories).map(([k, v]) => [k, v.length])
            )
        },
        winnerAnalysis
    };

    fs.writeFileSync(
        path.join(OUTPUT_DIR, 'premarket_analysis_report.json'),
        JSON.stringify(report, null, 2)
    );

    console.log('\n✅ Analysis complete! Files saved to:', OUTPUT_DIR);
    console.log('  - premarket_backtest_results.csv');
    console.log('  - premarket_analysis_report.json');
}

// Run
runAnalysis()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
