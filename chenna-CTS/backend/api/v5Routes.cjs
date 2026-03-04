/**
 * V5 API Routes — Signal-to-Position Pipeline
 */
const express = require('express');
const router = express.Router();
const prisma = require('../lib/prisma.cjs');
const { generateSignals } = require('../services/v5SignalGenerator.cjs');
const confirmationService = require('../services/confirmationService.cjs');
const positionService = require('../services/positionService.cjs');
const dashboardService = require('../services/dashboardService.cjs');
const alertService = require('../services/alertService.cjs');
const { runDailyCleanup, getSignalAge, CATEGORY_LIFECYCLE } = require('../services/signalLifecycleService.cjs');
const { todayIST, startOfDayUTC, endOfDayUTC, importDateIST, formatISTTime, getMarketPhase, isMarketOpen } = require('../utils/istUtils.cjs');

// Run daily cleanup on first request (lazy startup)
let cleanupRanToday = false;
(async () => {
    try {
        await runDailyCleanup();
        cleanupRanToday = true;
    } catch (e) {
        console.error('[V5Routes] Auto-cleanup failed:', e.message);
    }
})();

// GET /api/v5/signals?date=YYYY-MM-DD&category=XXX&status=XXX — Fetch signals
router.get('/signals', async (req, res) => {
    try {
        const dateStr = req.query.date;
        const category = req.query.category;
        const status = req.query.status;

        const whereClause = {};
        if (dateStr) {
            whereClause.signalDate = importDateIST(dateStr);
        }
        if (category) whereClause.category = category;
        if (status) whereClause.status = status;

        const signals = await prisma.v5Signal.findMany({
            where: whereClause,
            orderBy: { confidenceScore: 'desc' }
        });

        res.json({
            ok: true,
            date: dateStr,
            count: signals.length,
            signals: signals.map(s => ({
                id: s.id,
                symbol: s.symbol,
                category: s.category,
                signalClose: Number(s.signalClose),
                breakoutLevel: Number(s.breakoutLevel),
                rsi14: Number(s.rsi14),
                adx14: Number(s.adx14),
                volumeRatio: Number(s.volumeRatio),
                candleQuality: s.candleQuality,
                macd1hState: s.macd1hState,
                niftyContext: s.niftyContext,
                confidenceScore: s.confidenceScore,
                confidenceTier: s.confidenceTier,
                atr14: Number(s.atr14),
                suggestedStop: Number(s.suggestedStop),
                suggestedQty: s.suggestedQty,
                status: s.status,
                meta: s.meta,
                createdAt: s.createdAt
            }))
        });
    } catch (err) {
        console.error('[V5 /signals] Error:', err);
        res.status(500).json({ ok: false, error: err.message });
    }
});

// POST /api/v5/signals/generate — Trigger signal generation
router.post('/signals/generate', async (req, res) => {
    try {
        const dateStr = req.body.date || todayIST();
        const category = req.body.category || 'SHORT_TERM_SWING_BO_UP';

        console.log(`[V5 API] Signal generation triggered for ${dateStr} | ${category}`);
        const result = await generateSignals(dateStr, category);

        res.json({ ok: true, ...result });
    } catch (err) {
        console.error('[V5 /signals/generate] Error:', err);
        res.status(500).json({ ok: false, error: err.message });
    }
});

// PATCH /api/v5/signals/:id/status — Accept/Reject a signal
router.patch('/signals/:id/status', async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body; // ACCEPTED, REJECTED

        if (!['ACCEPTED', 'REJECTED'].includes(status)) {
            return res.status(400).json({ ok: false, error: 'Status must be ACCEPTED or REJECTED' });
        }

        const signal = await prisma.v5Signal.update({
            where: { id: parseInt(id) },
            data: { status }
        });

        res.json({ ok: true, signal: { id: signal.id, symbol: signal.symbol, status: signal.status } });
    } catch (err) {
        console.error('[V5 /signals/:id/status] Error:', err);
        res.status(500).json({ ok: false, error: err.message });
    }
});

