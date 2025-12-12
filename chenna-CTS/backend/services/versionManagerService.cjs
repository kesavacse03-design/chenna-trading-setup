/**
 * Version Manager Service
 * Manages strategy version lifecycle (V1, V2, V3...)
 * Handles promotion from Labs to Strategy versions
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

/**
 * Promote Labs run to Strategy version
 * @param {string} labsRunId - Labs run ID to promote
 * @param {string} categoryKey - Category key
 * @param {Object} options - { overrideV1: boolean }
 * @returns {Promise<Object>} Created strategy version
 */
async function promoteLabsToStrategy(labsRunId, categoryKey, options = {}) {
    // Get Labs run
    const labsRun = await prisma.labsRun.findUnique({
        where: { id: labsRunId }
    });

    if (!labsRun) {
        throw new Error('Labs run not found');
    }

    // Check if already promoted
    if (labsRun.promotedToVersionId) {
        const existing = await prisma.strategyVersion.findUnique({
            where: { id: labsRun.promotedToVersionId }
        });
        if (existing) {
            return { version: existing, alreadyPromoted: true };
        }
    }

    // Determine version number
    let versionNumber = 1;
    let versionTag = 'V1';

    const existingV1 = await prisma.strategyVersion.findFirst({
        where: { categoryKey, version: 'V1' }
    });

    if (existingV1 && !options.overrideV1) {
        // Create next version
        const maxVersion = await prisma.strategyVersion.findFirst({
            where: { categoryKey },
            orderBy: { createdAt: 'desc' }
        });

        if (maxVersion) {
            const match = maxVersion.version.match(/V(\d+)/);
            if (match) {
                versionNumber = parseInt(match[1]) + 1;
                versionTag = `V${versionNumber}`;
            }
        }
    }

    // Create strategy version
    const strategyVersion = await prisma.strategyVersion.create({
        data: {
            categoryKey,
            version: versionTag,
            description: `Time-Travel Labs ${labsRun.ttVersion} - Auto-generated strategy`,
            rules: labsRun.recommendedLogic,
            params: {
                entry: labsRun.entryConditions,
                exit: labsRun.exitConditions,
                trapAvoidance: labsRun.trapRules
            },
            accuracy: labsRun.accuracy,
            totalSignals: labsRun.tradesTested,
            successfulSignals: Math.round(labsRun.tradesTested * labsRun.accuracy),
            failedSignals: Math.round(labsRun.tradesTested * (1 - labsRun.accuracy)),
            avgPnL: labsRun.performanceMetrics.expectancy || 0,
            maxDrawdown: labsRun.performanceMetrics.drawdown || 0,
            expectancy: labsRun.performanceMetrics.expectancy || 0,
            isActive: true,
            isShadow: false,
            promotedAt: new Date(),
            promotedFrom: labsRun.ttVersion,
            aiGenerated: true,
            learningSource: { type: 'labs', runId: labsRunId },
            labsRunId: labsRunId,
            source: 'labs'
        }
    });

    // Deactivate other versions
    await prisma.strategyVersion.updateMany({
        where: {
            categoryKey,
            isActive: true,
            id: { not: strategyVersion.id }
        },
        data: { isActive: false }
    });

    // Update Labs run
    await prisma.labsRun.update({
        where: { id: labsRunId },
        data: { promotedToVersionId: strategyVersion.id }
    });

    console.log(`[VersionManager] Promoted Labs run ${labsRunId} to ${versionTag}`);

    return { version: strategyVersion, created: true };
}

/**
 * Get version history for category
 */
async function getVersionHistory(categoryKey) {
    return await prisma.strategyVersion.findMany({
        where: { categoryKey },
        orderBy: { createdAt: 'desc' }
    });
}

/**
 * Switch active version
 */
async function switchVersion(categoryKey, versionId) {
    // Deactivate all versions
    await prisma.strategyVersion.updateMany({
        where: { categoryKey, isActive: true },
        data: { isActive: false }
    });

    // Activate selected version
    const version = await prisma.strategyVersion.update({
        where: { id: versionId },
        data: { isActive: true }
    });

    console.log(`[VersionManager] Switched to ${version.version} for ${categoryKey}`);

    return version;
}

/**
 * Compare two versions
 */
async function compareVersions(versionId1, versionId2) {
    const v1 = await prisma.strategyVersion.findUnique({ where: { id: versionId1 } });
    const v2 = await prisma.strategyVersion.findUnique({ where: { id: versionId2 } });

    if (!v1 || !v2) {
        throw new Error('Version not found');
    }

    return {
        v1: {
            version: v1.version,
            accuracy: v1.accuracy,
            expectancy: v1.expectancy,
            maxDrawdown: v1.maxDrawdown,
            source: v1.source,
            createdAt: v1.createdAt
        },
        v2: {
            version: v2.version,
            accuracy: v2.accuracy,
            expectancy: v2.expectancy,
            maxDrawdown: v2.maxDrawdown,
            source: v2.source,
            createdAt: v2.createdAt
        },
        comparison: {
            accuracyDiff: (v2.accuracy || 0) - (v1.accuracy || 0),
            expectancyDiff: (v2.expectancy || 0) - (v1.expectancy || 0),
            drawdownDiff: (v2.maxDrawdown || 0) - (v1.maxDrawdown || 0)
        }
    };
}

/**
 * Get active version for category
 */
async function getActiveVersion(categoryKey) {
    return await prisma.strategyVersion.findFirst({
        where: { categoryKey, isActive: true }
    });
}

module.exports = {
    promoteLabsToStrategy,
    getVersionHistory,
    switchVersion,
    compareVersions,
    getActiveVersion
};
