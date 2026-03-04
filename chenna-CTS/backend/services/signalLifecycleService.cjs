/**
 * Swing Signal Lifecycle Manager
 * 
 * Handles multi-day signal tracking and daily cleanup:
 * - INTRADAY signals: expire at EOD (same day only)
 * - SHORT_TERM_SWING_BO_UP:   track up to 5 trading days
 * - SHORT_TERM_SWING_BO_DOWN: track up to 10 trading days
 * - LONG_TERM_SWING_BO_UP:    track up to 10 trading days
 * - LONG_TERM_SWING_BO_DOWN:  track up to 10 trading days
 * 
 * Runs daily at 9:00 AM IST (before market open).
 * Can also be triggered manually via API: POST /api/v5/signals/cleanup
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const { todayIST, dateToIST, importDateIST } = require('../utils/istUtils.cjs');

// ─── Category Lifecycle Config ───────────────────────────────────────
const CATEGORY_LIFECYCLE = {
    // Intraday: same day only
    'INTRADAY_BOOST': {
        maxTrackingDays: 0,     // Expires at EOD
        type: 'INTRADAY',
        cleanupRule: 'EOD'      // End of day
    },

    // Swing breakout UP: track 5 trading days for 1H confirmation
    'SHORT_TERM_SWING_BO_UP': {
        maxTrackingDays: 5,
        type: 'SWING',
        cleanupRule: 'TRADING_DAYS'
    },

    // Swing breakout DOWN: track 10 days for mean-reversion confirmation
    'SHORT_TERM_SWING_BO_DOWN': {
        maxTrackingDays: 10,
        type: 'SWING',
        cleanupRule: 'TRADING_DAYS'
    },

    // Long-term swing UP: track 10 days
    'LONG_TERM_SWING_BO_UP': {
        maxTrackingDays: 10,
        type: 'SWING',
        cleanupRule: 'TRADING_DAYS'
    },

    // Long-term swing DOWN: track 10 days
    'LONG_TERM_SWING_BO_DOWN': {
        maxTrackingDays: 10,
        type: 'SWING',
        cleanupRule: 'TRADING_DAYS'
    }
};

// ─── Helper: Count Trading Days ──────────────────────────────────────
function countTradingDays(fromDate, toDate) {
    let count = 0;
    const d = new Date(fromDate);
    const end = new Date(toDate);
    while (d < end) {
        d.setDate(d.getDate() + 1);
        const dow = d.getDay();
        if (dow !== 0 && dow !== 6) count++; // Skip weekends
    }
    return count;
}

// ─── Main Cleanup Function ───────────────────────────────────────────
async function runDailyCleanup(todayStr = null) {
    const today = todayStr || todayIST();
    console.log(`\n[SignalLifecycle] ═══════════════════════════════════════`);
    console.log(`[SignalLifecycle] Daily Cleanup for ${today}`);
    console.log(`[SignalLifecycle] ═══════════════════════════════════════\n`);

    const results = {
        totalChecked: 0,
        expired: 0,
        kept: 0,
        byCategory: {}
    };

    // 1. Find all PENDING_CONFIRMATION signals (swing signals awaiting confirmation)
    const pendingSignals = await prisma.v5Signal.findMany({
        where: {
            status: 'PENDING_CONFIRMATION'
        },
        orderBy: { signalDate: 'asc' }
    });

    console.log(`[SignalLifecycle] Found ${pendingSignals.length} PENDING_CONFIRMATION signals`);
    results.totalChecked = pendingSignals.length;

    for (const signal of pendingSignals) {
        const config = CATEGORY_LIFECYCLE[signal.category];
        if (!config) {
            console.log(`[SignalLifecycle] ⚠️ Unknown category: ${signal.category} for ${signal.symbol} — skipping`);
            continue;
        }

        const signalDateStr = dateToIST(signal.signalDate);
        const tradingDays = countTradingDays(signalDateStr, today);

        if (!results.byCategory[signal.category]) {
            results.byCategory[signal.category] = { checked: 0, expired: 0, kept: 0 };
        }
        results.byCategory[signal.category].checked++;

        if (tradingDays > config.maxTrackingDays) {
            // EXPIRE this signal
            await prisma.v5Signal.update({
                where: { id: signal.id },
                data: {
                    status: 'EXPIRED',
                    expiredAt: importDateIST(today)
                }
            });
            results.expired++;
            results.byCategory[signal.category].expired++;
            console.log(`[SignalLifecycle] ❌ EXPIRED: ${signal.symbol} [${signal.category}] — ${tradingDays} days tracked (max: ${config.maxTrackingDays})`);
        } else {
            results.kept++;
            results.byCategory[signal.category].kept++;
            console.log(`[SignalLifecycle] ✅ KEPT: ${signal.symbol} [${signal.category}] — Day ${tradingDays}/${config.maxTrackingDays}`);
        }
    }

    // 2. Expire INTRADAY signals from previous days that are still CONFIRMED (not executed)
    const staleIntraday = await prisma.v5Signal.updateMany({
        where: {
            category: 'INTRADAY_BOOST',
            status: { in: ['CONFIRMED', 'PENDING_CONFIRMATION'] },
            signalDate: { lt: importDateIST(today) }
        },
        data: {
            status: 'EXPIRED',
            expiredAt: new Date()
        }
    });

    if (staleIntraday.count > 0) {
        console.log(`[SignalLifecycle] 🗑️ Expired ${staleIntraday.count} stale INTRADAY signals from previous days`);
        results.expired += staleIntraday.count;
    }

    // Summary
    console.log(`\n[SignalLifecycle] ─── Cleanup Summary ───`);
    console.log(`[SignalLifecycle] Total Checked: ${results.totalChecked}`);
    console.log(`[SignalLifecycle] Expired: ${results.expired}`);
    console.log(`[SignalLifecycle] Kept: ${results.kept}`);
    console.log(`[SignalLifecycle] Stale Intraday Cleaned: ${staleIntraday.count}`);
    for (const [cat, stats] of Object.entries(results.byCategory)) {
        console.log(`[SignalLifecycle]   ${cat}: ${stats.kept} kept, ${stats.expired} expired`);
    }
    console.log(`[SignalLifecycle] ═══════════════════════════════════════\n`);

    return results;
}

// ─── Signal Age Helper (for dashboard) ───────────────────────────────
function getSignalAge(signalDate, category) {
    const config = CATEGORY_LIFECYCLE[category];
    if (!config) return { daysTracked: 0, maxDays: 0, pctUsed: 0 };

    const today = todayIST();
    const sigDateStr = dateToIST(signalDate);
    const tradingDays = countTradingDays(sigDateStr, today);

    return {
        daysTracked: tradingDays,
        maxDays: config.maxTrackingDays,
        pctUsed: config.maxTrackingDays > 0 ? Math.round((tradingDays / config.maxTrackingDays) * 100) : 100,
        isExpiring: tradingDays >= config.maxTrackingDays - 1,
        type: config.type
    };
}

module.exports = {
    CATEGORY_LIFECYCLE,
    runDailyCleanup,
    getSignalAge,
    countTradingDays
};
