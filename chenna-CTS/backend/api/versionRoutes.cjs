/**
 * Strategy Version Management API Routes
 * Handles version listing, comparison, promotion, and history
 */

const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

/**
 * GET /api/versions/:categoryKey
 * Get all versions for a category
 */
router.get('/:categoryKey', async (req, res) => {
    try {
        const { categoryKey } = req.params;

        // Get all strategy improvements (versions) for this category
        const versions = await prisma.strategyImprovement.findMany({
            where: { categoryKey },
            orderBy: { createdAt: 'desc' }
        });

        // Also get current production strategy if it exists
        const category = await prisma.category.findUnique({
            where: { key: categoryKey },
            select: {
                currentStrategyParams: true,
                currentStrategyMetrics: true
            }
        });

        // Format versions for UI
        const formattedVersions = versions.map((v, idx) => ({
            id: v.id,
            versionNumber: versions.length - idx, // Reverse order for V1, V2, V3
            categoryKey: v.categoryKey,
            params: v.improvedParams,
            originalParams: v.originalParams,
            metrics: {
                expectedGain: v.expectedGain,
                // Add actual metrics if we have them
            },
            status: v.status,
            createdAt: v.createdAt,
            notes: v.notes
        }));

        // Add current production as V0 or latest
        if (category?.currentStrategyParams) {
            formattedVersions.unshift({
                id: 'current',
                versionNumber: 0,
                categoryKey,
                params: category.currentStrategyParams,
                metrics: category.currentStrategyMetrics || {},
                status: 'production',
                createdAt: new Date(),
                notes: 'Current production strategy'
            });
        }

        res.json({ ok: true, versions: formattedVersions });
    } catch (error) {
        console.error('[Versions API] Error fetching versions:', error);
        res.status(500).json({ ok: false, error: error.message });
    }
});

/**
 * GET /api/versions/compare/:categoryKey
 * Compare two versions
 * Query params: v1, v2 (version IDs or numbers)
 */
router.get('/compare/:categoryKey', async (req, res) => {
    try {
        const { categoryKey } = req.params;
        const { v1, v2 } = req.query;

        if (!v1 || !v2) {
            return res.status(400).json({
                ok: false,
                error: 'Both v1 and v2 query params required'
            });
        }

        // Fetch both versions
        const version1 = await getVersionData(categoryKey, v1);
        const version2 = await getVersionData(categoryKey, v2);

        if (!version1 || !version2) {
            return res.status(404).json({
                ok: false,
                error: 'One or both versions not found'
            });
        }

        // Calculate diff
        const diff = calculateDiff(version1.params, version2.params);

        res.json({
            ok: true,
            version1,
            version2,
            diff
        });
    } catch (error) {
        console.error('[Versions API] Error comparing versions:', error);
        res.status(500).json({ ok: false, error: error.message });
    }
});

/**
 * POST /api/versions/promote/:versionId
 * Promote a version to production
 */
router.post('/promote/:versionId', async (req, res) => {
    try {
        const { versionId } = req.params;

        // Get the version/improvement
        const improvement = await prisma.strategyImprovement.findUnique({
            where: { id: parseInt(versionId) }
        });

        if (!improvement) {
            return res.status(404).json({ ok: false, error: 'Version not found' });
        }

        // Update category with new strategy params
        await prisma.category.update({
            where: { key: improvement.categoryKey },
            data: {
                currentStrategyParams: improvement.improvedParams,
                updatedAt: new Date()
            }
        });

        // Mark improvement as applied
        await prisma.strategyImprovement.update({
            where: { id: parseInt(versionId) },
            data: { status: 'applied' }
        });

        // Log to adaptation history
        await prisma.adaptationHistory.create({
            data: {
                categoryKey: improvement.categoryKey,
                fromParams: improvement.originalParams,
                toParams: improvement.improvedParams,
                trigger: 'manual_promotion',
                outcome: 'success',
                metrics: { promotedBy: 'user' }
            }
        });

        res.json({
            ok: true,
            message: `Version ${versionId} promoted to production`,
            categoryKey: improvement.categoryKey
        });
    } catch (error) {
        console.error('[Versions API] Error promoting version:', error);
        res.status(500).json({ ok: false, error: error.message });
    }
});

/**
 * POST /api/versions/reject/:versionId
 * Reject a suggested version
 */
router.post('/reject/:versionId', async (req, res) => {
    try {
        const { versionId } = req.params;
        const { reason } = req.body;

        await prisma.strategyImprovement.update({
            where: { id: parseInt(versionId) },
            data: {
                status: 'rejected',
                notes: reason || 'Rejected by user'
            }
        });

        res.json({ ok: true, message: 'Version rejected' });
    } catch (error) {
        console.error('[Versions API] Error rejecting version:', error);
        res.status(500).json({ ok: false, error: error.message });
    }
});

/**
 * Helper: Get version data by ID or number
 */
async function getVersionData(categoryKey, versionId) {
    // If it's 'current' or '0', get current production
    if (versionId === 'current' || versionId === '0') {
        const category = await prisma.category.findUnique({
            where: { key: categoryKey },
            select: {
                currentStrategyParams: true,
                currentStrategyMetrics: true
            }
        });

        return category ? {
            id: 'current',
            versionNumber: 0,
            params: category.currentStrategyParams,
            metrics: category.currentStrategyMetrics || {}
        } : null;
    }

    // Otherwise get from improvements
    const improvement = await prisma.strategyImprovement.findUnique({
        where: { id: parseInt(versionId) }
    });

    if (!improvement) return null;

    return {
        id: improvement.id,
        versionNumber: improvement.id, // Placeholder - you may want actual version numbers
        params: improvement.improvedParams,
        metrics: {
            expectedGain: improvement.expectedGain
        }
    };
}

/**
 * Helper: Calculate diff between two param objects
 */
function calculateDiff(params1, params2) {
    const changed = [];
    const added = [];
    const removed = [];

    // Check for changed and removed
    for (const key in params1) {
        if (!(key in params2)) {
            removed.push({ param: key, value: params1[key] });
        } else if (JSON.stringify(params1[key]) !== JSON.stringify(params2[key])) {
            changed.push({
                param: key,
                from: params1[key],
                to: params2[key]
            });
        }
    }

    // Check for added
    for (const key in params2) {
        if (!(key in params1)) {
            added.push({ param: key, value: params2[key] });
        }
    }

    return { changed, added, removed };
}

module.exports = router;
