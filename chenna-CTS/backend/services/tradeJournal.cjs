/**
 * Trade Journal Service  
 * Phase 10: Enhanced trade metadata and journaling
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

/**
 * Create or update journal entry for a trade
 */
async function updateJournalEntry(tradeId, journalData) {
    const {
        entryReason,
        exitReason,
        userNotes,
        screenshot,
        tags,
        mood,
        lessonLearned
    } = journalData;

    try {
        // Store journal data in trade metadata
        const trade = await prisma.trade.update({
            where: { id: tradeId },
            data: {
                metadata: {
                    journal: {
                        entryReason: entryReason || null,
                        exitReason: exitReason || null,
                        userNotes: userNotes || null,
                        screenshot: screenshot || null,
                        tags: tags || [],
                        mood: mood || null,
                        lessonLearned: lessonLearned || null,
                        lastUpdated: new Date()
                    }
                }
            }
        });

        return { ok: true, trade };
    } catch (error) {
        console.error('[TradeJournal] Update error:', error);
        return { ok: false, error: error.message };
    }
}

/**
 * Get journal entries with filters
 */
async function getJournalEntries(filters = {}) {
    const {
        categoryKey,
        outcome,
        tags,
        fromDate,
        toDate,
        limit = 50
    } = filters;

    try {
        const where = {};

        if (categoryKey) where.categoryKey = categoryKey;
        if (outcome) where.outcome = outcome;
        if (fromDate) where.entryDate = { gte: new Date(fromDate) };
        if (toDate) where.exitDate = { lte: new Date(toDate) };

        const trades = await prisma.trade.findMany({
            where,
            orderBy: { exitDate: 'desc' },
            take: limit,
            include: {
                category: true
            }
        });

        // Filter by tags if provided
        let filtered = trades;
        if (tags && tags.length > 0) {
            filtered = trades.filter(trade => {
                const journal = trade.metadata?.journal;
                if (!journal || !journal.tags) return false;
                return tags.some(tag => journal.tags.includes(tag));
            });
        }

        return {
            ok: true,
            entries: filtered.map(trade => ({
                id: trade.id,
                symbol: trade.symbol,
                categoryKey: trade.categoryKey,
                entryDate: trade.entryDate,
                exitDate: trade.exitDate,
                pnl: trade.pnlPercent,
                outcome: trade.outcome,
                journal: trade.metadata?.journal || {}
            }))
        };
    } catch (error) {
        console.error('[TradeJournal] Get entries error:', error);
        return { ok: false, error: error.message };
    }
}

/**
 * Get journal statistics
 */
async function getJournalStats(categoryKey) {
    try {
        const trades = await prisma.trade.findMany({
            where: categoryKey ? { categoryKey } : {},
            select: {
                outcome: true,
                pnlPercent: true,
                metadata: true
            }
        });

        const stats = {
            total: trades.length,
            withJournal: 0,
            byOutcome: {},
            byMood: {},
            byTag: {},
            avgPnLByMood: {}
        };

        trades.forEach(trade => {
            const journal = trade.metadata?.journal;

            if (journal) {
                stats.withJournal++;

                // By mood
                if (journal.mood) {
                    if (!stats.byMood[journal.mood]) stats.byMood[journal.mood] = 0;
                    stats.byMood[journal.mood]++;

                    if (!stats.avgPnLByMood[journal.mood]) {
                        stats.avgPnLByMood[journal.mood] = { sum: 0, count: 0 };
                    }
                    stats.avgPnLByMood[journal.mood].sum += trade.pnlPercent;
                    stats.avgPnLByMood[journal.mood].count++;
                }

                // By tags
                if (journal.tags) {
                    journal.tags.forEach(tag => {
                        if (!stats.byTag[tag]) stats.byTag[tag] = 0;
                        stats.byTag[tag]++;
                    });
                }
            }

            // By outcome
            if (!stats.byOutcome[trade.outcome]) stats.byOutcome[trade.outcome] = 0;
            stats.byOutcome[trade.outcome]++;
        });

        // Calculate averages
        Object.keys(stats.avgPnLByMood).forEach(mood => {
            const data = stats.avgPnLByMood[mood];
            stats.avgPnLByMood[mood] = (data.sum / data.count).toFixed(2);
        });

        return { ok: true, stats };
    } catch (error) {
        console.error('[TradeJournal] Stats error:', error);
        return { ok: false, error: error.message };
    }
}

/**
 * Enhanced trade metadata for active trades
 */
async function enrichTradeMetadata(trade, marketContext = {}) {
    const metadata = {
        entryContext: {
            marketRegime: marketContext.regime || null,
            niftyChange: marketContext.niftyChange || null,
            sectorPerformance: marketContext.sectorPerformance || null,
            vix: marketContext.vix || null,
            timestamp: Date.now()
        },
        signals: {
            pattern: trade.pattern || null,
            rsi: marketContext.rsi || null,
            volume: marketContext.volumeRatio || null
        },
        aiSummary: null // To be filled by AI
    };

    return metadata;
}

module.exports = {
    updateJournalEntry,
    getJournalEntries,
    getJournalStats,
    enrichTradeMetadata
};
