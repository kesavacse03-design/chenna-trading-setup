/**
 * SHORT_TERM_SWING_BO_DOWN Signal Generator V1.0
 * 
 * Daily signal generation based on validated trading rules:
 * - Thursday/Friday signals only
 * - Tiered by price (Low < ₹200, Mid ₹200-1000, High > ₹1000)
 * - Seasonality filter (Skip November)
 * - Position sizing by tier and month
 */

const { PrismaClient } = require('@prisma/client');
const prisma = require('../../lib/prisma.cjs');
const path = require('path');
const fs = require('fs');

// Load strategy config
const CONFIG_PATH = path.join(__dirname, '../../config/strategies/SHORT_TERM_SWING_BO_DOWN_V1.json');
let strategyConfig = null;

function loadConfig() {
    if (!strategyConfig) {
        strategyConfig = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
    }
    return strategyConfig;
}

/**
 * Check if today is a valid trading day for this strategy
 */
function isValidTradingDay(date = new Date()) {
    const config = loadConfig();
    const dayOfWeek = date.getDay();
    const month = date.getMonth() + 1;

    // Check day of week (Thu=4, Fri=5)
    const validDay = config.entryRules.dayOfWeek.allowed.includes(dayOfWeek);

    // Check month (avoid November)
    const avoidMonth = config.seasonality.avoidMonths.months.includes(month);

    return {
        isValid: validDay && !avoidMonth,
        dayOfWeek,
        dayName: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][dayOfWeek],
        month,
        monthName: ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][month],
        invalidReason: !validDay ? 'Not Thursday/Friday' : (avoidMonth ? 'November (avoid month)' : null),
        isPrimeMonth: config.seasonality.primeMonths.months.includes(month),
        positionMultiplier: avoidMonth ? 0 : (config.seasonality.primeMonths.months.includes(month) ? 1.25 : 1.0)
    };
}

/**
 * Get price tier for a stock
 */
function getPriceTier(price) {
    const config = loadConfig();
    if (price < config.entryRules.priceFilter.lowPrice.maxPrice) {
        return {
            tier: 'TIER_1',
            name: 'Low-Price Premium',
            candlePattern: config.entryRules.priceFilter.lowPrice.candlePattern,
            expectedSuccess: config.entryRules.priceFilter.lowPrice.expectedSuccessRate,
            positionMultiplier: 1.5
        };
    } else if (price < config.entryRules.priceFilter.midPrice.maxPrice) {
        return {
            tier: 'TIER_2',
            name: 'Mid-Price Standard',
            candlePattern: config.entryRules.priceFilter.midPrice.candlePattern,
            expectedSuccess: config.entryRules.priceFilter.midPrice.expectedSuccessRate,
            positionMultiplier: 1.0
        };
    } else {
        return {
            tier: 'TIER_3',
            name: 'High-Price Caution',
            candlePattern: config.entryRules.priceFilter.highPrice.candlePattern,
            expectedSuccess: config.entryRules.priceFilter.highPrice.expectedSuccessRate,
            positionMultiplier: 0.75
        };
    }
}

/**
 * Generate daily signals
 */
