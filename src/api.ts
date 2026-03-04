// FLAGS not used here; keep constants where needed in other modules
import * as mock from './utils/mockApi';
import { attachCategoryMetaToItem, mapToCanonical } from './utils/categoryMap';
import fetchWithTimeout from './utils/fetchWithTimeout';
import { StrategyLogic, SystemHealthState, GroupedWatchlist, ImportWatchlistPayload, StrategyState, Trade, Notification, Category } from './types';
import type { CompositeOptimizationResponse } from './types';

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
    // If frontend has an API base configured, try the backend health and Upstox status.
    const imeta: any = (globalThis as any).import?.meta || ({});
    const base = (window as any).__CTS_API_BASE || imeta.env?.VITE_API_BASE || '';
    if (base) {
        try {
            const dbg = !!localStorage.getItem('cts_debug');
            const t0 = Date.now();
            const r = await fetchWithTimeout(`${base.replace(/\/$/, '')}/health`, undefined, 2500);
            const t1 = Date.now();
            if (dbg) console.log('[CTS-DEBUG] GET /health', { url: `${base.replace(/\/$/, '')}/health`, status: r.status, timeMs: t1 - t0 });
            if (r.ok) {
                const h = await r.json().catch(() => ({}));
                // also ask backend for Upstox auth status
                let upstox = { hasToken: false, expired: true };
                try {
                    const s = await fetchWithTimeout(`${base.replace(/\/$/, '')}/auth/upstox/status`, undefined, 2500);
                    if (s.ok) upstox = await s.json().catch(() => upstox);
                } catch (_) { /* ignore */ }
                const components = [
                    { service: 'Backend Server', status: 'ok', message: `OK (${h.version || 'live'})` },
                    { service: 'Database', status: 'ok', message: 'LocalStorage' },
                    { service: 'Telegram', status: 'ok', message: 'Configured' },
                    { service: 'Upstox API', status: upstox.hasToken && !upstox.expired ? 'ok' : 'error', message: upstox.hasToken && !upstox.expired ? 'Connected' : 'Not connected' }
                ];
                return { status: 'ok', timestamp: new Date().toISOString(), components } as SystemHealthState;
            }
        } catch (_) { /* fallthrough to mock */ }
    }
    // Fast path in preview mode
    await sleep(5);
    return mock.getSystemHealth();
}

export async function getWatchlist(): Promise<GroupedWatchlist> {
    const imeta: any = (globalThis as any).import?.meta || {};
    const base = (window as any).__CTS_API_BASE || imeta.env?.VITE_API_BASE || '';
    if (base) {
        try {
            const url = `${base.replace(/\/$/, '')}/api/watchlist`;
            const r = await fetchWithTimeout(url, undefined, 2500);
            if (r.ok) {
                return await r.json();
            }
        } catch (e) {
            if (localStorage.getItem('cts_debug')) console.warn('[CTS-DEBUG] getWatchlist backend failed', e);
        }
    }
    await sleep(10);
    return mock.getGroupedWatchlist();
}

export async function importWatchlist(payload: ImportWatchlistPayload): Promise<{ message: string, count: number }> {
    await sleep(15);
    return mock.importWatchlist(payload);
}

export async function getStocks(): Promise<any[]> {
    const imeta2: any = (globalThis as any).import?.meta || ({});
    const base = (window as any).__CTS_API_BASE || imeta2.env?.VITE_API_BASE || '';
    if (base) {
        try {
            // Debug: trace when frontend calls getStocks and the configured API base
            try { console.debug('[FRONTEND] getStocks called, API base=', base); } catch (_) { }
            const url = `${base.replace(/\/$/, '')}/api/stocks`;
            const t0 = Date.now();
            const r = await fetchWithTimeout(url, undefined, 2500);
            const t1 = Date.now();
            if (localStorage.getItem('cts_debug')) console.log('[CTS-DEBUG] GET /api/stocks', { url, status: r.status, timeMs: t1 - t0 });
            if (r.ok) {
                const data = await r.json().catch(() => []);
                try { console.debug('[FRONTEND] getStocks response length=', Array.isArray(data) ? data.length : 0); } catch (_) { }
                if (Array.isArray(data)) {
                    const norm = data.map(it => {
                        const withMeta = attachCategoryMetaToItem(it);
                        let key = withMeta.categoryKey || mapToCanonical(withMeta.category || withMeta.categoryRaw || '');
                        if (!key || key === 'UNMAPPED' || key === 'UNKNOWN') {
                            // Fallback: treat unknown categories as HIGH_POWERED_STOCKS so they render
                            key = 'HIGH_POWERED_STOCKS';
                        }
                        return { ...withMeta, categoryKey: key, category: key };
                    });
                    return norm;
                }
            }
        } catch (e) {
            if (localStorage.getItem('cts_debug')) console.warn('[CTS-DEBUG] getStocks backend failed, falling back', e);
        }
    }
    await sleep(8);
    return mock.getStocks();
}

