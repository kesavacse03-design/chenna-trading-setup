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

module.exports = router;
