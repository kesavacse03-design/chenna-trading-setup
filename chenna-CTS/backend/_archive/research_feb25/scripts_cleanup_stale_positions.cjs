/**
 * Cleanup Stale Positions Script
 * 
 * Problem: Active Positions show D13 (13 days old), P&L is ₹0
 * 
 * This script:
 * 1. Finds all OPEN positions
 * 2. For INTRADAY categories: Close positions from previous days
 * 3. For SWING categories: Close positions > 5 days old
 * 4. Archives closed positions to TradeJournal
 * 
 * Run: node scripts/cleanup_stale_positions.cjs
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const INTRADAY_CATEGORIES = ['INTRADAY_BOOST', 'HIGH_POWERED_STOCKS', 'UPSIDE_LOM_INTRA', 'DOWNSIDE_LOM_INTRA'];
const MAX_SWING_DAYS = 5;

async function cleanupStalePositions() {
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('STALE POSITION CLEANUP');
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('Date:', new Date().toISOString());
    console.log('');

    try {
        // Get all OPEN positions
        const openPositions = await prisma.position.findMany({
            where: { status: 'OPEN' }
        });

        console.log(`Found ${openPositions.length} OPEN positions`);
        console.log('');

        if (openPositions.length === 0) {
            console.log('No positions to clean up. Exiting.');
            return;
        }

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        let closedCount = 0;
        let skippedCount = 0;

        for (const position of openPositions) {
            const entryDate = new Date(position.entryDate);
            entryDate.setHours(0, 0, 0, 0);

            const daysHeld = Math.floor((today - entryDate) / (1000 * 60 * 60 * 24));
            const isIntraday = INTRADAY_CATEGORIES.includes(position.categoryKey);

            console.log(`\n[${position.symbol}]`);
            console.log(`  Category: ${position.categoryKey || 'UNKNOWN'}`);
            console.log(`  Entry Date: ${position.entryDate.toISOString().split('T')[0]}`);
            console.log(`  Days Held: ${daysHeld}`);
            console.log(`  Type: ${isIntraday ? 'INTRADAY' : 'SWING'}`);

            let shouldClose = false;
            let exitReason = '';

            if (isIntraday && daysHeld > 0) {
                // Intraday positions should close same day
                shouldClose = true;
                exitReason = 'MISSED_EOD_EXIT';
                console.log(`  ACTION: Closing - INTRADAY should have closed same day`);
            } else if (!isIntraday && daysHeld > MAX_SWING_DAYS) {
                // Swing positions: Force close after 5 days
                shouldClose = true;
                exitReason = 'FORCE_CLOSED_STALE';
                console.log(`  ACTION: Closing - Held ${daysHeld} days > ${MAX_SWING_DAYS} max`);
            } else {
                skippedCount++;
                console.log(`  ACTION: Skipping - Still valid`);
            }

            if (shouldClose) {
                // Close the position
                const exitPrice = position.entryPrice; // Use entry price since we don't have current price
                const realizedPnL = 0; // Unknown P&L
                const realizedPnLPercent = 0;

                await prisma.position.update({
                    where: { id: position.id },
                    data: {
                        status: 'CLOSED',
                        exitPrice: exitPrice,
                        exitDate: new Date(),
                        exitReason: exitReason,
                        realizedPnL: realizedPnL,
                        realizedPnLPercent: realizedPnLPercent,
                        holdingDays: daysHeld
                    }
                });

                // Archive to TradeJournal
                await prisma.tradeJournal.create({
                    data: {
                        positionId: position.id,
                        symbol: position.symbol,
                        categoryKey: position.categoryKey,
                        entryPrice: position.entryPrice,
                        entryDate: position.entryDate,
                        exitPrice: exitPrice,
                        exitDate: new Date(),
                        exitReason: exitReason,
                        quantity: position.quantity,
                        pnl: realizedPnL,
                        pnlPercent: realizedPnLPercent,
                        holdingDays: daysHeld,
                        isWinner: false,
                        targetPrice: position.targetPrice,
                        stopPrice: position.stopPrice
                    }
                });

                closedCount++;
                console.log(`  ✅ Position closed and archived`);
            }
        }

        console.log('');
        console.log('═══════════════════════════════════════════════════════════════');
        console.log('SUMMARY');
        console.log('═══════════════════════════════════════════════════════════════');
        console.log(`Total OPEN positions found: ${openPositions.length}`);
        console.log(`Positions closed: ${closedCount}`);
        console.log(`Positions skipped (still valid): ${skippedCount}`);
        console.log('');
        console.log('Cleanup complete!');

    } catch (error) {
        console.error('Error during cleanup:', error);
        throw error;
    } finally {
        await prisma.$disconnect();
    }
}

// Run the cleanup
cleanupStalePositions()
    .then(() => process.exit(0))
    .catch((e) => {
        console.error(e);
        process.exit(1);
    });
