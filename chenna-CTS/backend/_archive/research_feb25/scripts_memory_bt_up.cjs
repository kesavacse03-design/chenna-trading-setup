const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const swingBoUp = require('../strategies/swingBoUpLongStrategy.cjs');
const { calculateIntelligentStop, calculateTrailingStop } = require('../services/stopLossCalculator.cjs');

const MAX_HOLD_DAYS = 10;
const TRAIL_PCT = 0.03;
const TRAIL_ACTIVATION = 0.015;
const BREAKEVEN_PCT = 0.02;

function round2(val) { return Math.round(val * 100) / 100; }

function simulateTrade(params) {
    const { symbol, entryPrice, entryDate, futureCandles, initialStop, target, enableTrailing, trailPct, activationPct, breakevenPct, method, tier, reason, atr, stopMethod } = params;
    let currentStop = initialStop;
    let highestPrice = entryPrice;
    let exitPrice = null;
    let exitReason = null;
    let exitDate = null;
    let daysHeld = 0;

    for (let i = 0; i < futureCandles.length; i++) {
        const candle = futureCandles[i];
        daysHeld = i + 1;
        if (candle.high > highestPrice) highestPrice = candle.high;

        if (candle.low <= currentStop) {
            exitPrice = currentStop;
            exitReason = enableTrailing && currentStop > initialStop ? (currentStop >= entryPrice ? 'BREAKEVEN' : 'TRAILING_STOP') : 'STOP_HIT';
            exitDate = candle.timestamp;
            break;
        }

        if (candle.high >= target) {
            exitPrice = target;
            exitReason = 'TARGET_HIT';
            exitDate = candle.timestamp;
            break;
        }

        if (enableTrailing) {
            const trailCalc = calculateTrailingStop({ entryPrice, currentStop, highestPrice, trailPct: trailPct || 0.03, activationPct: activationPct || 0.015, breakevenPct: breakevenPct || 0.02 });
            if (trailCalc.newStop > currentStop) currentStop = trailCalc.newStop;
        }

        if (daysHeld >= MAX_HOLD_DAYS) {
            exitPrice = candle.close;
            exitReason = 'TIME_EXIT';
            exitDate = candle.timestamp;
            break;
        }
    }

    if (!exitPrice) {
        const last = futureCandles[futureCandles.length - 1];
        exitPrice = last.close;
        exitReason = 'TIME_EXIT';
        exitDate = last.timestamp;
    }

    const pnlPct = round2(((exitPrice - entryPrice) / entryPrice) * 100);
    return { symbol, entryDate, exitDate, entryPrice: round2(entryPrice), exitPrice: round2(exitPrice), pnlPct, exitReason, daysHeld, method, tier, reason, atr, stopMethod };
}

