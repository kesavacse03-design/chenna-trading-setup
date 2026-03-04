import React, { useState, useMemo, useEffect } from 'react';
import DashboardCard from './DashboardCard';
import { GroupedWatchlist, StockData, ImportWatchlistPayload } from '../types';
import { UploadIcon } from './icons/UploadIcon';
import ManualImport from './ManualImport';
import TredcodeSync from './TredcodeSync';
import SmartPasteImport from './SmartPasteImport';
import { SearchIcon } from './icons/SearchIcon';
import { TrashIcon } from './icons/TrashIcon';
import * as storage from '../utils/storage';
import { useWatchlistStore } from '../store/watchlistStore';
import { PREPOPULATED_WATCHLIST } from '../constants';
import * as api from '../api';
import { attachCategoryMetaToItem, mapToCanonical } from '../utils/categoryMap';
import priceService, { getCachedPrice } from '../utils/priceService';
import { readLocks, writeLock, isLocked } from '../utils/categoryLocks';
// simple per-category time filter persistence
const TIME_FILTERS_KEY = 'cts_timeFilters';
type TimeRange = '1_DAY' | '7_DAYS' | '10_DAYS' | '15_DAYS' | '30_DAYS' | 'ALL';
function readTimeFilters(): Record<string, TimeRange> {
    try { const raw = localStorage.getItem(TIME_FILTERS_KEY); return raw ? JSON.parse(raw) : {}; } catch (_) { return {}; }
}
function writeTimeFilter(categoryKey: string, value: TimeRange) {
    try { const cur = readTimeFilters(); cur[categoryKey] = value; localStorage.setItem(TIME_FILTERS_KEY, JSON.stringify(cur)); } catch (_) { }
}
function getTimeFilterFor(categoryKey: string, isIntraday: boolean): TimeRange {
    try {
        const cur = readTimeFilters();
        if (cur[categoryKey]) return cur[categoryKey] as TimeRange;
        return isIntraday ? '1_DAY' : '7_DAYS';
    } catch (_) {
        return isIntraday ? '1_DAY' : '7_DAYS';
    }
}

interface AnalysisHubProps {
    watchlist: GroupedWatchlist;
    onWatchlistUpdate: (payload: ImportWatchlistPayload) => void;
    onManageStrategy?: (categoryKey: string) => void;
    onOpenLabs?: (categoryKey: string) => void;
}

const isStockExpired = (stock: StockData): boolean => {
    if (!stock.expires_at) return false;
    return new Date() > new Date(stock.expires_at);
};

// helper removed (not used in compact block layout)

// per-stock rows rendered inline inside subcategory blocks

