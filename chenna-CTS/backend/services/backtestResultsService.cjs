const fs = require('fs');
const path = require('path');

/**
 * Backtest Results Service
 * Saves and manages Time-Travel and Regular backtest results
 * Provides CSV export and queryable storage
 */
class BacktestResultsService {
    constructor() {
        this.resultsDir = path.join(__dirname, '../results');
        this.csvDir = path.join(__dirname, '../results/csv');

        // Ensure directories exist
        if (!fs.existsSync(this.resultsDir)) {
            fs.mkdirSync(this.resultsDir, { recursive: true });
        }
        if (!fs.existsSync(this.csvDir)) {
            fs.mkdirSync(this.csvDir, { recursive: true });
        }
    }

    /**
     * Save Time-Travel Backtest Results
     */
    async saveTimeTravelResults(categoryKey, results) {
        const timestamp = new Date().toISOString();
        const runId = `tt_${categoryKey}_${Date.now()}`;

        const backtestRun = {
            runId,
            type: 'TIME_TRAVEL',
            category: categoryKey,
            timestamp,

            summary: {
                totalStrategies: results.stats.totalLogicsTested,
                totalStocks: results.stats.totalStocks,
                timeElapsed: results.stats.timeElapsed,
                topStrategy: results.top3[0]?.logic || 'None',
                topWinRate: results.top3[0]?.metrics?.winRate || 0,
                topScore: results.top3[0]?.score || 0
            },

            top3Strategies: results.top3.map(s => ({
                name: s.logic,
                score: s.score,
                metrics: s.metrics,
                trades: s.trades?.length || 0
            })),

            v1Strategy: results.v1Strategy,

            // Detailed per-symbol results
            perSymbol: this.buildPerSymbolResults(results.scoredLogics),

            // All strategies tested
            allStrategies: results.scoredLogics.map(s => ({
                name: s.logic.name,
                score: s.score,
                metrics: s.metrics,
                failReason: s.failReason || null
            }))
        };

        // Save JSON
        const jsonPath = path.join(this.resultsDir, `${runId}.json`);
        fs.writeFileSync(jsonPath, JSON.stringify(backtestRun, null, 2));

        // Save CSV
        const csvPath = await this.exportToCSV(backtestRun, 'TIME_TRAVEL');

        console.log(`✅ Time-Travel results saved:`);
        console.log(`   JSON: ${jsonPath}`);
        console.log(`   CSV: ${csvPath}`);

        return {
            runId,
            jsonPath,
            csvPath,
            summary: backtestRun.summary
        };
    }

    /**
     * Save Regular Backtest Results (V1 strategy on stocks)
     */
    async saveRegularBacktestResults(categoryKey, strategy, stocks, trades) {
        const timestamp = new Date().toISOString();
        const runId = `backtest_${categoryKey}_${Date.now()}`;

        const backtestRun = {
            runId,
            type: 'REGULAR_BACKTEST',
            category: categoryKey,
            timestamp,

            strategy: {
                name: strategy.name,
                version: strategy.version
            },

            summary: {
                totalStocks: stocks.length,
                totalTrades: trades.length,
                winners: trades.filter(t => t.pnl > 0).length,
                losers: trades.filter(t => t.pnl <= 0).length,
                winRate: trades.length > 0 ? (trades.filter(t => t.pnl > 0).length / trades.length * 100) : 0,
                avgPnL: trades.length > 0 ? trades.reduce((sum, t) => sum + t.pnl, 0) / trades.length : 0,
                totalPnL: trades.reduce((sum, t) => sum + t.pnl, 0)
            },

            trades: trades.map(trade => ({
                symbol: trade.symbol,
                entryDate: trade.entryDate,
                entryPrice: trade.entryPrice,
                exitDate: trade.exitDate,
                exitPrice: trade.exitPrice,
                target: trade.target,
                stopLoss: trade.stopLoss,
                pnl: trade.pnl,
                pnlPercent: trade.pnlPercent || ((trade.exitPrice - trade.entryPrice) / trade.entryPrice * 100),
                holdingDays: trade.holdingDays,
                exitReason: trade.exitReason,
                result: trade.result,
                targetHit: trade.targetHit,
                stopHit: trade.stopHit
            }))
        };

        // Save JSON
        const jsonPath = path.join(this.resultsDir, `${runId}.json`);
        fs.writeFileSync(jsonPath, JSON.stringify(backtestRun, null, 2));

        // Save CSV
        const csvPath = await this.exportToCSV(backtestRun, 'REGULAR_BACKTEST');

        console.log(`✅ Regular backtest results saved:`);
        console.log(`   JSON: ${jsonPath}`);
        console.log(`   CSV: ${csvPath}`);

        return {
            runId,
            jsonPath,
            csvPath,
            summary: backtestRun.summary
        };
    }