async function run() {
    console.log("Fetching Category Symbols...");
    const upCategory = await prisma.category.findUnique({ where: { key: 'SHORT_TERM_SWING_BO_UP' } });
    if (!upCategory) throw new Error("Category not found!");
    const categoryStocks = await prisma.stockCategory.findMany({
        where: { categoryId: upCategory.id },
        include: { stock: true }
    });
    const validSymbols = new Set(categoryStocks.map(s => s.stock.symbol));
    console.log(`Found ${validSymbols.size} symbols for BO_UP.`);

    console.log("Loading cache from Database...");

    // Get ALL cached data for daily interval. We just load it all in memory.
    const allCaches = await prisma.ohlcvCache.findMany({ where: { interval: 'day' } });
    const dataMap = {};

    for (const cache of allCaches) {
        if (!validSymbols.has(cache.symbol)) continue;
        if (!dataMap[cache.symbol]) dataMap[cache.symbol] = { daily: [] };
        // Combine data
        dataMap[cache.symbol].daily.push(...cache.data);
    }

    // Sort and deduplicate
    for (const sym in dataMap) {
        const unique = {};
        for (const c of dataMap[sym].daily) {
            const dt = c.timestamp.split('T')[0];
            unique[dt] = c;
        }
        dataMap[sym].daily = Object.values(unique).sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
    }

    console.log(`Loaded data for ${Object.keys(dataMap).length} symbols. Running SHORT_TERM_SWING_BO_UP...`);
    const atrTrailTrades = [];

    // Evaluate strategy across the timeline October 2025 -> Feb 2026
    const evalStart = new Date('2025-10-01');
    const evalEnd = new Date('2026-02-19');

    for (const symbol in dataMap) {
        const daily = dataMap[symbol].daily;
        if (daily.length < 50) continue; // Need minimum data

        // Loop through each valid day to test signal generator
        for (let i = 50; i < daily.length - 1; i++) {
            const currentCandle = daily[i];
            const candleDate = new Date(currentCandle.timestamp);

            if (candleDate < evalStart || candleDate > evalEnd) continue;

            // Generate signal using data up to today
            const pastDaily = daily.slice(0, i + 1);

            const signal = await swingBoUp.checkSignal(symbol, pastDaily, [], []);

            if (signal && signal.signal === 'BUY') {
                // Execute Trade Simulation!
                const entryCandle = daily[i + 1];
                const entryPrice = entryCandle.open;

                const futureCandles = daily.slice(i + 1, i + 1 + MAX_HOLD_DAYS);
                if (futureCandles.length < 2) continue; // Skip if end of dataset

                // Fetch ATR generated from the strategy directly
                const result = simulateTrade({
                    symbol, entryPrice, entryDate: currentCandle.timestamp.split('T')[0], futureCandles,
                    initialStop: signal.stopPrice,
                    target: signal.targetPrice,
                    enableTrailing: true,
                    trailPct: TRAIL_PCT,
                    activationPct: TRAIL_ACTIVATION,
                    breakevenPct: BREAKEVEN_PCT,
                    method: 'ATR_TRAIL',
                    tier: signal.tier,
                    reason: signal.reason,
                    atr: signal.atr,
                    stopMethod: signal.stopMethod
                });

                atrTrailTrades.push(result);
                // Move index forward by daysHeld to avoid overlapping signals
                i += result.daysHeld;
            }
        }
    }

    console.log(`\nOverall: ${atrTrailTrades.length} trades`);
    const wins = atrTrailTrades.filter(t => t.pnlPct > 0);
    const winRate = atrTrailTrades.length ? (wins.length / atrTrailTrades.length) * 100 : 0;
    const avgPnl = atrTrailTrades.length ? atrTrailTrades.reduce((a, b) => a + b.pnlPct, 0) / atrTrailTrades.length : 0;
    const profitFactor = (() => {
        const grossProfit = wins.reduce((a, b) => a + b.pnlPct, 0);
        const losses = atrTrailTrades.filter(t => t.pnlPct < 0);
        const grossLoss = Math.abs(losses.reduce((a, b) => a + b.pnlPct, 0));
        return grossLoss > 0 ? (grossProfit / grossLoss).toFixed(2) : "Infinite";
    })();

    console.log(`Overall WR: ${winRate.toFixed(2)}% | P&L: ${avgPnl.toFixed(2)}% | Profit Factor: ${profitFactor}`);

    for (let tier = 1; tier <= 3; tier++) {
        const tierTrades = atrTrailTrades.filter(t => t.tier === tier);
        const tierWins = tierTrades.filter(t => t.pnlPct > 0);
        const tWR = tierTrades.length ? (tierWins.length / tierTrades.length) * 100 : 0;
        const tPnl = tierTrades.length ? tierTrades.reduce((a, b) => a + b.pnlPct, 0) / tierTrades.length : 0;
        console.log(`Tier ${tier}: ${tierTrades.length} trades | WR: ${tWR.toFixed(2)}% | P&L: ${tPnl.toFixed(2)}%`);
    }

    const exits = {};
    for (const t of atrTrailTrades) {
        exits[t.exitReason] = (exits[t.exitReason] || 0) + 1;
    }
    console.log("\nExits:", exits);

    console.log("\nSample Trades:");
    for (const t of atrTrailTrades.slice(0, 5)) {
        console.log(`${t.symbol} | Entry: ₹${t.entryPrice} | Exit: ₹${t.exitPrice} | ${t.exitReason} | P&L: ${t.pnlPct}% | Tier: ${t.tier}`);
    }
}

run().catch(console.error).finally(() => { prisma.$disconnect(); process.exit(0); });