const AnalysisHub: React.FC<AnalysisHubProps> = ({ watchlist, onWatchlistUpdate }) => {
    const [isImportModalOpen, setIsImportModalOpen] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [filter, setFilter] = useState<'ALL' | 'SWING' | 'INTRADAY'>('ALL');
    const [localWatchlist, setLocalWatchlist] = useState<GroupedWatchlist>(watchlist);
    const [toast, setToast] = useState<string | null>(null);
    const [importReport, setImportReport] = useState<any | null>(null);
    const [isImportReportOpen, setImportReportOpen] = useState(false);

    // Multi-select deletion state
    const [selectedStocks, setSelectedStocks] = useState<Set<string>>(new Set());

    // Live prices from backend API
    const [livePrices, setLivePrices] = useState<Record<string, { ltp: number; updatedAt: string }>>({});
    const [lastPriceUpdate, setLastPriceUpdate] = useState<string | null>(null);
    const [marketStatus, setMarketStatus] = useState<any>(null);
    const [isLiveSyncOn, setIsLiveSyncOn] = useState<boolean>(false);

    // Fetch live prices from backend API
    const fetchLivePrices = React.useCallback(async () => {
        if (!isLiveSyncOn) return; // Only fetch if toggle is ON
        try {
            const response = await fetch('http://localhost:3001/api/live-prices');
            if (!response.ok) return;
            const data = await response.json();
            if (data.ok && data.prices) {
                // Merge with existing prices so we never show 0/empty if a batch drops
                setLivePrices(prev => ({ ...prev, ...data.prices }));
                setLastPriceUpdate(data.lastUpdate);
                setMarketStatus(data.marketStatus);
            }
        } catch (error) {
            console.error('[LivePrices] Fetch failed:', error);
        }
    }, [isLiveSyncOn]);

    // Fetch prices on mount and every 30 seconds if ON
    useEffect(() => {
        if (isLiveSyncOn) {
            fetchLivePrices(); // Initial fetch
            const interval = setInterval(fetchLivePrices, 30 * 1000); // UI Requirement: 30 seconds
            return () => clearInterval(interval);
        }
    }, [fetchLivePrices, isLiveSyncOn]);

    // helper to build an empty canonical watchlist merged with any persisted content
    const getBaseWatchlist = () => {
        // Start from a fresh copy of canonical category structure, then merge any persisted lists
        const base = JSON.parse(JSON.stringify(PREPOPULATED_WATCHLIST));
        try {
            const persisted = storage.getWatchlist();
            for (const pKey of Object.keys(base)) {
                for (const cat of Object.keys((base as any)[pKey] || {})) {
                    if ((persisted as any)[pKey] && (persisted as any)[pKey][cat]) {
                        (base as any)[pKey][cat] = (persisted as any)[pKey][cat];
                    }
                }
            }
        } catch (_) { }
        return base;
    };

    // Load stocks from API/local and project into canonical grouped watchlist
    const load = React.useCallback(async () => {
        let mounted = true;
        try {
            const serverStocks = await api.getStocks();
            if (!mounted) return;

            // CRITICAL FIX: Start with EMPTY category structure, NOT localStorage
            // Previously getBaseWatchlist() loaded stale localStorage data causing count mismatch
            const base = JSON.parse(JSON.stringify(PREPOPULATED_WATCHLIST));
            // Clear all arrays - we only want database data
            for (const page of Object.keys(base)) {
                for (const cat of Object.keys(base[page] || {})) {
                    base[page][cat] = []; // Empty array - will be filled from API only
                }
            }
            const copy = base;

            for (const s of serverStocks) {
                const s2 = attachCategoryMetaToItem(s);
                const incomingCatNorm = s2.categoryKey || (s2.category || s2.categoryRaw || '');
                // ensure we try the canonical mapped key too (handles raw variants stored with spaces)
                const mappedIncoming = mapToCanonical(incomingCatNorm || '') || incomingCatNorm;
                // place into the page that contains incomingCatNorm
                let added = false;
                for (const pKey of Object.keys(copy)) {
                    const existingCats = Object.keys(copy[pKey] || {});
                    // check either the exact incoming token or its canonical mapped key
                    const targetKey = existingCats.includes(incomingCatNorm) ? incomingCatNorm : (existingCats.includes(mappedIncoming) ? mappedIncoming : null);
                    if (!targetKey) continue;
                    const arr = copy[pKey][targetKey] || [];
                    // avoid duplicates by (stockName,date)
                    const stockName = s.stockName || s.symbol || '';
                    if (!stockName) continue;
                    const exists = (arr as any[]).some((x: any) => x.stockName === stockName && (x.date || '') === (s.date || ''));
                    if (!exists) arr.push({ stockName, date: s.date, price: s.price ?? null, addedDate: s.addedDate ?? new Date().toISOString(), expires_at: s.expires_at ?? null });
                    copy[pKey][targetKey] = arr;
                    added = true;
                    break; // Found the right page, stop searching
                }

                // 🔧 FIX: If category not found, create it dynamically in a "Custom" page
                if (!added && incomingCatNorm) {
                    console.log(`[AnalysisHub] Creating dynamic category: ${incomingCatNorm}`);
                    // Ensure "Custom" page exists
                    if (!copy['Custom']) copy['Custom'] = {};
                    // Create the category if it doesn't exist
                    if (!copy['Custom'][incomingCatNorm]) copy['Custom'][incomingCatNorm] = [];

                    const stockName = s.stockName || s.symbol || '';
                    if (stockName) {
                        const arr = copy['Custom'][incomingCatNorm];
                        const exists = (arr as any[]).some((x: any) => x.stockName === stockName && (x.date || '') === (s.date || ''));
                        if (!exists) {
                            arr.push({
                                stockName,
                                date: s.date,
                                price: s.price ?? null,
                                addedDate: s.addedDate ?? new Date().toISOString(),
                                expires_at: s.expires_at ?? null
                            });
                        }
                        added = true;
                    }
                }

                if (!added) {
                    console.warn('[AnalysisHub] Could not add stock:', s.stockName, 'categoryKey:', incomingCatNorm);
                }
            }
            setLocalWatchlist(copy);
            // NOTE: storage.setWatchlist removed - database is only source of truth
            try {
                // Flatten grouped watchlist into rows for the Active Watchlist store
                const flattened: any[] = [];
                for (const page of Object.keys(copy || {})) {
                    const pageObj = (copy as any)[page] || {};
                    for (const cat of Object.keys(pageObj)) {
                        const arr = pageObj[cat] || [];
                        for (const it of arr) {
                            flattened.push({ symbol: it.stockName || it.symbol || '', name: it.name || '', instrument_token: it.instrument_token || '', exchange: it.exchange || '', date: it.date || '', category: cat, price: it.price ?? null, priceSource: it.priceSource || '' });
                        }
                    }
                }
                // Debug trace
                console.log('[AnalysisHub] GET /api/stocks returned', serverStocks.length, 'items; updating watchlistStore rows=', flattened.length);
                useWatchlistStore.getState().setRows(flattened as any);
            } catch (e) { console.warn('[AnalysisHub] failed to update watchlistStore', e); }
            try {
                const counts: Record<string, number> = {};
                for (const p of Object.keys(copy)) {
                    for (const c of Object.keys(copy[p] || {})) {
                        counts[c] = (copy[p][c] || []).length;
                    }
                }
                // Snapshot for debugging evidence
                console.log('WATCHLIST_SNAPSHOT', { totalStocks: serverStocks.length, perCategory: counts });
            } catch (_) { }
        } catch (e) {
            // Log error and continue with empty watchlist if backend fails
            console.error('[AnalysisHub] Failed to load stocks from backend:', e);
            setLocalWatchlist(getBaseWatchlist());
        }
    }, []);

    // initial load and on prop change (e.g., other flows updating watchlist)
    useEffect(() => { load(); }, [load]);
    useEffect(() => { load(); }, [watchlist, load]);

    // Listen for manual import completion and reload data immediately
    useEffect(() => {
        const handleImport = () => { load(); };
        window.addEventListener('cts:watchlist:imported', handleImport);
        return () => { window.removeEventListener('cts:watchlist:imported', handleImport); };
    }, [load]);

    // Listen for detailed import summary events from ManualImport
    useEffect(() => {
        const onSummary = (e: any) => {
            const d = e?.detail || {};
            setImportReport(d);
            // also set a clickable toast message
            if (d && d.toastMessage) {
                setToast(d.toastMessage);
                // auto-hide after 6s
                setTimeout(() => setToast(null), 6000);
            }
        };
        window.addEventListener('cts:import:summary', onSummary as any);
        return () => window.removeEventListener('cts:import:summary', onSummary as any);
    }, []);



    // intraday categories are defined inline in displayedContent

    // Main category filtering: ALL | SWING | INTRADAY
    const mainCategoryPages = ['PRO_SETUP', 'SWING_CENTER', 'MARKET_DEPTH'];

    const displayedContent = useMemo(() => {
        const lowerCaseSearchTerm = searchTerm.toLowerCase();
        const content: { page: string, category: string, stocks: StockData[] }[] = [];

        // Define swing and intraday sub-category lists explicitly to enforce order and naming
        const swingList = [
            'DOWNSIDE_LOM_SWING', 'UPSIDE_LOM_SWING', 'MULTI_RESISTANCE_BO', 'MULTI_SUPPORT_BO',
            'SHORT_TERM_SWING_BO_UP', 'SHORT_TERM_SWING_BO_DOWN', 'LONG_TERM_SWING_BO_UP', 'LONG_TERM_SWING_BO_DOWN'
        ];
        const intradayList = [
            'HIGH_POWERED_STOCKS', 'INTRADAY_BOOST', 'DOWNSIDE_LOM_INTRA', 'UPSIDE_LOM_INTRA', 'DAILY_CONTRACTION', 'PRE_MARKET'
        ];

        // Build the list of sub-categories to show based on filter
        let categoriesToShow: string[] = [];
        if (filter === 'ALL') categoriesToShow = [...swingList, ...intradayList];
        else if (filter === 'SWING') categoriesToShow = swingList;
        else categoriesToShow = intradayList;

        // Iterate the ordered categories and pick the correct page that defines each category
        for (const category of categoriesToShow) {
            // choose the page that actually contains this category key
            let chosenPage: string | null = null;
            for (const p of mainCategoryPages) {
                const cats = localWatchlist[p] || {};
                if (Object.prototype.hasOwnProperty.call(cats, category)) { chosenPage = p; break; }
            }
            // fallback to first page if not found (should not happen if PREPOPULATED_WATCHLIST is merged)
            if (!chosenPage) chosenPage = mainCategoryPages[0];

            const categories = localWatchlist[chosenPage] || {};
            const stocksRaw = categories[category] || [];
            // de-duplicate by (stockName,date,category)
            const seen = new Set<string>();
            const deduped: StockData[] = [];
            for (const s of stocksRaw) {
                const key = `${s.stockName}::${s.date || ''}::${category}`;
                if (seen.has(key)) continue;
                seen.add(key);
                deduped.push(s);
            }

            // apply time-range filter per category
            const isCategoryIntraday = intradayList.includes(category);
            const timeFilter = getTimeFilterFor(category, isCategoryIntraday);
            const now = new Date();
            const inTimeRange = (s: any) => {
                // Use date field (the actual import date) if addedDate is missing
                const dtStr = s.date || s.addedDate || null;
                if (!dtStr) return false; // Hide stocks with no date
                const dt = new Date(dtStr);
                if (Number.isNaN(dt.getTime())) return false; // Hide invalid dates
                if (timeFilter === 'ALL') return true;
                const diffMs = now.getTime() - dt.getTime();
                const days = diffMs / (1000 * 60 * 60 * 24);
                if (timeFilter === '1_DAY') return days <= 1;
                if (timeFilter === '7_DAYS') return days <= 7;
                if (timeFilter === '10_DAYS') return days <= 10;
                if (timeFilter === '15_DAYS') return days <= 15;
                if (timeFilter === '30_DAYS') return days <= 30;
                return false; // Default: hide if doesn't match any filter
            };

            const activeAndFilteredStocks = deduped
                .filter(s => !isStockExpired(s))
                .filter(s => (s.stockName || '').toLowerCase().includes(lowerCaseSearchTerm))
                .filter(s => inTimeRange(s))
                .sort((a, b) => {
                    // Sort by date descending (newest first)
                    const dateA = new Date(a.date || a.addedDate || 0).getTime();
                    const dateB = new Date(b.date || b.addedDate || 0).getTime();
                    return dateB - dateA;
                });
            // push one block per category from the chosen page
            content.push({ page: chosenPage, category, stocks: activeAndFilteredStocks });
        }

        return content;
    }, [localWatchlist, searchTerm, filter]);

    // Register visible categories with the price service and update their symbol lists
    useEffect(() => {
        try {
            for (const block of displayedContent) {
                const syms = (block.stocks || []).map(s => s.stockName).filter(Boolean);
                // ensure group exists and its symbols are up-to-date
                priceService.registerGroup(block.category, syms);
                priceService.updateGroupSymbols(block.category, syms);
            }
        } catch (e) {
            console.warn('[AnalysisHub] priceService registration failed', e);
        }
    }, [displayedContent]);

    const handleDelete = async (page: string, category: string, stockName: string, date?: string) => {
        // Block deletes when category is locked
        try {
            if (isLocked(category)) {
                try { window.dispatchEvent(new CustomEvent('cts:toast', { detail: { message: `${category.replace(/_/g, ' ')} is locked`, kind: 'error' } })); } catch (_) { }
                return;
            }
        } catch (_) { }
        const confirmMsg = `Remove ${stockName} from ${category.replace(/_/g, ' ')}?`;
        if (!window.confirm(confirmMsg)) return;

        // Immediate UI removal and persistent deletion
        const copy: GroupedWatchlist = JSON.parse(JSON.stringify(localWatchlist));
        const arr = copy[page] && copy[page][category] ? copy[page][category] : [];
        const idx = arr.findIndex((s: any) => s.stockName === stockName && ((s.date || '') === (date || '')));
        if (idx >= 0) arr.splice(idx, 1);
        if (copy[page]) copy[page][category] = arr;
        setLocalWatchlist(copy);
        // NOTE: localStorage persistence removed - database is only source of truth

        // Delete from backend via category-specific API
        try {
            const result = await api.deleteCategoryStock(category, stockName);
            if (!result.ok) {
                console.warn(`Backend delete failed for ${stockName} in ${category}, but keeping removed locally`);
            }
        } catch (e) {
            console.warn('Backend delete failed, but keeping removed locally:', e);
        }

        // Notify user of successful removal (UI toast + transient local message)
        const msg = `Removed ${stockName} from ${category.replace(/_/g, ' ')}`;
        try { window.dispatchEvent(new CustomEvent('cts:toast', { detail: { message: msg, kind: 'success' } })); } catch (_) { }
        setToast(msg);
        setTimeout(() => setToast(null), 3000);
    };

    const handleDeleteAll = async (page: string, category: string) => {
        try {
            if (isLocked(category)) {
                try { window.dispatchEvent(new CustomEvent('cts:toast', { detail: { message: `${category.replace(/_/g, ' ')} is locked`, kind: 'error' } })); } catch (_) { }
                return;
            }
        } catch (_) { }
        const confirmMsg = `Are you sure you want to delete all stocks in ${category.replace(/_/g, ' ')}?`;
        if (!window.confirm(confirmMsg)) return;

        // Optimistic UI update: clear the category
        const copy: GroupedWatchlist = JSON.parse(JSON.stringify(localWatchlist));
        if (copy[page]) copy[page][category] = [];
        setLocalWatchlist(copy);
        // NOTE: localStorage persistence removed - database is only source of truth


        // Delete all stocks from category via backend API
        try {
            // Fetch stocks in this category and delete each one
            const stocks = await api.getCategoryStocks(category);
            for (const stock of stocks) {
                try {
                    const result = await api.deleteCategoryStock(category, stock.symbol);
                    if (!result.ok) {
                        console.warn(`Failed to delete ${stock.symbol} from ${category}:`, result);
                    }
                } catch (e) {
                    console.warn(`Error deleting ${stock.symbol} from ${category}:`, e);
                    // Best-effort: keep removed locally even if backend delete fails (do not restore)
                }
            }
        } catch (e) {
            console.warn('Backend delete-all operation failed, but local changes applied:', e);
        }

        const msg = `Deleted all stocks from ${category.replace(/_/g, ' ')} — permanent.`;
        try { window.dispatchEvent(new CustomEvent('cts:toast', { detail: { message: msg, kind: 'success' } })); } catch (_) { }
    };

    // Multi-select deletion helpers
    const getStockKey = (category: string, stockName: string, date?: string) => `${category}|${stockName}|${date || ''}`;

    const toggleSelectStock = (category: string, stockName: string, date?: string) => {
        const key = getStockKey(category, stockName, date);
        setSelectedStocks(prev => {
            const next = new Set(prev);
            if (next.has(key)) next.delete(key);
            else next.add(key);
            return next;
        });
    };

    const toggleSelectAllInCategory = (page: string, category: string) => {
        const allStocks = (localWatchlist[page]?.[category] || []);
        const isCategoryIntraday = ['HIGH_POWERED_STOCKS', 'INTRADAY_BOOST', 'DOWNSIDE_LOM_INTRA', 'UPSIDE_LOM_INTRA', 'DAILY_CONTRACTION', 'PRE_MARKET'].includes(category);
        const timeFilter = getTimeFilterFor(category, isCategoryIntraday);
        const now = new Date();

        // Filter stocks by time range (same logic as display)
        const stocks = allStocks.filter((s: any) => {
            if (!s.stockName) return false;
            if (isStockExpired(s)) return false;
            if (!s.stockName.toLowerCase().includes((searchTerm || '').toLowerCase())) return false;

            const dtStr = s.addedDate || s.date || null;
            if (!dtStr) return true;
            const dt = new Date(dtStr);
            if (Number.isNaN(dt.getTime())) return true;
            if (timeFilter === 'ALL') return true;
            const diffMs = now.getTime() - dt.getTime();
            const days = diffMs / (1000 * 60 * 60 * 24);
            if (timeFilter === '1_DAY') return days <= 1;
            if (timeFilter === '7_DAYS') return days <= 7;
            if (timeFilter === '10_DAYS') return days <= 10;
            if (timeFilter === '15_DAYS') return days <= 15;
            if (timeFilter === '30_DAYS') return days <= 30;
            return true;
        });

        const allKeys = stocks.map((s: any) => getStockKey(category, s.stockName, s.date));
        const allSelected = allKeys.length > 0 && allKeys.every(k => selectedStocks.has(k));
        setSelectedStocks(prev => {
            const next = new Set(prev);
            if (allSelected) allKeys.forEach(k => next.delete(k));
            else allKeys.forEach(k => next.add(k));
            return next;
        });
    };

    // Helper: get stocks filtered by current time range and search
    const getFilteredStocksInCategory = (page: string, category: string) => {
        const allStocks = (localWatchlist[page]?.[category] || []);
        const isCategoryIntraday = ['HIGH_POWERED_STOCKS', 'INTRADAY_BOOST', 'DOWNSIDE_LOM_INTRA', 'UPSIDE_LOM_INTRA', 'DAILY_CONTRACTION', 'PRE_MARKET'].includes(category);
        const timeFilter = getTimeFilterFor(category, isCategoryIntraday);
        const now = new Date();

        return allStocks.filter((s: any) => {
            if (!s.stockName) return false;
            if (isStockExpired(s)) return false;
            if (!s.stockName.toLowerCase().includes((searchTerm || '').toLowerCase())) return false;

            const dtStr = s.addedDate || s.date || null;
            if (!dtStr) return true;
            const dt = new Date(dtStr);
            if (Number.isNaN(dt.getTime())) return true;
            if (timeFilter === 'ALL') return true;
            const diffMs = now.getTime() - dt.getTime();
            const days = diffMs / (1000 * 60 * 60 * 24);
            if (timeFilter === '1_DAY') return days <= 1;
            if (timeFilter === '7_DAYS') return days <= 7;
            if (timeFilter === '10_DAYS') return days <= 10;
            if (timeFilter === '15_DAYS') return days <= 15;
            if (timeFilter === '30_DAYS') return days <= 30;
            return true;
        });
    };


    const getSelectedInCategory = (category: string) => {
        return Array.from(selectedStocks).filter(k => k.startsWith(`${category}|`));
    };

    const handleDeleteSelected = async (page: string, category: string) => {
        try {
            if (isLocked(category)) {
                try { window.dispatchEvent(new CustomEvent('cts:toast', { detail: { message: `${category.replace(/_/g, ' ')} is locked`, kind: 'error' } })); } catch (_) { }
                return;
            }
        } catch (_) { }

        const selectedKeys = getSelectedInCategory(category);
        if (selectedKeys.length === 0) {
            try { window.dispatchEvent(new CustomEvent('cts:toast', { detail: { message: 'No stocks selected', kind: 'error' } })); } catch (_) { }
            return;
        }

        const confirmMsg = `Delete ${selectedKeys.length} selected stock(s) from ${category.replace(/_/g, ' ')}?`;
        if (!window.confirm(confirmMsg)) return;

        // Parse selected keys to get stock details
        const toDelete = selectedKeys.map(k => {
            const [_, stockName, date] = k.split('|');
            return { stockName, date };
        });

        // Optimistic UI update
        const copy: GroupedWatchlist = JSON.parse(JSON.stringify(localWatchlist));
        const arr = copy[page]?.[category] || [];
        const filtered = arr.filter((s: any) => !toDelete.some(d => d.stockName === s.stockName && (d.date || '') === (s.date || '')));
        if (copy[page]) copy[page][category] = filtered;
        setLocalWatchlist(copy);
        // NOTE: localStorage persistence removed - database is only source of truth


        // Delete from backend
        let deletedCount = 0;
        for (const d of toDelete) {
            try {
                const result = await api.deleteCategoryStock(category, d.stockName);
                if (result.ok) deletedCount++;
            } catch (e) {
                console.warn(`Failed to delete ${d.stockName}:`, e);
            }
        }

        // Clear selections for this category
        setSelectedStocks(prev => {
            const next = new Set(prev);
            selectedKeys.forEach(k => next.delete(k));
            return next;
        });

        const msg = `Deleted ${deletedCount} stock(s) from ${category.replace(/_/g, ' ')}`;
        try { window.dispatchEvent(new CustomEvent('cts:toast', { detail: { message: msg, kind: 'success' } })); } catch (_) { }
    };

    return (
        <>
            <DashboardCard title="Active Watchlist & Analysis" className="flex-grow h-full">
                <div className="flex flex-col h-full">
                    <div className="flex-shrink-0 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-2">
                        <div className="relative flex-shrink-0 w-full sm:w-auto sm:min-w-[200px]">
                            <input type="text" placeholder="Search stock..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)}
                                className="w-full bg-slate-700 border border-slate-600 rounded-md py-2 pl-9 pr-3 text-sm placeholder-slate-400 focus:ring-cyan-500 focus:border-cyan-500" />
                            <SearchIcon className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                        </div>
                    </div>

                    <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                            <button onClick={() => setFilter('ALL')} className={`px-3 py-1 rounded ${filter === 'ALL' ? 'bg-slate-700' : ''}`}>ALL</button>
                            <button onClick={() => setFilter('SWING')} className={`px-3 py-1 rounded ${filter === 'SWING' ? 'bg-slate-700' : ''}`}>SWING CENTER</button>
                            <button onClick={() => setFilter('INTRADAY')} className={`px-3 py-1 rounded ${filter === 'INTRADAY' ? 'bg-slate-700' : ''}`}>INTRADAY</button>
                        </div>

                        <div className="flex items-center gap-3">
                            {isLiveSyncOn && lastPriceUpdate && (
                                <span className="text-xs text-slate-400">
                                    Last sync: {new Date(lastPriceUpdate).toLocaleTimeString()}
                                </span>
                            )}
                            <button
                                onClick={() => {
                                    if (!isLiveSyncOn) fetchLivePrices(); // fetch immediately when turning on
                                    setIsLiveSyncOn(!isLiveSyncOn);
                                }}
                                className={`text-xs px-3 py-1.5 rounded-full flex items-center gap-2 border transition-colors ${isLiveSyncOn ? 'bg-green-900/30 text-green-400 border-green-800' : 'bg-slate-800 text-slate-400 border-slate-700'}`}
                            >
                                <span className={`w-2 h-2 rounded-full ${isLiveSyncOn ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`}></span>
                                {isLiveSyncOn ? 'Live Sync ON' : 'Live Sync OFF'}
                            </button>
                        </div>
                    </div>

                    <div className="flex-grow overflow-y-auto pr-1">
                        {displayedContent.length > 0 ? (
                            <div className="space-y-4">
                                {displayedContent.map(({ page, category, stocks }) => (
                                    <div key={`${page}-${category}`} className="bg-slate-900/50 p-3 rounded-lg">
                                        <div className="flex justify-between items-center mb-2">
                                            <h3 className="text-cyan-400 font-semibold text-sm">{category.replace(/_/g, ' ')}</h3>
                                            <div className="ml-2 text-slate-300 text-xs font-medium">{(stocks || []).length}</div>
                                            <div className="flex items-center gap-2">
                                                <div className="flex items-center gap-2">
                                                    <label className="text-slate-300 text-xs">Time</label>
                                                    <select aria-label={`Time filter for ${category}`} value={getTimeFilterFor(category, ['HIGH_POWERED_STOCKS', 'INTRADAY_BOOST', 'DOWNSIDE_LOM_INTRA', 'UPSIDE_LOM_INTRA', 'DAILY_CONTRACTION', 'PRE_MARKET'].includes(category))} onChange={(e) => { writeTimeFilter(category, e.target.value as any); setLocalWatchlist(s => JSON.parse(JSON.stringify(s))); }} className="manual-import-select text-xs bg-slate-700/50 border border-slate-600 rounded px-2 py-1">
                                                        <option value="1_DAY">Today Only (Default Intra)</option>
                                                        <option value="7_DAYS">7 Days (Default Swing)</option>
                                                        <option value="10_DAYS">10 Days</option>
                                                        <option value="15_DAYS">15 Days</option>
                                                        <option value="30_DAYS">30 Days</option>
                                                        <option value="ALL">📂 Show All Data</option>
                                                    </select>
                                                </div>
                                                {/* Delete Selected button */}
                                                {getSelectedInCategory(category).length > 0 && (
                                                    <button title={`Delete ${getSelectedInCategory(category).length} selected`} disabled={!!readLocks()[category]} onClick={() => handleDeleteSelected(page, category)} className={`text-xs px-2 py-1 rounded-md border ${readLocks()[category] ? 'opacity-50 cursor-not-allowed bg-slate-700/30' : 'bg-amber-600 text-white border-amber-500 hover:bg-amber-500'}`}>
                                                        🗑️ Delete Selected ({getSelectedInCategory(category).length})
                                                    </button>
                                                )}
                                                {/* Master Delete button */}
                                                <button title={`Delete all in ${category.replace(/_/g, ' ')}`} disabled={!!readLocks()[category]} onClick={() => handleDeleteAll(page, category)} className={`text-xs p-1 rounded-md border ${readLocks()[category] ? 'opacity-50 cursor-not-allowed bg-slate-700/30' : 'bg-red-700 text-white border-red-600'}`}>
                                                    Delete All
                                                </button>
                                                {/* Lock/Unlock toggle */}
                                                <button title={readLocks()[category] ? 'Unlock category' : 'Lock category'} onClick={() => {
                                                    const current = !!readLocks()[category];
                                                    if (current) {
                                                        // confirm unlock
                                                        if (!window.confirm(`Unlock ${category.replace(/_/g, ' ')}?`)) return;
                                                    }
                                                    writeLock(category, !current);
                                                    // force re-render by updating local state copy
                                                    setLocalWatchlist((s) => JSON.parse(JSON.stringify(s)));
                                                }} className={`text-xs p-1 rounded-md border ${readLocks()[category] ? 'bg-red-700 text-white border-red-600' : 'bg-slate-700/50 text-slate-300 border-slate-600'}`}>
                                                    {readLocks()[category] ? 'Locked' : 'Lock'}
                                                </button>
                                            </div>
                                        </div>
                                        <div className="max-h-[240px] overflow-y-auto border border-slate-700 rounded-md bg-slate-900/60 p-1">
                                            <div className="sticky top-0 bg-slate-800/80 z-10 rounded-t p-2 grid grid-cols-12 gap-2 items-center">
                                                <div className="col-span-1">
                                                    {(() => {
                                                        const filteredStocks = getFilteredStocksInCategory(page, category);
                                                        const allKeys = filteredStocks.map((s: any) => getStockKey(category, s.stockName, s.date));
                                                        const allChecked = allKeys.length > 0 && allKeys.every(k => selectedStocks.has(k));
                                                        return (
                                                            <input
                                                                type="checkbox"
                                                                onChange={() => toggleSelectAllInCategory(page, category)}
                                                                checked={allChecked}
                                                                className="w-4 h-4 accent-cyan-500 cursor-pointer"
                                                                title={`Select All (${allKeys.length} visible)`}
                                                            />
                                                        );
                                                    })()}
                                                </div>

                                                <div className="col-span-4 text-slate-300 font-semibold">Stock</div>
                                                <div className="col-span-4 text-right text-slate-300 font-semibold">Live Price</div>
                                                <div className="col-span-2 text-right text-slate-300 font-semibold">Date</div>
                                                <div className="col-span-1" />
                                            </div>
                                            <div className="space-y-1 p-1">
                                                {stocks.length === 0 && (
                                                    <div className="p-3 text-sm text-slate-500">No stocks</div>
                                                )}
                                                {stocks.length > 0 && (() => {
                                                    // compute filtered view for this rendered block using same rules as useMemo
                                                    const isCategoryIntraday = ['HIGH_POWERED_STOCKS', 'INTRADAY_BOOST', 'DOWNSIDE_LOM_INTRA', 'UPSIDE_LOM_INTRA', 'DAILY_CONTRACTION', 'PRE_MARKET'].includes(category);
                                                    const timeFilter = getTimeFilterFor(category, isCategoryIntraday);
                                                    const now = new Date();
                                                    const inTimeRange = (s: any) => {
                                                        const dtStr = s.addedDate || s.date || null;
                                                        if (!dtStr) return true;
                                                        const dt = new Date(dtStr);
                                                        if (Number.isNaN(dt.getTime())) return true;
                                                        if (timeFilter === 'ALL') return true;
                                                        const diffMs = now.getTime() - dt.getTime();
                                                        const days = diffMs / (1000 * 60 * 60 * 24);
                                                        if (timeFilter === '1_DAY') return days <= 1;
                                                        if (timeFilter === '7_DAYS') return days <= 7;
                                                        if (timeFilter === '10_DAYS') return days <= 10;
                                                        if (timeFilter === '15_DAYS') return days <= 15;
                                                        if (timeFilter === '30_DAYS') return days <= 30;
                                                        return true;
                                                    };
                                                    const filtered = stocks.filter(s => !isStockExpired(s) && s.stockName.toLowerCase().includes((searchTerm || '').toLowerCase()) && inTimeRange(s));
                                                    if (filtered.length === 0) return (<div className="p-3 text-sm text-slate-500">No stocks in this time range</div>);
                                                    return filtered.map((stock: any) => {
                                                        const stockKey = getStockKey(category, stock.stockName, stock.date);
                                                        const isSelected = selectedStocks.has(stockKey);
                                                        return (
                                                            <div key={`${page}-${category}-${stock.stockName}-${stock.date ?? ''}`} className={`grid grid-cols-12 gap-2 items-center p-2 hover:bg-slate-800/40 rounded ${isSelected ? 'bg-cyan-900/20' : ''}`}>
                                                                <div className="col-span-1">
                                                                    <input
                                                                        type="checkbox"
                                                                        checked={isSelected}
                                                                        onChange={() => toggleSelectStock(category, stock.stockName, stock.date)}
                                                                        className="w-4 h-4 accent-cyan-500 cursor-pointer"
                                                                    />
                                                                </div>
                                                                <div className="col-span-4 font-mono text-slate-200 truncate">{stock.stockName}</div>
                                                                <div className="col-span-4 text-right text-slate-300" data-symbol={stock.stockName}>
                                                                    {(() => {
                                                                        // Use live prices from backend API
                                                                        const livePrice = livePrices[stock.stockName];
                                                                        const isMarketOpen = marketStatus?.isOpen !== false;

                                                                        if (livePrice && livePrice.ltp) {
                                                                            // Green when market open, Blue when closed
                                                                            const priceColor = isMarketOpen ? 'text-green-400' : 'text-blue-400';
                                                                            return (
                                                                                <div className="text-right">
                                                                                    <div className={`${priceColor} font-medium`}>₹{livePrice.ltp.toFixed(2)}</div>
                                                                                    <div className="text-xs text-slate-400">
                                                                                        {new Date(livePrice.updatedAt).toLocaleTimeString('en-IN', {
                                                                                            hour: '2-digit',
                                                                                            minute: '2-digit'
                                                                                        })}
                                                                                        {!isMarketOpen && <span className="ml-1 text-blue-400">●</span>}
                                                                                    </div>
                                                                                </div>
                                                                            );
                                                                        }

                                                                        // Fallback to old cached price if live price not available
                                                                        const p = getCachedPrice(stock.stockName);
                                                                        if (!p) return <span className="text-slate-500">—</span>;
                                                                        return (
                                                                            <div className="text-right">
                                                                                <div className="text-slate-400 font-medium">{typeof p.price === 'number' ? p.price.toFixed(2) : '—'}</div>
                                                                                <div className="text-xs text-slate-500">{p.ts ? new Date(p.ts).toLocaleTimeString() : '—'}</div>
                                                                            </div>
                                                                        );
                                                                    })()}
                                                                </div>
                                                                <div className="col-span-2 text-right text-slate-400">{stock.date ? (stock.date.length === 10 ? stock.date : new Date(stock.date).toISOString().slice(0, 10)) : (new Date().toISOString().slice(0, 10))}</div>
                                                                <div className="col-span-1 text-right">
                                                                    <button aria-label={`Delete ${stock.stockName} from ${category}`} onClick={() => handleDelete(page, category, stock.stockName, stock.date)} className="text-slate-400 hover:text-red-400 px-2 py-1 rounded">
                                                                        <TrashIcon className="w-4 h-4" />
                                                                    </button>
                                                                </div>
                                                            </div>
                                                        )
                                                    });
                                                })()}


                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="text-center text-slate-500 pt-10 flex items-center justify-center h-full"><p>No active stocks. Import data to begin monitoring.</p></div>
                        )}
                    </div>
                    <div className="flex-shrink-0 pt-3 mt-3 border-t border-slate-700 flex gap-2">
                        <button type="button" onClick={() => setIsImportModalOpen(true)} className="flex-1 bg-cyan-600 hover:bg-cyan-500 text-white font-bold py-2 px-4 rounded-lg flex items-center justify-center transition-colors text-sm">
                            <UploadIcon className="w-4 h-4 mr-2" />Import Data
                        </button>
                        <SmartPasteImport />
                        <TredcodeSync />
                    </div>
                </div >
            </DashboardCard >
            <ManualImport
                isOpen={isImportModalOpen}
                onClose={() => setIsImportModalOpen(false)}
                onImport={(payload) => onWatchlistUpdate(payload as any)}
            />
            {
                toast && (
                    <div onClick={() => { setImportReportOpen(true); }} className="fixed bottom-4 right-4 cursor-pointer bg-slate-800 border border-slate-700 text-slate-200 px-4 py-2 rounded shadow-lg">
                        {toast}
                    </div>
                )
            }
            {
                isImportReportOpen && importReport && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
                        <div className="absolute inset-0 bg-black/60" onClick={() => setImportReportOpen(false)} />
                        <div className="relative bg-slate-900 rounded-lg border border-slate-700 shadow-lg p-4 w-[min(700px,90vw)]">
                            <div className="flex items-center justify-between mb-2">
                                <div className="text-slate-100 font-semibold">Import Report</div>
                                <button onClick={() => setImportReportOpen(false)} className="px-2 py-1">✕</button>
                            </div>
                            <div className="text-sm text-slate-300 mb-2">{importReport.toastMessage || ''}</div>
                            <div className="text-xs text-slate-200">
                                <div>Total: {importReport.total ?? 0}</div>
                                <div>Added: {importReport.added ?? 0}</div>
                                <div>Skipped: {importReport.skipped ?? 0}</div>
                            </div>
                            <div className="mt-3 text-xs text-slate-300">
                                <div className="font-medium">Per-category added:</div>
                                <ul className="list-disc list-inside">
                                    {Object.entries((importReport.perCategoryAdded || {}) as Record<string, number>).map(([k, v]) => (<li key={k}>{k.replace(/_/g, ' ')}: {v}</li>))}
                                </ul>
                            </div>
                        </div>
                    </div>
                )
            }
        </>
    );
};

export default AnalysisHub;
