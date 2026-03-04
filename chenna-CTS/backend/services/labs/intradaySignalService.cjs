/**
 * Intraday Signal Service - V2.1 Production
 * 
 * Real-time intraday signal generator using proven V2.1 logic (66.7% WR)
 * 
 * Features:
 * - Runs during market hours (9:15-15:30)
 * - Generates signals with reasoning, confidence, entry buffers
 * - Tracks active positions
 * - Monitors exits (target/stop/EOD)
 * - Telegram alerts
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const { generateProductionSignals, simulateProductionTrade } = require('./intradayStrategyV2_1_prod.cjs');
const telegramService = require('../telegramService.cjs');

// ============================================================================
// CONFIGURATION
// ============================================================================

const CONFIG = {
    CATEGORY: 'INTRADAY_BOOST',
    CAPITAL: 50000,
    POSITION_SIZE: 10000,
    MAX_POSITIONS: 3,
    TARGET_PERCENT: 1.5,
    MIN_CONFIDENCE: 0.65,

    // Market hours
    MARKET_OPEN: '09:15',
    MARKET_CLOSE: '15:30',
    FORCE_EXIT: '15:15',

    // Scan interval (ms)
    SCAN_INTERVAL: 60000,  // Every minute

    // Execution modes
    EXECUTION_MODES: {
        PERFECT: 0.65,      // Take all signals >= 0.65
        TIER_1: 0.75,       // Take only GOOD+ (>= 0.75)
        CONSERVATIVE: 0.85  // Take only EXCELLENT (>= 0.85)
    }
};

// ============================================================================
// STATE
// ============================================================================

let state = {
    isRunning: false,
    scanInterval: null,
    executionMode: 'PERFECT',

    todaysSignals: [],
    activePositions: [],
    closedPositions: [],

    performance: {
        totalSignals: 0,
        executed: 0,
        winners: 0,
        losers: 0,
        totalPnL: 0
    }
};

// ============================================================================
// TIME UTILITIES
// ============================================================================

function isMarketHours() {
    const now = new Date();
    const hours = now.getHours();
    const minutes = now.getMinutes();
    const timeNum = hours * 100 + minutes;

    // Market open 9:15 - 15:30
    return timeNum >= 915 && timeNum <= 1530;
}

function isForceExitTime() {
    const now = new Date();
    const hours = now.getHours();
    const minutes = now.getMinutes();
    const timeNum = hours * 100 + minutes;

    return timeNum >= 1515;
}

function getTodayDate() {
    return new Date().toISOString().split('T')[0];
}

function getCurrentTime() {
    const now = new Date();
    return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;
}

// ============================================================================
// SIGNAL GENERATION
// ============================================================================

async function scanForSignals() {
    if (!isMarketHours()) {
        console.log(`[${getCurrentTime()}] Market closed, skipping scan`);
        return [];
    }

    const today = getTodayDate();
    console.log(`\n[${getCurrentTime()}] Scanning for V2.1 signals...`);

    try {
        const signals = await generateProductionSignals(CONFIG.CATEGORY, today);

        // Filter by execution mode
        const minConfidence = CONFIG.EXECUTION_MODES[state.executionMode];
        const qualifiedSignals = signals.filter(s => parseFloat(s.confidence) >= minConfidence);

        // Filter out already-seen signals
        const newSignals = qualifiedSignals.filter(s => {
            const key = `${s.symbol}-${s.entryTime}`;
            return !state.todaysSignals.some(existing =>
                `${existing.symbol}-${existing.entryTime}` === key
            );
        });

        if (newSignals.length > 0) {
            console.log(`[${getCurrentTime()}] Found ${newSignals.length} NEW signals!`);

            for (const signal of newSignals) {
                // Add to today's signals
                state.todaysSignals.push({
                    ...signal,
                    status: 'PENDING',
                    discoveredAt: getCurrentTime()
                });

                state.performance.totalSignals++;

                // Send Telegram alert
                await sendEntryAlert(signal);
            }
        } else {
            console.log(`[${getCurrentTime()}] No new signals`);
        }

        return newSignals;

    } catch (error) {
        console.error(`[${getCurrentTime()}] Scan error:`, error.message);
        return [];
    }
}

// ============================================================================
// POSITION MANAGEMENT
// ============================================================================

async function fillSignal(signalId, entryPrice) {
    const signal = state.todaysSignals.find(s =>
        `${s.symbol}-${s.entryTime}` === signalId
    );

    if (!signal) {
        return { ok: false, error: 'Signal not found' };
    }

    if (state.activePositions.length >= CONFIG.MAX_POSITIONS) {
        return { ok: false, error: 'Max positions reached' };
    }

    // Check entry price is within range
    if (entryPrice > signal.entryRange.max) {
        return { ok: false, error: `Entry price ${entryPrice} exceeds max ${signal.entryRange.max}` };
    }

    // Create position
    const position = {
        id: `${signal.symbol}-${Date.now()}`,
        symbol: signal.symbol,
        entryTime: getCurrentTime(),
        entryPrice: entryPrice,
        quantity: Math.floor(CONFIG.POSITION_SIZE / entryPrice),
        targetPrice: signal.targetPrice,
        stopPrice: signal.stopPrice,
        positionValue: CONFIG.POSITION_SIZE,
        currentPrice: entryPrice,
        unrealizedPnL: 0,
        status: 'ACTIVE'
    };

    // Update signal status
    signal.status = 'FILLED';
    signal.filledPrice = entryPrice;
    signal.filledTime = getCurrentTime();

    // Add to active positions
    state.activePositions.push(position);
    state.performance.executed++;

    console.log(`[${getCurrentTime()}] FILLED: ${signal.symbol} @ ${entryPrice}`);

    return { ok: true, position };
}

async function closePosition(positionId, exitPrice, reason) {
    const positionIndex = state.activePositions.findIndex(p => p.id === positionId);

    if (positionIndex === -1) {
        return { ok: false, error: 'Position not found' };
    }

    const position = state.activePositions[positionIndex];

    // Calculate P&L
    const pnlPercent = ((exitPrice - position.entryPrice) / position.entryPrice) * 100;
    const pnlAmount = (exitPrice - position.entryPrice) * position.quantity;

    position.exitPrice = exitPrice;
    position.exitTime = getCurrentTime();
    position.exitReason = reason;
    position.pnlPercent = pnlPercent;
    position.pnlAmount = pnlAmount;
    position.status = 'CLOSED';

    // Update performance
    if (pnlPercent > 0) {
        state.performance.winners++;
    } else {
        state.performance.losers++;
    }
    state.performance.totalPnL += pnlAmount;

    // Move to closed positions
    state.activePositions.splice(positionIndex, 1);
    state.closedPositions.push(position);

    // Send exit alert
    await sendExitAlert(position);

    console.log(`[${getCurrentTime()}] CLOSED: ${position.symbol} | ${reason} | ${pnlPercent.toFixed(2)}%`);

    return { ok: true, position };
}

async function updatePositionPrices(priceUpdates) {
    for (const [symbol, price] of Object.entries(priceUpdates)) {
        const position = state.activePositions.find(p => p.symbol === symbol);
        if (position) {
            position.currentPrice = price;
            position.unrealizedPnL = ((price - position.entryPrice) / position.entryPrice) * 100;

            // Check exits
            if (price >= position.targetPrice) {
                await closePosition(position.id, position.targetPrice, 'TARGET_HIT');
            } else if (price <= position.stopPrice) {
                await closePosition(position.id, position.stopPrice, 'STOP_HIT');
            }
        }
    }
}

async function forceExitAllPositions() {
    console.log(`[${getCurrentTime()}] Force exit time - closing all positions`);

    for (const position of [...state.activePositions]) {
        await closePosition(position.id, position.currentPrice, 'EOD_EXIT');
    }
}

// ============================================================================
// TELEGRAM ALERTS
// ============================================================================

async function sendEntryAlert(signal) {
    const message = `
🚀 *BUY SIGNAL - INTRADAY V2.1*

\`${signal.symbol}\`
Quality: ${signal.quality} (${(parseFloat(signal.confidence) * 100).toFixed(0)}%)
Time: ${signal.entryTime}

📈 Entry: ₹${signal.entryPrice.toFixed(2)}-${signal.entryRange.max.toFixed(2)}
🎯 Target: ₹${signal.targetPrice.toFixed(2)} (+${CONFIG.TARGET_PERCENT}%)
🛑 Stop: ₹${signal.stopPrice.toFixed(2)} (${signal.riskPercent}% risk)

💡 *Reasoning:*
${signal.reasoning?.primary || 'N-pattern breakout'}
${signal.reasoning?.supporting?.map(r => `• ${r}`).join('\n') || ''}

⏰ Execute within 60-90 sec
`;

    try {
        await telegramService.sendTelegramMessage(message);
        console.log(`[${getCurrentTime()}] Telegram alert sent for ${signal.symbol}`);
    } catch (error) {
        console.error(`[${getCurrentTime()}] Telegram error:`, error.message);
    }
}

async function sendExitAlert(position) {
    let emoji, title;

    if (position.exitReason === 'TARGET_HIT') {
        emoji = '✅';
        title = 'TARGET HIT!';
    } else if (position.exitReason === 'STOP_HIT') {
        emoji = '🛑';
        title = 'STOP HIT';
    } else {
        emoji = '⏰';
        title = 'EOD EXIT';
    }

    const message = `
${emoji} *${title}*

\`${position.symbol}\`
Entry: ₹${position.entryPrice.toFixed(2)}
Exit: ₹${position.exitPrice.toFixed(2)}
P&L: ${position.pnlPercent >= 0 ? '+' : ''}${position.pnlPercent.toFixed(2)}% (₹${position.pnlAmount.toFixed(0)})

${position.exitReason === 'TARGET_HIT' ? 'Great trade! 🎯' : position.exitReason === 'STOP_HIT' ? 'Risk managed. Moving on. 💪' : 'Trade closed at market close.'}
`;

    try {
        await telegramService.sendTelegramMessage(message);
    } catch (error) {
        console.error(`[${getCurrentTime()}] Telegram error:`, error.message);
    }
}

// ============================================================================
// MONITORING CONTROL
// ============================================================================

function startLiveMonitoring(executionMode = 'PERFECT') {
    if (state.isRunning) {
        return { ok: false, error: 'Already running' };
    }

    state.executionMode = executionMode;
    state.isRunning = true;

    console.log(`\n${'═'.repeat(60)}`);
    console.log('V2.1 PRODUCTION LIVE MONITORING STARTED');
    console.log(`${'═'.repeat(60)}`);
    console.log(`Category: ${CONFIG.CATEGORY}`);
    console.log(`Execution Mode: ${executionMode} (min confidence: ${CONFIG.EXECUTION_MODES[executionMode]})`);
    console.log(`Capital: ₹${CONFIG.CAPITAL} | Position: ₹${CONFIG.POSITION_SIZE} | Max: ${CONFIG.MAX_POSITIONS}`);
    console.log(`${'═'.repeat(60)}\n`);

    // Initial scan
    scanForSignals();

    // Set up interval
    state.scanInterval = setInterval(async () => {
        if (isForceExitTime() && state.activePositions.length > 0) {
            await forceExitAllPositions();
        } else if (isMarketHours()) {
            await scanForSignals();
        }
    }, CONFIG.SCAN_INTERVAL);

    return { ok: true, message: 'Live monitoring started' };
}

function stopLiveMonitoring() {
    if (!state.isRunning) {
        return { ok: false, error: 'Not running' };
    }

    clearInterval(state.scanInterval);
    state.isRunning = false;

    console.log(`\n[${getCurrentTime()}] Live monitoring stopped`);

    return { ok: true, message: 'Live monitoring stopped' };
}

// ============================================================================
// STATUS & GETTERS
// ============================================================================

function getStatus() {
    return {
        isRunning: state.isRunning,
        executionMode: state.executionMode,
        marketHours: isMarketHours(),
        forceExitTime: isForceExitTime()
    };
}

function getTodaysSignals() {
    return state.todaysSignals;
}

function getActivePositions() {
    return state.activePositions;
}

function getClosedPositions() {
    return state.closedPositions;
}

function getTodayPerformance() {
    const executed = state.performance.executed;
    const winRate = executed > 0
        ? (state.performance.winners / executed * 100)
        : 0;

    return {
        ...state.performance,
        winRate: winRate.toFixed(1),
        pendingSignals: state.todaysSignals.filter(s => s.status === 'PENDING').length,
        activePositions: state.activePositions.length
    };
}

function resetDailyState() {
    state.todaysSignals = [];
    state.activePositions = [];
    state.closedPositions = [];
    state.performance = { totalSignals: 0, executed: 0, winners: 0, losers: 0, totalPnL: 0 };
    console.log(`[${getCurrentTime()}] Daily state reset`);
}

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
    // Control
    startLiveMonitoring,
    stopLiveMonitoring,

    // Position management
    fillSignal,
    closePosition,
    updatePositionPrices,
    forceExitAllPositions,

    // Status
    getStatus,
    getTodaysSignals,
    getActivePositions,
    getClosedPositions,
    getTodayPerformance,
    resetDailyState,

    // Manual trigger
    scanForSignals,

    // Config
    CONFIG
};

// ============================================================================
// CLI
// ============================================================================

if (require.main === module) {
    const args = process.argv.slice(2);

    if (args.includes('--test')) {
        console.log('Testing V2.1 signal generation...');
        scanForSignals().then(signals => {
            console.log('\n=== TEST RESULTS ===');
            console.log('Signals found:', signals.length);
            if (signals.length > 0) {
                console.log('\nFirst signal:');
                console.log(JSON.stringify(signals[0], null, 2));
            }
            process.exit(0);
        });
    } else if (args.includes('--start')) {
        const mode = args[1] || 'PERFECT';
        startLiveMonitoring(mode);
        // Keep running
        console.log('Press Ctrl+C to stop...');
    } else {
        console.log('Usage:');
        console.log('  node intradaySignalService.cjs --test    # Test signal generation');
        console.log('  node intradaySignalService.cjs --start   # Start live monitoring');
        process.exit(0);
    }
}
