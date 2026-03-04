/**
 * Signal Routes
 * API endpoints for live signal scanning
 */

const express = require('express');
const router = express.Router();
const signalScanner = require('../services/signalScanner.cjs');

/**
 * GET /api/signals/scan/:categoryKey
 * Scan a category for live trading signals using V1 strategy
 */
router.get('/scan/:categoryKey', async (req, res) => {
    try {
        const { categoryKey } = req.params;
        console.log(`[Signals API] Scanning ${categoryKey}...`);

        const result = await signalScanner.scanCategory(categoryKey);

        // Save results
        const filename = await signalScanner.saveScanResults(result);
        result.savedAs = filename;

        res.json({
            ok: true,
            ...result
        });
    } catch (error) {
        console.error('[Signals API] Scan error:', error);
        res.status(500).json({
            ok: false,
            error: error.message
        });
    }
});

/**
 * GET /api/signals/scan-all
 * Scan all enabled categories
 */
router.get('/scan-all', async (req, res) => {
    try {
        console.log('[Signals API] Scanning ALL categories...');
        const results = await signalScanner.scanAllCategories();

        res.json({
            ok: true,
            categories: results.length,
            totalSignals: results.reduce((sum, r) => sum + r.signals.length, 0),
            results
        });
    } catch (error) {
        console.error('[Signals API] Scan-all error:', error);
        res.status(500).json({
            ok: false,
            error: error.message
        });
    }
});

/**
 * GET /api/signals/active
 * Get currently active signals from last scan
 */
router.get('/active', async (req, res) => {
    try {
        const active = signalScanner.getActiveSignals();
        res.json({
            ok: true,
            ...active
        });
    } catch (error) {
        res.status(500).json({
            ok: false,
            error: error.message
        });
    }
});

/**
 * GET /api/signals/settings
 * Get live mode settings (including auto-skip)
 */
router.get('/settings', async (req, res) => {
    try {
        const liveModeSettings = require('../services/liveModeSettings.cjs');
        res.json({
            ok: true,
            settings: liveModeSettings.getSettings(),
            autoSkip: liveModeSettings.getAutoSkipSettings()
        });
    } catch (error) {
        res.status(500).json({ ok: false, error: error.message });
    }
});

/**
 * POST /api/signals/settings
 * Update live mode settings
 */
router.post('/settings', async (req, res) => {
    try {
        const { autoSkipLow, autoSkipAgainstTrend } = req.body;
        const liveModeSettings = require('../services/liveModeSettings.cjs');

        const result = liveModeSettings.setAutoSkipSettings(autoSkipLow, autoSkipAgainstTrend);

        res.json({
            ok: true,
            message: 'Settings updated',
            ...result
        });
    } catch (error) {
        res.status(500).json({ ok: false, error: error.message });
    }
});

/**
 * GET /api/signals/trades
 * Get all active signals from DATABASE (not memory)
 * This is the source for Active Trades UI
 */
router.get('/trades', async (req, res) => {
    try {
        const { PrismaClient } = require('@prisma/client');
        const prisma = new PrismaClient();

        const signals = await prisma.signal.findMany({
            where: { trackingStatus: 'ACTIVE' },
            orderBy: { generatedAt: 'desc' }
        });

        await prisma.$disconnect();

        // Group by category
        const byCategory = {};
        signals.forEach(s => {
            if (!byCategory[s.categoryKey]) byCategory[s.categoryKey] = [];
            byCategory[s.categoryKey].push({
                id: s.signalId,
                symbol: s.symbol,
                direction: s.direction,
                entry: Number(s.entryPrice),
                current: Number(s.currentPrice) || Number(s.entryPrice),
                target: Number(s.targetPrice),
                stopLoss: Number(s.stopLoss),
                pnl: Number(s.unrealizedPnL) || 0,
                confidence: Number(s.aiConfidence) || 50,
                daysInTrade: s.daysInTrade || 0,
                trackingDays: s.trackingDays || 10,
                generatedAt: s.generatedAt
            });
        });

        res.json({
            ok: true,
            totalSignals: signals.length,
            byCategory,
            signals
        });
    } catch (error) {
        console.error('[Signals API] Trades error:', error);
        res.status(500).json({
            ok: false,
            error: error.message
        });
    }
});

