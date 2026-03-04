/**
 * Backtest API Routes
 * 
 * Endpoints for time-travel backtest functionality
 */

const express = require('express');
const router = express.Router();
const backtestEngine = require('../services/labs/backtestEngine.cjs');
const prisma = require('../lib/prisma.cjs');

// Import V2.1 strategy for direct backtest
let backtestIntradayV21 = null;
try {
    const v21 = require('../services/labs/intradayStrategyV2_1.cjs');
    backtestIntradayV21 = v21.backtestIntradayV21;
    console.log('[Backtest API] V2.1 strategy loaded ✅');
} catch (e) {
    console.log('[Backtest API] V2.1 strategy not available:', e.message);
}

/**
 * POST /api/backtest/run
 * Run V2.1 time-travel backtest directly
 * This is the main endpoint for the dashboard backtest button
 * 
 * Execution Modes:
 * - perfect: Take all signals (unlimited capital)
 * - capital_lock: Capital locked until trade closes
 * - max_1_position: Only 1 trade at a time
 * - max_3_positions: Up to 3 concurrent trades
 */
router.post('/run', async (req, res) => {
    try {
        const {
            category,
            startDate,
            endDate,
            capital = 100000,
            positionSize = 10000,
            executionMode = 'perfect'
        } = req.body;

        const applyQualityFilter = req.body.applyQualityFilter === true;
        console.log('[Backtest API] V2.1 Run requested:', { category, startDate, endDate, executionMode, applyQualityFilter, dataMode: req.body.dataMode });

        if (!category) {
            return res.status(400).json({ status: 'error', message: 'Missing category' });
        }

        if (!startDate || !endDate) {
            return res.status(400).json({ status: 'error', message: 'Missing startDate or endDate' });
        }

        if (!backtestIntradayV21) {
            return res.status(500).json({ status: 'error', message: 'V2.1 strategy not available' });
        }

        // SWING STRATEGY ROUTING
        if (category.includes('SWING')) {
            let swingStrategy = null;
            if (category === 'SHORT_TERM_SWING_BO_UP') swingStrategy = require('../services/labs/shortTermSwingBoUpStrategy.cjs');
            else if (category === 'SHORT_TERM_SWING_BO_DOWN') swingStrategy = require('../services/labs/shortTermSwingBoDownStrategy.cjs');
            else if (category === 'LONG_TERM_SWING_BO_UP') swingStrategy = require('../services/labs/longTermSwingBoUpStrategy.cjs');
            else if (category === 'LONG_TERM_SWING_BO_DOWN') swingStrategy = require('../services/labs/longTermSwingBoDownStrategy.cjs');

            if (swingStrategy) {
                console.log(`[Backtest API] Routing ${category} to specific Swing Strategy file...`);
                // Run Backtest
                const swingResult = await swingStrategy.backtest(startDate, endDate);

                // Transform Results
                const transformedTrades = swingResult.trades.map(t => ({
                    date: t.entryDate || t.date,
                    signalDate: t.signalDate || t.date,
                    entryDate: t.entryDate || t.date,
                    symbol: t.symbol,
                    entryTime: '09:15',
                    entryPrice: parseFloat(t.entryPrice),
                    targetPrice: parseFloat(t.targetPrice),
                    stopPrice: parseFloat(t.stopPrice),
                    exitTime: '15:30',
                    exitPrice: parseFloat(t.exitPrice),
                    exitReason: t.exitReason,
                    outcome: t.outcome,
                    pnlPercent: parseFloat(t.pnlPercent),
                    holdDays: t.holdDays || 0,
                    orRange: 'N/A',
                    enhancedChecks: 'N/A',
                    confidence: t.confidence >= 80 ? 'HIGH' : t.confidence >= 60 ? 'MEDIUM' : 'LOW',
                    warnings: [],
                    strategy: t.strategy
                }));

                const totalTrades = swingResult.stats.totalTrades;
                const winRate = swingResult.stats.winRate;
                const winners = transformedTrades.filter(t => t.outcome === 'WIN').length;
                const losers = transformedTrades.filter(t => t.outcome === 'LOSS').length;
                const totalPnL = transformedTrades.reduce((sum, t) => sum + t.pnlPercent, 0);

                return res.json({
                    status: 'success',
                    category: category,
                    strategy: swingStrategy.CONFIG ? swingStrategy.CONFIG.displayName : category,
                    version: 'SWING-V1',
                    executionMode: executionMode,
                    period: { startDate, endDate },
                    results: {
                        trades: totalTrades,
                        winners: winners,
                        losers: losers,
                        winRate: winRate,
                        totalPnL: totalPnL,
                        avgPnL: totalTrades > 0 ? totalPnL / totalTrades : 0,
                        skippedTrades: 0,
                        skippedReasons: [],
                        tradeList: transformedTrades,
                        skipReport: [] // No skip report for Swing yet
                    }
                });
            }
        }

        // MULTI STRATEGY ROUTING
        if (category.includes('MULTI')) {
            let multiStrategy = null;
            if (category === 'MULTI_SUPPORT_BO') multiStrategy = require('../services/labs/multiSupportBoStrategy.cjs');
            else if (category === 'MULTI_RESISTANCE_BO') multiStrategy = require('../services/labs/multiResistanceBoStrategy.cjs');

            if (multiStrategy) {
                console.log(`[Backtest API] Routing ${category} to specific Multi Strategy file...`);
                const multiResult = await multiStrategy.backtest(startDate, endDate);

                const transformedTrades = multiResult.trades.map(t => ({
                    date: t.entryDate || t.date,
                    signalDate: t.signalDate || t.date,
                    entryDate: t.entryDate || t.date,
                    symbol: t.symbol,
                    entryTime: '09:15',
                    entryPrice: parseFloat(t.entryPrice),
                    targetPrice: parseFloat(t.targetPrice),
                    stopPrice: parseFloat(t.stopPrice),
                    exitTime: '15:30',
                    exitPrice: parseFloat(t.exitPrice),
                    exitReason: t.exitReason,
                    outcome: t.outcome,
                    pnlPercent: parseFloat(t.pnlPercent),
                    holdDays: t.holdDays || 0,
                    orRange: 'N/A',
                    enhancedChecks: 'N/A',
                    confidence: t.confidence >= 80 ? 'HIGH' : t.confidence >= 60 ? 'MEDIUM' : 'LOW',
                    warnings: [],
                    strategy: t.strategy
                }));

                const totalTrades = multiResult.stats.totalTrades;
                const winRate = multiResult.stats.winRate;
                const winners = transformedTrades.filter(t => t.outcome === 'WIN').length;
                const losers = transformedTrades.filter(t => t.outcome === 'LOSS').length;
                const totalPnL = transformedTrades.reduce((sum, t) => sum + t.pnlPercent, 0);

                return res.json({
                    status: 'success',
                    category: category,
                    strategy: multiStrategy.CONFIG ? multiStrategy.CONFIG.displayName : category,
                    version: 'MULTI-V1',
                    executionMode: executionMode,
                    period: { startDate, endDate },
                    results: {
                        trades: totalTrades,
                        winners: winners,
                        losers: losers,
                        winRate: winRate,
                        totalPnL: totalPnL,
                        avgPnL: totalTrades > 0 ? totalPnL / totalTrades : 0,
                        skippedTrades: 0,
                        skippedReasons: [],
                        tradeList: transformedTrades,
                        skipReport: []
                    }
                });
            }
        }

        const intradayDaily = require('../services/labs/intradayBoostDailyStrategy.cjs');

        // Check for Data Mode (1minute vs 1day)
        const dataMode = req.body.dataMode || (req.body.useAllData ? '1day' : '1minute');

        if (dataMode === '1day' && ['INTRADAY_BOOST', 'HIGH_POWERED_STOCKS'].includes(category)) {
            console.log(`[Backtest API] Switching to DAILY DATA backtest for ${category} (${startDate} to ${endDate})`);

            // Run the Daily Strategy Backtest with Date Range!
            const dailyResult = await intradayDaily.runBacktestDaily(category, startDate, endDate);

            // Transform result to match V2.1 format expected by frontend
            const transformedTrades = dailyResult.trades.map((t, i) => ({
                date: t.date,
                symbol: t.symbol,
                entryTime: '09:15', // Daily candles imply open
                entryPrice: parseFloat(t.entryPrice),
                targetPrice: parseFloat(t.targetPrice),
                stopPrice: parseFloat(t.stopPrice),
                exitTime: t.exitReason === 'EOD' ? '15:30' : 'Unknown',
                exitPrice: parseFloat(t.exitPrice),
                exitReason: t.exitReason,
                outcome: t.outcome,
                pnlPercent: parseFloat(t.pnl.replace('%', '').replace('+', '')),
                orRange: '0.00',
                enhancedChecks: 2
            }));

            const winners = dailyResult.stats.winners;
            const totalTrades = dailyResult.stats.totalTrades;
            const totalPnL = dailyResult.stats.totalPnl;
            const winRate = dailyResult.stats.winRate;

            return res.json({
                status: 'success',
                category: category,
                strategy: 'N-Pattern (Daily Proxy)',
                version: 'V2.1-DAILY',
                executionMode: executionMode,
                period: { startDate, endDate },
                results: {
                    trades: totalTrades,
                    winners: winners,
                    losers: dailyResult.stats.losers,
                    winRate: winRate,
                    totalPnL: totalPnL,
                    avgPnL: dailyResult.stats.avgWin || (totalTrades > 0 ? totalPnL / totalTrades : 0),
                    skippedTrades: 0,
                    skippedReasons: [],
                    tradeList: transformedTrades,
                    skipReport: dailyResult.skipReport // Pass detailed skip report
                }
            });
        }

        // Run V2.1 backtest (Standard Date Range)
        const result = await backtestIntradayV21(category, startDate, endDate);

        // Apply quality filter if requested (matches live trading behavior)
        let qualityFilteredCount = 0;

        // Debug: Log confidence values on all trades
        console.log(`[Backtest API] Quality filter enabled: ${applyQualityFilter}`);
        console.log(`[Backtest API] Total trades from engine: ${result.trades?.length || 0}`);
        if (result.trades && result.trades.length > 0) {
            const confBreakdown = {};
            result.trades.forEach(t => {
                const c = t.confidence || 'NONE';
                confBreakdown[c] = (confBreakdown[c] || 0) + 1;
            });
            console.log('[Backtest API] Confidence breakdown:', confBreakdown);
        }

        if (applyQualityFilter && result.trades && result.trades.length > 0) {
            const beforeCount = result.trades.length;
            result.trades = result.trades.filter(t => {
                const conf = (t.confidence || '').toUpperCase();
                // Skip LOW/AVOID confidence
                if (conf === 'LOW' || conf === 'AVOID') {
                    console.log(`[Quality Filter] REMOVING ${t.symbol} (${t.date}) - confidence: ${conf}`);
                    return false;
                }
                // Skip AGAINST_TREND signals
                if (t.warnings && Array.isArray(t.warnings) && t.warnings.includes('AGAINST_TREND')) {
                    console.log(`[Quality Filter] REMOVING ${t.symbol} (${t.date}) - AGAINST_TREND`);
                    return false;
                }
                return true;
            });
            qualityFilteredCount = beforeCount - result.trades.length;
            console.log(`[Backtest API] Quality filter result: removed ${qualityFilteredCount}/${beforeCount} trades, keeping ${result.trades.length}`);
        }

        // Apply execution mode filter to trades
        let filteredTrades = result.trades || [];
        let skippedTrades = [];

        if (executionMode !== 'perfect' && filteredTrades.length > 0) {
            // Sort trades by date and entry time
            filteredTrades.sort((a, b) => {
                if (a.date !== b.date) return a.date.localeCompare(b.date);
                return (a.entryTime || '10:00').localeCompare(b.entryTime || '10:00');
            });

            const executedTrades = [];
            let activePositions = 0;
            let capitalLocked = 0;

            const maxPositions = executionMode === 'max_1_position' ? 1 :
                executionMode === 'max_3_positions' ? 3 : 999;

            for (const trade of filteredTrades) {
                // For intraday: all trades close same day
                // Check if we can take this trade based on mode

                if (executionMode === 'capital_lock') {
                    // Check if we have enough free capital
                    if (capitalLocked + positionSize <= capital) {
                        capitalLocked += positionSize;
                        executedTrades.push(trade);
                        // Capital released at end of day (intraday)
                    } else {
                        skippedTrades.push({ ...trade, skipReason: 'Capital locked' });
                    }
                } else if (executionMode === 'max_1_position' || executionMode === 'max_3_positions') {
                    // Simple position count check per day
                    const sameDayTrades = executedTrades.filter(t => t.date === trade.date);
                    if (sameDayTrades.length < maxPositions) {
                        executedTrades.push(trade);
                    } else {
                        skippedTrades.push({ ...trade, skipReason: `Max ${maxPositions} positions per day` });
                    }
                }
            }

            filteredTrades = executedTrades;
        }

        // Recalculate stats based on filtered trades (always calculate, even for 'perfect' mode)
        const winners = filteredTrades.filter(t => t.outcome === 'WIN').length;
        const totalTrades = filteredTrades.length;
        const totalPnL = filteredTrades.reduce((sum, t) => sum + (parseFloat(t.pnlPercent) || 0), 0);
        const winRate = totalTrades > 0 ? (winners / totalTrades * 100) : 0;

        console.log('[Backtest API] V2.1 Result (mode: ' + executionMode + '):', {
            totalTrades: totalTrades,
            skipped: skippedTrades.length,
            winRate: (typeof winRate === 'number' ? winRate.toFixed(1) : '0') + '%',
            pnl: (typeof totalPnL === 'number' ? totalPnL.toFixed(2) : '0') + '%'
        });

        // Format response for frontend
        res.json({
            status: 'success',
            category: category,
            strategy: 'N-Pattern Detection',
            version: 'V2.1',
            executionMode: executionMode,
            period: { startDate, endDate },
            results: {
                trades: totalTrades,
                winners: winners,
                losers: totalTrades - winners,
                winRate: winRate,
                totalPnL: totalPnL,
                avgPnL: totalTrades > 0 ? (totalPnL / totalTrades) : 0,
                confidenceMetrics: result.confidenceMetrics, // Pass metrics to frontend
                skippedTrades: skippedTrades.length,
                qualityFiltered: qualityFilteredCount,
                skippedReasons: skippedTrades.map(t => ({ symbol: t.symbol, reason: t.skipReason })),
                tradeList: filteredTrades.map(t => ({
                    date: t.date,
                    symbol: t.symbol,
                    entryTime: t.entryTime,
                    entryPrice: t.entryPrice,
                    targetPrice: t.targetPrice,
                    stopPrice: t.stopPrice,
                    exitTime: t.exitTime,
                    exitPrice: t.exitPrice,
                    exitReason: t.exitReason,
                    outcome: t.outcome,
                    pnlPercent: t.pnlPercent,
                    orRange: t.orRange,
                    enhancedChecks: t.enhancedChecks,
                    // Quality Fields
                    confidence: t.confidence,
                    qualityScore: t.qualityScore,
                    qualityFactors: t.qualityFactors,
                    warnings: t.warnings
                }))
            }
        });

    } catch (error) {
        console.error('[Backtest API] V2.1 Run error:', error);
        res.status(500).json({ status: 'error', message: error.message });
    }
});
/**
 * POST /api/backtest/run-full
 * Run backtest on ALL available data for a category
 * Uses TradeCode-based strategy (e.g., preMarketDailyStrategy for PRE_MARKET)
 */
