import * as storage from './storage';
import { FLAGS, PREPOPULATED_WATCHLIST, SWING_TRADE_CATEGORIES } from '../constants';
import { GroupedWatchlist, ImportWatchlistPayload, Notification, StrategyLogic, StrategyState, SystemHealthState, Trade, TradeStatus } from '../types';

// --- HELPERS ---
let tradeIdCounter = Date.now();
const getToday = () => new Date().toISOString().slice(0, 10);

// --- NOTIFICATIONS ---
async function sendTelegram(message: string, type: Notification['type']) {
    console.log(`[TELEGRAM STUB] ${type.toUpperCase()}: ${message}`);
    if (!FLAGS.TELEGRAM_ENABLED) return;
    
    const notifications = storage.getNotifications();
    const newNotification: Notification = {
        id: Date.now(),
        timestamp: new Date(),
        message,
        type,
    };
    storage.setNotifications([newNotification, ...notifications].slice(0, 100));
}

// --- CORE MOCK API ---

export function getSystemHealth(): SystemHealthState {
    return {
        status: 'ok',
        timestamp: new Date().toISOString(),
        components: [
            { service: 'Backend Server', status: 'ok', message: 'OK (Preview Mode)' },
            { service: 'Database', status: 'ok', message: 'LocalStorage' },
            { service: 'Telegram', status: 'ok', message: 'Stubbed' },
            { service: 'Upstox API', status: 'warning', message: 'Deterministic Mock' },
        ],
    };
}

// --- Watchlist ---
export function getGroupedWatchlist(): GroupedWatchlist {
    return storage.getWatchlist();
}

export function importWatchlist(payload: ImportWatchlistPayload): { message: string, count: number } {
    const { category, rows } = payload;
    const watchlist = storage.getWatchlist();
    
    let pageKey: string | undefined;
    for (const pKey in PREPOPULATED_WATCHLIST) {
        if (Object.keys(PREPOPULATED_WATCHLIST[pKey]).includes(category)) {
            pageKey = pKey;
            break;
        }
    }

    if (!pageKey) {
        throw new Error(`Category "${category}" not found.`);
    }

    const isSwing = SWING_TRADE_CATEGORIES.has(category);
    const now = new Date();
    
    rows.forEach(row => {
        const expiresDate = new Date();
        expiresDate.setDate(expiresDate.getDate() + (isSwing ? FLAGS.TRACKING_DAYS : 1));
        
        const stock = {
            stockName: row.symbol,
            price: row.ltp,
            date: row.date,
            status: 'watching' as const,
            addedDate: now.toISOString(),
            expires_at: expiresDate.toISOString(),
            isNew: true,
        };
        
        // Simple upsert logic
        const categoryStocks = watchlist[pageKey!][category];
        const existingIndex = categoryStocks.findIndex(s => s.stockName === row.symbol);
        if (existingIndex > -1) {
            categoryStocks[existingIndex] = stock;
        } else {
            categoryStocks.push(stock);
        }
    });

    storage.setWatchlist(watchlist);
    sendTelegram(`Imported ${rows.length} stocks to category: ${category}`, 'success');
    return { message: `Successfully imported ${rows.length} stocks.`, count: rows.length };
}


// --- Strategies ---
export function getStrategies(): StrategyState {
    return storage.getStrategies();
}

export function saveStrategy(categoryKey: string, logic: StrategyLogic): StrategyState {
    const strategies = storage.getStrategies();
    if (!strategies[categoryKey]) {
        strategies[categoryKey] = [];
    }
    // In preview mode, we only deal with one version (V1)
    strategies[categoryKey][0] = {
        id: 1,
        categoryKey,
        status: 'live',
        logic,
        performance: { winRate: 0, totalTrades: 0, netPL: 0 },
        learnings: [],
    };
    storage.setStrategies(strategies);
    return strategies;
}

// --- Trades ---
export function getActiveTrades(): Trade[] {
    return storage.getTrades().filter(t => t.status === TradeStatus.ACTIVE);
}

export function getCompletedTrades(): Trade[] {
    return storage.getTrades().filter(t => t.status !== TradeStatus.ACTIVE);
}

// --- TICKER LOGIC ---
export function evaluateOpenTradesAndNotify(): void {
    const allTrades = storage.getTrades();
    const activeTrades = allTrades.filter(t => t.status === TradeStatus.ACTIVE);
    if (activeTrades.length === 0) return;

    let changed = false;
    activeTrades.forEach(trade => {
        // In a real scenario, we'd fetch LTP. Here we simulate a price move.
        const pseudoRandom = (seed: number) => { const x = Math.sin(seed) * 10000; return x - Math.floor(x); };
        const seed = trade.id + new Date().getDate();
        const move = (pseudoRandom(seed) - 0.49) * 0.05; // -2.45% to +2.55% daily move
        const currentPrice = trade.entry * (1 + move);

        // Advance age
        trade.age += 1;
        
        // Check for expiry
        if (trade.age > FLAGS.TRACKING_DAYS) {
            trade.status = TradeStatus.EXPIRED;
            trade.pnl = 0;
            trade.closeDate = new Date();
            sendTelegram(`[EXPIRED] ${trade.ticker} tracking window closed.`, 'info');
            changed = true;
            return;
        }

        // Check for TP
        if (currentPrice >= trade.target) {
            trade.status = TradeStatus.TARGET_HIT;
            trade.pnl = (trade.target - trade.entry) * trade.positionSize;
            trade.closeDate = new Date();
            sendTelegram(`[TARGET HIT] ${trade.ticker} @ ${trade.target.toFixed(2)}. P/L: ${trade.pnl.toFixed(2)}`, 'success');
            changed = true;
            return;
        }

        // Check for SL
        if (currentPrice <= trade.stopLoss) {
            trade.status = TradeStatus.SL_HIT;
            trade.pnl = (trade.stopLoss - trade.entry) * trade.positionSize;
            trade.closeDate = new Date();
            sendTelegram(`[STOP HIT] ${trade.ticker} @ ${trade.stopLoss.toFixed(2)}. P/L: ${trade.pnl.toFixed(2)}`, 'error');
            changed = true;
            return;
        }
    });

    if (changed) {
        storage.setTrades(allTrades);
    }
}

// --- Notifications ---
export function getNotifications(): Notification[] {
    return storage.getNotifications();
}

export function clearNotification(id: number): Notification[] {
    const notifications = storage.getNotifications().filter(n => n.id !== id);
    storage.setNotifications(notifications);
    return notifications;
}
