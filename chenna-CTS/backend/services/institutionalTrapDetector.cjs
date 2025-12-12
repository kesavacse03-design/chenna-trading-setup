/**
 * Institutional Trap Detector Service
 * Phase 7: Enhanced Trap Detection
 * 
 * Detects all 10 institutional trap types in real-time
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

//=====================================
// TRAP DEFINITIONS
//=====================================

const TRAP_TYPES = {
    VOLUME_TRAP: {
        name: 'Volume Trap',
        description: 'Abnormal volumespike without price movement',
        severity: 'HIGH'
    },
    BULL_TRAP: {
        name: 'Bull Trap',
        description: 'False breakout above resistance',
        severity: 'HIGH'
    },
    BEAR_TRAP: {
        name: 'Bear Trap',
        description: 'False breakdown below support',
        severity: 'HIGH'
    },
    STOP_HUNT: {
        name: 'Stop Hunt',
        description: 'Price wicks designed to trigger stops',
        severity: 'CRITICAL'
    },
    FAKE_BREAKOUT: {
        name: 'Fake Breakout',
        description: 'Breakout that reverses quickly',
        severity: 'HIGH'
    },
    LIQUIDITY_SWEEP: {
        name: 'Liquidity Sweep',
        description: 'Quick move to grab liquidity then reverse',
        severity: 'CRITICAL'
    },
    DISTRIBUTION: {
        name: 'Distribution Phase',
        description: 'Smart money exiting while retail buying',
        severity: 'MEDIUM'
    },
    EXHAUSTION_GAP: {
        name: 'Exhaustion Gap',
        description: 'Gap indicating trend exhaustion',
        severity: 'MEDIUM'
    },
    PUMP_DUMP: {
        name: 'Pump and Dump',
        description: 'Artificial price inflation',
        severity: 'CRITICAL'
    },
    WYCKOFF_SPRING: {
        name: 'Wyckoff Spring',
        description: 'Manipulation before markup phase',
        severity: 'HIGH'
    }
};

//=====================================
// TRAP DETECTION FUNCTIONS
//=====================================

/**
 * Detect all traps for a given stock and candles
 */
function detectAllTraps(symbol, candles) {
    if (!candles || candles.length < 20) {
        return { detected: false, traps: [], reason: 'Insufficient data' };
    }

    const detectedTraps = [];

    // Check each trap type
    if (detectVolumeTrap(candles)) detectedTraps.push('VOLUME_TRAP');
    if (detectBullTrap(candles)) detectedTraps.push('BULL_TRAP');
    if (detectBearTrap(candles)) detectedTraps.push('BEAR_TRAP');
    if (detectStopHunt(candles)) detectedTraps.push('STOP_HUNT');
    if (detectFakeBreakout(candles)) detectedTraps.push('FAKE_BREAKOUT');
    if (detectLiquiditySweep(candles)) detectedTraps.push('LIQUIDITY_SWEEP');
    if (detectDistribution(candles)) detectedTraps.push('DISTRIBUTION');
    if (detectExhaustionGap(candles)) detectedTraps.push('EXHAUSTION_GAP');
    if (detectPumpDump(candles)) detectedTraps.push('PUMP_DUMP');
    if (detectWyckoffSpring(candles)) detectedTraps.push('WYCKOFF_SPRING');

    return {
        detected: detectedTraps.length > 0,
        traps: detectedTraps.map(type => ({
            type,
            ...TRAP_TYPES[type],
            timestamp: Date.now()
        })),
        count: detectedTraps.length
    };
}

// Individual trap detection functions
function detectVolumeTrap(candles) {
    const latest = candles[candles.length - 1];
    const prev = candles[candles.length - 2];
    const avgVolume = candles.slice(-20).reduce((sum, c) => sum + c.volume, 0) / 20;

    // Volume spike > 2.5x average with minimal price movement
    const volumeSpike = latest.volume / avgVolume > 2.5;
    const priceChange = Math.abs((latest.close - prev.close) / prev.close);
    const minimalMovement = priceChange < 0.01; // Less than 1%

    return volumeSpike && minimalMovement;
}

function detectBullTrap(candles) {
    const recent = candles.slice(-5);
    const high = Math.max(...candles.slice(-20).map(c => c.high));
    const latest = candles[candles.length - 1];

    // Breakout above resistance then quick reversal
    const brokeResistance = latest.high > high * 1.01;
    const reversedDown = latest.close < latest.open;
    const largeWick = (latest.high - latest.close) / (latest.high - latest.low) > 0.7;

    return brokeResistance && reversedDown && largeWick;
}

