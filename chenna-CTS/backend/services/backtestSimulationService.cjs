/**
 * Backtest Simulation Service
 * 
 * Takes replayed signals (which have exact outcomes) and filters/samples them
 * based on different simulation strategies (All, Top N, Monkey Random, AI).
 */

class BacktestSimulationService {

    /**
     * Helper to evaluate a set of picks and return standard metrics
     */
    evaluatePicks(signals) {
        // Only evaluate signals that actually entered a trade
        const tradeable = signals.filter(s => s.entered);
        const winners = tradeable.filter(s => s.replayRMultiple > 0);
        const losers = tradeable.filter(s => s.replayRMultiple < 0);

        const totalR = tradeable.reduce((sum, s) => sum + s.replayRMultiple, 0);
        const winRate = tradeable.length > 0 ? (winners.length / tradeable.length) * 100 : 0;

        return {
            signals: tradeable, // Only return the ones actually taken
            summary: {
                total: signals.length,
                traded: tradeable.length,
                winners: winners.length,
                losers: losers.length,
                totalR: Math.round(totalR * 100) / 100,
                winRate: Math.round(winRate * 10) / 10
            }
        };
    }

    /**
     * Main simulation router
     */
    async simulateBacktest(signals, mode, options = {}) {
        console.log(`[BacktestSim] Running simulation mode: ${mode} on ${signals.length} base signals`);

        let selectedSignals = [];
        let monkeyStats = null;

        switch (mode) {
            case 'ALL':
                selectedSignals = signals;
                break;

            case 'TOP_N_BY_SCORE': {
                const n = options.pickCount || 3;

                // Group by date because we want top N *per day*, not overall
                const signalsByDate = {};
                for (const s of signals) {
                    if (!signalsByDate[s.signalDate]) signalsByDate[s.signalDate] = [];
                    signalsByDate[s.signalDate].push(s);
                }

                for (const date in signalsByDate) {
                    const dailySignals = signalsByDate[date];
                    const topPicks = dailySignals
                        .sort((a, b) => b.score - a.score)
                        .slice(0, n);
                    selectedSignals.push(...topPicks);
                }
                break;
            }

            case 'MONKEY_RANDOM': {
                const simulations = options.simCount || 1000;
                const n = options.pickCount || 3;
                const allNetR = [];
                const allWinRates = [];

                // Group by date
                const signalsByDate = {};
                for (const s of signals) {
                    if (!signalsByDate[s.signalDate]) signalsByDate[s.signalDate] = [];
                    signalsByDate[s.signalDate].push(s);
                }

                console.log(`[BacktestSim] Running ${simulations} random monkey tests...`);

                // Run 1000 simulations
                for (let i = 0; i < simulations; i++) {
                    let simSignals = [];

                    for (const date in signalsByDate) {
                        const dailySignals = signalsByDate[date];
                        // Shuffle array
                        const shuffled = [...dailySignals].sort(() => Math.random() - 0.5);
                        // Pick random N
                        simSignals.push(...shuffled.slice(0, n));
                    }

                    const result = this.evaluatePicks(simSignals);
                    allNetR.push(result.summary.totalR);
                    allWinRates.push(result.summary.winRate);
                }

                // Calculate distribution stats
                allNetR.sort((a, b) => a - b);
                const avgNetR = allNetR.reduce((a, b) => a + b, 0) / simulations;
                const avgWr = allWinRates.reduce((a, b) => a + b, 0) / simulations;

                monkeyStats = {
                    simulations,
                    avgNetR: Math.round(avgNetR * 100) / 100,
                    avgWinRate: Math.round(avgWr * 10) / 10,
                    bestCase: allNetR[allNetR.length - 1],
                    worstCase: allNetR[0],
                    percentile95: allNetR[Math.floor(simulations * 0.95)],
                    percentile5: allNetR[Math.floor(simulations * 0.05)]
                };

                // Default the returned signals to the "average" outcome run just for display
                // (Find the simulation run that matches the median NetR)
                const medianR = allNetR[Math.floor(simulations * 0.5)];
                selectedSignals = signals.filter(s => s.entered).slice(0, n); // Just return some real signals for the table
                break;
            }

            case 'AI_RECOMMENDED': {
                // To be implemented in Issue 4
                // For now, falls back to highest score
                const n = options.pickCount || 3;
                const signalsByDate = {};
                for (const s of signals) {
                    if (!signalsByDate[s.signalDate]) signalsByDate[s.signalDate] = [];
                    signalsByDate[s.signalDate].push(s);
                }

                for (const date in signalsByDate) {
                    const daily = signalsByDate[date];
                    selectedSignals.push(...daily.sort((a, b) => b.score - a.score).slice(0, n));
                }
                break;
            }

            default:
                selectedSignals = signals;
        }

        const result = this.evaluatePicks(selectedSignals);

        return {
            modeInfo: { mode, pickCount: options.pickCount || 3 },
            summary: result.summary,
            signals: result.signals,
            monkeyStats
        };
    }
}

module.exports = new BacktestSimulationService();