/**
 * GET /api/signals/history/:categoryKey
 * Get historical signal scans
 */
router.get('/history/:categoryKey', async (req, res) => {
    try {
        const { categoryKey } = req.params;
        const fs = require('fs');
        const path = require('path');

        const dir = path.join(__dirname, '../results/signals');
        if (!fs.existsSync(dir)) {
            return res.json({ ok: true, history: [] });
        }

        const files = fs.readdirSync(dir)
            .filter(f => f.startsWith(`signals_${categoryKey}_`) && f.endsWith('.json'))
            .sort((a, b) => b.localeCompare(a))
            .slice(0, 10); // Last 10 scans

        const history = files.map(f => {
            const content = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
            return {
                fileName: f,
                scannedAt: content.scannedAt,
                signalsFound: content.signals?.length || 0,
                signals: content.signals?.slice(0, 5) || [] // Top 5 only
            };
        });

        res.json({
            ok: true,
            categoryKey,
            history
        });
    } catch (error) {
        res.status(500).json({
            ok: false,
            error: error.message
        });
    }
});

/**
 * POST /api/signals/scheduler/start
 * Start the scheduled scanner
 */
router.post('/scheduler/start', async (req, res) => {
    try {
        const scheduledScanner = require('../services/scheduledScanner.cjs');
        scheduledScanner.startScheduledScanning();
        res.json({ ok: true, message: 'Scheduled scanner started' });
    } catch (error) {
        res.status(500).json({ ok: false, error: error.message });
    }
});

/**
 * POST /api/signals/scheduler/stop
 * Stop the scheduled scanner
 */
router.post('/scheduler/stop', async (req, res) => {
    try {
        const scheduledScanner = require('../services/scheduledScanner.cjs');
        scheduledScanner.stopScheduledScanning();
        res.json({ ok: true, message: 'Scheduled scanner stopped' });
    } catch (error) {
        res.status(500).json({ ok: false, error: error.message });
    }
});

/**
 * GET /api/signals/scheduler/status
 * Get scheduler status and history
 */
router.get('/scheduler/status', async (req, res) => {
    try {
        const scheduledScanner = require('../services/scheduledScanner.cjs');
        const status = scheduledScanner.getScanHistory();
        res.json({ ok: true, ...status });
    } catch (error) {
        res.status(500).json({ ok: false, error: error.message });
    }
});

/**
 * GET /api/signals/notifications
 * Get pending notifications
 */
router.get('/notifications', async (req, res) => {
    try {
        const notificationService = require('../services/notificationService.cjs');
        res.json({
            ok: true,
            pending: notificationService.getPendingNotifications(),
            badge: notificationService.getBadgeCount()
        });
    } catch (error) {
        res.status(500).json({ ok: false, error: error.message });
    }
});

/**
 * POST /api/signals/notifications/read/:id
 * Mark notification as read
 */
router.post('/notifications/read/:id', async (req, res) => {
    try {
        const notificationService = require('../services/notificationService.cjs');
        notificationService.markAsRead(req.params.id);
        res.json({ ok: true });
    } catch (error) {
        res.status(500).json({ ok: false, error: error.message });
    }
});

/**
 * POST /api/signals/notifications/read-all
 * Mark all notifications as read
 */
router.post('/notifications/read-all', async (req, res) => {
    try {
        const notificationService = require('../services/notificationService.cjs');
        notificationService.markAllAsRead();
        res.json({ ok: true });
    } catch (error) {
        res.status(500).json({ ok: false, error: error.message });
    }
});

/**
 * GET /api/signals/notifications/history
 * Get notification history
 */
router.get('/notifications/history', async (req, res) => {
    try {
        const notificationService = require('../services/notificationService.cjs');
        const limit = parseInt(req.query.limit) || 20;
        res.json({
            ok: true,
            history: notificationService.getHistory(limit)
        });
    } catch (error) {
        res.status(500).json({ ok: false, error: error.message });
    }
});

// ============================================================
// POSITION SIZING ENDPOINTS
// ============================================================

const positionSizing = require('../services/positionSizingService.cjs');