// POST /api/v5/confirm/swing — Trigger Swing Confirmation
router.post('/confirm/swing', async (req, res) => {
    try {
        const dateStr = req.body.date || todayIST();
        console.log(`[V5 API] Swing Confirmation triggered for ${dateStr}`);

        const upRes = await confirmationService.confirmSwingUpSignals(dateStr);
        const downRes = await confirmationService.confirmSwingDownSignals(dateStr);

        res.json({ ok: true, date: dateStr, swingUp: upRes, swingDown: downRes });
    } catch (err) {
        console.error('[V5 /confirm/swing] Error:', err);
        res.status(500).json({ ok: false, error: err.message });
    }
});

// POST /api/v5/confirm/intraday — Trigger Intraday Confirmation
router.post('/confirm/intraday', async (req, res) => {
    try {
        const dateStr = req.body.date || todayIST();
        console.log(`[V5 API] Intraday Confirmation triggered for ${dateStr}`);

        const result = await confirmationService.confirmIntradaySignals(dateStr);

        res.json({ ok: true, date: dateStr, ...result });
    } catch (err) {
        console.error('[V5 /confirm/intraday] Error:', err);
        res.status(500).json({ ok: false, error: err.message });
    }
});

// POST /api/v5/intraday/refresh — Manual intraday cache refresh + confirmation
router.post('/intraday/refresh', async (req, res) => {
    try {
        console.log('[V5 API] Intraday refresh triggered');
        const { refreshIntradayCache } = require('../scripts/intraday_refresh.cjs');
        const result = await refreshIntradayCache();
        res.json({ ok: true, ...result });
    } catch (err) {
        console.error('[V5 /intraday/refresh] Error:', err);
        res.status(500).json({ ok: false, error: err.message });
    }
});

// GET /api/v5/backtest/check — Check data availability for backtest
router.get('/backtest/check', async (req, res) => {
    try {
        const { category, startDate, endDate } = req.query;
        if (!category || !startDate || !endDate) {
            return res.status(400).json({ ok: false, error: 'category, startDate, and endDate are required parameters' });
        }

        const replayService = require('../services/backtestReplayService.cjs');
        const checkResult = await replayService.checkBacktestData(category, startDate, endDate);

        res.json({ ok: true, data: checkResult });
    } catch (err) {
        console.error('[V5 /backtest/check] Error:', err);
        res.status(500).json({ ok: false, error: err.message });
    }
});

// POST /api/v5/backtest/replay — Replay signals with simulation modes
router.post('/backtest/replay', async (req, res) => {
    try {
        const { category, startDate, endDate, mode = 'ALL', options = {} } = req.body;
        if (!category || !startDate || !endDate) {
            return res.status(400).json({ ok: false, error: 'category, startDate, and endDate are required' });
        }
        console.log(`[V5 API] Backtest Replay triggered for ${category} from ${startDate} to ${endDate} (Mode: ${mode})`);

        // First replay the signals to get exact outcomes
        const replayService = require('../services/backtestReplayService.cjs');
        const replayResult = await replayService.replaySignals(category, startDate, endDate);

        // Then pass through simulation service to apply chosen mode (ALL, TOP_N, MONKEY, etc)
        const simService = require('../services/backtestSimulationService.cjs');
        const finalResult = await simService.simulateBacktest(replayResult.signals, mode, options);

        // Keep the original params and summary from replay, but override with simulation logic
        res.json({
            ok: true,
            params: replayResult.params,
            modeInfo: finalResult.modeInfo,
            summary: finalResult.summary,
            signals: finalResult.signals,
            monkeyStats: finalResult.monkeyStats
        });
    } catch (err) {
        console.error('[V5 /backtest/replay] Error:', err);
        res.status(500).json({ ok: false, error: err.message });
    }
});

// ============================================
// MODULE 3: POSITION MANAGER ENDPOINTS
// ============================================

// POST /api/v5/positions/open
router.post('/positions/open', async (req, res) => {
    try {
        const { signalId, entryPrice, quantity } = req.body;
        if (!signalId) return res.status(400).json({ ok: false, error: 'signalId required' });

        const userOverrides = {};
        if (entryPrice) userOverrides.entryPrice = parseFloat(entryPrice);
        if (quantity) userOverrides.quantity = parseInt(quantity);

        const position = await positionService.openPositionFromSignal(signalId, userOverrides);
        res.json({ ok: true, position });
    } catch (err) {
        console.error('[V5 /positions/open] Error:', err.message);
        res.status(500).json({ ok: false, error: err.message });
    }
});

