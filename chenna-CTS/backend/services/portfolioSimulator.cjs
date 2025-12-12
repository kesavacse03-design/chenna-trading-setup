/**
 * Portfolio Simulator
 * Phase 9: Portfolio Simulation
 * 
 * Simulates ₹1,00,000 portfolio over backtest period
 */

function simulatePortfolio(trades, initialCapital = 100000) {
    const portfolio = {
        initialCapital,
        currentCapital: initialCapital,
        equityCurve: [],
        trades: [],
        metrics: {
            totalTrades: 0,
            winningTrades: 0,
            losingTrades: 0,
            totalPnL: 0,
            maxDrawdown: 0,
            sharpeRatio: 0,
            winRate: 0,
            avgWin: 0,
            avgLoss: 0,
            profitFactor: 0
        }
    };

    let peak = initialCapital;
    let drawdown = 0;
    const returns = [];

    // Sort trades by entry timestamp
    const sortedTrades = [...trades].sort((a, b) => a.entryTs - b.entryTs);

    sortedTrades.forEach((trade, index) => {
        const pnlAmount = (trade.pnl / 100) * initialCapital; // Convert % to amount
        portfolio.currentCapital += pnlAmount;

        // Record equity point
        portfolio.equityCurve.push({
            timestamp: trade.exitTs || trade.entryTs,
            equity: portfolio.currentCapital,
            tradeNumber: index + 1
        });

        // Update peak and calculate drawdown
        if (portfolio.currentCapital > peak) {
            peak = portfolio.currentCapital;
        }
        const currentDrawdown = ((peak - portfolio.currentCapital) / peak) * 100;
        if (currentDrawdown > drawdown) {
            drawdown = currentDrawdown;
        }

        // Track metrics
        portfolio.metrics.totalTrades++;
        if (trade.pnl > 0) {
            portfolio.metrics.winningTrades++;
            portfolio.metrics.avgWin += trade.pnl;
        } else if (trade.pnl < 0) {
            portfolio.metrics.losingTrades++;
            portfolio.metrics.avgLoss += Math.abs(trade.pnl);
        }
        portfolio.metrics.totalPnL += trade.pnl;

        // Calculate return for Sharpe
        returns.push(trade.pnl);

        portfolio.trades.push({
            ...trade,
            capitalBefore: portfolio.currentCapital - pnlAmount,
            capitalAfter: portfolio.currentCapital,
            pnlAmount
        });
    });

    // Final metrics calculations
    portfolio.metrics.maxDrawdown = drawdown;
    portfolio.metrics.winRate = portfolio.metrics.totalTrades > 0
        ? (portfolio.metrics.winningTrades / portfolio.metrics.totalTrades) * 100
        : 0;

    portfolio.metrics.avgWin = portfolio.metrics.winningTrades > 0
        ? portfolio.metrics.avgWin / portfolio.metrics.winningTrades
        : 0;

    portfolio.metrics.avgLoss = portfolio.metrics.losingTrades > 0
        ? portfolio.metrics.avgLoss / portfolio.metrics.losingTrades
        : 0;

    const totalWins = portfolio.metrics.avgWin * portfolio.metrics.winningTrades;
    const totalLosses = portfolio.metrics.avgLoss * portfolio.metrics.losingTrades;
    portfolio.metrics.profitFactor = totalLosses > 0 ? totalWins / totalLosses : 0;

    // Calculate Sharpe ratio (simplified)
    if (returns.length > 0) {
        const avgReturn = returns.reduce((sum, r) => sum + r, 0) / returns.length;
        const variance = returns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) / returns.length;
        const stdDev = Math.sqrt(variance);
        portfolio.metrics.sharpeRatio = stdDev > 0 ? (avgReturn / stdDev) * Math.sqrt(252) : 0; // Annualized
    }

    portfolio.metrics.finalCapital = portfolio.currentCapital;
    portfolio.metrics.totalReturn = ((portfolio.currentCapital - initialCapital) / initialCapital) * 100;

    return portfolio;
}

/**
 * Calculate monthly P&L breakdown
 */
function calculateMonthlyPnL(trades) {
    const monthly = {};

    trades.forEach(trade => {
        const date = new Date(trade.exitTs || trade.entryTs);
        const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;

        if (!monthly[monthKey]) {
            monthly[monthKey] = {
                trades: 0,
                wins: 0,
                losses: 0,
                totalPnL: 0
            };
        }

        monthly[monthKey].trades++;
        if (trade.pnl > 0) monthly[monthKey].wins++;
        else if (trade.pnl < 0) monthly[monthKey].losses++;
        monthly[monthKey].totalPnL += trade.pnl;
    });

    return Object.entries(monthly).map(([month, data]) => ({
        month,
        ...data,
        winRate: data.trades > 0 ? (data.wins / data.trades) * 100 : 0
    }));
}

module.exports = {
    simulatePortfolio,
    calculateMonthlyPnL
};
