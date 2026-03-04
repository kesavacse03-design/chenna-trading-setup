const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// Configuration Limits
const MAX_CONCURRENT_INTRADAY = 3;
const MAX_CONCURRENT_SWING = 2;
const MAX_RISK_PER_TRADE_INR = 1500; // Rs. 1500 max loss per trade

class PositionService {

    // -------------------------------------------------------------
    // POSITION SIZING & OPENING
    // -------------------------------------------------------------
    async openPositionFromSignal(signalId, userOverrides = {}) {
        // 1. Fetch Signal Data
        const signal = await prisma.v5Signal.findUnique({ where: { id: signalId } });
        if (!signal) throw new Error("Signal not found");
        if (signal.status !== 'CONFIRMED') throw new Error("Signal is not properly CONFIRMED yet. Cannot open position.");

        // 2. Enforce Concurrency Limits
        const isIntraday = signal.category === 'INTRADAY_BOOST';
        const limit = isIntraday ? MAX_CONCURRENT_INTRADAY : MAX_CONCURRENT_SWING;

        const openPositions = await prisma.v5Position.count({
            where: {
                status: 'OPEN',
                signal: { category: { startsWith: isIntraday ? 'INTRADAY' : 'ST_SWING' } }
            }
        });

        if (openPositions >= limit) {
            throw new Error(`Concurrency Limit Reached: Cannot open more than ${limit} active ${isIntraday ? 'Intraday' : 'Swing'} positions simultaneously.`);
        }

        // 3. Use signal data (prefer signal fields, allow user overrides)
        const entryPrice = userOverrides.entryPrice || parseFloat(signal.entryPrice || signal.breakoutLevel);
        const stopPrice = parseFloat(signal.stopPrice || signal.suggestedStop);
        const direction = signal.direction || (entryPrice > stopPrice ? 'LONG' : 'SHORT');

        let riskPerShare = Math.abs(entryPrice - stopPrice);
        if (riskPerShare <= 0) riskPerShare = entryPrice * 0.005;

        // Use signal targets if available, otherwise calculate
        const t1Price = signal.t1Price ? parseFloat(signal.t1Price) :
            (direction === 'LONG' ? entryPrice + riskPerShare : entryPrice - riskPerShare);
        const t2Price = signal.t2Price ? parseFloat(signal.t2Price) :
            (direction === 'LONG' ? entryPrice + (riskPerShare * 2) : entryPrice - (riskPerShare * 2));

        // Position sizing (user can override quantity)
        const quantity = userOverrides.quantity || Math.floor(MAX_RISK_PER_TRADE_INR / riskPerShare);
        if (quantity < 1) throw new Error("Risk boundary too large to afford 1 share.");

        // 4. Create Open Position
        const pos = await prisma.v5Position.create({
            data: {
                signalId: signal.id,
                symbol: signal.symbol,
                direction: direction,
                entryDate: new Date(),
                entryPrice: entryPrice,
                stopPrice: stopPrice,
                t1Price: t1Price,
                t2Price: t2Price,
                quantity: quantity,
                riskInr: MAX_RISK_PER_TRADE_INR,
                status: 'OPEN',
                confidenceScore: signal.confidenceScore,
                confidenceTier: signal.confidenceTier
            }
        });

        // 5. Update Signal status
        await prisma.v5Signal.update({
            where: { id: signal.id },
            data: { status: 'EXECUTED' }
        });

        console.log(`[PositionService] Opened ${direction} Position on ${signal.symbol}. QTY: ${quantity} | Entry: ${entryPrice.toFixed(2)} | Stop: ${stopPrice.toFixed(2)} | T1: ${t1Price.toFixed(2)} | Risk: ${MAX_RISK_PER_TRADE_INR}`);
        return pos;
    }

    // -------------------------------------------------------------
    // POSITION TRACKING & EXITS
    // -------------------------------------------------------------