export async function getPrices(symbols: string[]): Promise<Record<string, { price: number; timestamp: string }>> {
    // If backend base is present, try server proxy; else fallback to mock
    const imeta3: any = (globalThis as any).import?.meta || ({});
    const base = (window as any).__CTS_API_BASE || imeta3.env?.VITE_API_BASE || '';
    if (base) {
        try {
            const dbg = !!localStorage.getItem('cts_debug');
            const url = `${base.replace(/\/$/, '')}/api/upstox/prices`;
            const t0 = Date.now();
            const r = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ symbols })
            });
            const t1 = Date.now();
            if (dbg) console.log('[CTS-DEBUG] POST /api/upstox/prices', { url, status: r.status, timeMs: t1 - t0, symbols });
            if (r.ok) {
                const data = await r.json();
                return data || {};
            }
        } catch (e) { if (localStorage.getItem('cts_debug')) console.warn('[CTS-DEBUG] getPrices error', String((e && (e as any).message) || e)); /* fall through to mock */ }
    }
    await sleep(6);
    return mock.getPrices(symbols);
}

export async function createStock(payload: { symbol: string; date: string; category: string; sector?: string }): Promise<any> {
    const imeta4: any = (globalThis as any).import?.meta || {};
    const base = (window as any).__CTS_API_BASE || imeta4.env?.VITE_API_BASE || '';

    // CRITICAL: Do NOT silently fallback to mock - this caused data loss!
    // If backend is not configured, throw an error immediately
    if (!base) {
        console.error('[CRITICAL] createStock called but VITE_API_BASE is not set!');
        console.error('Stocks will NOT be saved to database. Backend URL must be configured.');
        throw new Error('Backend not configured - VITE_API_BASE missing. Cannot save stock to database.');
    }

    // Gun-shot mode: Direct backend call, no silent fallback
    const url = `${base.replace(/\/$/, '')}/api/stocks`;
    const body = { symbol: payload.symbol, date: payload.date, category: payload.category, sector: payload.sector };
    const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (r.ok) return r.json();
    if (r.status === 409) { const err: any = new Error('Duplicate'); err.code = 'DUPLICATE'; throw err; }
    // For other errors, throw with message
    const errBody = await r.json().catch(() => ({}));
    throw new Error(errBody.error || `Backend error: ${r.status}`);
}


export async function deleteStock(id: number): Promise<{ success: boolean }> {
    const imeta5: any = (globalThis as any).import?.meta || {};
    const base = (window as any).__CTS_API_BASE || imeta5.env?.VITE_API_BASE || '';

    // CRITICAL: Do NOT silently fallback to mock - this caused data inconsistency!
    if (!base) {
        console.error('[CRITICAL] deleteStock called but VITE_API_BASE is not set!');
        throw new Error('Backend not configured - VITE_API_BASE missing. Cannot delete stock from database.');
    }

    const url = `${base.replace(/\/$/, '')}/api/stocks/${encodeURIComponent(String(id))}`;
    const r = await fetch(url, { method: 'DELETE' });
    if (r.ok) return r.json();
    if (r.status === 404) { const err: any = new Error('Not found'); err.code = 'NOT_FOUND'; throw err; }
    const errBody = await r.json().catch(() => ({}));
    throw new Error(errBody.error || `Backend error: ${r.status}`);
}


// Get stocks for a specific category
export async function getCategoryStocks(categoryKey: string): Promise<any[]> {
    const imeta6: any = (globalThis as any).import?.meta || {};
    const base = (window as any).__CTS_API_BASE || imeta6.env?.VITE_API_BASE || '';
    if (base) {
        try {
            const url = `${base.replace(/\/$/, '')}/api/categories/${encodeURIComponent(categoryKey)}/stocks`;
            const r = await fetchWithTimeout(url, undefined, 2500);
            if (r.ok) {
                const data = await r.json();
                return data.stocks || [];
            }
        } catch (e) {
            if (localStorage.getItem('cts_debug')) console.warn('[CTS-DEBUG] getCategoryStocks backend failed', e);
        }
    }
    await sleep(8);
    // Fallback: filter getStocks by category
    const allStocks = await mock.getStocks();
    return allStocks.filter((s: any) => s.categoryKey === categoryKey || s.category === categoryKey);
}