    /**
     * Build per-symbol results from strategy results
     */
    buildPerSymbolResults(scoredLogics) {
        const perSymbol = {};

        for (const logic of scoredLogics) {
            if (!logic.trades || logic.trades.length === 0) continue;

            for (const trade of logic.trades) {
                if (!perSymbol[trade.symbol]) {
                    perSymbol[trade.symbol] = {
                        symbol: trade.symbol,
                        trades: [],
                        totalTrades: 0,
                        wins: 0,
                        losses: 0,
                        winRate: 0,
                        totalPnL: 0
                    };
                }

                perSymbol[trade.symbol].trades.push({
                    strategy: logic.logic.name,
                    entryDate: trade.entry.date,
                    entryPrice: trade.entry.price,
                    exitDate: trade.exit.date,
                    exitPrice: trade.exit.price,
                    pnl: trade.pnl,
                    holdingDays: trade.holdingDays,
                    exitReason: trade.exitReason,
                    result: trade.pnl > 0 ? 'WIN' : 'LOSS'
                });
            }
        }

        // Calculate stats for each symbol
        Object.values(perSymbol).forEach(symbolData => {
            symbolData.totalTrades = symbolData.trades.length;
            symbolData.wins = symbolData.trades.filter(t => t.result === 'WIN').length;
            symbolData.losses = symbolData.trades.filter(t => t.result === 'LOSS').length;
            symbolData.winRate = (symbolData.wins / symbolData.totalTrades * 100).toFixed(1);
            symbolData.totalPnL = symbolData.trades.reduce((sum, t) => sum + t.pnl, 0).toFixed(2);
        });

        return Object.values(perSymbol);
    }

    /**
     * Export results to CSV
     */
    async exportToCSV(backtestRun, type) {
        const csvPath = path.join(this.csvDir, `${backtestRun.runId}.csv`);

        if (type === 'TIME_TRAVEL') {
            return this.exportTimeTravelToCSV(backtestRun, csvPath);
        } else {
            return this.exportRegularBacktestToCSV(backtestRun, csvPath);
        }
    }

    /**
     * Export Time-Travel results to CSV
     */
    exportTimeTravelToCSV(backtestRun, csvPath) {
        const headers = [
            'Symbol',
            'Strategy',
            'Entry Date',
            'Entry Price',
            'Exit Date',
            'Exit Price',
            'Target Price',
            'Stop Loss',
            'P&L %',
            'Holding Days',
            'Exit Reason',
            'Result',
            'Target Hit',
            'Stop Hit'
        ];

        const rows = [];

        // Add header
        rows.push(headers.join(','));

        // Add data rows from per-symbol results
        for (const symbolData of backtestRun.perSymbol) {
            for (const trade of symbolData.trades) {
                const row = [
                    symbolData.symbol,
                    trade.strategy,
                    this.formatDate(trade.entryDate),
                    trade.entryPrice.toFixed(2),
                    this.formatDate(trade.exitDate),
                    trade.exitPrice.toFixed(2),
                    (trade.entryPrice * 1.025).toFixed(2),  // 2.5% target
                    (trade.entryPrice * 0.985).toFixed(2),  // 1.5% stop
                    trade.pnl.toFixed(2),
                    trade.holdingDays,
                    trade.exitReason,
                    trade.result,
                    trade.exitReason === 'TARGET' ? 'YES' : 'NO',
                    trade.exitReason === 'STOP' ? 'YES' : 'NO'
                ];
                rows.push(row.join(','));
            }
        }

        fs.writeFileSync(csvPath, rows.join('\n'));
        return csvPath;
    }

    /**
     * Export Regular Backtest results to CSV
     */
    exportRegularBacktestToCSV(backtestRun, csvPath) {
        const headers = [
            'Symbol',
            'Strategy',
            'Entry Date',
            'Entry Price',
            'Exit Date',
            'Exit Price',
            'Target Price',
            'Stop Loss',
            'P&L ₹',
            'P&L %',
            'Holding Days',
            'Exit Reason',
            'Result',
            'Target Hit',
            'Stop Hit'
        ];

        const rows = [];
        rows.push(headers.join(','));

        for (const trade of backtestRun.trades) {
            const row = [
                trade.symbol,
                backtestRun.strategy.name,
                this.formatDate(trade.entryDate),
                trade.entryPrice.toFixed(2),
                this.formatDate(trade.exitDate),
                trade.exitPrice.toFixed(2),
                trade.target.toFixed(2),
                trade.stopLoss.toFixed(2),
                ((trade.exitPrice - trade.entryPrice) * 100).toFixed(2),  // Assuming 100 shares
                trade.pnlPercent.toFixed(2),
                trade.holdingDays,
                trade.exitReason,
                trade.result,
                trade.targetHit ? 'YES' : 'NO',
                trade.stopHit ? 'YES' : 'NO'
            ];
            rows.push(row.join(','));
        }

        fs.writeFileSync(csvPath, rows.join('\n'));
        return csvPath;
    }

    /**
     * Format date for CSV
     */
    formatDate(dateString) {
        if (!dateString) return 'N/A';
        const date = new Date(dateString);
        return date.toLocaleDateString('en-IN', {
            day: '2-digit',
            month: 'short',
            year: 'numeric'
        });
    }

    /**
     * Get all backtest runs for a category
     */
    async getBacktestHistory(categoryKey) {
        const files = fs.readdirSync(this.resultsDir)
            .filter(f => f.endsWith('.json') && f.includes(categoryKey));

        const history = [];

        for (const file of files) {
            const content = fs.readFileSync(path.join(this.resultsDir, file), 'utf8');
            const data = JSON.parse(content);

            history.push({
                runId: data.runId,
                type: data.type,
                timestamp: data.timestamp,
                summary: data.summary
            });
        }

        // Sort by timestamp descending (newest first)
        return history.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    }

    /**
     * Get detailed results for a specific run
     */
    async getBacktestDetails(runId) {
        const jsonPath = path.join(this.resultsDir, `${runId}.json`);

        if (!fs.existsSync(jsonPath)) {
            throw new Error(`Backtest run ${runId} not found`);
        }

        const content = fs.readFileSync(jsonPath, 'utf8');
        return JSON.parse(content);
    }

    /**
     * Get CSV path for a run
     */
    getCSVPath(runId) {
        return path.join(this.csvDir, `${runId}.csv`);
    }
}

module.exports = new BacktestResultsService();
