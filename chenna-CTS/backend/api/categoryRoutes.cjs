/**
 * Category API Routes
 * Exposes endpoints to control category status (Enable/Disable, Scan Toggle)
 */

const express = require('express');
const router = express.Router();
const categoryController = require('../services/categoryController.cjs');

// GET /api/categories - Get all categories with full status
router.get('/', async (req, res) => {
    try {
        const categories = await categoryController.getAllCategories();
        res.json({ success: true, count: categories.length, data: categories });
    } catch (error) {
        console.error('[API] Failed to get categories:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// GET /api/categories/:key - Get single category details
router.get('/:key', async (req, res) => {
    try {
        const category = await categoryController.getCategory(req.params.key);
        if (!category) return res.status(404).json({ success: false, error: 'Category not found' });
        res.json({ success: true, data: category });
    } catch (error) {
        console.error(`[API] Failed to get category ${req.params.key}:`, error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// PATCH /api/categories/:key/status - Update category status
// Body: { enabled, scanningEnabled, signalGenerationEnabled } (Partial updates allowed)
router.patch('/:key/status', async (req, res) => {
    try {
        const updates = req.body;
        const key = req.params.key;

        // Validation: Ensure at least one field is provided
        if (updates.enabled === undefined &&
            updates.scanningEnabled === undefined &&
            updates.signalGenerationEnabled === undefined) {
            return res.status(400).json({ success: false, error: 'No valid fields provided for update' });
        }

        const updatedCategory = await categoryController.updateCategoryStatus(key, updates);
        res.json({ success: true, message: `Category ${key} updated`, data: updatedCategory });

    } catch (error) {
        console.error(`[API] Failed to update category ${req.params.key}:`, error);
        res.status(500).json({ success: false, error: error.message });
    }
});

module.exports = router;