// Delete a stock from a specific category
export async function deleteCategoryStock(categoryKey: string, symbol: string): Promise<{ ok: boolean; deleted?: number }> {
    const imeta7: any = (globalThis as any).import?.meta || {};
    const base = (window as any).__CTS_API_BASE || imeta7.env?.VITE_API_BASE || '';
    if (base) {
        try {
            const url = `${base.replace(/\/$/, '')}/api/categories/${encodeURIComponent(categoryKey)}/stocks/${encodeURIComponent(symbol)}`;
            const r = await fetch(url, { method: 'DELETE' });
            if (r.ok) {
                const data = await r.json();
                return { ok: data.ok !== false, deleted: data.deleted };
            }
        } catch (e) {
            if (localStorage.getItem('cts_debug')) console.warn('[CTS-DEBUG] deleteCategoryStock backend failed', e);
        }
    }
    await sleep(8);
    // Fallback: use mock deleteStock (won't have category context in mock mode)
    return { ok: true, deleted: 1 };
}

export async function getStrategies(): Promise<StrategyState> {
    await sleep(6);
    return mock.getStrategies();
}

export async function saveStrategy(categoryKey: string, logic: StrategyLogic): Promise<StrategyState> {
    await sleep(10);
    return mock.saveStrategy(categoryKey, logic);
}

export async function getActiveTrades(): Promise<Trade[]> {
    await sleep(6);
    return mock.getActiveTrades();
}

export async function getCompletedTrades(): Promise<Trade[]> {
    await sleep(6);
    return mock.getCompletedTrades();
}

export async function evaluateOpenTradesAndNotify(): Promise<void> {
    // No sleep here, as it's part of a ticker
    return mock.evaluateOpenTradesAndNotify();
}

export async function getNotifications(): Promise<Notification[]> {
    await sleep(4);
    return mock.getNotifications();
}

export async function clearNotification(id: number): Promise<Notification[]> {
    await sleep(4);
    return mock.clearNotification(id);
}

// --- Backtest API helpers (used by Strategy Workbench UI) ---
type BacktestStartPayload = { symbols: string[]; from: string; to: string; interval: string; mode: 'mock' | 'upstox'; categoryKey?: string; examples?: any[] };
type BacktestStartResp = { ok: boolean; jobId?: string; error?: string };
type BacktestStatusResp = { ok: boolean; id: string; status: 'queued' | 'running' | 'done' | 'error' | 'cancelled'; progress: { phase: string; done: number; total: number }; logs: string[]; runId?: string; resultsPath?: string; error?: string };
type BacktestResultResp = { ok: boolean; runId: string; result: any };

function apiBase(): string | null {
    let viteBase = '';
    try {
        const im: any = (globalThis as any).import?.meta || {};
        viteBase = im.env?.VITE_API_BASE || '';
    } catch (_) { /* ignore */ }
    const base = (window as any).__CTS_API_BASE || viteBase || '';
    return base ? String(base).replace(/\/$/, '') : null;
}

