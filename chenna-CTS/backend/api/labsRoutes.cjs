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

            // Extract metrics for display
            const metrics = latestRun.performanceMetrics || {};
            const strategyParams = latestRun.strategyParams || {};
            const recommendedLogic = latestRun.recommendedLogic || {};

            // Use entryConditions/exitConditions from record, fallback to recommendedLogic.entry/exit
            const entryConditions = latestRun.entryConditions || recommendedLogic.entry || {};
            const exitConditions = latestRun.exitConditions || recommendedLogic.exit || {};
            const trapRules = latestRun.trapRules || recommendedLogic.trapAvoidance || [];

            // Debug log to see what's in the record
            console.log(`[Labs API] Entry conditions type: ${typeof entryConditions}, keys: ${Object.keys(entryConditions).length}`);
            console.log(`[Labs API] RecommendedLogic keys: ${Object.keys(recommendedLogic).join(', ')}`);

            // Check if we have meaningful data - if not, fall through to JSON file
            const hasEntryData = Object.keys(entryConditions).length > 0;
            const hasRecommendedEntryData = recommendedLogic.entry && Object.keys(recommendedLogic.entry).length > 0;

            if (!hasEntryData && !hasRecommendedEntryData) {
                console.log(`[Labs API] DB record ${latestRun.ttVersion} has NO entry data, falling through to JSON file`);
            } else {

                // Transform to match expected format for TimeTravelLabsWindow.tsx
                return res.json({

                    ok: true,
                    hasResult: true,
                    source: 'database',
                    result: {
                        runId: latestRun.id,
                        ttVersion: latestRun.ttVersion,

                        // V1 Strategy display data
                        v1Strategy: {
                            thesis: recommendedLogic.thesis || `Optimized entry for ${categoryKey.replace(/_/g, ' ')} category`,
                            categoryIntent: recommendedLogic.categoryIntent || 'Capture reversal opportunities',
                            // Build confirmations from entry conditions
                            confirmations: Object.entries(entryConditions).map(([key, value], idx) => ({
                                rank: idx + 1,
                                rule: key,
                                description: typeof value === 'string' ? value : JSON.stringify(value)
                            })).slice(0, 5),
                            // Build invalidations from trap rules
                            invalidations: (Array.isArray(trapRules) ? trapRules : []).map(rule => ({
                                rule: typeof rule === 'string' ? rule : (rule?.type || rule?.name || 'Trap filter')
                            })),
                            expectedBehavior: {
                                avgHoldingTime: `${strategyParams.maxHoldingDays || 10} days`,
                                avgMove: `${strategyParams.targetR || 2.5}%`,
                                winRate: `${(latestRun.accuracy * 100).toFixed(1)}%`,
                                avgDrawdown: `${((metrics.drawdown || 0) * 100).toFixed(1)}%`
                            },
                            // Entry/Exit for display
                            entryRules: entryConditions,
                            exitRules: exitConditions
                        },

                        // Summary for display
                        summary: {
                            topWinRate: latestRun.accuracy * 100,
                            topStrategy: {
                                name: strategyParams.name || recommendedLogic.strategyName || 'Labs Strategy',
                                metrics: {
                                    winRate: latestRun.accuracy * 100,
                                    avgPnl: metrics.pnl || 0,
                                    maxDrawdown: (metrics.drawdown || 0) * 100,
                                    expectancy: metrics.expectancy || 0,
                                    tradeCount: latestRun.tradesTested || 0
                                }
                            }
                        },

                        // Top strategies list
                        top3Strategies: [{
                            name: strategyParams.name || 'Labs Strategy',
                            metrics: {
                                winRate: latestRun.accuracy * 100,
                                avgPnl: metrics.pnl || 0,
                                maxDrawdown: (metrics.drawdown || 0) * 100,
                                expectancy: metrics.expectancy || 0,
                                tradeCount: latestRun.tradesTested || 0
                            }
                        }],

                        // Cache status
                        cacheStatus: latestRun.cacheStatus || { cached: 0, uncached: 0, total: 0 },

                        // Raw data for advanced display
                        entryConditions: entryConditions,
                        exitConditions: exitConditions,
                        strategyParams: strategyParams,
                        performanceMetrics: metrics
                    },
                    fileName: `db:${latestRun.ttVersion}`,
                    createdAt: latestRun.createdAt
                });
            }
            // If else block didn't return, fall through to JSON file section below
        }

        // ===========================================
        // 2. FALLBACK: JSON files (when database has no data or empty data)
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
 * GET /api/labs/versions/:categoryKey
 * List all TT versions for a category
 * Returns: [{ ttVersion, accuracy, createdAt, ... }]
 */
