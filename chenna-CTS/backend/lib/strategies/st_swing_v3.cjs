/**
 * ST_SWING_BO_UP v3 Strategy (Data-Driven)
 * Based exactly on 511-stock Multiframe Data Study.
 * DO NOT modify arbitrarily; every number is data-driven.
 */
module.exports = {
    // --- Watchlist & Entry Filters ---
    REQUIRED_STAGE: 'STAGE_2',
    MIN_RSI: 60,
    MAX_RSI: 70,
    WATCHLIST_WINDOW_DAYS: 5,         // Track signal for up to 5 days looking for pullback
    MAX_ENTRY_GAP_PCT: 2.0,           // Filter out massive gap ups/downs on entry day
    MAX_ENTRY_ABOVE_SIGNAL_PCT: 3.0,  // If entry price is 3%+ higher than signal close, reward is gone

    // --- Risk Management ---
    CAPITAL_PER_TRADE: 15000,         // Target position size base
    MAX_RISK_PER_TRADE: 1000,         // Hard cap on INR risk. Sizing = 1000 / risk%
    INITIAL_STOP_MAX_PCT: 4.0,        // Never allow a stop wider than 4% (overrides structure)
    INITIAL_STOP_MIN_PCT: 1.5,        // Never allow a stop tighter than 1.5% (prevents noise stopouts)

    // --- Trade Management ---
    BREAKEVEN_TRIGGER_PCT: 1.5,       // Move to breakeven if price reaches Entry + 1.5%
    TIMEOUT_DAYS: 10,                 // Force exit at Day 10 close if stop/target not hit yet
    PARTIAL_TARGET_RRM: 1.5,          // Book 50% at 1.5x Risk/Reward
    FULL_TARGET_RRM: 3.0              // Or 2x ATR
};