    // In production, this runs via a Cron schedule every 5 minutes 
    // passing latest real-time market data dictionary: { 'AAPL': 150.50, ... }
    async evaluateOpenPositions(currentMarketData, isEOD = false) {
        const positions = await prisma.v5Position.findMany({
            where: { status: 'OPEN' },
            include: { signal: true }
        });

        console.log(`[PositionService] Evaluating ${positions.length} active open positions...`);
        let closedCount = 0;

        for (const pos of positions) {
            const sym = pos.symbol;
            if (!currentMarketData[sym]) continue;

            const tHigh = currentMarketData[sym].high;
            const tLow = currentMarketData[sym].low;
            const tClose = currentMarketData[sym].close; // current actual
            const isIntraday = pos.signal.category === 'INTRADAY_BOOST';

            let exitTriggered = false;
            let exitPrice = 0;
            let exitReason = '';

            const entry = parseFloat(pos.entryPrice);
            const stop = parseFloat(pos.stopPrice);
            const t1 = parseFloat(pos.t1Price);
            const t2 = parseFloat(pos.t2Price);

            // 1. HARD STOP LOSS (Always evaluated first for safety)
            if (pos.direction === 'LONG' && tLow <= stop) { exitTriggered = true; exitPrice = stop; exitReason = 'STOP_HIT'; }
            if (pos.direction === 'SHORT' && tHigh >= stop) { exitTriggered = true; exitPrice = stop; exitReason = 'STOP_HIT'; }

            // 2. INTRADAY EOD TIME LIMIT (15:15 PM)
            if (!exitTriggered && isIntraday && isEOD) {
                exitTriggered = true; exitPrice = tClose; exitReason = 'EOD_TIME_EXIT';
            }

            // 3. TARGET HITS (Assuming full close at T1 for simplicity in core logic right now. Partial booking logic follows later)
            if (!exitTriggered) {
                if (pos.direction === 'LONG') {
                    if (tHigh >= t2) { exitTriggered = true; exitPrice = t2; exitReason = 'T2_HIT'; }
                    else if (tHigh >= t1 && isIntraday) {
                        // Intraday logic books 70% at T1, 30% runs. For simplicity in phase 1, we exit fully if it loses momentum or we handle it visually.
                        // Setting full exit on target to ensure mathematical recording handles exact Rs P&L.
                        exitTriggered = true; exitPrice = t1; exitReason = 'T1_HIT';
                    }
                } else {
                    if (tLow <= t2) { exitTriggered = true; exitPrice = t2; exitReason = 'T2_HIT'; }
                    else if (tLow <= t1 && isIntraday) {
                        exitTriggered = true; exitPrice = t1; exitReason = 'T1_HIT';
                    }
                }
            }

            // 4. SWING TIME LIMITS
            if (!exitTriggered && !isIntraday) {
                const daysHeld = pos.holdingDays;
                if (pos.signal.category === 'ST_SWING_DOWN' && daysHeld >= 5) {
                    exitTriggered = true; exitPrice = tClose; exitReason = 'TIME_EXIT_5DAY';
                }
                else if (pos.signal.category === 'ST_SWING_UP' && daysHeld >= 10) {
                    exitTriggered = true; exitPrice = tClose; exitReason = 'TIME_EXIT_10DAY';
                }
                else if (pos.signal.category === 'LT_SWING_UP' && daysHeld >= 13) {
                    exitTriggered = true; exitPrice = tClose; exitReason = 'TIME_EXIT_13DAY';
                }
            }

            // Update live trailing Data
            if (!exitTriggered) {
                const pnl = pos.direction === 'LONG' ? (tClose - entry) * pos.quantity : (entry - tClose) * pos.quantity;
                await prisma.v5Position.update({
                    where: { id: pos.id },
                    data: { currentPrice: tClose, unrealizedPnl: pnl }
                });
            } else {
                // Execute Final Close
                const pnl = pos.direction === 'LONG' ? (exitPrice - entry) * pos.quantity : (entry - exitPrice) * pos.quantity;
                const riskInrParsed = parseFloat(pos.riskInr) || MAX_RISK_PER_TRADE_INR;
                const rMult = pnl / riskInrParsed;

                let outcome = 'BREAKEVEN';
                if (pnl > 0) outcome = 'WIN';
                if (pnl < 0) outcome = 'LOSS';

                await prisma.v5Position.update({
                    where: { id: pos.id },
                    data: {
                        status: 'CLOSED',
                        exitDate: new Date(),
                        exitPrice: exitPrice,
                        exitReason: exitReason,
                        realizedPnL: pnl,
                        rMultiple: rMult,
                        outcome: outcome,
                        currentPrice: exitPrice,
                        unrealizedPnl: 0
                    }
                });
                closedCount++;
                console.log(`[PositionService] CLOSED ${pos.symbol} - Reason: ${exitReason} | Exit: ${exitPrice.toFixed(2)} | PNL: Rs. ${pnl.toFixed(2)} (${rMult.toFixed(2)}R)`);
            }
        }
        return { closed: closedCount };
    }
}

module.exports = new PositionService();