// POST /api/v5/positions/check
router.post('/positions/check', async (req, res) => {
    try {
        const { currentMarketData, isEOD } = req.body;
        if (!currentMarketData) return res.status(400).json({ ok: false, error: 'currentMarketData map required' });

        const result = await positionService.evaluateOpenPositions(currentMarketData, isEOD);
        res.json({ ok: true, ...result });
    } catch (err) {
        console.error('[V5 /positions/check] Error:', err.message);
        res.status(500).json({ ok: false, error: err.message });
    }
});

// GET /api/v5/positions
router.get('/positions', async (req, res) => {
    try {
        const status = req.query.status || 'OPEN';
        const pos = await prisma.v5Position.findMany({
            where: { status },
            include: { signal: true },
            orderBy: { createdAt: 'desc' }
        });
        res.json({ ok: true, count: pos.length, positions: pos });
    } catch (err) {
        console.error('[V5 /positions] Error:', err.message);
        res.status(500).json({ ok: false, error: err.message });
    }
});

// PATCH /api/v5/positions/:id/journal
router.patch('/positions/:id/journal', async (req, res) => {
    try {
        const { id } = req.params;
        const { notes, slippagePercent } = req.body;

        const position = await prisma.v5Position.update({
            where: { id: parseInt(id) },
            data: {
                notes: notes !== undefined ? notes : undefined,
                slippagePercent: slippagePercent !== undefined ? parseFloat(slippagePercent) : undefined,
            }
        });

        res.json({ ok: true, position });
    } catch (err) {
        console.error('[V5 /positions/:id/journal] Error:', err.message);
        res.status(500).json({ ok: false, error: err.message });
    }
});

// ============================================
// MODULE 4: DASHBOARD & ALERTS
// ============================================

router.get('/dashboard/summary', async (req, res) => {
    try {
        const summary = await dashboardService.getSummary();
        res.json({ ok: true, summary });
    } catch (err) {
        console.error('[V5 /dashboard/summary] Error:', err.message);
        res.status(500).json({ ok: false, error: err.message });
    }
});

router.get('/dashboard/positions', async (req, res) => {
    try {
        const positions = await dashboardService.getPositions();
        res.json({ ok: true, count: positions.length, positions });
    } catch (err) {
        console.error('[V5 /dashboard/positions] Error:', err.message);
        res.status(500).json({ ok: false, error: err.message });
    }
});

// GET /api/v5/positions/history — Closed positions (for Trade Journal)
router.get('/positions/history', async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 20;
        const positions = await prisma.v5Position.findMany({
            where: { status: 'CLOSED' },
            include: { signal: true },
            orderBy: { updatedAt: 'desc' },
            take: limit
        });
        res.json({ ok: true, count: positions.length, positions });
    } catch (err) {
        console.error('[V5 /positions/history] Error:', err.message);
        res.status(500).json({ ok: false, error: err.message });
    }
});

router.get('/dashboard/signals', async (req, res) => {
    try {
        const dateStr = req.query.date || null; // optional YYYY-MM-DD
        const signals = await dashboardService.getTodaySignals(dateStr);
        res.json({ ok: true, date: dateStr, signals });
    } catch (err) {
        console.error('[V5 /dashboard/signals] Error:', err.message);
        res.status(500).json({ ok: false, error: err.message });
    }
});

router.get('/dashboard/history', async (req, res) => {
    try {
        const days = req.query.days || 30;
        const history = await dashboardService.getHistory(days);
        res.json({ ok: true, count: history.length, history });
    } catch (err) {
        console.error('[V5 /dashboard/history] Error:', err.message);
        res.status(500).json({ ok: false, error: err.message });
    }
});

router.get('/alerts/today', async (req, res) => {
    try {
        const alerts = await alertService.getTodayAlerts();
        res.json({ ok: true, count: alerts.length, alerts });
    } catch (err) {
        console.error('[V5 /alerts/today] Error:', err.message);
        res.status(500).json({ ok: false, error: err.message });
    }
});

router.get('/alerts/active', async (req, res) => {
    try {
        const alerts = await alertService.getActiveAlerts();
        res.json({ ok: true, count: alerts.length, alerts });
    } catch (err) {
        console.error('[V5 /alerts/active] Error:', err.message);
        res.status(500).json({ ok: false, error: err.message });
    }
});

