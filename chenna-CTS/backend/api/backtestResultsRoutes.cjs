/**
 * Backtest Results API Routes
 * Endpoints for viewing and downloading backtest results
 */

const backtestResultsService = require('../services/backtestResultsService.cjs');
const path = require('path');

function registerBacktestResultsRoutes(app) {
    /**
     * GET /api/backtest/history/:categoryKey
     * Get all past backtest runs for a category
     */
    app.get('/api/backtest/history/:categoryKey', async (req, res) => {
        try {
            const { categoryKey } = req.params;

            const history = await backtestResultsService.getBacktestHistory(categoryKey);

            res.json({
                ok: true,
                categoryKey,
                results: history
            });
        } catch (error) {
            console.error('[GET /api/backtest/history] Error:', error);
            res.status(500).json({ ok: false, error: error.message });
        }
    });

    /**
     * GET /api/backtest/details/:runId
     * Get detailed results for a specific backtest run
     */
    app.get('/api/backtest/details/:runId', async (req, res) => {
        try {
            const { runId } = req.params;

            const details = await backtestResultsService.getBacktestDetails(runId);

            res.json({
                ok: true,
                details
            });
        } catch (error) {
            console.error('[GET /api/backtest/details] Error:', error);
            res.status(404).json({ ok: false, error: error.message });
        }
    });

    /**
     * GET /api/backtest/download-csv/:runId
     * Download CSV file for a backtest run
     */
    app.get('/api/backtest/download-csv/:runId', async (req, res) => {
        try {
            const { runId } = req.params;

            const csvPath = backtestResultsService.getCSVPath(runId);

            // Check if file exists
            const fs = require('fs');
            if (!fs.existsSync(csvPath)) {
                return res.status(404).json({ ok: false, error: 'CSV file not found' });
            }

            // Send file for download
            res.download(csvPath, `${runId}.csv`, (err) => {
                if (err) {
                    console.error('[GET /api/backtest/download-csv] Error:', err);
                    res.status(500).json({ ok: false, error: 'Failed to download CSV' });
                }
            });
        } catch (error) {
            console.error('[GET /api/backtest/download-csv] Error:', error);
            res.status(500).json({ ok: false, error: error.message });
        }
    });

    console.log('[Routes] Backtest results routes registered ✅');
}

module.exports = registerBacktestResultsRoutes;
