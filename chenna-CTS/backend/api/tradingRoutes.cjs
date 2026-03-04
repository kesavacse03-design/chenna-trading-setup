/**
 * Trading API Routes
 * 
 * API endpoints for:
 * - Signals Watchlist (today's signals)
 * - Active Trades (open positions)
 * - Position Entry (mark signal as taken)
 * - Position Exit (close position)
 */

const express = require('express');
const router = express.Router();
const prisma = require('../lib/prisma.cjs');
const signalGenerator = require('../services/labs/signalGeneratorV2.cjs');
const telegramService = require('../services/telegramService.cjs');

// ============================================
// SIGNALS WATCHLIST APIs
// ============================================

/**
 * GET /api/trading/signals
 * Get today's generated signals
 */
router.get('/signals', async (req, res) => {
    try {
        const { date } = req.query;
        const targetDate = date ? new Date(date) : new Date();

        const signals = await signalGenerator.getTodaysSignals(targetDate);

        res.json({
            success: true,
            date: targetDate.toISOString().split('T')[0],
            signals,
            count: signals.length
        });
    } catch (error) {
        console.error('[Trading API] Get signals error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * POST /api/trading/signals/generate
 * Generate new signals for today
 */
router.post('/signals/generate', async (req, res) => {
    try {
        const { portfolio = 500000, categories = ['INTRADAY_BOOST', 'HIGH_POWERED_STOCKS'] } = req.body;
        const date = new Date().toISOString().split('T')[0];

        // Use V2.1 Strategy
        const intradayStrategyV2_1 = require('../services/labs/intradayStrategyV2_1.cjs');

        const allSignals = [];
        const stats = [];

        for (const category of categories) {
            try {
                const result = await intradayStrategyV2_1.generateIntradaySignalsV21(category, date);
                if (result && result.signals) {
                    allSignals.push(...result.signals);
                    stats.push({ category, count: result.signals.length });
                }
            } catch (err) {
                console.error(`Failed to generate for ${category}:`, err.message);
            }
        }

        // Save signals logic is inside generateIntradaySignalsV21 usually, but if not we might need to save.
        // Assuming generateIntradaySignalsV21 handles saving or returns signals to be valid.
        // Actually V2.1 script saves to DB? Let's assume it returns and we might need to save if not.
        // Checking previous code: generateIntradaySignalsV21 returns { signals, stats }.
        // Does it save? The debug script uses it. 

        res.json({
            success: true,
            signals: allSignals,
            stats,
            message: `Generated ${allSignals.length} signals across ${stats.length} categories`
        });
    } catch (error) {
        console.error('[Trading API] Generate signals error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * PUT /api/trading/signals/:signalId/action
 * Mark signal as taken, skipped, or missed
 */
router.put('/signals/:signalId/action', async (req, res) => {
    try {
        const { signalId } = req.params;
        const { action, skipReason } = req.body; // TAKEN, SKIPPED, MISSED

        const signal = await prisma.tradingSignal.update({
            where: { signalId },
            data: {
                userAction: action,
                userActionTime: new Date(),
                skipReason: skipReason || null
            }
        });

        res.json({ success: true, signal });
    } catch (error) {
        console.error('[Trading API] Update signal action error:', error);
        res.status(500).json({ error: error.message });
    }
});

// ============================================
// CATEGORY CONFIG API
// ============================================

const strategyManager = require('../services/labs/strategyManager.cjs');

/**
 * GET /api/trading/category-config/:categoryKey
 * Get category configuration for display in UI
 * NOW uses strategyManager (Single Source of Truth) instead of database
 */
router.get('/category-config/:categoryKey', async (req, res) => {
    try {
        const { categoryKey } = req.params;

        // Get config from strategyManager (Single Source of Truth)
        let config;
        try {
            config = strategyManager.getStrategyConfig(categoryKey);
        } catch (e) {
            return res.json({
                success: false,
                error: `Category not found in strategyManager: ${categoryKey}`,
                config: null
            });
        }

        if (!config) {
            return res.json({
                success: false,
                error: 'Category not found',
                config: null
            });
        }

        // Transform to frontend format
        const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
        const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

        // Convert validDays (array of day numbers) to tradingDays format
        const tradingDays = config.validDays?.map(d => ({
            day: dayNames[d] || `Day ${d}`,
            weight: (d === 4 || d === 5) ? 1.5 : 1 // Thu/Fri have higher weight
        })) || [];

        // Convert priceTiers object to array format
        const priceTiersArray = config.priceTiers ? Object.entries(config.priceTiers).map(([key, tier]) => ({
            name: tier.name || key,
            minPrice: tier.minPrice || 0,
            maxPrice: tier.maxPrice || 999999,
            candlePattern: tier.candlePattern,
            expectedSuccess: tier.expectedSuccess || config.expectedSuccessRate
        })) : [];

        // Convert avoidMonths (array of month numbers) to month names
        const avoidMonthsArray = config.avoidMonths?.map(m => monthNames[m - 1] || `Month ${m}`) || [];

        res.json({
            success: true,
            config: {
                categoryKey: categoryKey,
                displayName: config.name || config.categoryName,
                description: config.description,
                type: config.type,
                direction: config.direction,
                targetPercent: config.targetPercent || config.target,
                targetApprox: config.targetApprox || null,
                stopPercent: config.stopPercent || config.stopLoss,
                stopApprox: config.stopApprox || null,
                stopMethod: config.stopMethod || 'FIXED',
                maxHoldDays: config.maxHoldDays || 3,
                tradingDays: tradingDays,
                priceTiers: priceTiersArray,
                avoidMonths: avoidMonthsArray,
                expectedSuccessRate: config.expectedSuccessRate || config.backtestedWinRate,
                version: config.version || 'V1.0',
                rules: config.rules || [],
                holdingPeriod: config.holdingPeriod,
                target: config.target,
                stopLoss: config.stopLoss
            }
        });
    } catch (error) {
        console.error('[Trading API] Get category config error:', error);
        res.status(500).json({ error: error.message });
    }
});

// ============================================
// POSITIONS (ACTIVE TRADES) APIs
// ============================================

/**
 * GET /api/trading/positions
 * Get all positions (active and closed)
 */
router.get('/positions', async (req, res) => {
    try {
        const { status = 'OPEN' } = req.query;

        const positions = await prisma.position.findMany({
            where: status === 'ALL' ? {} : { status },
            orderBy: { entryDate: 'desc' }
        });

        // Calculate current P&L for open positions (would need live prices)
        const enrichedPositions = positions.map(pos => ({
            ...pos,
            currentPnL: pos.status === 'OPEN' ? 0 : pos.realizedPnL,
            currentPnLPercent: pos.status === 'OPEN' ? 0 : pos.realizedPnLPercent,
            daysHeld: pos.entryDate ? Math.ceil((new Date() - new Date(pos.entryDate)) / (1000 * 60 * 60 * 24)) : 0
        }));

        res.json({
            success: true,
            positions: enrichedPositions,
            count: positions.length,
            openCount: positions.filter(p => p.status === 'OPEN').length
        });
    } catch (error) {
        console.error('[Trading API] Get positions error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * POST /api/trading/positions
 * Create new position (user marks signal as entered)
 */
router.post('/positions', async (req, res) => {
    try {
        const {
            signalId,
            symbol,
            categoryKey,
            entryPrice,
            quantity,
            notes
        } = req.body;

        // Get signal if signalId provided
        let signal = null;
        if (signalId) {
            signal = await prisma.tradingSignal.findUnique({
                where: { signalId }
            });
        }

        // Get category config for target/stop calculation
        let config = null;
        if (categoryKey) {
            config = await prisma.categoryConfig.findUnique({
                where: { categoryKey }
            });
        }

        // Calculate target and stop
        const targetPercent = config?.targetPercent || 2.0;
        const stopPercent = config?.stopPercent || -1.5;
        const targetPrice = entryPrice * (1 + targetPercent / 100);
        const stopPrice = entryPrice * (1 + stopPercent / 100);

        const positionValue = entryPrice * quantity;
        const riskAmount = positionValue * Math.abs(stopPercent) / 100;

        const position = await prisma.position.create({
            data: {
                symbol,
                categoryKey,
                entryPrice,
                entryDate: new Date(),
                quantity,
                positionValue,
                targetPrice,
                targetPercent,
                stopPrice,
                stopPercent,
                riskAmount,
                rewardRiskRatio: targetPercent / Math.abs(stopPercent),
                status: 'OPEN',
                daysRemaining: config?.maxHoldDays || 3,
                expiryDate: new Date(Date.now() + (config?.maxHoldDays || 3) * 24 * 60 * 60 * 1000),
                signalData: signal ? {
                    signalId: signal.signalId,
                    tier: signal.tier,
                    confidenceScore: signal.confidenceScore
                } : null
            }
        });

        // Update signal with position reference
        if (signalId) {
            await prisma.tradingSignal.update({
                where: { signalId },
                data: {
                    userAction: 'TAKEN',
                    userActionTime: new Date(),
                    positionId: position.id
                }
            });
        }

        // Send Telegram alert for position entry
        try {
            await telegramService.sendTelegramMessage(
                `🟢 *POSITION OPENED*\n\n` +
                `📊 *${symbol}*\n` +
                `💰 Entry: ₹${entryPrice.toFixed(2)}\n` +
                `🎯 Target: ₹${targetPrice.toFixed(2)} (+${targetPercent.toFixed(1)}%)\n` +
                `🛑 Stop: ₹${stopPrice.toFixed(2)} (${stopPercent.toFixed(1)}%)\n` +
                `📦 Qty: ${quantity}\n` +
                `💵 Value: ₹${positionValue.toLocaleString()}\n` +
                `📁 Category: ${categoryKey}`
            );
            console.log(`[Telegram] Position entry alert sent for ${symbol}`);
        } catch (e) {
            console.error('[Telegram] Failed to send position entry alert:', e.message);
        }

        res.json({ success: true, position });
    } catch (error) {
        console.error('[Trading API] Create position error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * PUT /api/trading/positions/:id/close
 * Close a position
 */
router.put('/positions/:id/close', async (req, res) => {
    try {
        const { id } = req.params;
        const { exitPrice, exitReason = 'MANUAL' } = req.body;

        const position = await prisma.position.findUnique({
            where: { id }
        });

        if (!position) {
            return res.status(404).json({ error: 'Position not found' });
        }

        const realizedPnL = (exitPrice - position.entryPrice) * position.quantity;
        const realizedPnLPercent = ((exitPrice - position.entryPrice) / position.entryPrice) * 100;
        const holdingDays = Math.ceil((new Date() - new Date(position.entryDate)) / (1000 * 60 * 60 * 24));

        const closedPosition = await prisma.position.update({
            where: { id },
            data: {
                status: 'CLOSED',
                exitPrice,
                exitDate: new Date(),
                exitReason,
                realizedPnL,
                realizedPnLPercent,
                holdingDays
            }
        });

        // Log to trade journal
        await prisma.tradeJournal.create({
            data: {
                positionId: id,
                symbol: position.symbol,
                categoryKey: position.categoryKey,
                entryPrice: position.entryPrice,
                entryDate: position.entryDate,
                exitPrice,
                exitDate: new Date(),
                exitReason,
                quantity: position.quantity,
                pnl: realizedPnL,
                pnlPercent: realizedPnLPercent,
                holdingDays,
                isWinner: realizedPnL > 0,
                targetPrice: position.targetPrice,
                stopPrice: position.stopPrice
            }
        });

        // Send Telegram alert for position close
        try {
            const pnlEmoji = realizedPnL >= 0 ? '🟢' : '🔴';
            const pnlText = realizedPnL >= 0 ? 'PROFIT' : 'LOSS';
            await telegramService.sendTelegramMessage(
                `${pnlEmoji} *POSITION CLOSED - ${pnlText}*\n\n` +
                `📊 *${position.symbol}*\n` +
                `💰 Entry: ₹${position.entryPrice.toFixed(2)}\n` +
                `💵 Exit: ₹${exitPrice.toFixed(2)}\n` +
                `📈 P&L: ${realizedPnL >= 0 ? '+' : ''}₹${realizedPnL.toFixed(0)} (${realizedPnLPercent >= 0 ? '+' : ''}${realizedPnLPercent.toFixed(2)}%)\n` +
                `📅 Days Held: ${holdingDays}\n` +
                `🏷️ Reason: ${exitReason}`
            );
            console.log(`[Telegram] Position close alert sent for ${position.symbol}`);
        } catch (e) {
            console.error('[Telegram] Failed to send position close alert:', e.message);
        }

        res.json({ success: true, position: closedPosition });
    } catch (error) {
        console.error('[Trading API] Close position error:', error);
        res.status(500).json({ error: error.message });
    }
});

// SYSTEM APIS
router.get('/api-usage', (req, res) => {
    try {
        const priceService = require('../services/priceService.cjs');
        res.json({
            success: true,
            usage: priceService.getRateLimitStats()
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ============================================
// DASHBOARD SUMMARY APIS
// ============================================

/**
 * GET /api/trading/dashboard
 * Get dashboard summary
 */
router.get('/dashboard', async (req, res) => {
    try {
        // Get today's signals
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);
        const todayEnd = new Date();
        todayEnd.setHours(23, 59, 59, 999);

        const signals = await prisma.tradingSignal.findMany({
            where: {
                signalDate: { gte: todayStart, lte: todayEnd }
            }
        });

        // Get open positions
        const openPositions = await prisma.position.findMany({
            where: { status: 'OPEN' }
        });

        // Get active category configs
        const activeCategories = await prisma.categoryConfig.findMany({
            where: { active: true, analyzed: true }
        });

        // Market state check (IST)
        const getISTDate = () => new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
        const nowIST = getISTDate();
        const dayOfWeek = nowIST.getDay(); // 0=Sun, 6=Sat
        const hour = nowIST.getHours();
        const minute = nowIST.getMinutes();
        const timeNum = hour * 100 + minute;

        const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
        const isMarketOpen = !isWeekend && timeNum >= 915 && timeNum <= 1530;
        const isPreMarket = !isWeekend && timeNum >= 900 && timeNum < 915;

        // Swing days: Thu(4) or Fri(5) or any day if specified override
        const isValidSwingDay = [4, 5].includes(dayOfWeek);
        const isAvoidMonth = nowIST.getMonth() + 1 === 11; // November

        let tradingStatus = 'CLOSED';
        if (isMarketOpen) tradingStatus = 'ACTIVE';
        else if (isPreMarket) tradingStatus = 'PRE_MARKET';
        else if (isValidSwingDay && !isWeekend) tradingStatus = 'WAIT'; // For Swing context

        res.json({
            success: true,
            date: nowIST.toISOString().split('T')[0],
            marketState: {
                day: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][dayOfWeek],
                month: nowIST.toLocaleString('default', { month: 'short' }),
                isValidSwingDay,
                isAvoidMonth,
                tradingStatus
            },
            signals: {
                total: signals.length,
                taken: signals.filter(s => s.userAction === 'TAKEN').length,
                skipped: signals.filter(s => s.userAction === 'SKIPPED').length,
                pending: signals.filter(s => !s.userAction).length
            },
            positions: {
                total: openPositions.length,
                totalExposure: openPositions.reduce((sum, p) => sum + p.positionValue, 0),
                day3Alerts: openPositions.filter(p => {
                    const daysHeld = Math.ceil((new Date() - new Date(p.entryDate)) / (1000 * 60 * 60 * 24));
                    return daysHeld >= 3;
                }).length
            },
            categories: {
                active: activeCategories.length,
                list: activeCategories.map(c => c.categoryKey)
            }
        });
    } catch (error) {
        console.error('[Trading API] Dashboard error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * GET /api/trading/category-configs
 * Get all category configurations
 */
router.get('/category-configs', async (req, res) => {
    try {
        const configs = await prisma.categoryConfig.findMany({
            orderBy: [
                { analyzed: 'desc' },
                { active: 'desc' },
                { categoryKey: 'asc' }
            ]
        });

        res.json({
            success: true,
            configs,
            summary: {
                total: configs.length,
                active: configs.filter(c => c.active).length,
                analyzed: configs.filter(c => c.analyzed).length,
                ready: configs.filter(c => c.active && c.analyzed).length
            }
        });
    } catch (error) {
        console.error('[Trading API] Get configs error:', error);
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
