/**
 * Realistic Trading Simulation API Routes
 * Professional trading desk simulation endpoints
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

function registerRealisticSimRoutes(app) {
    /**
     * POST /api/strategy/realistic-simulation
     * Run realistic trading desk simulation with all professional behaviors:
     * - Stock age awareness (10 days swing, same day intraday)
     * - Signal → Entry delay (15min swing, 5min intraday)
     * - Trade lifecycle states
     * - Partial exit (80%) + trailing (20%)
     * - Full transparency logging
     */
    app.post('/api/strategy/realistic-simulation', async (req, res) => {
        try {
            const {
                categoryKey,
                quickMode = false,
                backtestMode = true,
                // 2-Pass Research Backtest params
                researchPass = null,
                applyRefinements = false,
                shadowSuggestions = [],
                // Multi-Pass Research (Version Chain Evolution)
                multiPassMode = false,  // Enable TT-V1 → TT-V1.a → TT-V1.b
                maxPasses = 5           // Max evolution iterations
            } = req.body;

            if (!categoryKey) {
                return res.status(400).json({ ok: false, error: 'categoryKey is required' });
            }

            console.log(`\n🎯 [Realistic Simulation] Starting for ${categoryKey}`);
            console.log(`   Mode: ${quickMode ? 'Quick (10 stocks)' : 'Full'}`);
            console.log(`   Backtest Mode: ${backtestMode ? 'ON (skip validity)' : 'OFF (enforce validity)'}`);

            // Research mode logging
            if (researchPass) {
                console.log(`   📋 Research Pass: ${researchPass}`);
                console.log(`   🔧 Apply Refinements: ${applyRefinements}`);
                if (shadowSuggestions.length > 0) {
                    console.log(`   💡 Shadow Suggestions: ${shadowSuggestions.length} suggestions provided`);
                }
            }

            // Multi-pass mode logging
            if (multiPassMode) {
                console.log(`   🔬 MULTI-PASS MODE: ENABLED (max ${maxPasses} passes)`);
                console.log(`      Version Chain Evolution: TT-V1 → TT-V1.a → TT-V1.b...`);
            }

            // Import simulator
            const { RealisticTradingSimulator } = require('../strategy/RealisticTradingSimulator.cjs');
            const simulator = new RealisticTradingSimulator({
                backtestMode,
                // Pass refinement config for Pass 2
                applyRefinements,
                shadowSuggestions,
                researchPass,
                // Multi-pass evolution config
                multiPassMode,
                maxPasses
            });


            // Get stocks for category
            const categoryStocks = await prisma.stockCategory.findMany({
                where: { category: { key: categoryKey } },
                include: { stock: true }
            });

            if (categoryStocks.length === 0) {
                return res.status(404).json({ ok: false, error: 'No stocks found for category' });
            }

            // Map stocks with addedDate
            let stocks = categoryStocks.map(sc => ({
                ...sc.stock,
                addedDate: sc.addedDate
            }));

            // Quick mode: limit to 10 stocks
            if (quickMode) {
                stocks = stocks.slice(0, 10);
            }

            console.log(`   Stocks: ${stocks.length}`);

            // Run simulation
            const startTime = Date.now();
            const results = await simulator.runCategorySimulation(categoryKey, stocks);
            const elapsed = ((Date.now() - startTime) / 60000).toFixed(1);

            console.log(`\n✅ [Realistic Simulation] Complete in ${elapsed} minutes`);
            console.log(`   Executed Trades: ${results.summary.executedTrades}`);
            console.log(`   Invalidated Signals: ${results.summary.invalidatedSignals}`);
            console.log(`   Expired Stocks: ${results.summary.expiredStocks}`);
            console.log(`   Win Rate: ${results.summary.winRate}%`);

            // Save results
            const runId = `realistic_${categoryKey}_${Date.now()}`;
            const fs = require('fs');
            const path = require('path');
            const resultsDir = path.join(__dirname, '..', 'results');
            const jsonPath = path.join(resultsDir, `${runId}.json`);

            if (!fs.existsSync(resultsDir)) {
                fs.mkdirSync(resultsDir, { recursive: true });
            }

            fs.writeFileSync(jsonPath, JSON.stringify({
                runId,
                type: 'REALISTIC_SIMULATION',
                category: categoryKey,
                timestamp: new Date().toISOString(),
                timeElapsed: `${elapsed}min`,
                ...results
            }, null, 2));

            // Generate CSV with new lifecycle structure
            const csvDir = path.join(resultsDir, 'csv');
            if (!fs.existsSync(csvDir)) {
                fs.mkdirSync(csvDir, { recursive: true });
            }
            const csvPath = path.join(csvDir, `realistic_${categoryKey}_${Date.now()}.csv`);

            // Build CSV with executed trades + invalidated signals
            const csvHeaders = [
                'Type', 'Symbol', 'Strategy', 'SignalDate', 'SignalPrice',
                'EntryDate', 'EntryPrice', 'ExitDate', 'ExitPrice',
                'PartialExitPrice', 'TrailingExitPrice', 'ExitReason',
                'HoldingDays', 'PnL%', 'Result', 'Lifecycle', 'InvalidationReason'
            ];

            const csvRows = [];

            // Add executed trades
            for (const trade of results.executedTrades) {
                csvRows.push([
                    'EXECUTED',
                    trade.symbol,
                    trade.strategy,
                    trade.signalDate || '',
                    trade.signalPrice || '',
                    trade.entryDate || '',
                    trade.entryPrice || '',
                    trade.exitDate || '',
                    trade.exitPrice || '',
                    trade.partialExit?.price || '',
                    trade.trailingExit?.price || '',
                    trade.exitReason || '',
                    trade.holdingDays || '',
                    trade.pnl ? trade.pnl.toFixed(2) : '',
                    trade.result || '',
                    trade.lifecycle?.stateHistory?.map(s => s.state).join(' → ') || '',
                    ''
                ]);
            }

            // Add invalidated signals
            for (const signal of results.invalidatedSignals) {
                csvRows.push([
                    'INVALIDATED',
                    signal.symbol,
                    signal.strategy,
                    signal.signalDate || '',
                    signal.signalPrice || '',
                    '', '', '', '', '', '', '',
                    '', '', 'INVALIDATED',
                    signal.lifecycle?.stateHistory?.map(s => s.state).join(' → ') || '',
                    signal.invalidationReason || ''
                ]);
            }

            // Write CSV
            const csvContent = [
                csvHeaders.join(','),
                ...csvRows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
            ].join('\n');

            fs.writeFileSync(csvPath, csvContent);

            console.log(`\n💾 Results saved: ${jsonPath}`);
            console.log(`📊 CSV saved: ${csvPath}\n`);

            res.json({
                ok: true,
                categoryKey,
                runId,
                timeElapsed: `${elapsed}min`,
                summary: results.summary,
                interpretation: results.interpretation,
                shadowReport: results.shadowReport,
                files: { json: jsonPath, csv: csvPath },
                message: 'Realistic simulation completed successfully'
            });

        } catch (error) {
            console.error('[POST /api/strategy/realistic-simulation] Error:', error);
            res.status(500).json({ ok: false, error: error.message });
        }
    });

    console.log('[Routes] Realistic simulation endpoint registered ✅');
}

module.exports = registerRealisticSimRoutes;