router.patch('/alerts/:id/read', async (req, res) => {
    try {
        const { id } = req.params;
        const alert = await alertService.markAsRead(id);
        res.json({ ok: true, alert });
    } catch (err) {
        console.error('[V5 /alerts/:id/read] Error:', err.message);
        res.status(500).json({ ok: false, error: err.message });
    }
});

// ============================================
// INTRADAY WATCHLIST — Real-time IB stock phases
// ============================================
router.get('/watchlist/intraday', async (req, res) => {
    try {
        const watchService = require('../services/intradayWatchService.cjs');
        const status = watchService.getStatus();
        res.json({ ok: true, ...status });
    } catch (err) {
        console.error('[V5 /watchlist/intraday] Error:', err.message);
        res.status(500).json({ ok: false, error: err.message });
    }
});

// ============================================
// HEALTH CHECK
// ============================================
router.get('/health', async (req, res) => {
    try {
        const fs = require('fs');
        const path = require('path');

        // 1. Upstox Token Check — uses real upstoxClient data
        const upstoxHealth = require('../services/upstoxClient.cjs').getHealth();
        let upstox = { status: 'unknown', tokenAge: null, hasToken: false, apiCalls: 0, lastCall: null };
        try {
            const tokensPath = path.join(__dirname, '../auth/tokens.json');
            if (fs.existsSync(tokensPath)) {
                const tokens = JSON.parse(fs.readFileSync(tokensPath, 'utf8'));
                upstox.hasToken = !!tokens.access_token;
                if (tokens.updated_at) {
                    const tokenDate = new Date(tokens.updated_at);
                    const hoursOld = (Date.now() - tokenDate.getTime()) / 3600000;
                    upstox.tokenAge = `${hoursOld.toFixed(1)}h`;
                }
                upstox.lastUpdated = tokens.updated_at || null;
            }
        } catch (e) { }

        // Real token validity from actual API responses (401 detection)
        if (!upstoxHealth.tokenValid) {
            upstox.status = 'expired';  // Actually got a 401!
        } else if (!upstox.hasToken) {
            upstox.status = 'expired';
        } else {
            const hoursOld = upstox.tokenAge ? parseFloat(upstox.tokenAge) : 0;
            upstox.status = hoursOld < 16 ? 'connected' : hoursOld < 20 ? 'expiring' : 'expired';
        }

        upstox.apiCalls = upstoxHealth.apiCallCount;
        upstox.dailyLimit = 10000; // Upstox standard daily limit
        upstox.limitCritical = upstox.apiCalls >= 9500;
        upstox.lastCall = upstoxHealth.lastCallTime;
        upstox.lastError = upstoxHealth.lastError;

        // 2. Database check
        let database = { status: 'error', signalCount: 0, positionCount: 0 };
        try {
            const sigCount = await prisma.v5Signal.count();
            const posCount = await prisma.v5Position.count({ where: { status: 'OPEN' } });
            database = { status: 'connected', signalCount: sigCount, positionCount: posCount };
        } catch (e) {
            database = { status: 'error', signalCount: 0, positionCount: 0 };
        }

        // 3. Live price service status
        let livePrice = { status: 'stopped', stockCount: 0, lastUpdate: null };
        try {
            const lps = require('../services/livePriceService.cjs');
            const allPrices = lps.getAllPrices();
            livePrice = {
                status: allPrices.totalStocks > 0 ? 'running' : 'stopped',
                stockCount: allPrices.totalStocks,
                lastUpdate: allPrices.lastUpdate || null,
                marketStatus: allPrices.marketStatus || null,
            };
        } catch (e) { }

        // 4. Market hours
        const now = new Date();
        const istHour = (now.getUTCHours() + 5) + (now.getUTCMinutes() + 30) / 60;
        const isMarketHours = istHour >= 9.25 && istHour <= 15.5;
        const dayOfWeek = now.getDay();
        const isWeekday = dayOfWeek >= 1 && dayOfWeek <= 5;

        res.json({
            ok: true,
            upstox,
            database,
            livePrice,
            market: {
                isOpen: isMarketHours && isWeekday,
                currentTimeIST: now.toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata' }),
            }
        });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
    }
});

// ============================================
// ============================================
// EOD POSITION CLEANUP
// ============================================
const eodService = require('../services/eodService.cjs');

