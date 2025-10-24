import { FLAGS } from './constants';
import * as mock from './utils/mockApi';
import { StrategyLogic, SystemHealthState, GroupedWatchlist, ImportWatchlistPayload, StrategyState, Trade, Notification } from './types';

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

/*
// --- REAL API (to be enabled when MOCK_MODE is false) ---
const getApiBase = (): string => {
    if (typeof window !== 'undefined' && (window as any).__CTS_API_BASE) {
        return (window as any).__CTS_API_BASE;
    }
    const env = (import.meta as any).env || {};
    if (env.VITE_API_BASE) {
        return env.VITE_API_BASE;
    }
    return '/api';
};
const API_BASE_URL = getApiBase();
// Real fetch logic would go here...
*/

// --- PREVIEW MODE API ROUTER ---

export async function getHealth(): Promise<SystemHealthState> {
    await sleep(100);
    return mock.getSystemHealth();
}

export async function getWatchlist(): Promise<GroupedWatchlist> {
    await sleep(150);
    return mock.getGroupedWatchlist();
}

export async function importWatchlist(payload: ImportWatchlistPayload): Promise<{ message: string, count: number }> {
    await sleep(250);
    return mock.importWatchlist(payload);
}

export async function getStrategies(): Promise<StrategyState> {
    await sleep(100);
    return mock.getStrategies();
}

export async function saveStrategy(categoryKey: string, logic: StrategyLogic): Promise<StrategyState> {
    await sleep(200);
    return mock.saveStrategy(categoryKey, logic);
}

export async function getActiveTrades(): Promise<Trade[]> {
    await sleep(100);
    return mock.getActiveTrades();
}

export async function getCompletedTrades(): Promise<Trade[]> {
    await sleep(100);
    return mock.getCompletedTrades();
}

export async function evaluateOpenTradesAndNotify(): Promise<void> {
    // No sleep here, as it's part of a ticker
    return mock.evaluateOpenTradesAndNotify();
}

export async function getNotifications(): Promise<Notification[]> {
    await sleep(50);
    return mock.getNotifications();
}

export async function clearNotification(id: number): Promise<Notification[]> {
    await sleep(50);
    return mock.clearNotification(id);
}