/**
 * POST /api/signals/calculate-position
 * Calculate position size for a trade
 */
router.post('/calculate-position', async (req, res) => {
    try {
        const { entry, stopLoss, target, capital, riskPercent } = req.body;

        if (!entry || !stopLoss) {
            return res.status(400).json({
                ok: false,
                error: 'Missing required fields: entry, stopLoss'
            });
        }

        const sizing = positionSizing.calculatePositionSize(
            { price: entry, stop: stopLoss, target },
            { capital, riskPerTradePercent: riskPercent }
        );

        res.json({
            ok: true,
            ...sizing
        });
    } catch (error) {
        console.error('[Signals API] Position sizing error:', error);
        res.status(500).json({ ok: false, error: error.message });
    }
});

/**
 * POST /api/signals/size-portfolio
 * Size multiple signals with portfolio awareness
 */
router.post('/size-portfolio', async (req, res) => {
    try {
        const { signals, existingPositions, capital, maxPositions } = req.body;

        if (!signals || !Array.isArray(signals)) {
            return res.status(400).json({
                ok: false,
                error: 'Missing required fields: signals[]'
            });
        }

        const result = positionSizing.sizePortfolio(
            signals,
            existingPositions || [],
            { capital, maxOpenPositions: maxPositions }
        );

        res.json({
            ok: true,
            ...result
        });
    } catch (error) {
        console.error('[Signals API] Portfolio sizing error:', error);
        res.status(500).json({ ok: false, error: error.message });
    }
});

/**
 * POST /api/signals/risk-profiles
 * Get position sizing for different risk profiles
 */
router.post('/risk-profiles', async (req, res) => {
    try {
        const { entry, stopLoss, target, capital } = req.body;

        if (!entry || !stopLoss) {
            return res.status(400).json({
                ok: false,
                error: 'Missing required fields: entry, stopLoss'
            });
        }

        const profiles = positionSizing.getRiskProfiles(
            { price: entry, stop: stopLoss, target }
        );

        res.json({
            ok: true,
            ...profiles
        });
    } catch (error) {
        console.error('[Signals API] Risk profiles error:', error);
        res.status(500).json({ ok: false, error: error.message });
    }
});

// ============================================================
// EXIT MONITORING / POSITION TRACKING ENDPOINTS
// ============================================================

const exitMonitor = require('../services/exitMonitorService.cjs');

/**
 * POST /api/signals/positions
 * Create a new position from a signal
 */
router.post('/positions', async (req, res) => {
    try {
        const { signal, entryPrice, quantity, capital } = req.body;

        if (!signal || !signal.symbol) {
            return res.status(400).json({
                ok: false,
                error: 'Missing required fields: signal'
            });
        }

        const position = await exitMonitor.createPosition(signal, {
            entryPrice, quantity, capital
        });

        res.json({
            ok: true,
            position,
            message: `Position created: ${signal.symbol}`
        });
    } catch (error) {
        console.error('[Signals API] Create position error:', error);
        res.status(500).json({ ok: false, error: error.message });
    }
});

/**
 * GET /api/signals/positions
 * Get all open positions
 */
router.get('/positions', async (req, res) => {
    try {
        const positions = await exitMonitor.getOpenPositions();

        res.json({
            ok: true,
            count: positions.length,
            positions
        });
    } catch (error) {
        console.error('[Signals API] Get positions error:', error);
        res.status(500).json({ ok: false, error: error.message });
    }
});

/**
 * POST /api/signals/positions/:id/close
 * Close a position
 */
router.post('/positions/:id/close', async (req, res) => {
    try {
        const { id } = req.params;
        const { exitPrice, reason } = req.body;

        if (!exitPrice) {
            return res.status(400).json({
                ok: false,
                error: 'Missing required fields: exitPrice'
            });
        }

        const result = await exitMonitor.closePosition(id, exitPrice, reason || 'MANUAL');

        res.json({
            ok: true,
            ...result
        });
    } catch (error) {
        console.error('[Signals API] Close position error:', error);
        res.status(500).json({ ok: false, error: error.message });
    }
});

/**
 * POST /api/signals/positions/monitor
 * Check all positions against current prices
 */