function detectBearTrap(candles) {
    const low = Math.min(...candles.slice(-20).map(c => c.low));
    const latest = candles[candles.length - 1];

    // Break below support then quick reversal up
    const brokeSupport = latest.low < low * 0.99;
    const reversedUp = latest.close > latest.open;
    const largeWick = (latest.close - latest.low) / (latest.high - latest.low) > 0.7;

    return brokeSupport && reversedUp && largeWick;
}

function detectStopHunt(candles) {
    const latest = candles[candles.length - 1];
    const wickRatio = (latest.high - latest.low) / Math.abs(latest.close - latest.open);

    // Long wicks (>3x body) indicate stop hunting
    return wickRatio > 3;
}

function detectFakeBreakout(candles) {
    // Similar to bull/bear trap but faster reversal
    return detectBullTrap(candles) || detectBearTrap(candles);
}

function detectLiquiditySweep(candles) {
    const latest = candles[candles.length - 1];
    const prev = candles[candles.length - 2];

    // Quick spike then immediate reversal
    const spiked = Math.abs((latest.high - prev.close) / prev.close) > 0.02;
    const reversed = Math.abs((latest.close - prev.close) / prev.close) < 0.005;

    return spiked && reversed;
}

function detectDistribution(candles) {
    const recent = candles.slice(-10);
    const avgVolume = candles.slice(-30, -10).reduce((sum, c) => sum + c.volume, 0) / 20;
    const recentVolume = recent.reduce((sum, c) => sum + c.volume, 0) / 10;

    // High volume with sideways price action
    const highVolume = recentVolume / avgVolume > 1.3;
    const sideways = Math.abs((recent[recent.length - 1].close - recent[0].close) / recent[0].close) < 0.02;

    return highVolume && sideways;
}

function detectExhaustionGap(candles) {
    const latest = candles[candles.length - 1];
    const prev = candles[candles.length - 2];

    // Large gap followed by reversal
    const gap = Math.abs((latest.open - prev.close) / prev.close);
    const reversed = (latest.open > prev.close && latest.close < latest.open) ||
        (latest.open < prev.close && latest.close > latest.open);

    return gap > 0.03 && reversed;
}

function detectPumpDump(candles) {
    const recent = candles.slice(-5);
    const avgVolume = candles.slice(-20, -5).reduce((sum, c) => sum + c.volume, 0) / 15;
    const recentVolume = recent.reduce((sum, c) => sum + c.volume, 0) / 5;

    // Massive volume spike with sharp price increase then drop
    const volumeSpike = recentVolume / avgVolume > 3;
    const sharpRise = (recent[2].close - recent[0].close) / recent[0].close > 0.05;
    const sharpFall = (recent[4].close - recent[2].close) / recent[2].close < -0.03;

    return volumeSpike && sharpRise && sharpFall;
}

function detectWyckoffSpring(candles) {
    const low = Math.min(...candles.slice(-20).map(c => c.low));
    const latest = candles[candles.length - 1];

    // Break below previous low with low volume then quick recovery
    const brokeSupport = latest.low < low * 0.98;
    const recovered = latest.close > latest.open;
    const avgVolume = candles.slice(-20).reduce((sum, c) => sum + c.volume, 0) / 20;
    const lowVolume = latest.volume < avgVolume * 0.8;

    return brokeSupport && recovered && lowVolume;
}

/**
 * Store trap detection in history
 */
async function logTrapDetection(symbol, categoryKey, traps) {
    try {
        const trapData = {
            symbol,
            categoryKey,
            traps: JSON.stringify(traps),
            timestamp: new Date()
        };

        // Store in outcomes table metadata for now
        // TODO: Create dedicated trap_history table
        console.log('[TrapDetector] Logged:', trapData);

        return { ok: true };
    } catch (error) {
        console.error('[TrapDetector] Log error:', error);
        return { ok: false, error: error.message };
    }
}

/**
 * Get trap history for a symbol
 */
async function getTrapHistory(symbol, days = 30) {
    try {
        // TODO: Query trap_history table
        // For now, return mock data
        return {
            ok: true,
            history: [],
            totalTraps: 0
        };
    } catch (error) {
        return { ok: false, error: error.message };
    }
}

module.exports = {
    detectAllTraps,
    logTrapDetection,
    getTrapHistory,
    TRAP_TYPES
};