router.get('/versions/:categoryKey', async (req, res) => {
    try {
        const { categoryKey } = req.params;

        const versions = await prisma.labsRun.findMany({
            where: { categoryKey },
            orderBy: { createdAt: 'desc' },
            select: {
                id: true,
                ttVersion: true,
                accuracy: true,
                tradesTested: true,
                promotedToVersionId: true,
                createdAt: true
            }
        });

        res.json({
            ok: true,
            categoryKey,
            versions: versions.map(v => ({
                id: v.id,
                ttVersion: v.ttVersion,
                accuracy: v.accuracy * 100,
                tradesTested: v.tradesTested,
                isPromoted: !!v.promotedToVersionId,
                createdAt: v.createdAt
            })),
            latestVersion: versions[0]?.ttVersion || null
        });
    } catch (error) {
        console.error('[Labs API] Versions list error:', error);
        res.status(500).json({ ok: false, error: error.message });
    }
});

/**
 * GET /api/labs/run/:id
 * Get a specific Labs run by ID (to view its logic)
 */
router.get('/run/:id', async (req, res) => {
    try {
        const { id } = req.params;

        const labsRun = await prisma.labsRun.findUnique({
            where: { id }
        });

        if (!labsRun) {
            return res.status(404).json({ ok: false, error: 'Labs run not found' });
        }

        res.json({
            ok: true,
            result: {
                id: labsRun.id,
                ttVersion: labsRun.ttVersion,
                categoryKey: labsRun.categoryKey,
                accuracy: labsRun.accuracy,
                tradesTested: labsRun.tradesTested,
                entryConditions: labsRun.entryConditions,
                exitConditions: labsRun.exitConditions,
                recommendedLogic: labsRun.recommendedLogic,
                strategyParams: labsRun.strategyParams,
                performanceMetrics: labsRun.performanceMetrics,
                isPromoted: !!labsRun.promotedToVersionId,
                createdAt: labsRun.createdAt
            }
        });
    } catch (error) {
        console.error('[Labs API] Get run error:', error);
        res.status(500).json({ ok: false, error: error.message });
    }
});

/**
 * DELETE /api/labs/run/:id
 * Delete a specific Labs run
 */
