/**
 * CREATE MOCK SIGNALS FOR UI DEMO
 * Inserts sample signals so user can see them in the actual UI
 * Run: node scripts/create_mock_signals.cjs
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function createMockSignals() {
    console.log('\n╔════════════════════════════════════════════════════════╗');
    console.log('║     CREATING MOCK SIGNALS FOR UI DEMO                   ║');
    console.log('╚════════════════════════════════════════════════════════╝\n');

    // Define mock signals - 2 stocks meeting conditions from different categories
    const mockSignals = [
        {
            signalId: `SIG_TATASTEEL_${Date.now()}`,
            categoryKey: 'DOWNSIDE_LOM_SWING',
            symbol: 'TATASTEEL',
            direction: 'SHORT',
            entryPrice: 142.30,
            entryConditions: {
                rsi14: 28.5,
                macdSignal: 'bearish_cross',
                volumeRatio: 1.8,
                belowSupport: true
            },
            targetPrice: 135.18,  // -5%
            stopLoss: 145.94,     // +2.5%
            trailingStopPercent: 3.0,
            aiConfidence: 72.5,
            trackingDays: 10,
            trackingStatus: 'ACTIVE',
            currentPrice: 141.50,
            unrealizedPnL: 0.56,  // 0.56% profit for SHORT
            daysInTrade: 1,
            strategyVersion: 'V1',
            marketContext: {
                regime: 'bearish',
                sectorStrength: 'weak',
                niftyTrend: 'down'
            }
        },
        {
            signalId: `SIG_HDFCBANK_${Date.now() + 1}`,
            categoryKey: 'UPSIDE_LOM_SWING',
            symbol: 'HDFCBANK',
            direction: 'LONG',
            entryPrice: 1645.00,
            entryConditions: {
                rsi14: 62.3,
                macdSignal: 'bullish_cross',
                volumeRatio: 1.5,
                aboveResistance: true
            },
            targetPrice: 1727.25,  // +5%
            stopLoss: 1603.88,     // -2.5%
            trailingStopPercent: 3.0,
            aiConfidence: 68.2,
            trackingDays: 10,
            trackingStatus: 'ACTIVE',
            currentPrice: 1672.50,
            unrealizedPnL: 1.67,  // 1.67% profit
            daysInTrade: 3,
            strategyVersion: 'V1',
            marketContext: {
                regime: 'bullish',
                sectorStrength: 'strong',
                niftyTrend: 'up'
            }
        }
    ];

    console.log('Creating mock signals...\n');

    for (const signal of mockSignals) {
        try {
            // Check if signal already exists
            const existing = await prisma.signal.findUnique({
                where: { signalId: signal.signalId }
            });

            if (existing) {
                console.log(`  ⏭️  ${signal.symbol}: Signal already exists`);
                continue;
            }

            // Create the signal
            await prisma.signal.create({
                data: {
                    signalId: signal.signalId,
                    categoryKey: signal.categoryKey,
                    symbol: signal.symbol,
                    direction: signal.direction,
                    entryPrice: signal.entryPrice,
                    entryConditions: signal.entryConditions,
                    targetPrice: signal.targetPrice,
                    stopLoss: signal.stopLoss,
                    trailingStopPercent: signal.trailingStopPercent,
                    aiConfidence: signal.aiConfidence,
                    trackingDays: signal.trackingDays,
                    trackingStatus: signal.trackingStatus,
                    currentPrice: signal.currentPrice,
                    unrealizedPnL: signal.unrealizedPnL,
                    daysInTrade: signal.daysInTrade,
                    strategyVersion: signal.strategyVersion,
                    marketContext: signal.marketContext,
                    generatedAt: new Date(),
                    bufferMinutes: 15
                }
            });

            console.log(`  ✅ ${signal.symbol} (${signal.direction})`);
            console.log(`     Category: ${signal.categoryKey}`);
            console.log(`     Entry: ₹${signal.entryPrice.toFixed(2)}`);
            console.log(`     Target: ₹${signal.targetPrice.toFixed(2)} | Stop: ₹${signal.stopLoss.toFixed(2)}`);
            console.log(`     Confidence: ${signal.aiConfidence}%`);
            console.log('');

        } catch (error) {
            console.error(`  ❌ ${signal.symbol}: Error - ${error.message}`);
        }
    }

    // Verify signals in database
    const activeCount = await prisma.signal.count({
        where: { trackingStatus: 'ACTIVE' }
    });

    console.log('─'.repeat(50));
    console.log(`\n✅ Total ACTIVE signals in database: ${activeCount}`);
    console.log('\n📱 View these in your UI:');
    console.log('   1. Open browser: http://127.0.0.1:5173');
    console.log('   2. Navigate to "Active Trades" or "Signals" section');
    console.log('   3. You should see the mock signals displayed!\n');

    await prisma.$disconnect();
}

createMockSignals().catch(e => {
    console.error('Error:', e);
    process.exit(1);
});