export async function startBacktest(payload: BacktestStartPayload): Promise<BacktestStartResp> {
    const base = apiBase();
    if (!base) return { ok: false, error: 'API base not configured' };
    const r = await fetch(`${base}/api/backtest/start`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    if (!r.ok) return { ok: false, error: `HTTP ${r.status}` };
    return r.json();
}

export async function getBacktestStatus(jobId: string): Promise<BacktestStatusResp> {
    const base = apiBase();
    if (!base) throw new Error('API base not configured');
    const r = await fetch(`${base}/api/backtest/status?jobId=${encodeURIComponent(jobId)}`);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.json();
}

export async function getBacktestResult(runId: string): Promise<BacktestResultResp> {
    const base = apiBase();
    if (!base) throw new Error('API base not configured');
    const r = await fetch(`${base}/api/backtest/result/${encodeURIComponent(runId)}`);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.json();
}

export function getTradesCsvUrl(runId: string): string | null {
    const base = apiBase();
    if (!base) return null;
    return `${base}/strategy/trades/${encodeURIComponent(runId)}`;
}

// Composite optimizer API
export async function optimizeComposite(payload: { symbols: string[]; from: string; to: string; interval: string; mode: 'mock' | 'upstox'; categoryKey: string; pool?: any; limits?: any; threshold?: { minAccuracyPct?: number; minExpectancy?: number; maxDrawdown?: number }; autoPersist?: boolean }): Promise<CompositeOptimizationResponse> {
    const base = apiBase();
    if (!base) return { ok: false, categoryKey: payload.categoryKey, candidates: 0, ranked: [] } as any;
    const r = await fetch(`${base}/api/optimize/composite`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    if (!r.ok) return { ok: false, categoryKey: payload.categoryKey, candidates: 0, ranked: [] } as any;
    return r.json();
}

// ========== AI Intelligence API Functions ==========

export interface MarketSentiment {
    score: number;
    label: string;
    components: {
        fiiDii: any;
        globalCues: string;
        vix: { value: number; trend: string };
        pcr: { value: number; trend: string };
    };
    timestamp: string;
}

export interface MarketRegime {
    regime: 'TRENDING_BULLISH' | 'TRENDING_BEARISH' | 'RANGING' | 'VOLATILE' | 'UNKNOWN';
    confidence: number;
    indicators: {
        adx: number;
        atrRatio: number;
        bbWidth: number;
    };
    reason: string;
}

export interface TechnicalAnalysisResult {
    current: {
        price: number;
        emaShort: number;
        emaLong: number;
        rsi: number;
        atr: number;
    };
    trend: {
        direction: 'bullish' | 'bearish';
        strength: number;
        emaAlignment: boolean;
    };
    indicators: any;
    patterns: Array<{ type: string; confidence: number; direction: string }>;
    supportResistance: {
        support: Array<{ price: number; strength: number; touches?: number }>;
        resistance: Array<{ price: number; strength: number; touches?: number }>;
    };
    volume: any;
    signals: Array<{ type: string; strength: number; message: string; direction?: string }>;
}

export interface TokenUsageStats {
    totalTokensUsed: number;
    totalCost: number;
    requestCount: number;
    avgTokensPerRequest: number;
    avgCostPerRequest: number;
    model: string;
}

export async function getMarketSentiment(): Promise<MarketSentiment | null> {
    const base = apiBase();
    if (!base) return null;

    try {
        const r = await fetch(`${base}/api/ai/market-sentiment`);
        if (!r.ok) return null;
        const data = await r.json();
        return data.sentiment;
    } catch (e) {
        console.error('Failed to fetch market sentiment:', e);
        return null;
    }
}

export async function analyzeNews(headlines: string[]): Promise<any> {
    const base = apiBase();
    if (!base) return null;

    try {
        const r = await fetch(`${base}/api/ai/analyze-news`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ headlines })
        });
        if (!r.ok) return null;
        const data = await r.json();
        return data.analysis;
    } catch (e) {
        console.error('Failed to analyze news:', e);
        return null;
    }
}

export async function detectMarketRegime(candles: any[]): Promise<MarketRegime | null> {
    const base = apiBase();
    if (!base) return null;

    try {
        const r = await fetch(`${base}/api/ai/detect-regime`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ candles })
        });
        if (!r.ok) return null;
        const data = await r.json();
        return data.regime;
    } catch (e) {
        console.error('Failed to detect market regime:', e);
        return null;
    }
}

export async function getTechnicalAnalysis(candles: any[], config?: any): Promise<TechnicalAnalysisResult | null> {
    const base = apiBase();
    if (!base) return null;

    try {
        const r = await fetch(`${base}/api/ai/technical-analysis`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ candles, config })
        });
        if (!r.ok) return null;
        const data = await r.json();
        return data.analysis;
    } catch (e) {
        console.error('Failed to get technical analysis:', e);
        return null;
    }
}

export async function getAITokenUsage(): Promise<TokenUsageStats | null> {
    const base = apiBase();
    if (!base) return null;

    try {
        const r = await fetch(`${base}/api/ai/token-usage`);
        if (!r.ok) return null;
        const data = await r.json();
        return data.stats;
    } catch (e) {
        console.error('Failed to fetch token usage:', e);
        return null;
    }
}

export async function resetAITokenUsage(): Promise<boolean> {
    const base = apiBase();
    if (!base) return false;

    try {
        const r = await fetch(`${base}/api/ai/reset-usage`, { method: 'POST' });
        return r.ok;
    } catch (e) {
        console.error('Failed to reset token usage:', e);
        return false;
    }
}


export async function getCategories(): Promise<Category[]> {
    const base = apiBase();
    if (!base) return [];
    try {
        const r = await fetch(`${base}/api/categories`);
        if (r.ok) {
            const json = await r.json();
            // Handle { success: true, data: [...] } structure
            if (json.data && Array.isArray(json.data)) return json.data;
            if (Array.isArray(json)) return json;
        }
    } catch (e) { console.error(e); }
    return [];
}

export async function updateCategoryStatus(key: string, updates: Partial<Category>): Promise<Category | null> {
    const base = apiBase();
    if (!base) return null;
    try {
        const r = await fetch(`${base}/api/categories/${encodeURIComponent(key)}/status`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(updates)
        });
        if (r.ok) {
            const json = await r.json();
            return json.data || json;
        }
    } catch (e) {
        console.error(e);
        throw e;
    }
    return null;
}
