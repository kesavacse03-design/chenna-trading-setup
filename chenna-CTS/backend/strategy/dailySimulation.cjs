/**
 * Daily Simulation Engine
 * 
 * Answers: "What if the AI traded today using V1?"
 * 
 * Features:
 * - Applies V1 strategy to today's market data
 * - Real-time trap detection
 * - Classifies signals as TAKE/REJECT
 * - Transparency: shows what AI would do
 * - Trust-building: demonstrates trap avoidance
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const InstitutionalTrapDetector = require('./institutionalTrapDetector.cjs');
const ComprehensiveTA = require('./comprehensiveTA.cjs');
const V1StrategyGenerator = require('./v1Generator.cjs');

class DailySimulation {

    constructor() {
        this.trapDetector = new InstitutionalTrapDetector();
    }

    /**
     * Run daily simulation for a category
     */
    async runToday(categoryKey, options = {}) {
        console.log(`\n📅 Running Daily Simulation for ${categoryKey}`);
        console.log(`===================================================\n`);

        const simulationDate = options.date || new Date();
        const dateStr = simulationDate.toISOString().split('T')[0];

        // Step 1: Load V1 strategy
        const generator = new V1StrategyGenerator();
        let v1Strategy;

        try {
            v1Strategy = await generator.loadV1FromDatabase(categoryKey);
            console.log(`✅ Loaded V1 Strategy: ${v1Strategy.id}`);
            console.log(`📊 Historical Performance:`);
            console.log(`   Win Rate: ${v1Strategy.backtestMetrics.winRate.toFixed(1)}%`);
            console.log(`   Expectancy: ${v1Strategy.backtestMetrics.expectancy.toFixed(2)}%\n`);
        } catch (error) {
            throw new Error(`Failed to load V1 strategy: ${error.message}`);
        }

        // Step 2: Get stocks for category
        const stocks = await this.getStocksForCategory(categoryKey);
        console.log(`📈 Analyzing ${stocks.length} stocks from ${categoryKey}\n`);

        if (stocks.length === 0) {
            throw new Error(`No stocks found for category: ${categoryKey}`);
        }

        // Step 3: For each stock, check if signal generated today
        const signals = [];
        let stocksAnalyzed = 0;
        let stocksSkipped = 0;

        for (const stock of stocks) {
            console.log(`  [${stocksAnalyzed + stocksSkipped + 1}/${stocks.length}] ${stock.symbol}...`);

            const todayCandles = await this.getTodayCandles(stock.symbol);

            if (!todayCandles || todayCandles.length < 50) {
                console.log(`    ⚠️ Insufficient data`);
                stocksSkipped++;
                continue;
            }

            // Check V1 entry conditions
            const signal = await this.checkV1EntryConditions(todayCandles, v1Strategy.logic.entry);

            if (!signal.valid) {
                stocksAnalyzed++;
                continue; // No signal, skip
            }

            console.log(`    🎯 SIGNAL GENERATED`);

            // Check traps
            const trapScan = await this.trapDetector.scanAll(todayCandles);

            const action = trapScan.allClear ? 'TAKE' : 'REJECT';
            const confidence = this.calculateConfidence(signal, trapScan, v1Strategy);

            const todayCandle = todayCandles[todayCandles.length - 1];

            signals.push({
                symbol: stock.symbol,
                date: dateStr,
                currentPrice: todayCandle.close,
                signalValid: signal.valid,
                signalDetails: signal,
                trapDetected: !trapScan.allClear,
                trapTypes: trapScan.detectedTraps,
                trapFlags: trapScan.flags,
                action,
                reason: trapScan.allClear
                    ? 'All V1 conditions met, no traps detected. HIGH-QUALITY SIGNAL.'
                    : `Rejected: ${trapScan.reason}`,
                confidence: confidence.toFixed(2),
                projectedTarget: (todayCandle.close * (1 + v1Strategy.logic.exit.targetPct / 100)).toFixed(2),
                projectedStop: (todayCandle.close * (1 - v1Strategy.logic.exit.stopPct / 100)).toFixed(2),
                rewardRiskRatio: (v1Strategy.logic.exit.targetPct / v1Strategy.logic.exit.stopPct).toFixed(2)
            });

            console.log(`    Action: ${action}`);
            console.log(`    Confidence: ${(confidence * 100).toFixed(0)}%`);
            if (!trapScan.allClear) {
                console.log(`    Traps: ${trapScan.detectedTraps.join(', ')}`);
            }

            stocksAnalyzed++;
        }

        // Step 4: Generate summary
        const signalsAccepted = signals.filter(s => s.action === 'TAKE');
        const signalsRejected = signals.filter(s => s.action === 'REJECT');

        const protectionRate = signals.length > 0
            ? (signalsRejected.length / signals.length) * 100
            : 0;

        console.log(`\n===================================================`);
        console.log(`📅 DAILY SIMULATION - ${dateStr}\n`);
        console.log(`  Stocks Analyzed: ${stocksAnalyzed}/${stocks.length}`);
        console.log(`  Signals Generated: ${signals.length}`);
        console.log(`  ✅ ACCEPT (High Quality): ${signalsAccepted.length}`);
        console.log(`  ❌ REJECT (Traps Detected): ${signalsRejected.length}`);
        console.log(`  🛡️ Protection Rate: ${protectionRate.toFixed(1)}%`);
        console.log(`===================================================\n`);

        // Step 5: Return report
        return {
            date: dateStr,
            category: categoryKey,
            v1StrategyId: v1Strategy.id,
            expectedPerformance: {
                historicalWinRate: v1Strategy.backtestMetrics.winRate,
                historicalExpectancy: v1Strategy.backtestMetrics.expectancy
            },
            analysis: {
                totalStocks: stocks.length,
                stocksAnalyzed,
                stocksSkipped,
                signalsGenerated: signals.length,
                signalsAccepted: signalsAccepted.length,
                signalsRejected: signalsRejected.length,
                protectionRate: parseFloat(protectionRate.toFixed(1))
            },
            signals,
            acceptedSignals: signalsAccepted,
            rejectedSignals: signalsRejected,
            insight: this.generateInsight(signals, protectionRate)
        };
    }

    /**
     * Check V1 entry conditions
     */
    async checkV1EntryConditions(candles, entryRules) {
        try {
            const indicators = ComprehensiveTA.getAllIndicators(candles);
            const current = candles[candles.length - 1];

            // RSI check
            const rsiMet = entryRules.rsiOperator === '<'
                ? indicators.rsi < entryRules.rsiThreshold
                : indicators.rsi > entryRules.rsiThreshold;

            // MACD check
            const macdFound = indicators.macd && indicators.macd.histogram > 0;

            // Volume check
            const avgVol = candles.slice(-20).reduce((sum, c) => sum + (c.volume || 0), 0) / 20;
            const volMet = avgVol > 0 && (current.volume / avgVol) >= entryRules.volumeFactor;

            // SMA check
            const smaMet = current.close > indicators.sma20;

            const allMet = rsiMet && macdMet && volMet && smaMet;

            return {
                valid: allMet,
                rsi: indicators.rsi,
                rsiMet,
                macdMet,
                volMet,
                smaMet,
                currentPrice: current.close
            };
        } catch (error) {
            return { valid: false, error: error.message };
        }
    }

    /**
     * Calculate signal confidence
     */
    calculateConfidence(signal, trapScan, v1Strategy) {
        let confidence = 0.5; // Base

        // V1 historical performance
        const historicalWR = v1Strategy.backtestMetrics.winRate / 100;
        confidence += historicalWR * 0.3;

        // All conditions met
        if (signal.rsiMet && signal.macdMet && signal.volMet && signal.smaMet) {
            confidence += 0.1;
        }

        // No traps
        if (trapScan.allClear) {
            confidence += 0.2;
        } else {
            // Deduct for traps
            confidence -= trapScan.detectedTraps.length * 0.1;
        }

        return Math.max(0, Math.min(1, confidence));
    }

    /**
     * Generate human-readable insight
     */
    generateInsight(signals, protectionRate) {
        const accepted = signals.filter(s => s.action === 'TAKE');
        const rejected = signals.filter(s => s.action === 'REJECT');

        if (signals.length === 0) {
            return "No signals generated today. Market conditions did not meet V1 criteria.";
        }

        if (accepted.length === 0) {
            return `All ${signals.length} signal(s) rejected due to trap detection. 100% capital protection - avoiding institutional manipulation.`;
        }

        if (rejected.length === 0) {
            return `All ${signals.length} signal(s) cleared trap detection. Rare high-quality setup day.`;
        }

        return `${accepted.length} of ${signals.length} signals cleared trap detection (${(100 - protectionRate).toFixed(0)}% pass rate). ${rejected.length} signals avoided due to institutional trap patterns.`;
    }

    // ==================== HELPERS ====================

    async getStocksForCategory(categoryKey) {
        const categoryStocks = await prisma.stockCategory.findMany({
            where: { category: { key: categoryKey } },
            include: { stock: true }
        });

        return categoryStocks.map(sc => sc.stock);
    }

    async getTodayCandles(symbol) {
        // Get most recent cached data for symbol
        const cached = await prisma.ohlcvCache.findFirst({
            where: { symbol, interval: 'day' },
            orderBy: { createdAt: 'desc' }
        });

        if (!cached) return null;

        return JSON.parse(cached.data);
    }
}

module.exports = DailySimulation;