// POST /api/v5/positions/eod-close — Auto-close all intraday positions
router.post('/positions/eod-close', async (req, res) => {
    try {
        console.log('[V5 API] EOD position cleanup triggered');
        const result = await eodService.runEODCleanup(req.body.prices || {});
        res.json({ ok: true, ...result });
    } catch (err) {
        console.error('[V5 /positions/eod-close] Error:', err.message);
        res.status(500).json({ ok: false, error: err.message });
    }
});

// ============================================
// SCANNER STATUS & CONTROL
// ============================================
const signalScheduler = require('../services/signalScheduler.cjs');

// GET /api/v5/scanner/status — Current scanner state
router.get('/scanner/status', (req, res) => {
    res.json({ ok: true, ...signalScheduler.getStatus() });
});

// POST /api/v5/scanner/force-scan — Trigger immediate scan
router.post('/scanner/force-scan', async (req, res) => {
    try {
        const result = await signalScheduler.forceScan();
        res.json({ ok: true, ...result });
    } catch (err) {
        console.error('[V5 /scanner/force-scan] Error:', err.message);
        res.status(500).json({ ok: false, error: err.message });
    }
});
// GET /api/v5/scanner/stocks — All IB stocks grouped by scanning status
const scannerStatusTracker = require('../services/scannerStatusTracker.cjs');
router.get('/scanner/stocks', async (req, res) => {
    try {
        // Ensure tracker has data — if empty, update it now
        if (scannerStatusTracker.stocks.size === 0) {
            await scannerStatusTracker.updateAll();
        }
        res.json({ ok: true, ...scannerStatusTracker.getGrouped() });
    } catch (err) {
        console.error('[V5 /scanner/stocks] Error:', err.message);
        res.status(500).json({ ok: false, error: err.message });
    }
});

// GET /api/v5/scanner/logs — View today's scan log
router.get('/scanner/logs', (req, res) => {
    const dateStr = req.query.date || todayIST();
    const logPath = require('path').join(__dirname, `../scan_logs/${dateStr}.json`);
    const fs = require('fs');
    if (fs.existsSync(logPath)) {
        try {
            const data = JSON.parse(fs.readFileSync(logPath, 'utf8'));
            // Return the latest scan cycle
            const latest = data[data.length - 1];
            res.json({ ok: true, date: dateStr, totalScans: data.length, latest, allScans: data });
        } catch (e) {
            res.json({ ok: false, error: 'Failed to parse scan log' });
        }
    } else {
        res.json({ ok: true, date: dateStr, totalScans: 0, latest: null, allScans: [] });
    }
});

// ============================================
// EOD PERFORMANCE REPORTS
// ============================================
const eodReportService = require('../services/eodReportService.cjs');

// GET /api/v5/reports/eod — Get EOD report (from file or generate)
router.get('/reports/eod', async (req, res) => {
    const dateStr = req.query.date || todayIST();
    try {
        let report = eodReportService.getReport(dateStr);
        if (!report) {
            // Generate on-demand if no persisted report exists
            report = await eodReportService.generateEODReport(dateStr);
        }
        res.json({ ok: true, report });
    } catch (err) {
        console.error('[V5 /reports/eod] Error:', err.message);
        res.status(500).json({ ok: false, error: err.message });
    }
});

// POST /api/v5/reports/eod/generate — Force generate EOD report
router.post('/reports/eod/generate', async (req, res) => {
    const dateStr = req.body.date || todayIST();
    try {
        const report = await eodReportService.generateEODReport(dateStr);
        res.json({ ok: true, report });
    } catch (err) {
        console.error('[V5 /reports/eod/generate] Error:', err.message);
        res.status(500).json({ ok: false, error: err.message });
    }
});

// ============================================
// EOD SIMULATION
// ============================================
const eodSimulationService = require('../services/eodSimulationService.cjs');

// POST /api/v5/simulate/eod — Run EOD Simulation
router.post('/simulate/eod', async (req, res) => {
    console.log('[V5 /simulate/eod] INCOMING REQUEST!');
    try {
        const dateStr = req.body.date || null;
        const result = await eodSimulationService.runSimulationForDate(dateStr);
        if (result && result.ok) {
            res.json({ ok: true, report: result.report, details: result.details });
        } else {
            res.status(500).json({ ok: false, error: result?.error || "Unknown error" });
        }
    } catch (err) {
        console.error('[V5 /simulate/eod] Error:', err.message);
        res.status(500).json({ ok: false, error: err.message });
    }
});

