
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
};

type WatchlistState = {
  rows: WatchlistRow[];
  setRows: (rows: WatchlistRow[]) => void;
  addRow: (row: WatchlistRow) => void;
  clear: () => void;
};

const STORAGE_KEY = 'chenna-watchlist';

const loadFromStorage = (): WatchlistRow[] => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
};

const persist = (rows: WatchlistRow[]) => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(rows));
};

export const useWatchlistStore = create<WatchlistState>((set) => ({
  rows: loadFromStorage(),
  setRows: (rows) => {
    persist(rows);
    set({ rows });
  },
  addRow: (row) => {
    set((state) => {
      const updated = [...state.rows, row];
      persist(updated);
      return { rows: updated };
    });
  },
  clear: () => {
    persist([]);
    set({ rows: [] });
  },
}));