router.post('/positions/monitor', async (req, res) => {
    try {
        const { prices } = req.body; // { "RELIANCE": 2450, "TCS": 3200 }

        // Price provider function
        const priceProvider = async (symbol) => {
            return prices?.[symbol] || null;
        };

        const result = await exitMonitor.monitorAllPositions(priceProvider);

        res.json({
            ok: true,
            ...result
        });
    } catch (error) {
        console.error('[Signals API] Monitor positions error:', error);
        res.status(500).json({ ok: false, error: error.message });
    }
});

/**
 * GET /api/signals/portfolio
 * Get portfolio summary
 */
router.get('/portfolio', async (req, res) => {
    try {
        const summary = await exitMonitor.getPortfolioSummary();

        res.json({
            ok: true,
            ...summary
        });
    } catch (error) {
        console.error('[Signals API] Portfolio summary error:', error);
        res.status(500).json({ ok: false, error: error.message });
    }
});

/**
 * GET /api/signals/trade-history
 * Get trade history with stats
 */
router.get('/trade-history', async (req, res) => {
    try {
        const { categoryKey, limit } = req.query;

        const history = await exitMonitor.getTradeHistory({
            categoryKey,
            limit: limit ? parseInt(limit) : 50
        });

        res.json({
            ok: true,
            ...history
        });
    } catch (error) {
        console.error('[Signals API] Trade history error:', error);
        res.status(500).json({ ok: false, error: error.message });
    }
});

/**
 * GET /api/signals/performance
 * Get performance by category
 */
router.get('/performance', async (req, res) => {
    try {
        const performance = await exitMonitor.getPerformanceByCategory();

        res.json({
            ok: true,
            categories: performance
        });
    } catch (error) {
        console.error('[Signals API] Performance error:', error);
        res.status(500).json({ ok: false, error: error.message });
    }
});

// ============================================================
// INTRADAY V2.1 PRODUCTION ENDPOINTS
// ============================================================

const intradayService = require('../services/labs/intradaySignalService.cjs');

/**
 * GET /api/signals/intraday/start
 * Start V2.1 Production live monitoring
 */
router.get('/intraday/start', async (req, res) => {
    try {
        const mode = req.query.mode || 'PERFECT';
        const result = intradayService.startLiveMonitoring(mode);
        res.json({ ok: true, ...result });
    } catch (error) {
        console.error('[Signals API] Intraday start error:', error);
        res.status(500).json({ ok: false, error: error.message });
    }
});

/**
 * GET /api/signals/intraday/stop
 * Stop V2.1 Production live monitoring
 */
router.get('/intraday/stop', async (req, res) => {
    try {
        const result = intradayService.stopLiveMonitoring();
        res.json({ ok: true, ...result });
    } catch (error) {
        console.error('[Signals API] Intraday stop error:', error);
        res.status(500).json({ ok: false, error: error.message });
    }
});

/**
 * GET /api/signals/intraday/status
 * Get V2.1 monitoring status
 */
router.get('/intraday/status', async (req, res) => {
    try {
        const status = intradayService.getStatus();
        res.json({ ok: true, ...status });
    } catch (error) {
        res.status(500).json({ ok: false, error: error.message });
    }
});

/**
 * GET /api/signals/intraday/signals
 * Get today's V2.1 signals
 */
router.get('/intraday/signals', async (req, res) => {
    try {
        const signals = intradayService.getTodaysSignals();
        res.json({
            ok: true,
            date: new Date().toISOString().split('T')[0],
            count: signals.length,
            signals
        });
    } catch (error) {
        console.error('[Signals API] Intraday signals error:', error);
        res.status(500).json({ ok: false, error: error.message });
    }
});

/**
 * GET /api/signals/intraday/positions
 * Get active intraday positions
 */
router.get('/intraday/positions', async (req, res) => {
    try {
        const positions = intradayService.getActivePositions();
        res.json({
            ok: true,
            count: positions.length,
            positions
        });
    } catch (error) {
        console.error('[Signals API] Intraday positions error:', error);
        res.status(500).json({ ok: false, error: error.message });
    }
});

/**
 * GET /api/signals/intraday/performance
 * Get today's intraday performance
 */
