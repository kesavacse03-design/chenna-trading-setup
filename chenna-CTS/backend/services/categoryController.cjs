/**
 * Category Controller Service
 * Manages the state and configuration of trading categories.
 * Unifies static config (file-based) with dynamic state (database-based).
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const categoryConfig = require('../config/categoryConfig.cjs');

class CategoryController {

    /**
     * Get all categories with full status (Merged Config + DB State)
     */
    async getAllCategories() {
        try {
            // 1. Get DB State
            const dbCategories = await prisma.category.findMany({
                orderBy: { key: 'asc' }
            });

            // 2. Merge with File Config
            const unifiedCategories = dbCategories.map(dbCat => {
                const fileConf = categoryConfig.getCategoryConfig(dbCat.key);
                return {
                    id: dbCat.id,
                    key: dbCat.key,
                    name: dbCat.name,
                    description: dbCat.description,

                    // DB State (The authority for limits/toggles)
                    enabled: dbCat.enabled,
                    scanningEnabled: dbCat.scanningEnabled,
                    signalGenerationEnabled: dbCat.signalGenerationEnabled,
                    livePriceEnabled: dbCat.livePriceEnabled,
                    lastAuditDate: dbCat.lastAuditDate,

                    // Static Config (The authority for behavior)
                    type: fileConf.type,
                    trackingDays: fileConf.trackingDays,
                    scanIntervalMin: fileConf.scanIntervalMin,

                    // Stats (Placeholder for now, could fetch real stats)
                    stockCount: 0 // TODO: Query stock count
                };
            });

            return unifiedCategories;
        } catch (error) {
            console.error('[CategoryController] Error fetching categories:', error);
            throw error;
        }
    }

    /**
     * Get single category details
     */
    async getCategory(key) {
        const dbCat = await prisma.category.findUnique({ where: { key } });
        if (!dbCat) return null;

        const fileConf = categoryConfig.getCategoryConfig(key);
        return {
            ...dbCat,
            ...fileConf
        };
    }

    /**
     * Update category status
     * @param {string} key 
     * @param {object} updates { enabled, scanningEnabled, signalGenerationEnabled }
     */
    async updateCategoryStatus(key, updates) {
        try {
            const updated = await prisma.category.update({
                where: { key },
                data: updates
            });
            console.log(`[CategoryController] Updated ${key}:`, updates);
            return updated;
        } catch (error) {
            console.error(`[CategoryController] Failed to update ${key}:`, error);
            throw error;
        }
    }

    /**
     * Check if a category is fully active (Enabled + Scanning Enabled)
     */
    async isCategoryActive(key) {
        const cat = await this.getCategory(key);
        return cat && cat.enabled && cat.scanningEnabled;
    }
}

module.exports = new CategoryController();
