import { GroupedWatchlist, StrategyState, Trade, Notification } from '../types';
import { PREPOPULATED_WATCHLIST, FLAGS } from '../constants';

// --- Watchlist Functions ---

export const getWatchlist = (): GroupedWatchlist => {
    try {
        const stored = localStorage.getItem(FLAGS.PERSIST_KEY_WATCHLIST);
        if (stored) {
            const parsed = JSON.parse(stored) || {};
            // Always rebuild from canonical structure, copying only known categories
            const base: GroupedWatchlist = JSON.parse(JSON.stringify(PREPOPULATED_WATCHLIST));
            for (const page of Object.keys(base)) {
                const srcPage = (parsed as any)[page] || {};
                for (const cat of Object.keys((base as any)[page] || {})) {
                    if (Array.isArray(srcPage[cat])) {
                        (base as any)[page][cat] = srcPage[cat];
                    }
                }
            }
            return base;
        }
    } catch (error) { console.error("Failed to parse watchlist from localStorage", error); }
    return PREPOPULATED_WATCHLIST;
};

export const setWatchlist = (watchlist: GroupedWatchlist): void => {
    try {
        localStorage.setItem(FLAGS.PERSIST_KEY_WATCHLIST, JSON.stringify(watchlist));
    } catch (error) { console.error("Failed to save watchlist to localStorage", error); }
};

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
