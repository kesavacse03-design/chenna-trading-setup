/**
 * Data Fetch Agent Routes
 * API endpoints for controlling the data fetch agent
 */

const express = require('express');
const router = express.Router();
const dataFetchAgent = require('../services/dataFetchAgent.cjs');

/**
 * POST /api/data-fetch/start
 * Start scheduled data fetching
 */
router.post('/start', async (req, res) => {
    try {
        dataFetchAgent.startScheduledFetching();
        res.json({
            ok: true,
            message: 'Data fetch agent started (10 min interval)'
        });
    } catch (error) {
        res.status(500).json({ ok: false, error: error.message });
    }
});

/**
 * POST /api/data-fetch/run
 * Run a single fetch cycle immediately
 */
router.post('/run', async (req, res) => {
    try {
        console.log('[DataFetchRoutes] Running immediate fetch cycle...');
        await dataFetchAgent.runCycle();
        res.json({
            ok: true,
            ...dataFetchAgent.getStatus()
        });
    } catch (error) {
        res.status(500).json({ ok: false, error: error.message });
    }
});

/**
 * GET /api/data-fetch/status
 * Get current fetch status
 */
router.get('/status', (req, res) => {
    res.json({
        ok: true,
        ...dataFetchAgent.getStatus()
    });
});

/**
 * GET /api/data-fetch/snapshots/:category
 * Get latest snapshots for a category
 */
router.get('/snapshots/:category', async (req, res) => {
    try {
        const { PrismaClient } = require('@prisma/client');
        const prisma = new PrismaClient();

        const { category } = req.params;
        const limit = parseInt(req.query.limit) || 50;

        const snapshots = await prisma.liveSnapshot.findMany({
            where: { category },
            orderBy: { fetchedAt: 'desc' },
            take: limit
        });

        res.json({
            ok: true,
            category,
            count: snapshots.length,
            snapshots
        });

        await prisma.$disconnect();
    } catch (error) {
        res.status(500).json({ ok: false, error: error.message });
    }
});

/**
 * POST /api/data-fetch/prefetch-for-labs
 * Pre-fetch historical data for all stocks in a category before running Labs
 */
router.post('/prefetch-for-labs', async (req, res) => {
    try {
        const { categoryKey } = req.body;

        if (!categoryKey) {
            return res.status(400).json({ ok: false, error: 'categoryKey is required' });
        }

        console.log(`[DataFetch] 📥 Pre-fetching data for Labs: ${categoryKey}`);

        const { PrismaClient } = require('@prisma/client');
        const prisma = new PrismaClient();
        const priceService = require('../services/priceService.cjs');

        // Get category and stocks
        const category = await prisma.category.findUnique({
            where: { key: categoryKey }
        });

        if (!category) {
            await prisma.$disconnect();
            return res.status(404).json({ ok: false, error: 'Category not found' });
        }

        const stockCategories = await prisma.stockCategory.findMany({
            where: { categoryId: category.id },
            include: { stock: true }
        });

        console.log(`[DataFetch] Found ${stockCategories.length} stocks in ${categoryKey}`);

        const results = {
            total: stockCategories.length,
            success: 0,
            failed: 0,
            details: []
        };

        // Calculate date range (last 300 days)
        const toDate = new Date();
        const fromDate = new Date();
        fromDate.setDate(fromDate.getDate() - 300);
        const fromStr = fromDate.toISOString().split('T')[0];
        const toStr = toDate.toISOString().split('T')[0];

        // Fetch data for each stock (with rate limiting)
        for (const sc of stockCategories) {
            const symbol = sc.stock.symbol;

            try {
                // Get instrument key - try symbol first, then tradingSymbol
                let instrument = await prisma.instrument.findFirst({
                    where: {
                        symbol: symbol,
                        exchange: 'NSE'
                    }
                });

                // Fallback: try without exchange filter
                if (!instrument) {
                    instrument = await prisma.instrument.findFirst({
                        where: { symbol: symbol }
                    });
                }

                if (!instrument || !instrument.instrumentKey) {
                    results.failed++;
                    results.details.push({ symbol, status: 'NO_INSTRUMENT' });
                    continue;
                }

                // Fetch from Upstox
                const data = await priceService.fetchPrice(
                    symbol,
                    instrument.instrumentKey,
                    fromStr,
                    toStr,
                    'day'
                );

                if (data && data.length >= 50) {
                    results.success++;
                    results.details.push({ symbol, status: 'OK', candles: data.length });
                    console.log(`[DataFetch] ✓ ${symbol}: ${data.length} candles`);
                } else {
                    results.failed++;
                    results.details.push({ symbol, status: 'NO_DATA', candles: data?.length || 0 });
                    console.log(`[DataFetch] ✗ ${symbol}: No data`);
                }

                // Rate limit: wait 500ms between requests
                await new Promise(resolve => setTimeout(resolve, 500));

            } catch (error) {
                results.failed++;
                results.details.push({ symbol, status: 'ERROR', error: error.message });
                console.log(`[DataFetch] ✗ ${symbol}: ${error.message}`);
            }
        }

        await prisma.$disconnect();

        console.log(`[DataFetch] ✅ Pre-fetch complete: ${results.success}/${results.total} success`);

        res.json({
            ok: true,
            category: categoryKey,
            ...results
        });

    } catch (error) {
        console.error('[DataFetch] Pre-fetch error:', error);
        res.status(500).json({ ok: false, error: error.message });
    }
});

module.exports = router;