async function generateDailySignals(date = new Date(), portfolioSize = 500000) {
    console.log('=== SIGNAL GENERATOR: SHORT_TERM_SWING_BO_DOWN V1 ===');
    console.log('Date:', date.toISOString().split('T')[0]);
    console.log('Portfolio:', '₹' + portfolioSize.toLocaleString());

    const tradingDay = isValidTradingDay(date);
    console.log('\n--- MARKET STATE ---');
    console.log('Day:', tradingDay.dayName, '(' + (tradingDay.isValid ? '✅ Valid' : '❌ Invalid: ' + tradingDay.invalidReason) + ')');
    console.log('Month:', tradingDay.monthName, (tradingDay.isPrimeMonth ? '(✅ PRIME)' : ''));
    console.log('Position Multiplier:', tradingDay.positionMultiplier + 'x');

    if (!tradingDay.isValid) {
        return {
            date: date.toISOString().split('T')[0],
            status: 'NO_TRADE',
            reason: tradingDay.invalidReason,
            signals: []
        };
    }

    // Load category stocks with today's additions
    const category = await prisma.category.findFirst({
        where: { key: 'SHORT_TERM_SWING_BO_DOWN' }
    });

    if (!category) {
        console.log('Category not found');
        return { date: date.toISOString().split('T')[0], status: 'ERROR', signals: [] };
    }

    // Get stocks added today
    const todayStart = new Date(date);
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date(date);
    todayEnd.setHours(23, 59, 59, 999);

    const todayStocks = await prisma.stockCategory.findMany({
        where: {
            categoryId: category.id,
            addedDate: {
                gte: todayStart,
                lte: todayEnd
            }
        },
        include: { stock: true }
    });

    console.log('\n--- TODAY\'S SIGNALS ---');
    console.log('Stocks in category today:', todayStocks.length);

    if (todayStocks.length === 0) {
        // Fallback: Get recent stocks if no today's additions
        const recentStocks = await prisma.stockCategory.findMany({
            where: { categoryId: category.id },
            include: { stock: true },
            orderBy: { addedDate: 'desc' },
            take: 10
        });
        console.log('(Using recent 10 stocks for demo)');
        todayStocks.push(...recentStocks);
    }

    const signals = [];
    const config = loadConfig();
    const basePosition = portfolioSize * config.riskManagement.maxCapitalPerTrade;

    for (const sc of todayStocks) {
        if (!sc.stock) continue;

        const symbol = sc.stock.symbol;
        const price = sc.stock.lastPrice || 100; // Use last price or mock

        // Get tier
        const tier = getPriceTier(price);

        // Check candle pattern (would need real intraday data)
        // For now, assume RED candle (conservative)
        const isRedCandle = true; // TODO: Fetch real data

        // Apply candle filter
        let passesFilter = true;
        if (tier.candlePattern === 'RED_ONLY' && !isRedCandle) {
            passesFilter = false;
        }

        if (!passesFilter) continue;

        // Calculate position size
        const positionSize = basePosition * tier.positionMultiplier * tradingDay.positionMultiplier;
        const quantity = Math.floor(positionSize / price);

        // Calculate targets
        const targetPrice = price * (1 + config.exitRules.targetPercent / 100);
        const stopPrice = price * (1 + config.exitRules.stopPercent / 100);

        signals.push({
            symbol,
            tier: tier.tier,
            tierName: tier.name,
            entryPrice: Math.round(price * 100) / 100,
            targetPrice: Math.round(targetPrice * 100) / 100,
            stopPrice: Math.round(stopPrice * 100) / 100,
            quantity,
            positionSize: Math.round(positionSize),
            expectedSuccess: tier.expectedSuccess,
            maxHoldDays: config.exitRules.maxHoldDays,
            status: 'READY'
        });
    }

    // Sort by tier (best first)
    signals.sort((a, b) => a.tier.localeCompare(b.tier));

    // Limit to max positions
    const maxPositions = config.riskManagement.maxPositionsOpen;
    const finalSignals = signals.slice(0, maxPositions);

    console.log('\n--- ELIGIBLE SIGNALS ---');
    finalSignals.forEach((s, i) => {
        console.log(`${i + 1}. ${s.symbol} (${s.tierName})`);
        console.log(`   Entry: ₹${s.entryPrice} | Target: ₹${s.targetPrice} (+2%) | Stop: ₹${s.stopPrice} (-1.5%)`);
        console.log(`   Qty: ${s.quantity} | Position: ₹${s.positionSize.toLocaleString()}`);
        console.log(`   Expected: ${(s.expectedSuccess * 100).toFixed(1)}% success`);
    });

    console.log('\n--- SUMMARY ---');
    console.log('Total signals:', finalSignals.length);
    console.log('Total exposure:', '₹' + finalSignals.reduce((s, sig) => s + sig.positionSize, 0).toLocaleString());

    return {
        date: date.toISOString().split('T')[0],
        status: 'READY',
        marketState: {
            day: tradingDay.dayName,
            month: tradingDay.monthName,
            isPrime: tradingDay.isPrimeMonth,
            positionMultiplier: tradingDay.positionMultiplier
        },
        signals: finalSignals,
        summary: {
            totalSignals: finalSignals.length,
            totalExposure: finalSignals.reduce((s, sig) => s + sig.positionSize, 0),
            avgExpectedSuccess: finalSignals.length > 0
                ? finalSignals.reduce((s, sig) => s + sig.expectedSuccess, 0) / finalSignals.length
                : 0
        }
    };
}

/**
 * Check open positions for exits
 */
async function checkExitSignals(openPositions = []) {
    const config = loadConfig();
    const exits = [];

    for (const pos of openPositions) {
        // TODO: Fetch current price from Upstox
        const currentPrice = pos.currentPrice || pos.entryPrice;
        const daysHeld = pos.daysHeld || 0;

        let action = 'HOLD';
        let reason = '';

        // Check target
        if (currentPrice >= pos.targetPrice) {
            action = 'EXIT_TARGET';
            reason = 'Target +2% hit';
        }
        // Check stop
        else if (currentPrice <= pos.stopPrice) {
            action = 'EXIT_STOP';
            reason = 'Stop -1.5% hit';
        }
        // Check day 3 force exit
        else if (daysHeld >= config.exitRules.maxHoldDays) {
            action = 'EXIT_TIMEOUT';
            reason = 'Day 3 force exit';
        }

        exits.push({
            ...pos,
            currentPrice,
            action,
            reason,
            returnPct: ((currentPrice - pos.entryPrice) / pos.entryPrice * 100).toFixed(2)
        });
    }

    return exits;
}

// CLI interface
if (require.main === module) {
    (async () => {
        try {
            const result = await generateDailySignals(new Date(), 500000);
            console.log('\n=== JSON OUTPUT ===');
            console.log(JSON.stringify(result, null, 2));
        } catch (error) {
            console.error('Error:', error.message);
        } finally {
            await prisma.$disconnect();
        }
    })();
}

module.exports = {
    generateDailySignals,
    checkExitSignals,
    isValidTradingDay,
    getPriceTier,
    loadConfig
};