// ============================================
// SIGNAL LIFECYCLE
// ============================================

// POST /api/v5/signals/cleanup — Manual cleanup trigger
router.post('/signals/cleanup', async (req, res) => {
    try {
        const todayStr = req.body.date || todayIST();
        const results = await runDailyCleanup(todayStr);
        res.json({ ok: true, ...results });
    } catch (err) {
        console.error('[V5 /signals/cleanup] Error:', err.message);
        res.status(500).json({ ok: false, error: err.message });
    }
});

// GET /api/v5/signals/lifecycle — Get lifecycle config
router.get('/signals/lifecycle', (req, res) => {
    res.json({ ok: true, categories: CATEGORY_LIFECYCLE });
});

// ============================================
// COMBINED GENERATE ENDPOINT (Task 2)
// ============================================

// POST /api/v5/intraday/generate — Full pipeline: archive → refresh cache → confirm
router.post('/intraday/generate', async (req, res) => {
    const steps = [];
    try {
        const today = todayIST();
        console.log(`[V5 API] Combined intraday generate triggered for ${today}`);

        // Step 1: Archive old INTRADAY_BOOST signals
        const todayStart = startOfDayUTC(today);
        const archived = await prisma.v5Signal.updateMany({
            where: {
                category: 'INTRADAY_BOOST',
                signalDate: { lt: todayStart },
                status: { in: ['CONFIRMED', 'EXPIRED', 'PENDING_CONFIRMATION'] }
            },
            data: { status: 'CLOSED' }
        });
        steps.push({ step: 'archive', count: archived.count });

        // Step 2: Refresh intraday cache (fetch live 30m candles)
        const { refreshIntradayCache } = require('../scripts/intraday_refresh.cjs');
        const refreshResult = await refreshIntradayCache();
        steps.push({ step: 'refresh', ...refreshResult });

        // Step 3: Get resulting signal count
        const signals = await prisma.v5Signal.findMany({
            where: { signalDate: importDateIST(today), category: 'INTRADAY_BOOST' },
            orderBy: { confidenceScore: 'desc' }
        });

        const confirmed = signals.filter(s => s.status === 'CONFIRMED').length;
        const expired = signals.filter(s => s.status === 'EXPIRED').length;
        steps.push({ step: 'result', totalSignals: signals.length, confirmed, expired });

        res.json({
            ok: true,
            date: today,
            steps,
            summary: {
                archived: archived.count,
                cacheRefreshed: refreshResult.cacheRefreshed || 0,
                totalSignals: signals.length,
                confirmed,
                expired
            }
        });
    } catch (err) {
        console.error('[V5 /intraday/generate] Error:', err.message);
        res.status(500).json({ ok: false, error: err.message, steps });
    }
});

// ============================================
// DIAGNOSTICS ENDPOINT (Task 5)
// ============================================

