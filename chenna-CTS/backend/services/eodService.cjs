/**
 * EOD Service — End-of-Day Position Management
 * 
 * Handles:
 * 1. runEODCleanup()    — Auto-close all OPEN intraday positions at 3:20 PM
 * 2. runStartupCleanup() — Mark stale previous-day intraday positions as MISSED_EXIT on server boot
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const { todayIST, dateToIST, startOfDayUTC, importDateIST } = require('../utils/istUtils.cjs');

/**
 * Auto-close all OPEN intraday positions.
 * Called at 3:20 PM IST by the signal scheduler, or manually via API.
 * 
 * @param {Object} [lastPrices] - Optional map of { symbol: price } for exit prices.
 *                                 If not provided, uses the position's last known currentPrice.
 * @returns {{ closed: number, positions: Array }}
 */
async function runEODCleanup(lastPrices = {}) {
    const today = todayIST();
    console.log(`\n[EODService] ═══ Running EOD Cleanup for ${today} ═══`);

    const openPositions = await prisma.v5Position.findMany({
        where: { status: 'OPEN' },
        include: { signal: true }
    });

    if (openPositions.length === 0) {
        console.log('[EODService] No open positions to close.');
        return { closed: 0, positions: [] };
    }

    const closedPositions = [];

    for (const pos of openPositions) {
        const isIntraday = pos.signal?.category === 'INTRADAY_BOOST' ||
            pos.signal?.category?.includes('INTRADAY');

        if (!isIntraday) {
            console.log(`[EODService] Skipping SWING position: ${pos.symbol} (category: ${pos.signal?.category})`);
            continue;
        }

        // Determine exit price: live price > position's last currentPrice > entry price
        const exitPrice = lastPrices[pos.symbol] ||
            (pos.currentPrice ? parseFloat(pos.currentPrice) : null) ||
            parseFloat(pos.entryPrice);

        const entry = parseFloat(pos.entryPrice);
        const qty = pos.quantity || 0;
        const pnl = pos.direction === 'LONG'
            ? (exitPrice - entry) * qty
            : (entry - exitPrice) * qty;

        const riskInr = parseFloat(pos.riskInr) || 1500;
        const rMult = pnl / riskInr;
        const outcome = pnl > 0 ? 'WIN' : pnl < 0 ? 'LOSS' : 'BREAKEVEN';

        await prisma.v5Position.update({
            where: { id: pos.id },
            data: {
                status: 'CLOSED',
                exitDate: new Date(),
                exitPrice: exitPrice,
                exitReason: 'EOD_AUTO_CLOSE',
                realizedPnL: pnl,
                rMultiple: rMult,
                outcome: outcome,
                currentPrice: exitPrice,
                unrealizedPnl: 0
            }
        });

        closedPositions.push({
            symbol: pos.symbol,
            direction: pos.direction,
            entryPrice: entry,
            exitPrice,
            pnl: Math.round(pnl * 100) / 100,
            rMultiple: Math.round(rMult * 100) / 100,
            outcome
        });

        console.log(`[EODService] ✅ CLOSED ${pos.symbol} | ${pos.direction} | Entry: ${entry.toFixed(2)} | Exit: ${exitPrice.toFixed(2)} | PnL: ₹${pnl.toFixed(2)} (${rMult.toFixed(2)}R) | ${outcome}`);
    }

    console.log(`[EODService] ═══ EOD Cleanup Complete: ${closedPositions.length} positions closed ═══\n`);
    return { closed: closedPositions.length, positions: closedPositions };
}

/**
 * Startup cleanup — mark stale intraday positions from previous days.
 * Called once on server boot.
 * 
 * Positions from previous days that are still OPEN are marked MISSED_EXIT
 * so they don't appear in the Active Positions UI but can be audited.
 */
async function runStartupCleanup() {
    const today = todayIST();
    const todayStart = startOfDayUTC(today);
    console.log(`[EODService] Running startup cleanup (today: ${today})...`);

    // Find all OPEN positions from BEFORE today
    const stalePositions = await prisma.v5Position.findMany({
        where: {
            status: 'OPEN',
            entryDate: { lt: todayStart }
        },
        include: { signal: true }
    });

    if (stalePositions.length === 0) {
        console.log('[EODService] ✅ No stale positions found on startup.');
        return { cleaned: 0 };
    }

    let cleaned = 0;

    for (const pos of stalePositions) {
        const isIntraday = pos.signal?.category === 'INTRADAY_BOOST' ||
            pos.signal?.category?.includes('INTRADAY');

        if (!isIntraday) continue; // Leave swing positions alone

        const entry = parseFloat(pos.entryPrice);
        // Use last known currentPrice or entry as a fallback
        const exitPrice = pos.currentPrice ? parseFloat(pos.currentPrice) : entry;
        const qty = pos.quantity || 0;
        const pnl = pos.direction === 'LONG'
            ? (exitPrice - entry) * qty
            : (entry - exitPrice) * qty;

        const riskInr = parseFloat(pos.riskInr) || 1500;
        const rMult = pnl / riskInr;
        const outcome = pnl > 0 ? 'WIN' : pnl < 0 ? 'LOSS' : 'BREAKEVEN';

        await prisma.v5Position.update({
            where: { id: pos.id },
            data: {
                status: 'CLOSED',
                exitDate: pos.entryDate, // Close on the day it was opened
                exitPrice: exitPrice,
                exitReason: 'SYSTEM_MISSED_EOD',
                realizedPnL: pnl,
                rMultiple: rMult,
                outcome: outcome,
                currentPrice: exitPrice,
                unrealizedPnl: 0
            }
        });

        cleaned++;
        console.log(`[EODService] ⚠️ MISSED_EXIT: ${pos.symbol} (${dateToIST(pos.entryDate)}) | PnL: ₹${pnl.toFixed(2)} | Reason: Server missed EOD auto-close`);
    }

    console.log(`[EODService] Startup cleanup complete: ${cleaned} stale intraday positions closed.`);
    return { cleaned };
}

module.exports = {
    runEODCleanup,
    runStartupCleanup
};