router.post('/run-full', async (req, res) => {
    try {
        const { category } = req.body;

        console.log('[Backtest API] Full backtest requested for:', category);

        if (!category) {
            return res.status(400).json({ status: 'error', message: 'Missing category' });
        }

        // Use appropriate strategy based on category
        let strategyModule;
        try {
            if (category === 'PRE_MARKET') {
                strategyModule = require('../services/labs/preMarketDailyStrategy.cjs');
            } else {
                // Default fallback - extend for other categories
                return res.status(400).json({
                    status: 'error',
                    message: `Full backtest not yet implemented for ${category}. Only PRE_MARKET supported.`
                });
            }
        } catch (e) {
            return res.status(500).json({ status: 'error', message: 'Strategy not found: ' + e.message });
        }

        // Run the full backtest
        const results = await strategyModule.runFullBacktest();

        // Format trades for CSV download
        const csvHeader = 'Trade#,Date,Symbol,Direction,Gap%,Entry,Target,Stop,Exit,ExitReason,PnL%,Outcome';
        const csvRows = results.trades.map((t, i) =>
            `${i + 1},${t.date},${t.symbol},${t.direction},${t.gapPercent},${t.entryPrice},${t.targetPrice},${t.stopPrice},${t.exitPrice},${t.exitReason},${t.pnl},${t.outcome}`
        );
        const csvContent = [csvHeader, ...csvRows].join('\n');

        res.json({
            status: 'success',
            category,
            strategy: strategyModule.CONFIG,
            summary: {
                period: results.stats.period || 'All available data',
                totalTrades: results.stats.totalTrades,
                winners: results.stats.winners,
                losers: results.stats.losers,
                winRate: parseFloat(results.stats.winRate.toFixed(1)),
                avgWin: parseFloat(results.stats.avgWin.toFixed(2)),
                avgLoss: parseFloat(results.stats.avgLoss.toFixed(2)),
                totalPnL: parseFloat(results.stats.totalPnl.toFixed(2)),
                expectancy: parseFloat(results.stats.expectancy.toFixed(3))
            },
            exitBreakdown: results.stats.exitBreakdown,
            trades: results.trades.map((t, i) => ({
                tradeNo: i + 1,
                date: t.date,
                symbol: t.symbol,
                direction: t.direction,
                gapPercent: parseFloat(t.gapPercent),
                entryPrice: parseFloat(t.entryPrice),
                targetPrice: parseFloat(t.targetPrice),
                stopPrice: parseFloat(t.stopPrice),
                exitPrice: parseFloat(t.exitPrice),
                exitReason: t.exitReason,
                pnl: parseFloat(t.pnl),
                outcome: t.outcome
            })),
            csv: csvContent
        });

    } catch (error) {
        console.error('[Backtest API] Full backtest error:', error);
        res.status(500).json({ status: 'error', message: error.message });
    }
});