router.get('/intraday/performance', async (req, res) => {
    try {
        const performance = intradayService.getTodayPerformance();
        const closed = intradayService.getClosedPositions();
        res.json({
            ok: true,
            date: new Date().toISOString().split('T')[0],
            ...performance,
            closedPositions: closed
        });
    } catch (error) {
        console.error('[Signals API] Intraday performance error:', error);
        res.status(500).json({ ok: false, error: error.message });
    }
});

/**
 * POST /api/signals/intraday/fill
 * Mark a signal as filled (executed)
 */
router.post('/intraday/fill', async (req, res) => {
    try {
        const { signalId, entryPrice } = req.body;

        if (!signalId || !entryPrice) {
            return res.status(400).json({
                ok: false,
                error: 'Missing required fields: signalId, entryPrice'
            });
        }

        const result = await intradayService.fillSignal(signalId, entryPrice);
        res.json(result);
    } catch (error) {
        console.error('[Signals API] Intraday fill error:', error);
        res.status(500).json({ ok: false, error: error.message });
    }
});

/**
 * POST /api/signals/intraday/close
 * Close an intraday position
 */
router.post('/intraday/close', async (req, res) => {
    try {
        const { positionId, exitPrice, reason } = req.body;

        if (!positionId || !exitPrice) {
            return res.status(400).json({
                ok: false,
                error: 'Missing required fields: positionId, exitPrice'
            });
        }

        const result = await intradayService.closePosition(positionId, exitPrice, reason || 'MANUAL');
        res.json(result);
    } catch (error) {
        console.error('[Signals API] Intraday close error:', error);
        res.status(500).json({ ok: false, error: error.message });
    }
});

/**
 * POST /api/signals/intraday/scan
 * Manually trigger a signal scan
 */
router.post('/intraday/scan', async (req, res) => {
    try {
        const signals = await intradayService.scanForSignals();
        res.json({
            ok: true,
            newSignals: signals.length,
            signals
        });
    } catch (error) {
        console.error('[Signals API] Intraday scan error:', error);
        res.status(500).json({ ok: false, error: error.message });
    }
});

/**
 * POST /api/signals/intraday/reset
 * Reset daily state (for new trading day)
 */
router.post('/intraday/reset', async (req, res) => {
    try {
        intradayService.resetDailyState();
        res.json({ ok: true, message: 'Daily state reset' });
    } catch (error) {
        res.status(500).json({ ok: false, error: error.message });
    }
});

// ============================================================
// STRATEGY API ENDPOINTS
// ============================================================

const strategyManager = require('../services/labs/strategyManager.cjs');

/**
 * GET /api/signals/strategies/list
 * Get all strategies (both active and inactive)
 */
router.get('/strategies/list', async (req, res) => {
    try {
        const strategies = strategyManager.getAllStrategyInfo();
        res.json({
            ok: true,
            total: strategies.length,
            strategies
        });
    } catch (error) {
        res.status(500).json({ ok: false, error: error.message });
    }
});

/**
 * GET /api/signals/strategies/active
 * Get only active strategies (ready for trading)
 */
router.get('/strategies/active', async (req, res) => {
    try {
        const strategies = strategyManager.getActiveStrategies();
        res.json({
            ok: true,
            total: strategies.length,
            strategies
        });
    } catch (error) {
        res.status(500).json({ ok: false, error: error.message });
    }
});

/**
 * GET /api/signals/strategies/inactive
 * Get inactive strategies (not yet developed)
 */
router.get('/strategies/inactive', async (req, res) => {
    try {
        const strategies = strategyManager.getInactiveStrategies();
        res.json({
            ok: true,
            total: strategies.length,
            strategies
        });
    } catch (error) {
        res.status(500).json({ ok: false, error: error.message });
    }
});

/**
 * GET /api/signals/strategies/:category
 * Get strategy info for a specific category
 */
router.get('/strategies/:category', async (req, res) => {
    try {
        const { category } = req.params;
        const info = strategyManager.getStrategyInfo(category);

        if (!info) {
            return res.status(404).json({ ok: false, error: `No strategy for ${category}` });
        }

        res.json({ ok: true, strategy: info });
    } catch (error) {
        res.status(500).json({ ok: false, error: error.message });
    }
});

module.exports = router;

