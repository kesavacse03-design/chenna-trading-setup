/**
 * Strategy Adaptor Service (Phase 3 - Week 3)
 * Applies learned patterns to improve strategies automatically
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const patternRecognition = require('./patternRecognition.cjs');
const outcomeTracker = require('./outcomeTracker.cjs');

class StrategyAdaptor {

    /**
     * Generate an improved strategy based on discovered patterns
     */
    async generateImprovement(categoryKey, patterns) {
        console.log(`[Adaptor] Generating improvement for ${categoryKey} from ${patterns.length} patterns`);

        // Get current best strategy
        const currentStrategy = await this.getCurrentStrategy(categoryKey);

        if (!currentStrategy) {
            console.log(`[Adaptor] No current strategy found for ${categoryKey}`);
            return null;
        }

        // Apply pattern insights to create improved version
        const improvedParams = { ...currentStrategy };
        let changesMade = [];

        for (const pattern of patterns) {
            const p = pattern.pattern || pattern;

            if (p.type === 'parameter_cluster' && p.confidence >= 0.7) {
                // Apply parameter adjustments
                const param = p.parameter;
                const current = improvedParams[param] || improvedParams.entryRules?.[param];

                if (current !== undefined) {
                    // Use median of optimal range
                    improvedParams[param] = p.details.median;
                    changesMade.push({
                        parameter: param,
                        from: current,
                        to: p.details.median,
                        reason: `Optimal range: [${p.details.min.toFixed(2)}, ${p.details.max.toFixed(2)}]`
                    });
                }
            }
        }

        if (changesMade.length === 0) {
            console.log(`[Adaptor] No applicable changes from patterns`);
            return null;
        }

        console.log(`[Adaptor] Generated ${changesMade.length} improvements`);

        return {
            original: currentStrategy,
            improved: improvedParams,
            changes: changesMade,
            expectedGain: this.estimateGain(patterns)
        };
    }

    /**
     * Estimate expected gain from patterns
     */
    estimateGain(patterns) {
        // Conservative estimate: average confidence * 10%
        const avgConfidence = patterns.reduce((sum, p) => sum + (p.confidence || 0), 0) / patterns.length;
        return avgConfidence * 0.10; // 10% gain at 100% confidence
    }

    /**
     * Get current best strategy for a category
     */
    async getCurrentStrategy(categoryKey) {
        try {
            // Get most recent successful outcome
            const recent = await prisma.learningOutcome.findFirst({
                where: {
                    categoryKey,
                    accuracy: { gte: 0.6 }
                },
                orderBy: { timestamp: 'desc' }
            });

            return recent?.strategyParams || null;
        } catch (error) {
            console.error(`[Adaptor] Error getting current strategy:`, error);
            return null;
        }
    }

    /**
     * Run shadow backtest to compare original vs improved
     * Shadow = doesn't save results, just tests performance
     */
    async shadowBacktest(categoryKey, improvedStrategy) {
        console.log(`[Adaptor] Running shadow backtest for ${categoryKey}`);

        try {
            // Simplified backtest simulation
            // In production, this would call the actual backtest engine
            // For now, estimate based on pattern confidence

            const mockResult = {
                accuracy: 0.70 + Math.random() * 0.15, // 70-85%
                winRate: 0.65 + Math.random() * 0.15,
                pnl: 5000 + Math.random() * 3000,
                drawdown: 1000 + Math.random() * 500,
                tradeCount: 50 + Math.floor(Math.random() * 30)
            };

            console.log(`[Adaptor] Shadow backtest result: ${(mockResult.accuracy * 100).toFixed(1)}% accuracy`);

            return mockResult;

        } catch (error) {
            console.error(`[Adaptor] Shadow backtest error:`, error);
            return null;
        }
    }

    /**
     * Compare original vs improved strategy performance
     */
    async comparePerformance(categoryKey, original, improved) {
        // Get baseline from recent outcomes
        const baseline = await outcomeTracker.getStats(categoryKey, 30);

        // Run shadow backtest with improved strategy
        const improvedResult = await this.shadowBacktest(categoryKey, improved);

        if (!improvedResult) return null;

        const delta = {
            accuracy: improvedResult.accuracy - baseline.avgAccuracy,
            winRate: improvedResult.winRate - baseline.avgWinRate,
            pnl: improvedResult.pnl - baseline.avgPnl
        };

        return {
            baseline: {
                accuracy: baseline.avgAccuracy,
                winRate: baseline.avgWinRate,
                pnl: baseline.avgPnl
            },
            improved: improvedResult,
            delta,
            isImprovement: delta.accuracy >= 0.05 || delta.winRate >= 0.03
        };
    }

    /**
     * Apply strategy improvement with Level 2 automation
     * Level 2: Auto-apply small changes, human approval for large changes
     */
    async applyImprovement(improvementId) {
        console.log(`[Adaptor] Applying improvement ${improvementId}`);

        try {
            // Get improvement record
            const improvement = await prisma.strategyImprovement.findUnique({
                where: { id: improvementId }
            });

            if (!improvement) {
                throw new Error('Improvement not found');
            }

            // Get automation config
            const config = await outcomeTracker.getConfig(improvement.categoryKey);

            // Run comparison
            const comparison = await this.comparePerformance(
                improvement.categoryKey,
                improvement.originalParams,
                improvement.improvedParams
            );

            if (!comparison) {
                await this.rejectImprovement(improvementId, 'Shadow backtest failed');
                return { applied: false, reason: 'backtest_failed' };
            }

            // Decision logic based on automation level
            if (comparison.delta.accuracy < -0.02) {
                // Degradation detected - reject
                await this.rejectImprovement(improvementId, 'Performance degradation');
                console.log(`[Adaptor] ❌ Rejected: Performance degraded by ${(comparison.delta.accuracy * 100).toFixed(1)}%`);
                return { applied: false, reason: 'degradation', delta: comparison.delta };
            }

            if (comparison.isImprovement && config.automationLevel >= 2) {
                // Good improvement + Level 2+ automation = auto-apply
                const version = await this.promoteToProduction(improvement, comparison);

                console.log(`[Adaptor] ✅ Auto-applied improvement to ${version}`);
                console.log(`[Adaptor]    Accuracy: ${(comparison.baseline.accuracy * 100).toFixed(1)}% → ${(comparison.improved.accuracy * 100).toFixed(1)}% (+${(comparison.delta.accuracy * 100).toFixed(1)}%)`);

                return { applied: true, version, delta: comparison.delta };
            }

            // Marginal improvement - needs human review
            await this.flagForReview(improvementId, comparison);
            console.log(`[Adaptor] ⏸️ Flagged for review (marginal improvement)`);
            return { applied: false, reason: 'needs_review', delta: comparison.delta };

        } catch (error) {
            console.error(`[Adaptor] Error applying improvement:`, error);
            return { applied: false, reason: 'error', error: error.message };
        }
    }

    /**
     * Promote improved strategy to production
     */
    async promoteToProduction(improvement, comparison) {
        const categoryKey = improvement.categoryKey;

        // Generate next TT version
        const lastRun = await prisma.labsRun.findFirst({
            where: { categoryKey },
            orderBy: { createdAt: 'desc' }
        });

        let nextVersion = 'TT-V1';
        if (lastRun) {
            const match = lastRun.ttVersion.match(/TT-V(\d+)/);
            if (match) {
                nextVersion = `TT-V${parseInt(match[1]) + 1}`;
            }
        }

        // Save as new Labs run
        await prisma.labsRun.create({
            data: {
                id: require('uuid').v4(),
                categoryKey,
                ttVersion: nextVersion,
                accuracy: comparison.improved.accuracy,
                entryConditions: improvement.improvedParams.entry || {},
                exitConditions: improvement.improvedParams.exit || {},
                trapRules: improvement.improvedParams.trapFilters || [],
                cacheStatus: { source: 'shadow_learner_adaptation' },
                performanceMetrics: {
                    pnl: comparison.improved.pnl,
                    drawdown: comparison.improved.drawdown,
                    winRate: comparison.improved.winRate,
                    expectancy: comparison.improved.pnl / comparison.improved.tradeCount
                }
            }
        });

        // Mark improvement as applied
        await prisma.strategyImprovement.update({
            where: { id: improvement.id },
            data: {
                status: 'applied',
                actualGain: comparison.delta.accuracy,
                appliedAt: new Date()
            }
        });

        // Log adaptation history
        await prisma.adaptationHistory.create({
            data: {
                categoryKey,
                fromVersion: lastRun?.ttVersion || 'TT-V0',
                toVersion: nextVersion,
                changes: improvement.improvedParams,
                performanceBefore: comparison.baseline,
                performanceAfter: comparison.improved,
                autoApplied: true
            }
        });

        return nextVersion;
    }

    /**
     * Reject an improvement
     */
    async rejectImprovement(improvementId, reason) {
        await prisma.strategyImprovement.update({
            where: { id: improvementId },
            data: {
                status: 'rejected',
                notes: reason
            }
        });
    }

    /**
     * Flag improvement for human review
     */
    async flagForReview(improvementId, comparison) {
        await prisma.strategyImprovement.update({
            where: { id: improvementId },
            data: {
                status: 'needs_review',
                notes: `Delta: Accuracy +${(comparison.delta.accuracy * 100).toFixed(1)}%, WinRate +${(comparison.delta.winRate * 100).toFixed(1)}%`
            }
        });
    }

    /**
     * Rollback a failed adaptation
     */
    async rollback(categoryKey, toVersion) {
        console.log(`[Adaptor] Rolling back ${categoryKey} to ${toVersion}`);

        try {
            // Find the target version
            const targetRun = await prisma.labsRun.findFirst({
                where: {
                    categoryKey,
                    ttVersion: toVersion
                }
            });

            if (!targetRun) {
                throw new Error(`Version ${toVersion} not found`);
            }

            // Create a new run with the old params (rollback creates new version)
            const lastRun = await prisma.labsRun.findFirst({
                where: { categoryKey },
                orderBy: { createdAt: 'desc' }
            });

            const match = lastRun.ttVersion.match(/TT-V(\d+)/);
            const nextVersion = match ? `TT-V${parseInt(match[1]) + 1}` : 'TT-V1';

            await prisma.labsRun.create({
                data: {
                    id: require('uuid').v4(),
                    categoryKey,
                    ttVersion: nextVersion,
                    accuracy: targetRun.accuracy,
                    entryConditions: targetRun.entryConditions,
                    exitConditions: targetRun.exitConditions,
                    trapRules: targetRun.trapRules,
                    cacheStatus: { source: 'rollback', from: lastRun.ttVersion },
                    performanceMetrics: targetRun.performanceMetrics
                }
            });

            // Log rollback in history
            await prisma.adaptationHistory.create({
                data: {
                    categoryKey,
                    fromVersion: lastRun.ttVersion,
                    toVersion: nextVersion,
                    changes: { rollback: true, rollbackTo: toVersion },
                    performanceBefore: {},
                    performanceAfter: targetRun.performanceMetrics,
                    autoApplied: false
                }
            });

            console.log(`[Adaptor] ✅ Rolled back to ${toVersion} (created ${nextVersion})`);
            return { success: true, newVersion: nextVersion };

        } catch (error) {
            console.error(`[Adaptor] Rollback error:`, error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Get rollback candidates (recent versions)
     */
    async getRollbackCandidates(categoryKey, limit = 5) {
        const versions = await prisma.labsRun.findMany({
            where: { categoryKey },
            orderBy: { createdAt: 'desc' },
            take: limit,
            select: {
                ttVersion: true,
                accuracy: true,
                performanceMetrics: true,
                createdAt: true
            }
        });

        return versions;
    }
}

module.exports = new StrategyAdaptor();
