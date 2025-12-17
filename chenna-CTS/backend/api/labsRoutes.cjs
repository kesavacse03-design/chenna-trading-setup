/**
 * Labs API Routes
 * Endpoints for Time-Travel Labs research and version management
 */

const express = require('express');
const router = express.Router();
const labsService = require('../services/timeTravelLabsService.cjs');
const versionService = require('../services/versionManagerService.cjs');
const trapService = require('../services/trapDetectorService.cjs');

// Initialize Prisma Client at module level
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

/**
 * POST /api/labs/run-timetravel
 * Run Time-Travel Labs research for a category
 */
router.post('/run-timetravel', async (req, res) => {
    console.log('========================================');
    console.log('[Labs API] ⚡ ROUTE HIT! Time-Travel Labs endpoint called');
    console.log('========================================');

    try {
        const { categoryKey, stocks, options } = req.body;

        if (!categoryKey || !stocks || !Array.isArray(stocks)) {
            console.log('[Labs API] ❌ Validation failed - missing fields');
            return res.status(400).json({
                ok: false,
                error: 'Missing required fields: categoryKey, stocks'
            });
        }

        console.log(`[Labs API] ✅ Starting Time-Travel Labs for ${categoryKey} with ${stocks.length} stocks`);
        console.log(`[Labs API] Mode: ${options?.mode || 'default'}`);

        // Use REAL Labs service with 220+ combination testing
        const labsService = require('../services/timeTravelLabsService.cjs');

        console.log('[Labs API] 🔬 Calling runTimeTravelLabs...');
        const result = await labsService.runTimeTravelLabs(categoryKey, stocks, {
            mode: 'real'  // Use real data, not mock
        });

        console.log('[Labs API] ✅ Labs completed successfully');
        console.log(`[Labs API] Result: ${result.accuracy * 100}% accuracy, ${result.recommendedLogic?.entry?.length || 0} entry conditions`);

        res.json({
            ok: true,
            ...result
        });
    } catch (error) {
        console.error('========================================');
        console.error('[Labs API] ❌ ERROR:', error.message);
        console.error('[Labs API] Stack:', error.stack);
        console.error('========================================');
        res.status(500).json({
            ok: false,
            error: error.message,
            stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
    }
});

/**
 * GET /api/labs/latest/:categoryKey
 * Get the latest Labs run result for a category
 * 
 * PRIORITY:
 * 1. Query database (LabsRun table) - source of truth
 * 2. Fall back to JSON files (legacy support)
 */
router.get('/latest/:categoryKey', async (req, res) => {
    try {
        const { categoryKey } = req.params;

        // ===========================================
        // 1. DATABASE FIRST (source of truth for production)
        // ===========================================
        const latestRun = await prisma.labsRun.findFirst({
            where: { categoryKey },
            orderBy: { createdAt: 'desc' }
        });

        if (latestRun) {
            console.log(`[Labs API] ✅ Loaded from DATABASE: ${latestRun.ttVersion} for ${categoryKey}`);

            // Transform to match expected format
            return res.json({
                ok: true,
                hasResult: true,
                source: 'database',
                result: {
                    runId: latestRun.id,
                    v1Strategy: {
                        thesis: latestRun.recommendedLogic?.thesis || null,
                        categoryIntent: latestRun.recommendedLogic?.categoryIntent || null,
                        confirmations: latestRun.recommendedLogic?.confirmations || [],
                        invalidations: latestRun.recommendedLogic?.invalidations || [],
                        expectedBehavior: latestRun.recommendedLogic?.expectedBehavior || null
                    },
                    summary: {
                        topWinRate: latestRun.accuracy * 100,
                        topStrategy: {
                            name: latestRun.strategyParams?.name || latestRun.recommendedLogic?.strategyName || 'Labs Strategy',
                            metrics: latestRun.performanceMetrics || {}
                        }
                    },
                    top3Strategies: [{
                        name: latestRun.strategyParams?.name || 'Labs Strategy',
                        metrics: latestRun.performanceMetrics || {}
                    }],
                    cacheStatus: latestRun.recommendedLogic?.cacheStatus || { cached: 0, uncached: 0, total: 0 }
                },
                fileName: `db:${latestRun.ttVersion}`,
                createdAt: latestRun.createdAt
            });
        }

        // ===========================================
        // 2. FALLBACK: JSON files (legacy support)
        // ===========================================
        const fs = require('fs');
        const path = require('path');
        const resultsDir = path.join(__dirname, '..', 'results');

        // Find the latest tt_ file for this category
        const files = fs.readdirSync(resultsDir)
            .filter(f => f.startsWith(`tt_${categoryKey}_`) && f.endsWith('.json'))
            .sort()
            .reverse(); // Most recent first (timestamp in filename)

        if (files.length === 0) {
            console.log(`[Labs API] No Labs result found for ${categoryKey} (checked DB and files)`);
            return res.json({ ok: false, error: 'No previous Labs run found', hasResult: false });
        }

        const latestFile = path.join(resultsDir, files[0]);
        const rawData = fs.readFileSync(latestFile, 'utf-8');
        const data = JSON.parse(rawData);

        console.log(`[Labs API] Loaded from FILE: ${files[0]}`);

        res.json({
            ok: true,
            hasResult: true,
            source: 'file',
            result: data,
            fileName: files[0]
        });
    } catch (error) {
        console.error('[Labs API] Latest result error:', error);
        res.status(500).json({ ok: false, error: error.message, hasResult: false });
    }
});


/**
 * GET /api/labs/cache-status/:categoryKey
 * Get cache status for category stocks
 */
router.get('/cache-status/:categoryKey', async (req, res) => {
    try {
        const { categoryKey } = req.params;

        // Get stocks for category
        const { PrismaClient } = require('@prisma/client');
        const prisma = new PrismaClient();

        const category = await prisma.category.findUnique({
            where: { key: categoryKey },
            include: {
                stocks: {
                    include: { stock: true }
                }
            }
        });

        if (!category) {
            return res.status(404).json({ ok: false, error: 'Category not found' });
        }

        const stocks = category.stocks.map(sc => ({
            symbol: sc.stock.symbol,
            listedDate: sc.addedDate
        }));

        const status = await labsService.checkLabsCache(stocks);

        res.json({
            ok: true,
            categoryKey,
            totalStocks: stocks.length,
            cached: status.cached,
            uncached: status.uncached.length,
            cacheHitRate: stocks.length > 0 ? (status.cached / stocks.length * 100).toFixed(1) : 0
        });
    } catch (error) {
        console.error('[Labs API] Cache status error:', error);
        res.status(500).json({ ok: false, error: error.message });
    }
});

/**
 * POST /api/labs/promote-to-strategy
 * Promote Labs run to Strategy version
 */
router.post('/promote-to-strategy', async (req, res) => {
    try {
        const { labsRunId, categoryKey, targetVersion } = req.body;  // targetVersion: 'V1', 'V2', 'V3'

        if (!labsRunId || !categoryKey) {
            return res.status(400).json({
                ok: false,
                error: 'Missing required fields: labsRunId, categoryKey'
            });
        }

        console.log(`[Labs API] Promoting Labs run ${labsRunId} to ${targetVersion || 'V1'}`);

        // Get LabsRun
        const labsRun = await prisma.labsRun.findUnique({
            where: { id: labsRunId }
        });

        if (!labsRun) {
            return res.status(404).json({ ok: false, error: 'Labs run not found' });
        }

        if (labsRun.promotedToVersionId) {
            return res.status(400).json({
                ok: false,
                error: `Already promoted to strategy ID ${labsRun.promotedToVersionId}`
            });
        }

        // Get category
        const category = await prisma.category.findUnique({
            where: { key: categoryKey }
        });

        if (!category) {
            return res.status(404).json({ ok: false, error: 'Category not found' });
        }

        const versionToCreate = targetVersion || 'V1';

        // Check if version exists
        const existingVersion = await prisma.strategy.findFirst({
            where: {
                categoryId: category.id,
                version: versionToCreate
            }
        });

        let strategy;
        if (existingVersion) {
            // Update existing version with Labs strategy
            strategy = await prisma.strategy.update({
                where: { id: existingVersion.id },
                data: {
                    rules: labsRun.entryConditions,
                    params: {
                        ...labsRun.exitConditions,
                        strategyParams: labsRun.strategyParams  // ✅ ADD: Exact Labs parameters
                    },
                    metrics: labsRun.performanceMetrics,
                    description: `Updated from ${labsRun.ttVersion} - ${(labsRun.accuracy * 100).toFixed(1)}% accuracy`,
                    updatedAt: new Date()
                }
            });
            console.log(`[Labs API] ✅ Updated ${versionToCreate} with Labs strategy (${(labsRun.accuracy * 100).toFixed(1)}% accuracy)`);
        } else {
            // Create new version with Labs strategy
            strategy = await prisma.strategy.create({
                data: {
                    categoryId: category.id,
                    version: versionToCreate,
                    promoted: true,
                    rules: labsRun.entryConditions,
                    params: {
                        ...labsRun.exitConditions,
                        strategyParams: labsRun.strategyParams  // ✅ ADD: Exact Labs parameters
                    },
                    metrics: labsRun.performanceMetrics,
                    description: `Promoted from ${labsRun.ttVersion} - ${(labsRun.accuracy * 100).toFixed(1)}% accuracy`
                }
            });
            console.log(`[Labs API] ✅ Created ${versionToCreate} from Labs (${(labsRun.accuracy * 100).toFixed(1)}% accuracy)`);
        }

        // Mark labs run as promoted
        await prisma.labsRun.update({
            where: { id: labsRunId },
            data: {
                promotedToVersionId: strategy.id
            }
        });

        res.json({
            ok: true,
            version: versionToCreate,
            strategyId: strategy.id,
            overrode: !!existingVersion
        });
    } catch (error) {
        console.error('[Labs API] Promotion error:', error);
        res.status(500).json({ ok: false, error: error.message });
    }
});

/**
 * GET /api/labs/check-version/:categoryKey/:version
 * Check if a specific version exists for a category
 */
router.get('/check-version/:categoryKey/:version', async (req, res) => {
    try {
        const { categoryKey, version } = req.params;

        const category = await prisma.category.findUnique({
            where: { key: categoryKey }
        });

        if (!category) {
            return res.status(404).json({ ok: false, error: 'Category not found' });
        }

        const existingVersion = await prisma.strategy.findFirst({
            where: {
                categoryId: category.id,
                version: version.toUpperCase()
            }
        });

        res.json({
            ok: true,
            exists: !!existingVersion,
            version: version.toUpperCase(),
            categoryKey
        });
    } catch (error) {
        console.error('[Labs API] Check version error:', error);
        res.status(500).json({ ok: false, error: error.message });
    }
});

/**
 * GET /api/labs/versions/:categoryKey
 * Get version history for category
 */
router.get('/versions/:categoryKey', async (req, res) => {
    try {
        const { categoryKey } = req.params;

        const versions = await versionService.getVersionHistory(categoryKey);

        res.json({
            ok: true,
            categoryKey,
            versions,
            count: versions.length
        });
    } catch (error) {
        console.error('[Labs API] Version history error:', error);
        res.status(500).json({ ok: false, error: error.message });
    }
});

/**
 * GET /api/labs/run/:runId
 * Get specific Labs run details
 */
router.get('/run/:runId', async (req, res) => {
    try {
        const { runId } = req.params;
        const { PrismaClient } = require('@prisma/client');
        const prisma = new PrismaClient();

        const labsRun = await prisma.labsRun.findUnique({
            where: { id: runId }
        });

        if (!labsRun) {
            return res.status(404).json({ ok: false, error: 'Labs run not found' });
        }

        res.json({
            ok: true,
            run: labsRun
        });
    } catch (error) {
        console.error('[Labs API] Get run error:', error);
        res.status(500).json({ ok: false, error: error.message });
    }
});

/**
 * GET /api/labs/runs/:categoryKey
 * Get all Labs runs for a category (for previous TT versions display)
 */
router.get('/runs/:categoryKey', async (req, res) => {
    try {
        const { categoryKey } = req.params;

        const labsRuns = await prisma.labsRun.findMany({
            where: { categoryKey },
            orderBy: { createdAt: 'desc' },
            take: 10  // Limit to last 10 TT versions
        });

        res.json({
            ok: true,
            categoryKey,
            runs: labsRuns,
            count: labsRuns.length
        });
    } catch (error) {
        console.error('[Labs API] Get runs error:', error);
        res.status(500).json({ ok: false, error: error.message });
    }
});

/**
 * GET /api/labs/strategy/:categoryKey
 * Get latest Labs strategy for backtest integration
 * Returns strategyParams ready for backtest
 */
router.get('/strategy/:categoryKey', async (req, res) => {
    try {
        const { categoryKey } = req.params;

        // Get most recent Labs run for this category
        const latestRun = await prisma.labsRun.findFirst({
            where: { categoryKey },
            orderBy: { createdAt: 'desc' }
        });

        if (!latestRun) {
            return res.status(404).json({
                ok: false,
                error: `No Labs strategy found for ${categoryKey}. Run Time-Travel Labs first.`
            });
        }

        res.json({
            ok: true,
            categoryKey,
            ttVersion: latestRun.ttVersion,
            accuracy: latestRun.accuracy,
            tradesTested: latestRun.tradesTested,
            strategyParams: latestRun.strategyParams,  // ✅ For backtest
            recommendedLogic: latestRun.recommendedLogic,  // For display
            performanceMetrics: latestRun.performanceMetrics,
            createdAt: latestRun.createdAt
        });
    } catch (error) {
        console.error('[Labs API] Get strategy error:', error);
        res.status(500).json({ ok: false, error: error.message });
    }
});


/**
 * DELETE /api/labs/run/:runId
 * Delete a specific Labs run (TT version)
 */
router.delete('/run/:runId', async (req, res) => {
    try {
        const { runId } = req.params;

        // Check if run exists
        const labsRun = await prisma.labsRun.findUnique({
            where: { id: runId }
        });

        if (!labsRun) {
            return res.status(404).json({ ok: false, error: 'Labs run not found' });
        }

        // Check if already promoted
        if (labsRun.promotedToVersionId) {
            return res.status(400).json({
                ok: false,
                error: 'Cannot delete: This TT version has been promoted to a strategy'
            });
        }

        // Delete the run
        await prisma.labsRun.delete({
            where: { id: runId }
        });

        console.log(`[Labs API] Deleted ${labsRun.ttVersion} for ${labsRun.categoryKey}`);

        res.json({
            ok: true,
            deleted: labsRun.ttVersion,
            message: `${labsRun.ttVersion} deleted successfully`
        });
    } catch (error) {
        console.error('[Labs API] Delete run error:', error);
        res.status(500).json({ ok: false, error: error.message });
    }
});

/**
 * POST /api/traps/detect
 * Detect traps for specific stocks
 */
router.post('/detect', async (req, res) => {
    try {
        const { stocks, stockData } = req.body;

        if (!stocks || !stockData) {
            return res.status(400).json({
                ok: false,
                error: 'Missing required fields: stocks, stockData'
            });
        }

        const trapResults = await trapService.detectTrapsForStocks(stocks, stockData);

        res.json({
            ok: true,
            traps: trapResults
        });
    } catch (error) {
        console.error('[Traps API] Detection error:', error);
        res.status(500).json({ ok: false, error: error.message });
    }
});

/**
 * GET /api/traps/history/:symbol
 * Get trap history for a symbol
 */
router.get('/history/:symbol', async (req, res) => {
    try {
        const { symbol } = req.params;
        const { days } = req.query;

        const history = await trapService.getTrapHistory(symbol, days ? parseInt(days) : 90);

        res.json({
            ok: true,
            symbol,
            traps: history,
            count: history.length
        });
    } catch (error) {
        console.error('[Traps API] History error:', error);
        res.status(500).json({ ok: false, error: error.message });
    }
});

module.exports = router;