router.delete('/run/:id', async (req, res) => {
    try {
        const { id } = req.params;

        const labsRun = await prisma.labsRun.findUnique({
            where: { id }
        });

        if (!labsRun) {
            return res.status(404).json({ ok: false, error: 'Labs run not found' });
        }

        if (labsRun.promotedToVersionId) {
            return res.status(400).json({
                ok: false,
                error: 'Cannot delete a promoted version. Remove strategy first.'
            });
        }

        await prisma.labsRun.delete({
            where: { id }
        });

        console.log(`[Labs API] ✅ Deleted Labs run ${labsRun.ttVersion}`);

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

// ============================================================
// RESEARCH BACKTEST ENDPOINTS (Phase 2 - V.bX Versioning)
// ============================================================

/**
 * POST /api/labs/research/save
 * Save Research Backtest results with V.bX versioning
 * Creates versions like V1.b1, V1.b2, etc. linked to parent TT version
 */
router.post('/research/save', async (req, res) => {
    try {
        const {
            categoryKey,
            baseTTVersion,       // e.g., "TT-V1"
            beforeMetrics,       // Metrics BEFORE shadow learning
            afterMetrics,        // Metrics AFTER shadow learning
            shadowReport,        // Shadow learner analysis
            entryConditions,     // Refined entry conditions
            exitConditions,      // Refined exit conditions
            refinements          // What was changed
        } = req.body;

        if (!categoryKey || !baseTTVersion) {
            return res.status(400).json({
                ok: false,
                error: 'Missing required fields: categoryKey, baseTTVersion'
            });
        }

        // Find the parent Labs run
        const parentLabs = await prisma.labsRun.findFirst({
            where: { categoryKey, ttVersion: baseTTVersion },
            orderBy: { createdAt: 'desc' }
        });

        if (!parentLabs) {
            return res.status(404).json({
                ok: false,
                error: `Parent Labs version ${baseTTVersion} not found`
            });
        }

        // Count existing research runs for this TT version to generate V.bX
        const existingCount = await prisma.researchRun.count({
            where: { categoryKey, baseTTVersion }
        });

        // Generate version: V1.b1, V1.b2, etc.
        const versionNumber = baseTTVersion.replace('TT-V', '');
        const researchVersion = `V${versionNumber}.b${existingCount + 1}`;

        // Create the research run
        const researchRun = await prisma.researchRun.create({
            data: {
                categoryKey,
                baseLabsRunId: parentLabs.id,
                baseTTVersion,
                researchVersion,
                entryConditions: entryConditions || parentLabs.entryConditions,
                exitConditions: exitConditions || parentLabs.exitConditions,
                refinements: refinements || {},
                beforeMetrics: beforeMetrics || {},
                afterMetrics: afterMetrics || {},
                shadowReport: shadowReport || {}
            }
        });

        console.log(`✅ Research run saved: ${researchVersion} (based on ${baseTTVersion})`);

        res.json({
            ok: true,
            researchRun: {
                id: researchRun.id,
                researchVersion: researchRun.researchVersion,
                baseTTVersion: researchRun.baseTTVersion,
                beforeMetrics: researchRun.beforeMetrics,
                afterMetrics: researchRun.afterMetrics
            },
            message: `${researchVersion} saved successfully`
        });
    } catch (error) {
        console.error('[Labs API] Research save error:', error);
        res.status(500).json({ ok: false, error: error.message });
    }
});

/**
 * GET /api/labs/research/versions/:categoryKey
 * List all research runs for a category
 */
router.get('/research/versions/:categoryKey', async (req, res) => {
    try {
        const { categoryKey } = req.params;

        const versions = await prisma.researchRun.findMany({
            where: { categoryKey },
            orderBy: { createdAt: 'desc' },
            select: {
                id: true,
                researchVersion: true,
                baseTTVersion: true,
                beforeMetrics: true,
                afterMetrics: true,
                promotedToStrategyId: true,
                createdAt: true
            }
        });

        res.json({
            ok: true,
            categoryKey,
            versions: versions.map(v => ({
                id: v.id,
                researchVersion: v.researchVersion,
                baseTTVersion: v.baseTTVersion,
                improvement: v.afterMetrics?.winRate - v.beforeMetrics?.winRate || 0,
                isPromoted: !!v.promotedToStrategyId,
                createdAt: v.createdAt
            }))
        });
    } catch (error) {
        console.error('[Labs API] Research versions error:', error);
        res.status(500).json({ ok: false, error: error.message });
    }
});

/**
 * GET /api/labs/research/run/:id
 * Get specific research run details
 */
router.get('/research/run/:id', async (req, res) => {
    try {
        const { id } = req.params;

        const run = await prisma.researchRun.findUnique({
            where: { id }
        });

        if (!run) {
            return res.status(404).json({ ok: false, error: 'Research run not found' });
        }

        res.json({
            ok: true,
            result: run
        });
    } catch (error) {
        console.error('[Labs API] Research run error:', error);
        res.status(500).json({ ok: false, error: error.message });
    }
});

/**
 * POST /api/labs/research/promote
 * Promote a Research run (V.bX) to Strategy
 */
router.post('/research/promote', async (req, res) => {
    try {
        const { researchRunId, categoryKey, targetVersion } = req.body;

        if (!researchRunId || !categoryKey) {
            return res.status(400).json({
                ok: false,
                error: 'Missing required fields: researchRunId, categoryKey'
            });
        }

        // Get the research run
        const researchRun = await prisma.researchRun.findUnique({
            where: { id: researchRunId }
        });

        if (!researchRun) {
            return res.status(404).json({
                ok: false,
                error: 'Research run not found'
            });
        }

        // Determine target version (V1, V2, etc.)
        const version = targetVersion || researchRun.researchVersion.split('.')[0]; // V1.b1 -> V1

        // Check if strategy already exists for this version
        const existingStrategy = await prisma.promotedStrategy.findFirst({
            where: { categoryKey, version }
        });

        let strategyId;
        if (existingStrategy) {
            // Update existing strategy
            await prisma.promotedStrategy.update({
                where: { id: existingStrategy.id },
                data: {
                    entryRules: researchRun.entryConditions || {},
                    exitRules: researchRun.exitConditions || {},
                    promotedFromResearch: researchRun.researchVersion,
                    updatedAt: new Date()
                }
            });
            strategyId = existingStrategy.id;
            console.log(`✅ Updated existing Strategy ${version} from ${researchRun.researchVersion}`);
        } else {
            // Create new strategy
            const newStrategy = await prisma.promotedStrategy.create({
                data: {
                    categoryKey,
                    version,
                    name: `${categoryKey.replace(/_/g, ' ')} ${version}`,
                    entryRules: researchRun.entryConditions || {},
                    exitRules: researchRun.exitConditions || {},
                    promotedFromResearch: researchRun.researchVersion,
                    status: 'ACTIVE'
                }
            });
            strategyId = newStrategy.id;
            console.log(`✅ Created new Strategy ${version} from ${researchRun.researchVersion}`);
        }


        // Mark research run as promoted
        await prisma.researchRun.update({
            where: { id: researchRunId },
            data: { promotedToStrategyId: strategyId }
        });

        res.json({
            ok: true,
            strategyId,
            version,
            promotedFrom: researchRun.researchVersion,
            message: `${researchRun.researchVersion} promoted to Strategy ${version}`
        });
    } catch (error) {
        console.error('[Labs API] Research promote error:', error);
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
 * POST /api/labs/promote
 * Promote latest Labs run to Strategy version (for Research Backtest modal)
 * This endpoint uses categoryKey and targetVersion (frontend-friendly version)
 */
router.post('/promote', async (req, res) => {
    try {
        const { categoryKey, targetVersion, refinedByShadow } = req.body;

        if (!categoryKey || !targetVersion) {
            return res.status(400).json({
                ok: false,
                error: 'Missing required fields: categoryKey, targetVersion'
            });
        }

        console.log(`[Labs API] Promote request: ${categoryKey} → ${targetVersion} (refined: ${refinedByShadow})`);

        // Get the latest Labs run for this category
        const latestRun = await prisma.labsRun.findFirst({
            where: { categoryKey },
            orderBy: { createdAt: 'desc' }
        });

        if (!latestRun) {
            return res.status(404).json({
                ok: false,
                error: 'No Labs run found for this category. Run Labs first.'
            });
        }

        // Get category
        const category = await prisma.category.findUnique({
            where: { key: categoryKey }
        });

        if (!category) {
            return res.status(404).json({ ok: false, error: 'Category not found' });
        }

        // Check if version exists
        const existingVersion = await prisma.strategy.findFirst({
            where: {
                categoryId: category.id,
                version: targetVersion
            }
        });

        let strategy;
        if (existingVersion) {
            // Update existing version
            strategy = await prisma.strategy.update({
                where: { id: existingVersion.id },
                data: {
                    rules: latestRun.entryConditions || latestRun.recommendedLogic?.entry || {},
                    params: {
                        ...latestRun.exitConditions,
                        ...latestRun.strategyParams,
                        refinedByShadow
                    },
                    metrics: latestRun.performanceMetrics,
                    description: `Promoted from ${latestRun.ttVersion} - ${(latestRun.accuracy * 100).toFixed(1)}% accuracy${refinedByShadow ? ' (Shadow Refined)' : ''}`,
                    promoted: true,
                    updatedAt: new Date()
                }
            });
            console.log(`[Labs API] ✅ Updated ${targetVersion} from ${latestRun.ttVersion}`);
        } else {
            // Create new version
            strategy = await prisma.strategy.create({
                data: {
                    categoryId: category.id,
                    version: targetVersion,
                    promoted: true,
                    rules: latestRun.entryConditions || latestRun.recommendedLogic?.entry || {},
                    params: {
                        ...latestRun.exitConditions,
                        ...latestRun.strategyParams,
                        refinedByShadow
                    },
                    metrics: latestRun.performanceMetrics,
                    description: `Promoted from ${latestRun.ttVersion} - ${(latestRun.accuracy * 100).toFixed(1)}% accuracy${refinedByShadow ? ' (Shadow Refined)' : ''}`
                }
            });
            console.log(`[Labs API] ✅ Created ${targetVersion} from ${latestRun.ttVersion}`);
        }

        // Mark labs run as promoted
        await prisma.labsRun.update({
            where: { id: latestRun.id },
            data: { promotedToVersionId: strategy.id }
        });

        res.json({
            ok: true,
            version: targetVersion,
            strategyId: strategy.id,
            fromTTVersion: latestRun.ttVersion,
            overrode: !!existingVersion
        });
    } catch (error) {
        console.error('[Labs API] Promote error:', error);
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