/**
 * POST /api/backtest/start
 * Start a new backtest run
 */

router.post('/start', async (req, res) => {
    console.log("!!! [DEBUG] /api/backtest/start HIT !!!");
    try {
        const {
            categoryKey,
            strategyVersion = 'V1.0',
            startDate,
            endDate,
            startingCapital = 100000,
            positionSizing = { type: 'fixed', amount: 10000 },
            executionMode = 'perfect'
        } = req.body;

        if (!categoryKey) {
            return res.status(400).json({ error: 'categoryKey is required' });
        }

        if (!startDate || !endDate) {
            return res.status(400).json({ error: 'startDate and endDate are required' });
        }

        console.log(`[Backtest API] Starting backtest for ${categoryKey}`);
        console.log(`[Backtest API] Period: ${startDate} to ${endDate}`);
        console.log(`[Backtest API] Capital: ₹${startingCapital}, Mode: ${executionMode}`);

        const run = await backtestEngine.startBacktest({
            categoryKey,
            strategyVersion,
            startDate,
            endDate,
            startingCapital,
            positionSizing,
            executionMode
        });

        res.json({
            success: true,
            backtestId: run.id,
            message: 'Backtest started'
        });
    } catch (error) {
        console.error('[Backtest API] Start error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * GET /api/backtest/status/:id
 * Get backtest progress (polled by frontend TimeTravelBacktestModal)
 */
router.get('/status/:id', async (req, res) => {
    try {
        const progress = await backtestEngine.getProgress(req.params.id);
        if (!progress) {
            return res.status(404).json({ success: false, error: 'Backtest not found' });
        }
        res.json({ success: true, progress });
    } catch (error) {
        console.error('[Backtest API] Status error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * GET /api/backtest/results/:id
 * Get full backtest results after completion
 */
router.get('/results/:id', async (req, res) => {
    try {
        const data = await backtestEngine.getResults(req.params.id);
        if (!data || !data.run) {
            return res.status(404).json({ success: false, error: 'Results not found' });
        }
        res.json({ success: true, data });
    } catch (error) {
        console.error('[Backtest API] Results error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * GET /api/backtest/data-availability/:category
 * Get data availability info for a category
 * Enables "Backtest All Available Data" UI option
 */
router.get('/data-availability/:category', async (req, res) => {
    try {
        const { category } = req.params;
        const fs = require('fs').promises;
        const path = require('path');

        // Get stocks in category
        const categoryRecord = await prisma.category.findUnique({
            where: { key: category },
            include: {
                stocks: {
                    include: { stock: true }
                }
            }
        });

        if (!categoryRecord) {
            return res.status(404).json({ error: 'Category not found' });
        }

        const stocks = categoryRecord.stocks.map(cs => cs.stock.symbol);

        // Check CSV cache for data
        const csvDir = path.join(__dirname, '../cache/historical');
        let csvFiles = [];
        try {
            csvFiles = (await fs.readdir(csvDir)).filter(f => f.endsWith('.csv'));
        } catch (e) {
            // CSV dir may not exist
        }

        let stocksWithData = 0;
        let minDate = null;
        let maxDate = null;
        let totalCandles = 0;

        for (const symbol of stocks) {
            const csvPath = path.join(csvDir, `${symbol}.csv`);
            try {
                const content = await fs.readFile(csvPath, 'utf8');
                const lines = content.trim().split('\n').slice(1); // Skip header

                if (lines.length > 0) {
                    stocksWithData++;
                    totalCandles += lines.length;

                    // Parse dates
                    const dates = lines.map(l => l.split(',')[0]).filter(d => d).sort();
                    if (dates.length > 0) {
                        if (!minDate || dates[0] < minDate) minDate = dates[0];
                        if (!maxDate || dates[dates.length - 1] > maxDate) maxDate = dates[dates.length - 1];
                    }
                }
            } catch (e) {
                // File not found - skip
            }
        }

        // Estimate trading days (assuming ~250 trading days per year)
        const tradingDays = stocksWithData > 0
            ? Math.round(totalCandles / stocksWithData)
            : 0;

        res.json({
            category,
            stocksTotal: stocks.length,
            stocksWithData,
            stocksMissingData: stocks.length - stocksWithData,
            dateRange: {
                start: minDate,
                end: maxDate
            },
            tradingDays,
            dataQuality: stocksWithData >= stocks.length * 0.9 ? 'GOOD' :
                stocksWithData >= stocks.length * 0.7 ? 'PARTIAL' : 'LIMITED'
        });
    } catch (error) {
        console.error('[Backtest API] Data availability error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * GET /api/backtest/optimal-range/:category
 * Calculate optimal date range for 1-minute data backtest
 * Logic: Max 30 days back (Upstox limit), adjusted by category's oldest stock
 */
router.get('/optimal-range/:category', async (req, res) => {
    try {
        const { category } = req.params;
        const today = new Date();
        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);

        // 30 days ago = oldest date with 1-minute data
        const thirtyDaysAgo = new Date(today);
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        // Get oldest stock addedDate in this category
        const oldestStock = await prisma.categoryStock.findFirst({
            where: { category: { key: category } },
            orderBy: { createdAt: 'asc' }
        });

        // Calculate optimal start date
        let optimalStartDate;

        if (oldestStock) {
            const stockDate = new Date(oldestStock.createdAt);
            // Use whichever is MORE RECENT: 30 days ago OR oldest stock
            optimalStartDate = stockDate > thirtyDaysAgo ? stockDate : thirtyDaysAgo;
        } else {
            optimalStartDate = thirtyDaysAgo;
        }

        // Fetch stock count for UI
        const stockCount = await prisma.categoryStock.count({
            where: { category: { key: category } }
        });

        res.json({
            category,
            startDate: optimalStartDate.toISOString().split('T')[0],
            endDate: yesterday.toISOString().split('T')[0],
            dataType: '1minute',
            stockCount,
            note: `Using 1-min data from ${optimalStartDate.toDateString()} to ${yesterday.toDateString()}`
        });

    } catch (error) {
        console.error('[Backtest API] Optimal range error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * GET /api/backtest/progress/:id
 * Get progress of a running backtest
 */

router.get('/progress/:id', async (req, res) => {
    try {
        const { id } = req.params;

        const progress = await backtestEngine.getProgress(id);

        if (!progress) {
            return res.status(404).json({ error: 'Backtest not found' });
        }

        res.json({
            success: true,
            ...progress
        });
    } catch (error) {
        console.error('[Backtest API] Progress error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * GET /api/backtest/results/:id
 * Get full results of a completed backtest
 */
router.get('/results/:id', async (req, res) => {
    try {
        const { id } = req.params;

        const { run, trades } = await backtestEngine.getResults(id);

        if (!run) {
            return res.status(404).json({ error: 'Backtest not found' });
        }

        res.json({
            success: true,
            run: {
                id: run.id,
                categoryKey: run.categoryKey,
                strategyVersion: run.strategyVersion,
                startDate: run.startDate,
                endDate: run.endDate,
                startingCapital: run.startingCapital,
                status: run.status,
                progress: run.progress,
                totalDays: run.totalDays,
                totalSignals: run.totalSignals,
                totalTrades: run.totalTrades,
                winningTrades: run.winningTrades,
                losingTrades: run.losingTrades,
                winRate: run.winRate,
                totalReturn: run.totalReturn,
                returnPercent: run.returnPercent,
                maxDrawdown: run.maxDrawdown,
                sharpeRatio: run.sharpeRatio,
                results: run.results,
                startedAt: run.startedAt,
                completedAt: run.completedAt
            },
            trades: trades.map(t => ({
                tradeNumber: t.tradeNumber,
                symbol: t.symbol,
                tier: t.tier,
                tierName: t.tierName,
                signalDate: t.signalDate,
                entryDate: t.entryDate,
                entryPrice: t.entryPrice,
                targetPrice: t.targetPrice,
                stopPrice: t.stopPrice,
                quantity: t.quantity,
                positionValue: t.positionValue,
                exitDate: t.exitDate,
                exitPrice: t.exitPrice,
                exitReason: t.exitReason,
                daysHeld: t.daysHeld,
                pnl: t.pnl,
                pnlPercent: t.pnlPercent,
                outcome: t.outcome
            }))
        });
    } catch (error) {
        console.error('[Backtest API] Results error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * GET /api/backtest/list
 * Get list of all backtest runs
 */
router.get('/list', async (req, res) => {
    try {
        const { categoryKey, limit = 10 } = req.query;

        const where = categoryKey ? { categoryKey } : {};

        const runs = await prisma.backtestRun.findMany({
            where,
            orderBy: { createdAt: 'desc' },
            take: parseInt(limit),
            select: {
                id: true,
                categoryKey: true,
                strategyVersion: true,
                startDate: true,
                endDate: true,
                status: true,
                progress: true,
                totalTrades: true,
                winRate: true,
                returnPercent: true,
                createdAt: true,
                completedAt: true
            }
        });

        res.json({
            success: true,
            runs
        });
    } catch (error) {
        console.error('[Backtest API] List error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * DELETE /api/backtest/:id
 * Delete a backtest run and its trades
 */
router.delete('/:id', async (req, res) => {
    try {
        const { id } = req.params;

        await prisma.backtestRun.delete({
            where: { id }
        });

        res.json({
            success: true,
            message: 'Backtest deleted'
        });
    } catch (error) {
        console.error('[Backtest API] Delete error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * Helper to prevent toISOString() from shifting IST to previous day UTC
 */
function toISTDateString(date) {
    if (!date) return '';
    const d = new Date(date);
    d.setMinutes(d.getMinutes() + 330);
    return d.toISOString().split('T')[0];
}

/**
 * GET /api/backtest/export/:id
 * Export trade log to CSV
 */
router.get('/export/:id', async (req, res) => {
    try {
        const { id } = req.params;

        const run = await prisma.backtestRun.findUnique({
            where: { id }
        });

        if (!run) {
            return res.status(404).json({ error: 'Backtest not found' });
        }

        const trades = await prisma.backtestTrade.findMany({
            where: { backtestRunId: id },
            orderBy: { tradeNumber: 'asc' }
        });

        // Generate CSV content
        const headers = [
            'TradeNo', 'Symbol', 'Tier', 'TierName',
            'SignalDate', 'EntryDate', 'EntryPrice', 'TargetPrice', 'StopPrice',
            'Quantity', 'PositionValue',
            'ExitDate', 'ExitPrice', 'ExitReason', 'DaysHeld',
            'PnL', 'PnLPercent', 'Outcome'
        ];

        const rows = trades.map(t => [
            t.tradeNumber,
            t.symbol,
            t.tier,
            t.tierName || '',
            toISTDateString(t.signalDate),
            toISTDateString(t.entryDate),
            t.entryPrice?.toFixed(2) || '',
            t.targetPrice?.toFixed(2) || '',
            t.stopPrice?.toFixed(2) || '',
            t.quantity || '',
            t.positionValue?.toFixed(2) || '',
            toISTDateString(t.exitDate),
            t.exitPrice?.toFixed(2) || '',
            t.exitReason || '',
            t.daysHeld || '',
            t.pnl?.toFixed(2) || '',
            t.pnlPercent?.toFixed(2) || '',
            t.outcome || ''
        ]);

        const csvContent = [
            `# Backtest Export: ${run.categoryKey}`,
            `# Period: ${toISTDateString(run.startDate)} to ${toISTDateString(run.endDate)}`,
            `# Total Return: ${run.returnPercent?.toFixed(2)}%, Win Rate: ${run.winRate?.toFixed(1)}%`,
            `# Total Trades: ${run.totalTrades}, Winning: ${run.winningTrades}, Losing: ${run.losingTrades}`,
            '',
            headers.join(','),
            ...rows.map(row => row.join(','))
        ].join('\n');

        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename=backtest_${run.categoryKey}_${id.slice(0, 8)}.csv`);
        res.send(csvContent);

    } catch (error) {
        console.error('[Backtest API] Export error:', error);
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
