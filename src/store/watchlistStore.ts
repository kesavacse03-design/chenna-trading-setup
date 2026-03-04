
import { create } from 'zustand';

export type WatchlistRow = {
  symbol: string;
  name: string;
  instrument_token: string;
  exchange: string;
  date: string;
  category: string;
  price: number | null;
  priceSource: string;
  meta?: any; // Tier, Trend10d, etc.
};

type WatchlistState = {
  rows: WatchlistRow[];
  setRows: (rows: WatchlistRow[]) => void;
  addRow: (row: WatchlistRow) => void;
  fetchData: () => Promise<void>;
  clear: () => void;
};

const flattenGrouped = (grouped: any): WatchlistRow[] => {
  const out: WatchlistRow[] = [];
  try {
    for (const page of Object.keys(grouped || {})) {
      const pageObj = (grouped as any)[page] || {};
      for (const cat of Object.keys(pageObj)) {
        const arr = (pageObj as any)[cat] || [];
        for (const it of arr) {
          out.push({
            symbol: it.stockName || it.symbol || '',
            name: it.name || '',
            instrument_token: it.instrument_token || '',
            exchange: it.exchange || '',
            date: it.date || '',
            category: cat,
            price: it.price ?? null,
            priceSource: it.priceSource || '',
            meta: it.meta
          });
        }
      }
    }
  } catch (_) { }
  return out;
};

export const useWatchlistStore = create<WatchlistState>((set) => ({
  // Start with empty state - no localStorage loading
  rows: [],

  setRows: (rows) => {
    console.debug('[watchlistStore] setRows called, count=', Array.isArray(rows) ? rows.length : 0);
    // No localStorage persistence - database is the only source of truth
    set({ rows });
  },

  addRow: (row) => {
    set((state) => {
      const updated = [...state.rows, row];
      // No localStorage persistence
      return { rows: updated };
    });
  },

  fetchData: async () => {
    try {
      console.log('[watchlistStore] Fetching watchlist from database...');
      const { getWatchlist } = await import('../api');
      const grouped = await getWatchlist();
      const flattened = flattenGrouped(grouped);
      console.log(`[watchlistStore] ✅ Loaded ${flattened.length} rows from database`);
      set({ rows: flattened });
    } catch (e) {
      console.error('[watchlistStore] Failed to fetch watchlist from database:', e);
    }
  },

  clear: () => {
    // No localStorage clearing - just reset state
    set({ rows: [] });
  },
}));