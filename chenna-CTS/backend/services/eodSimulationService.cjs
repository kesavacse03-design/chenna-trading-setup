/**
 * EOD Simulation Service (V2)
 * 
 * Uses historical 1-min candles from Upstox to simulate signal outcomes.
 * Fixed: ambiguity resolution, T2 tracking, uses historical endpoint (works post-market).
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const upstoxClient = require('./upstoxClient.cjs');
const historicalDataService = require('./historicalDataService.cjs');
const { todayIST } = require('../utils/istUtils.cjs');
const { fetch1MinCandles } = require('./eodReportService.cjs');
const { evaluateOutcome } = require('./signalEngine.cjs');

class EodSimulationService {
    async runSimulationForDate(targetDateStr = null) {
        try {
            // 1. Determine Target Date (IST)
            const date = targetDateStr || todayIST();
            console.log(`[EOD Sim V2] Starting simulation for ${date}...`);

            // Convert to UTC for DB query
            const targetDate = new Date(date + "T00:00:00Z");

            // 2. Fetch CONFIRMED signals (or all tradeable signals)
            const signals = await prisma.v5Signal.findMany({
                where: {
                    signalDate: targetDate,
                    category: 'INTRADAY_BOOST'
                },
                orderBy: { confidenceScore: 'desc' }
            });

            if (!signals || signals.length === 0) {
                console.log(`[EOD Sim V2] No signals found for ${date}.`);
                return { ok: true, report: null, details: [], message: 'No signals found' };
            }

            console.log(`[EOD Sim V2] Found ${signals.length} signals. Fetching 1-min candle outcomes...`);

            let wins = 0;
            let losses = 0;
            let totalR = 0;
            const results = [];

            // 3. Simulate Each Signal using 1-min candles
            for (const signal of signals) {
                const candles = await fetch1MinCandles(signal.instrumentKey, date);
                const result = evaluateOutcome(signal, candles);

                const entry = parseFloat(signal.entryPrice);
                const stop = parseFloat(signal.stopPrice);
                const t1 = parseFloat(signal.t1Price || 0);
                const dir = signal.direction || 'LONG';

                let outcome;
                if (result.rMultiple > 0) { outcome = 'WIN'; wins++; }
                else if (result.rMultiple < 0) { outcome = 'LOSS'; losses++; }
                else { outcome = 'BREAKEVEN'; }

                totalR += result.rMultiple;

                results.push({
                    symbol: signal.symbol,
                    dir,
                    entry,
                    t1,
                    stop,
                    outcome,
                    detailedOutcome: result.outcome,
                    exitPrice: result.exitPrice,
                    netR: result.rMultiple,
                    exitTime: result.exitTime,
                    hitT1: result.hitT1,
                    hitT2: result.hitT2,
                    score: signal.confidenceScore
                });

                // Respect Upstox rate limit
                await new Promise(r => setTimeout(r, 350));
            }

            // 4. Calculate Metrics
            const totalSignals = signals.length;
            const winRate = (wins + losses) > 0 ? (wins / (wins + losses)) * 100 : 0;

            // Top 3 by Score
            const top3 = results.slice(0, 3);
            const topNWins = top3.filter(r => r.outcome === 'WIN').length;
            const topNLosses = top3.filter(r => r.outcome === 'LOSS').length;
            const topNNetR = top3.reduce((acc, r) => acc + r.netR, 0);

            // 5. Save to DB
            const reportData = {
                date: targetDate,
                totalSignals,
                confirmed: totalSignals,
                wins,
                losses,
                netR: parseFloat(totalR.toFixed(2)),
                winRate: parseFloat(winRate.toFixed(2)),
                topNWins,
                topNLosses,
                topNNetR: parseFloat(topNNetR.toFixed(2))
            };

            const savedReport = await prisma.v5DailyReport.upsert({
                where: { date: targetDate },
                update: reportData,
                create: reportData
            });

            console.log(`[EOD Sim V2] ✅ Complete! ${wins}W/${losses}L, NetR: ${totalR.toFixed(2)}R | Top3 NetR: ${topNNetR.toFixed(2)}R`);

            return {
                ok: true,
                report: savedReport,
                details: results
            };

        } catch (error) {
            console.error('[EOD Sim V2] Error:', error);
            return { ok: false, error: error.message };
        }
    }
}

module.exports = new EodSimulationService();
