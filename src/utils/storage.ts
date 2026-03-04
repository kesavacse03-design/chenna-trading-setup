import { GroupedWatchlist, StrategyState, Trade, Notification } from '../types';
import { PREPOPULATED_WATCHLIST, FLAGS } from '../constants';

// --- Watchlist Functions ---
// CRITICAL: Database is the ONLY source of truth for watchlist/stock data
// localStorage is NOT used for watchlist persistence anymore
// All stock data comes from backend API (/api/stocks, /api/watchlist)

export const getWatchlist = (): GroupedWatchlist => {
    // DEPRECATED: Return empty structure - database is source of truth
    // This function is kept for backwards compatibility but should not be used
    console.warn('[storage] getWatchlist() called - this is deprecated. Use API instead.');
    return PREPOPULATED_WATCHLIST;
};

export const setWatchlist = (_watchlist: GroupedWatchlist): void => {
    // DEPRECATED: No-op - database is source of truth
    // Stock data is persisted via backend API, not localStorage
    console.warn('[storage] setWatchlist() called - this is deprecated. Use API instead.');
    // Do nothing - don't persist to localStorage
};

// Clear any stale localStorage watchlist data on module load
try {
    localStorage.removeItem(FLAGS.PERSIST_KEY_WATCHLIST);
    console.log('[storage] Cleared stale localStorage watchlist data');
} catch (_) { }


// --- Strategy Functions ---

export const getStrategies = (): StrategyState => {
    try {
        const stored = localStorage.getItem(FLAGS.PERSIST_KEY_STRATEGIES);
        return stored ? JSON.parse(stored) : {};
    } catch (error) { console.error("Failed to parse strategies from localStorage", error); }
    return {};
};

export const setStrategies = (strategies: StrategyState): void => {
    try {
        localStorage.setItem(FLAGS.PERSIST_KEY_STRATEGIES, JSON.stringify(strategies));
    } catch (error) { console.error("Failed to save strategies to localStorage", error); }
};

// --- Trades Functions ---

export const getTrades = (): Trade[] => {
    try {
        const stored = localStorage.getItem(FLAGS.PERSIST_KEY_TRADES);
        return stored ? JSON.parse(stored) : [];
    } catch (error) { console.error("Failed to parse trades from localStorage", error); }
    return [];
};

export const setTrades = (trades: Trade[]): void => {
    try {
        localStorage.setItem(FLAGS.PERSIST_KEY_TRADES, JSON.stringify(trades));
    } catch (error) { console.error("Failed to save trades to localStorage", error); }
};

// --- Notifications Functions ---

export const getNotifications = (): Notification[] => {
    try {
        const stored = localStorage.getItem(FLAGS.PERSIST_KEY_NOTIFS);
        if (stored) {
            // Restore date objects
            return JSON.parse(stored).map((n: any) => ({ ...n, timestamp: new Date(n.timestamp) }));
        }
    } catch (error) { console.error("Failed to parse notifications from localStorage", error); }
    return [];
};

export const setNotifications = (notifications: Notification[]): void => {
    try {
        localStorage.setItem(FLAGS.PERSIST_KEY_NOTIFS, JSON.stringify(notifications));
    } catch (error) { console.error("Failed to save notifications to localStorage", error); }
};