// GET /api/v5/diagnostics — System diagnostic snapshot
router.get('/diagnostics', async (req, res) => {
    try {
        const today = todayIST();
        const todayStart = startOfDayUTC(today);
        const todayEnd = endOfDayUTC(today);
        const todayUTC = importDateIST(today);
        const fs = require('fs');
        const path = require('path');

        // 1. Stock category counts for today
        const ibStocksToday = await prisma.stockCategory.count({
            where: { category: { key: 'INTRADAY_BOOST' }, addedDate: todayUTC }
        });
        const swingUpToday = await prisma.stockCategory.count({
            where: { category: { key: 'SHORT_TERM_SWING_BO_UP' }, addedDate: todayUTC }
        });
        const swingDownToday = await prisma.stockCategory.count({
            where: { category: { key: 'SHORT_TERM_SWING_BO_DOWN' }, addedDate: todayUTC }
        });

        // 2. Signal counts
        const todaySignals = await prisma.v5Signal.count({
            where: { signalDate: { gte: todayStart, lte: todayEnd } }
        });
        const pendingSignals = await prisma.v5Signal.count({
            where: { status: 'PENDING_CONFIRMATION' }
        });
        const confirmedToday = await prisma.v5Signal.count({
            where: { status: 'CONFIRMED', signalDate: { gte: todayStart, lte: todayEnd } }
        });

        // 3. Open positions
        const openPositions = await prisma.v5Position.count({ where: { status: 'OPEN' } });

        // 4. Cache status
        const cacheDir30m = path.join(__dirname, '../cache/30minute');
        const cacheDirDay = path.join(__dirname, '../cache/day');
        let cache30mFiles = 0, cacheDayFiles = 0;
        try { cache30mFiles = fs.readdirSync(cacheDir30m).filter(f => f.endsWith('.json')).length; } catch (e) { }
        try { cacheDayFiles = fs.readdirSync(cacheDirDay).filter(f => f.endsWith('.json')).length; } catch (e) { }

        // 5. Token status
        let tokenStatus = 'unknown';
        try {
            const tokensPath = path.join(__dirname, '../auth/tokens.json');
            if (fs.existsSync(tokensPath)) {
                const tokens = JSON.parse(fs.readFileSync(tokensPath, 'utf8'));
                tokenStatus = tokens.access_token ? 'present' : 'missing';
            }
        } catch (e) { tokenStatus = 'error'; }

        res.json({
            ok: true,
            timestamp: new Date().toISOString(),
            istDate: today,
            marketPhase: getMarketPhase(),
            isMarketOpen: isMarketOpen(),
            stocks: {
                intradayBoost: ibStocksToday,
                swingUp: swingUpToday,
                swingDown: swingDownToday
            },
            signals: {
                todayTotal: todaySignals,
                confirmedToday,
                pendingAll: pendingSignals
            },
            positions: { open: openPositions },
            cache: { files30m: cache30mFiles, filesDay: cacheDayFiles },
            token: tokenStatus
        });
    } catch (err) {
        console.error('[V5 /diagnostics] Error:', err.message);
        res.status(500).json({ ok: false, error: err.message });
    }
});

// ============================================
// AI AGENT-AS-ANALYST ENDPOINTS
// ============================================

const aiAnalysisService = require('../services/aiAnalysisService.cjs');
const signalExporter = require('../services/signalExporter.cjs');

// GET /api/v5/signals/export-for-analysis — Export today's confirmed signals for AI prompt
router.get('/signals/export-for-analysis', async (req, res) => {
    try {
        const dateStr = req.query.date || todayIST();
        const exportData = await signalExporter.exportSignalsForAnalysis(dateStr);
        res.json({ ok: true, data: exportData });
    } catch (err) {
        console.error('[V5 /signals/export-for-analysis] Error:', err.message);
        res.status(500).json({ ok: false, error: err.message });
    }
});

// GET /api/v5/ai-analysis — Retrieve saved AI analysis for a date
router.get('/ai-analysis', async (req, res) => {
    try {
        const dateStr = req.query.date || todayIST();
        const analysis = await aiAnalysisService.getAnalysis(dateStr);
        res.json({ ok: true, date: dateStr, analysis });
    } catch (err) {
        console.error('[V5 /ai-analysis (GET)] Error:', err.message);
        res.status(500).json({ ok: false, error: err.message });
    }
});

// POST /api/v5/ai-analysis — Save manual/automated AI analysis JSON
router.post('/ai-analysis', async (req, res) => {
    try {
        const dateStr = req.body.date || todayIST();
        const analysisData = req.body.analysis;

        if (!analysisData) {
            return res.status(400).json({ ok: false, error: 'Analysis data is required' });
        }

        await aiAnalysisService.saveAnalysis(dateStr, analysisData);
        res.json({ ok: true, message: `Analysis saved for ${dateStr}` });
    } catch (err) {
        console.error('[V5 /ai-analysis (POST)] Error:', err.message);
        res.status(500).json({ ok: false, error: err.message });
    }
});

// POST /api/v5/ai-analysis/auto — Auto-analyze signals using Gemini Flash API
router.post('/ai-analysis/auto', async (req, res) => {
    try {
        const dateStr = req.body.date || todayIST();
        const force = req.body.force === true;

        const geminiService = require('../services/geminiService.cjs');
        const result = await geminiService.analyzeSignals(dateStr, force);

        res.json({
            ok: true,
            source: result.source,
            analysis: result.analysis,
            status: geminiService.getStatus()
        });
    } catch (err) {
        console.error('[V5 /ai-analysis/auto] Error:', err.message);
        res.status(err.message.includes('Rate limited') ? 429 : 500)
            .json({ ok: false, error: err.message });
    }
});

module.exports = router;

