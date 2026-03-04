/**
 * Seed Category Configs for Trading System
 * 
 * Run with: node scripts/seedCategoryConfigs.cjs
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const CATEGORY_CONFIGS = [
    // =============================================
    // SHORT_TERM_SWING_BO_DOWN - FULLY ANALYZED ✅
    // =============================================
    {
        categoryKey: 'SHORT_TERM_SWING_BO_DOWN',
        categoryName: 'Short-Term Swing Breakout Down',
        type: 'SWING',
        version: 'V1.0',

        // Entry Rules (from Phase 1-5 analysis)
        targetPercent: 2.0,
        stopPercent: -1.5,
        maxHoldDays: 3,
        forceExitDay3: true,

        // Day Filters (Thu=4, Fri=5 are best)
        validDays: [4, 5], // Thursday, Friday
        avoidMonths: [11], // November (14.3% success - avoid!)
        primeMonths: [8, 9], // August (84.2%), September

        // Price Tiers (discovered in Phase 3)
        priceTiers: {
            tier1: {
                name: 'Low-Price Premium',
                maxPrice: 200,
                candlePattern: 'ANY', // Both red and green work
                expectedSuccess: 0.929,
                positionMultiplier: 1.5
            },
            tier2: {
                name: 'Mid-Price Standard',
                minPrice: 200,
                maxPrice: 1000,
                candlePattern: 'RED_ONLY',
                expectedSuccess: 0.689,
                positionMultiplier: 1.0
            },
            tier3: {
                name: 'High-Price Caution',
                minPrice: 1000,
                candlePattern: 'RED_ONLY',
                expectedSuccess: 0.65,
                positionMultiplier: 0.75
            }
        },

        // Monitoring (1 hour for swing)
        monitorInterval: 60,

        // Success metrics (from analysis)
        expectedSuccessRate: 0.793,
        actualSuccessRate: null, // Will update from live trades
        totalTrades: 0,
        winningTrades: 0,

        // Status
        active: true,
        analyzed: true // Has completed Phase 1-7 ✅
    },

    // =============================================
    // OTHER CATEGORIES - NOT YET ANALYZED
    // =============================================
    {
        categoryKey: 'LONG_TERM_SWING_BO_UP',
        categoryName: 'Long-Term Swing Breakout Up',
        type: 'SWING',
        version: 'V0.0', // Not analyzed yet
        targetPercent: 3.0,
        stopPercent: -2.0,
        maxHoldDays: 7,
        forceExitDay3: false,
        validDays: null,
        avoidMonths: null,
        primeMonths: null,
        priceTiers: null,
        monitorInterval: 60,
        expectedSuccessRate: 0.581, // From Phase 1 test
        actualSuccessRate: null,
        totalTrades: 0,
        winningTrades: 0,
        active: false, // Not ready for trading
        analyzed: false
    },
    {
        categoryKey: 'UPSIDE_LOM_SWING',
        categoryName: 'Upside Loss of Momentum Swing',
        type: 'SWING',
        version: 'V0.0',
        targetPercent: 2.0,
        stopPercent: -1.5,
        maxHoldDays: 5,
        forceExitDay3: false,
        validDays: null,
        avoidMonths: null,
        primeMonths: null,
        priceTiers: null,
        monitorInterval: 60,
        expectedSuccessRate: 0.548,
        actualSuccessRate: null,
        totalTrades: 0,
        winningTrades: 0,
        active: false,
        analyzed: false
    },
    {
        categoryKey: 'INTRADAY_BOOST',
        categoryName: 'Intraday Boost',
        type: 'INTRADAY',
        version: 'V0.0',
        targetPercent: 1.5,
        stopPercent: -1.0,
        maxHoldDays: null, // Intraday - no overnight
        forceExitDay3: false,
        validDays: null,
        avoidMonths: null,
        primeMonths: null,
        priceTiers: null,
        monitorInterval: 5, // 5 minutes for intraday
        expectedSuccessRate: 0.427, // Failed Phase 1
        actualSuccessRate: null,
        totalTrades: 0,
        winningTrades: 0,
        active: false,
        analyzed: false
    },
    {
        categoryKey: 'HIGH_POWERED_STOCKS',
        categoryName: 'High Powered Stocks',
        type: 'SWING',
        version: 'V0.0',
        targetPercent: 2.5,
        stopPercent: -1.5,
        maxHoldDays: 5,
        forceExitDay3: false,
        validDays: null,
        avoidMonths: null,
        primeMonths: null,
        priceTiers: null,
        monitorInterval: 60,
        expectedSuccessRate: 0.389, // Failed Phase 1
        actualSuccessRate: null,
        totalTrades: 0,
        winningTrades: 0,
        active: false,
        analyzed: false
    }
];

async function seedCategoryConfigs() {
    console.log('=== SEEDING CATEGORY CONFIGS ===\n');

    for (const config of CATEGORY_CONFIGS) {
        try {
            const result = await prisma.categoryConfig.upsert({
                where: { categoryKey: config.categoryKey },
                update: config,
                create: config
            });

            const status = config.analyzed ? '✅ READY' : '⚠️ NOT ANALYZED';
            console.log(`${status} ${config.categoryKey}: ${config.type} (${config.version})`);
        } catch (error) {
            console.error(`Error seeding ${config.categoryKey}:`, error.message);
        }
    }

    console.log('\n=== SEEDING COMPLETE ===');

    // Summary
    const configs = await prisma.categoryConfig.findMany({
        orderBy: { analyzed: 'desc' }
    });

    console.log(`\nTotal configs: ${configs.length}`);
    console.log(`Ready for trading: ${configs.filter(c => c.active && c.analyzed).length}`);
    console.log(`Pending analysis: ${configs.filter(c => !c.analyzed).length}`);

    await prisma.$disconnect();
}

seedCategoryConfigs().catch(console.error);
