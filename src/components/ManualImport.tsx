// src/components/ManualImport.tsx
import { useEffect, useMemo, useRef, useState } from 'react';
import { loadInstruments, suggestSymbols, suggestBuckets, Instrument } from '../lib/instruments';
import { useWatchlistStore } from '../store/watchlistStore';
import * as api from '../api';
import { runSyncQueue } from '../utils/sync';
import { normalizeAndMapCategory, attachCategoryMetaToItem } from '../utils/categoryMap';
import * as storage from '../utils/storage';
import './ManualImport.css';

export type WatchlistRow = {
  symbol: string;
  date: string; // DD-MM-YYYY
  category: 'OPTIONS' | 'FUTURES' | string;
  // internal flags
  validated?: boolean;
  error?: string | null;
};

export const STORAGE_KEY = 'cts:watchlist:manual-import:v1';
export interface ManualImportProps {
  isOpen?: boolean;
  onClose?: () => void;
  onImport?: (rows: WatchlistRow[]) => Promise<void> | void;
}

const defaultRow = (): WatchlistRow => ({
  symbol: '',
  date: new Date().toLocaleDateString('en-GB').replace(/\//g, '-'), // DD-MM-YYYY
  category: '',
  validated: false,
  error: null,
});

function validateSymbol(sym: string) {
  if (!sym) return 'Required';
  // uppercase letters and numbers only, no spaces
  // require letters-only and up to 12 chars to match instrument filtering
  if (!/^[A-Z]{1,12}$/.test(sym)) return 'Invalid symbol';
  return null;
}
function validateDate(d: string) {
  // Allow empty (we'll auto-fill on import). Accept either DD-MM-YYYY (storage) or YYYY-MM-DD (date input).
  if (!d) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(d)) {
    const [yyyy, mm, dd] = d.split('-').map(Number);
    const dt = new Date(yyyy, mm - 1, dd);
    if (dt.getFullYear() !== yyyy || dt.getMonth() !== mm - 1 || dt.getDate() !== dd) return 'Invalid date';
    return null;
  }
  if (/^\d{2}-\d{2}-\d{4}$/.test(d)) {
    const [dd, mm, yyyy] = d.split('-').map(Number);
    const dt = new Date(yyyy, mm - 1, dd);
    if (dt.getFullYear() !== yyyy || dt.getMonth() !== mm - 1 || dt.getDate() !== dd) return 'Invalid date';
    return null;
  }
  return 'Invalid date';
}

// formatDateToStorage removed - dates are normalized to ISO yyyy-mm-dd on import

// Note: manual import rows are intentionally not auto-restored when modal opens.

export default function ManualImport(props: ManualImportProps) {
  // normalized unique category options - keep in sync with AnalysisHub lists
  const categoryOptions: string[] = [
    'HIGH POWERED STOCKS', 'INTRADAY BOOST', 'DOWNSIDE LOM INTRA', 'UPSIDE LOM INTRA', 'DAILY CONTRACTION', 'PRE MARKET',
    'DOWNSIDE LOM SWING', 'UPSIDE LOM SWING', 'MULTI RESISTANCE BO', 'MULTI SUPPORT BO',
    'SHORT TERM SWING BO – UP', 'SHORT TERM SWING BO – DOWN', 'LONG TERM SWING BO – UP', 'LONG TERM SWING BO – DOWN'
  ];
  // build mapping of human label -> canonical key for the select options
  const categoryEntries = useMemo(() => {
    return categoryOptions.map(label => {
      const { categoryKey } = normalizeAndMapCategory(label);
      return { label, key: categoryKey };
    });
  }, [categoryOptions]);
  const { isOpen = false, onClose } = props;
  // Start with zero rows by default; users can Add Row to begin
  const [rows, setRows] = useState<WatchlistRow[]>(() => []);
  // File import preview state
  type ParsedFileRow = {
    id: string;
    symbol: string;
    date: string; // yyyy-mm-dd
    rawCategory: string;
    mappedCategoryKey: string | null;
    status: 'READY' | 'UNMAPPED' | 'INVALID' | 'DUPLICATE';
    selected: boolean;
    error?: string | null;
  };
  const [parsedRows, setParsedRows] = useState<ParsedFileRow[]>([]);
  const [isParsing, setIsParsing] = useState(false);
  const [parseProgress, setParseProgress] = useState<number>(0);
  const firstInputRef = useRef<HTMLInputElement | null>(null);
  const [instruments, setInstruments] = useState<Instrument[]>([]);
  const [suggestions, setSuggestions] = useState<Record<number, Instrument[]>>({});
  const [autocorrected, setAutocorrected] = useState<Record<number, string>>({});
  const selectingRef = useRef(false); // set true while clicking a suggestion to avoid blur-autocorrect
  const rowContainerRefs = useRef<Record<number, HTMLDivElement | null>>({});
  const [activeSuggestion, setActiveSuggestion] = useState<Record<number, number>>({});
  const [flipAbove] = useState<Record<number, boolean>>({});
  const announcerRef = useRef<HTMLDivElement | null>(null);
  const dropdownRefs = useRef<Record<number, HTMLDivElement | null>>({});
  const [suggestionLayout, setSuggestionLayout] = useState<Record<number, { height: number; useScroll: boolean; visibleCount: number; moreCount: number; position: 'above' | 'below' }>>({});
  const [skippedRows, setSkippedRows] = useState<string[]>([]);
  const [showMapPanel, setShowMapPanel] = useState(false);
  const [mapSelections, setMapSelections] = useState<Record<string, string>>({});
  // modal sizing / expanded state
  const LOCAL_MODAL_KEY = 'cts:watchlist:manual-import:modal';
  const [expanded, setExpanded] = useState(false);
  const [modalSize, setModalSize] = useState<{ w: number, h: number }>({ w: 800, h: 520 });
  const resizingRef = useRef<{ startX: number; startY: number; startW: number; startH: number } | null>(null);

  // Persisted mapping hints for category variants
  const HINTS_KEY = 'cts:manualimport:category-hints';
  const normalizeForHint = (s: string) => (s || '')
    .toString().trim().toLowerCase()
    .replace(/[–—−]/g, '-')
    .replace(/[^a-z0-9\- ]+/g, '')
    .replace(/\s+/g, ' ')
    .replace(/\s?-\s?/g, ' - ')
    .trim();
  const loadHints = (): Record<string, string> => {
    try { const raw = localStorage.getItem(HINTS_KEY); return raw ? JSON.parse(raw) : {}; } catch { return {}; }
  };
  const saveHints = (h: Record<string, string>) => { try { localStorage.setItem(HINTS_KEY, JSON.stringify(h)); } catch { } };

  // compute primary equity instruments map and set for fast lookup
  const { symbolSet } = (() => {
    // primary heuristic: letters-only, allow up to 12 chars (match helper)
    const isPrimary = (s: string) => /^[A-Z]{1,12}$/.test(s);
    const list = instruments.filter(i => i && i.symbol && isPrimary(i.symbol));
    const map = new Map<string, Instrument>();
    for (const it of list) {
      const existing = map.get(it.symbol);
      // prefer NSE if available (generator already sets exchange when produced)
      if (!existing) map.set(it.symbol, it);
      else if ((existing.exchange || '').toUpperCase() !== 'NSE' && (it.exchange || '').toUpperCase() === 'NSE') {
        map.set(it.symbol, it);
      }
    }
    return { symbolSet: new Set(Array.from(map.keys())) };
  })();

  useEffect(() => {
    // focus first input when modal opens
    if (isOpen) {
      setTimeout(() => firstInputRef.current?.focus(), 40);
    }
    // load instruments once when modal opens
    if (isOpen) {
      loadInstruments().then(list => setInstruments(list)).catch(() => setInstruments([]));
    }
    // load modal size/expanded from localStorage
    try {
      const raw = localStorage.getItem(LOCAL_MODAL_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') {
          if (parsed.expanded) setExpanded(true);
          if (parsed.w && parsed.h) setModalSize({ w: parsed.w, h: parsed.h });
        }
      }
      // Do not auto-restore saved rows when opening - open fresh by default
      // If desired later, the user can paste/upload or use Add Row
    } catch (_) {
      // ignore localStorage parse errors
    }
  }, [isOpen]);

  // listen for a restore event triggered by Undo
  useEffect(() => {
    const onRestore = (e: any) => {
      const rowsToRestore = (e?.detail?.rows) || [];
      setRows(rowsToRestore.map((r: any) => ({ ...r, validated: false, error: null })));
      setTimeout(() => firstInputRef.current?.focus(), 40);
    };
    window.addEventListener('cts:manualimport:restore', onRestore as any);
    return () => window.removeEventListener('cts:manualimport:restore', onRestore as any);
  }, []);

  // Manual import intentionally does not auto-persist rows to localStorage to open fresh each time.

  // keyboard shortcuts: Esc to close (unless focused in input), Ctrl+Shift+M to toggle expand
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        // if focus is inside an input (user editing), don't close
        const active = document.activeElement as HTMLElement | null;
        if (active) {
          const tag = active.tagName.toLowerCase();
          if (tag === 'input' || tag === 'textarea' || active.isContentEditable) return;
        }
        onClose?.();
      }
      if (e.key === 'M' && e.ctrlKey && e.shiftKey) {
        e.preventDefault();
        setExpanded(v => !v);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  // resize handlers
  useEffect(() => {
    const onMove = (ev: MouseEvent) => {
      if (!resizingRef.current) return;
      const { startX, startY, startW, startH } = resizingRef.current;
      const dx = ev.clientX - startX;
      const dy = ev.clientY - startY;
      const minW = 520, minH = 320;
      const maxW = Math.max(window.innerWidth - 40, minW);
      const maxH = Math.max(window.innerHeight - 40, minH);
      let nw = Math.min(Math.max(startW + dx, minW), maxW);
      let nh = Math.min(Math.max(startH + dy, minH), maxH);
      setModalSize({ w: Math.round(nw), h: Math.round(nh) });
    };
    const onUp = () => { resizingRef.current = null; document.body.style.cursor = ''; };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
  }, []);

  const allValid = useMemo(() => {
    for (const r of rows) {
      const sym = (r.symbol || '').toUpperCase().trim();
      const sErr = symbolSet.has(sym) ? null : 'Unknown symbol';
      const dErr = validateDate(r.date || '');
      if (sErr || dErr) return false;
    }
    return rows.length > 0;
  }, [rows, symbolSet]);

  const setRow = (idx: number, patch: Partial<WatchlistRow>) => {
    setRows(prev => {
      const copy = prev.slice();
      copy[idx] = { ...copy[idx], ...patch };
      // auto-validate on change
      const sym = (copy[idx].symbol || '').toUpperCase().trim();
      copy[idx].symbol = sym;
      const sErr = symbolSet.has(sym) ? null : 'Unknown symbol';
      const dErr = validateDate(copy[idx].date || '');
      copy[idx].error = sErr ?? dErr ?? null;
      copy[idx].validated = !copy[idx].error;
      // clear autocorrect badge if symbol was manually edited to a known symbol
      setAutocorrected(prev => ({ ...prev, [idx]: symbolSet.has(sym) ? '' : (prev[idx] || '') }));
      return copy;
    });
  };

  const addRow = (r?: Partial<WatchlistRow>) => {
    setRows(prev => [...prev, { ...defaultRow(), ...(r ?? {}) }]);
  };
  const deleteRow = (idx: number) => {
    setRows(prev => prev.filter((_, i) => i !== idx));
  };

  const handleImport = async () => {
    // validate all rows
    // On import, auto-fill empty dates with today's date (DD-MM-YYYY)
    const today = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    const todayStr = `${pad(today.getDate())}-${pad(today.getMonth() + 1)}-${today.getFullYear()}`;
    const checked = rows.map(r => {
      const symbol = (r.symbol || '').toUpperCase().trim();
      // if date is empty, fill with today's date for import
      const dateRaw = (r.date || '').trim() || todayStr;
      const sErr = validateSymbol(symbol);
      const dErr = dateRaw ? validateDate(dateRaw) : null;
      return {
        ...r,
        symbol,
        date: dateRaw,
        validated: !(sErr || dErr),
        error: sErr ?? dErr ?? null,
      };
    });
    setRows(checked);
    const invalid = checked.find(r => !r.validated);
    if (invalid) {
      // focus first invalid row's symbol input (best-effort)
      const idx = checked.findIndex(r => !r.validated);
      const el = document.querySelectorAll<HTMLInputElement>('[data-manual-symbol]')[idx];
      el?.focus();
      return;
    }

    // Persist valid rows by grouping by category and invoking external handler (AnalysisHub -> App -> api.importWatchlist)
    const addRowToStore = useWatchlistStore.getState().addRow;



    const skipped: string[] = [];
    // Use the loaded watchlist store (from DB) for duplicate checking
    const existingRows = useWatchlistStore.getState().rows;
    const todayISO = new Date().toISOString().slice(0, 10);

    // iterate validated rows and POST per-row
    for (const r of checked) {
      if (!r.validated) {
        skipped.push(`${r.symbol || '(empty)'} - invalid symbol`);
        continue;
      }
      const symbol = (r.symbol || '').toUpperCase().trim();
      const { categoryKey: catKey, categoryRaw } = normalizeAndMapCategory(r.category || '');
      // normalize date to yyyy-mm-dd
      let dateISO = (r.date || '').trim();
      if (/^\d{2}-\d{2}-\d{4}$/.test(dateISO)) {
        const [dd, mm, yyyy] = dateISO.split('-');
        dateISO = `${yyyy}-${mm}-${dd}`;
      } else if (!/^\d{4}-\d{2}-\d{2}$/.test(dateISO)) {
        dateISO = todayISO;
      }

      // prevent duplicate by checking against loaded database stocks
      const already = existingRows.find(s =>
        (s.symbol === symbol) &&
        ((s.date || '').startsWith(dateISO)) &&
        (s.category === catKey)
      );

      if (already) {
        try { (window as any).dispatchEvent(new CustomEvent('cts:toast', { detail: { message: `Duplicate entry — SKIP: ${symbol} (${dateISO} / ${catKey})`, kind: 'info' } })); } catch (_) { }
        continue;
      }

      try {
        // prepare payload and ensure category metadata is attached before POST
        let newStock: any = { symbol, date: dateISO, category: catKey };
        newStock = attachCategoryMetaToItem(newStock);
        const created = await api.createStock(newStock);
        // ensure created carries categoryRaw/categoryKey for mirror
        // stored.push({ ...created, categoryRaw: newStock.categoryRaw || categoryRaw, categoryKey: newStock.categoryKey || catKey });
        // update local UI store
        try { addRowToStore({ symbol: created.stockName || symbol, name: (instruments.find(x => x.symbol === symbol)?.name) || symbol, instrument_token: '', exchange: (instruments.find(x => x.symbol === symbol)?.exchange) || '', date: created.date || dateISO, category: catKey, price: null, priceSource: 'manual' }); } catch (_) { }
        // Also persist into grouped watchlist so AnalysisHub reflects immediately
        try {
          const wl = storage.getWatchlist();
          let targetPage: string | null = null;
          for (const p of Object.keys(wl)) {
            if (Object.prototype.hasOwnProperty.call(wl[p], catKey)) { targetPage = p; break; }
          }
          if (!targetPage) targetPage = Object.keys(wl)[0];
          wl[targetPage!][catKey] = wl[targetPage!][catKey] || [];
          const exists = wl[targetPage!][catKey].some((s: any) => s.stockName === symbol && ((s.date || '') === dateISO));
          if (!exists) wl[targetPage!][catKey].push({ stockName: created.stockName || symbol, date: created.date || dateISO, price: typeof created.price === 'number' ? created.price : undefined, addedDate: created.addedDate || new Date().toISOString(), expires_at: created.expires_at || new Date(new Date().getTime() + 24 * 60 * 60 * 1000).toISOString(), status: 'watching' });
          storage.setWatchlist(wl);
        } catch (_) { }
      } catch (err: any) {
        if (err && err.code === 'DUPLICATE') {
          try { (window as any).dispatchEvent(new CustomEvent('cts:toast', { detail: { message: `Duplicate entry — SKIP: ${symbol} (${dateISO} / ${catKey})`, kind: 'info' } })); } catch (_) { }
          continue;
        }
        // Gun-shot solution: Do NOT save locally if backend fails. Show error.
        console.error('Import failed for', symbol, err);
        try { (window as any).dispatchEvent(new CustomEvent('cts:toast', { detail: { message: `Failed to save ${symbol}: ${err.message || 'Backend Error'}`, kind: 'error' } })); } catch (_) { }
      }
    }

    // persist mirror to localStorage
    // try { localStorage.setItem('cts_stocks', JSON.stringify(stored)); } catch (_) { }
    // run sync queue to attempt pending items
    runSyncQueue((msg, k) => { try { (window as any).dispatchEvent(new CustomEvent('cts:toast', { detail: { message: msg, kind: k } })); } catch (_) { } });

    if (skipped.length > 0) setSkippedRows(skipped);

    // Build an import summary for system log and undo
    try {
      const importedSummary: string[] = [];
      // determine newly imported entries by comparing stored entries
      for (const r of checked) {
        const symbol = (r.symbol || '').toUpperCase().trim();
        const { categoryKey: catKey } = normalizeAndMapCategory(r.category || '');
        importedSummary.push(`${symbol} -> ${catKey}`);
      }
      const summaryMsg = `Imported: ${importedSummary.join('; ')}`;
      // prepend to system notifications so it shows in System Log
      try {
        const notifs = storage.getNotifications();
        const newN = { id: Date.now(), timestamp: new Date(), message: summaryMsg, type: 'info' as const };
        storage.setNotifications([newN, ...(notifs || [])].slice(0, 100));
        // notify App to refresh notifications
        try { window.dispatchEvent(new CustomEvent('cts:notifications:changed')); } catch (_) { }
      } catch (_) { }

      // cache last import for possible Undo; keep original rows to restore modal
      try {
        (window as any).__cts_last_import = { imported: checked.map(r => ({ symbol: r.symbol, date: r.date, category: r.category })), originalRows: rows };
        (window as any).__cts_undo_last_import = async function undoLastImport() {
          try {
            const ctx = (window as any).__cts_last_import;
            if (!ctx || !ctx.imported) return;
            // remove imported entries from mirror
            const raw = localStorage.getItem('cts_stocks');
            const arr = raw ? JSON.parse(raw) : [];
            const remaining = arr.filter((s: any) => !ctx.imported.some((x: any) => x.symbol === (s.stockName || s.symbol) && ((x.date || '') === (s.date || ''))));
            try { localStorage.setItem('cts_stocks', JSON.stringify(remaining)); } catch (_) { }
            // remove from grouped watchlist
            try {
              const wl = storage.getWatchlist();
              for (const im of ctx.imported) {
                const { categoryKey } = normalizeAndMapCategory(im.category || '');
                for (const p of Object.keys(wl)) {
                  if (Object.prototype.hasOwnProperty.call(wl[p], categoryKey)) {
                    wl[p][categoryKey] = (wl[p][categoryKey] || []).filter((s: any) => !(s.stockName === im.symbol && ((s.date || '') === (im.date || ''))));
                  }
                }
              }
              storage.setWatchlist(wl);
              // trigger UI refresh
              window.dispatchEvent(new CustomEvent('cts:watchlist:imported', { detail: { count: remaining.length } }));
            } catch (_) { }
            // restore modal rows
            try { window.dispatchEvent(new CustomEvent('cts:manualimport:restore', { detail: { rows: ctx.originalRows || [] } })); } catch (_) { }
            // clear cache
            (window as any).__cts_last_import = null;
            try { window.dispatchEvent(new CustomEvent('cts:toast', { detail: { message: 'Import undone', kind: 'info' } })); } catch (_) { }
          } catch (e) { console.warn('Undo failed', e); }
        };
      } catch (_) { }

      // dispatch event and console summary (best-effort)
      try {
        const rawAfter = localStorage.getItem('cts_stocks');
        const arrAfter = rawAfter ? JSON.parse(rawAfter) : [];
        window.dispatchEvent(new CustomEvent('cts:watchlist:imported', { detail: { count: arrAfter.length } }));
        console.log(`Imported (mirror) ${arrAfter.length} stocks in local mirror`);
      } catch (_) { }

    } catch (e) { console.warn('Import summary step failed', e); }

    // Reset modal to fresh empty panel (do not auto-close)
    setRows([]);

    // show small toast with undo hint
    try { window.dispatchEvent(new CustomEvent('cts:toast', { detail: { message: `Imported ${checked.length} rows — [Undo]`, kind: 'success' } })); } catch (_) { }
  };

  const handlePaste = (text: string) => {
    // Accept lines: SYMBOL[,|<TAB>]DD-MM-YYYY[,|<TAB>]CATEGORY
    const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    const parsed: WatchlistRow[] = [];
    for (const line of lines) {
      const parts = line.split(/\t|,/).map(p => p.trim());
      const sym = (parts[0] || '').toUpperCase();
      const date = parts[1] || (new Date().toLocaleDateString('en-GB').replace(/\//g, '-'));
      const category = (parts[2] || '').toUpperCase();
      parsed.push({
        symbol: sym,
        date,
        category,
        validated: false,
        error: null,
      });
    }
    if (parsed.length) {
      setRows(prev => [...prev, ...parsed]);
    }
  };

  // levenshtein scoring is provided by the instruments helper when needed

  const handleSymbolBlur = (idx: number, value: string) => {
    const sym = (value || '').toUpperCase().trim();
    if (!sym) return;
    if (symbolSet.has(sym)) {
      // already valid
      setAutocorrected(prev => ({ ...prev, [idx]: '' }));
      return;
    }
    // use buckets: prefer prefix/name matches for autocorrect, fallback to fuzzy
    const buckets = suggestBuckets(sym, instruments, 8);
    if (buckets.symbolPrefix && buckets.symbolPrefix.length > 0) {
      const bestPref = buckets.symbolPrefix[0];
      setRow(idx, { symbol: bestPref.symbol });
      setAutocorrected(prev => ({ ...prev, [idx]: bestPref.symbol }));
      return;
    }
    if (buckets.namePrefix && buckets.namePrefix.length > 0) {
      const bestPref = buckets.namePrefix[0];
      setRow(idx, { symbol: bestPref.symbol });
      setAutocorrected(prev => ({ ...prev, [idx]: bestPref.symbol }));
      return;
    }
    // no prefix matches; try fuzzy fallback
    if (buckets.fuzzy && buckets.fuzzy.length > 0) {
      const bestF = buckets.fuzzy[0];
      // only autocorrect from fuzzy if within threshold (the helper already ensures <=2)
      setRow(idx, { symbol: bestF.symbol });
      setAutocorrected(prev => ({ ...prev, [idx]: bestF.symbol }));
      return;
    }
    // leave value but mark error (setRow will mark Unknown symbol)
    setRow(idx, { symbol: sym });
  };

  const handleFileUpload = async (file: File | null) => {
    if (!file) return;
    setIsParsing(true);
    setParseProgress(0);
    const txt = await file.text();
    // parse asynchronously to avoid blocking UI for large files
    setTimeout(() => {
      parseFileText(txt);
    }, 0);
  };

  function mapCategoryToExistingKey(rawCat: string): string | null {
    const { categoryKey } = normalizeAndMapCategory(rawCat || '');
    // ensure this key exists in current watchlist structure
    const wl = storage.getWatchlist();
    for (const p of Object.keys(wl)) {
      if (Object.prototype.hasOwnProperty.call(wl[p], categoryKey)) return categoryKey;
    }
    return null;
  }

  function toISODate(input: string): string {
    if (!input) return new Date().toISOString().slice(0, 10);
    const s = input.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
    if (/^\d{2}-\d{2}-\d{4}$/.test(s)) {
      const [d, m, y] = s.split('-');
      return `${y}-${m}-${d}`;
    }
    // fallback: today
    return new Date().toISOString().slice(0, 10);
  }

  function parseFileText(txt: string) {
    try {
      const lines = txt.split(/\r?\n/);
      const out: ParsedFileRow[] = [];
      // Use DB data for duplicate check
      const existingRows = useWatchlistStore.getState().rows;
      let i = 0;
      for (const rawLine of lines) {
        i++;
        setParseProgress(Math.round((i / Math.max(1, lines.length)) * 100));
        const line = rawLine.trim();
        if (!line) continue;
        if (line.startsWith('#')) continue; // comment
        // strip outer surrounding quotes if entire line is quoted
        let workLine = line;
        if (workLine.startsWith('"') && workLine.endsWith('"')) {
          workLine = workLine.slice(1, -1).trim();
        }
        const parts = workLine.split(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/).map(p => p.replace(/^\s*"|"\s*$/g, '').trim());
        const sym = (parts[0] || '').toUpperCase();
        const dateRaw = parts[1] ? parts[1].trim() : '';
        const catRaw = parts[2] ? parts[2].trim() : '';
        if (!sym) continue;
        const dateISO = toISODate(dateRaw);
        const { mappedKey } = smartMapCategory(catRaw);
        const dupKey = mappedKey || normalizeAndMapCategory(catRaw).categoryKey || catRaw;

        const isDuplicate = existingRows.some((s: any) =>
          (s.symbol === sym) &&
          ((s.date || '').startsWith(dateISO)) &&
          (s.category === dupKey)
        );
        const status: ParsedFileRow['status'] = !/^[A-Z0-9]{1,12}$/.test(sym) ? 'INVALID' : (mappedKey ? (isDuplicate ? 'DUPLICATE' : 'READY') : 'UNMAPPED');
        out.push({ id: `${Date.now()}_${i}_${sym}`, symbol: sym, date: dateISO, rawCategory: catRaw, mappedCategoryKey: mappedKey, status, selected: status === 'READY', error: status === 'INVALID' ? 'Invalid symbol' : undefined });
      }
      setParsedRows(out);
    } catch (e) {
      console.warn('parseFileText failed', e);
    } finally {
      setIsParsing(false);
      setParseProgress(100);
      setTimeout(() => setParseProgress(0), 400);
    }
  }

  // Smart category mapper using hints and forgiving rules
  function smartMapCategory(rawCat: string): { mappedKey: string | null; matchedLabel?: string } {
    const hints = loadHints();
    const norm = normalizeForHint(rawCat || '');
    if (hints[norm]) {
      const hintedKey = hints[norm];
      const wl = storage.getWatchlist();
      for (const p of Object.keys(wl)) {
        if (Object.prototype.hasOwnProperty.call(wl[p], hintedKey)) return { mappedKey: hintedKey };
      }
    }
    // exact label
    const exact = categoryOptions.find(l => (l || '').toLowerCase() === (rawCat || '').toLowerCase());
    if (exact) return { mappedKey: normalizeAndMapCategory(exact).categoryKey, matchedLabel: exact };
    // normalized label equality
    const normMatch = categoryOptions.find(l => normalizeForHint(l) === norm);
    if (normMatch) return { mappedKey: normalizeAndMapCategory(normMatch).categoryKey, matchedLabel: normMatch };
    // canonical mapping
    const canonical = mapCategoryToExistingKey(rawCat || '');
    if (canonical) return { mappedKey: canonical };
    // forgiving contains
    const contain = categoryOptions.find(l => normalizeForHint(l).includes(norm) || norm.includes(normalizeForHint(l)));
    if (contain) return { mappedKey: normalizeAndMapCategory(contain).categoryKey, matchedLabel: contain };
    return { mappedKey: null };
  }

  // Unmapped unique categories for bulk mapping UI
  const unmappedCategories = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of parsedRows) {
      if (!r.mappedCategoryKey) {
        const raw = r.rawCategory || '';
        map.set(raw, (map.get(raw) || 0) + 1);
      }
    }
    return Array.from(map.entries()).map(([raw, count]) => ({ raw, count }));
  }, [parsedRows]);

  async function importSelectedFromPreview() {
    // gather selected and valid rows
    const toImportPre = parsedRows.filter(r => r.selected && r.status === 'READY');
    if (!toImportPre.length) {
      try { window.dispatchEvent(new CustomEvent('cts:toast', { detail: { message: 'No valid rows selected', kind: 'error' } })); } catch (_) { }
      return;
    }

    // create a timestamped backup of mirror before modifying
    const backupKey = `cts_stocks_backup_${new Date().toISOString()}`;
    const rawMirror = localStorage.getItem('cts_stocks');
    try { if (rawMirror) localStorage.setItem(backupKey, rawMirror); } catch (_) { }

    // collect a system log message
    const summaryParts: string[] = [];
    const duplicatesFound: string[] = [];

    // optimistic UI: add to grouped watchlist and mirror
    const mirror = rawMirror ? JSON.parse(rawMirror) : [];
    const wl = storage.getWatchlist();
    // Re-check duplicates against the live mirror just before import
    const toImport: typeof toImportPre = [];
    for (const r of toImportPre) {
      const mappedKey = r.mappedCategoryKey || mapCategoryToExistingKey(r.rawCategory || '') || r.rawCategory || '';
      const existsLive = mirror.some((s: any) => (s.stockName === r.symbol) && ((s.date || '') === (r.date || '')) && ((s.categoryKey || s.category || s.categoryRaw || '') === mappedKey));
      if (existsLive) {
        duplicatesFound.push(`${r.symbol} (${r.date} / ${mappedKey})`);
      } else {
        toImport.push(r);
      }
    }

    for (const r of toImport) {
      const mappedKey = r.mappedCategoryKey || mapCategoryToExistingKey(r.rawCategory || '') || r.rawCategory || '';
      summaryParts.push(`${r.symbol} -> ${mappedKey}`);

      // 🔫 GUN SHOT FIX: Call backend API to save to database
      try {
        await api.createStock({
          symbol: r.symbol,
          date: r.date,
          category: mappedKey
        });
        console.log(`[FileImport] ✅ Saved ${r.symbol} to database`);
      } catch (err: any) {
        console.error(`[FileImport] ❌ Failed to save ${r.symbol}:`, err);
        if (err.code !== 'DUPLICATE') {
          // Show error for non-duplicate failures
          try {
            window.dispatchEvent(new CustomEvent('cts:toast', {
              detail: { message: `Failed to save ${r.symbol}: ${err.message}`, kind: 'error' }
            }));
          } catch (_) { }
        }
      }
    }

    // build import summary details
    try {
      const totalSelected = parsedRows.filter(r => r.selected).length;
      const importedCount = toImport.length;
      const skippedCount = totalSelected - importedCount;
      const perCategoryAdded: Record<string, number> = {};
      const perCategorySkipped: Record<string, number> = {};
      for (const added of toImport) {
        const k = added.mappedCategoryKey || mapCategoryToExistingKey(added.rawCategory || '') || added.rawCategory || 'UNMAPPED';
        perCategoryAdded[k] = (perCategoryAdded[k] || 0) + 1;
      }
      for (const d of duplicatesFound) {
        // duplicatesFound entries like 'SYM (date / CAT)'
        const m = d.match(/\(([^)]+) \/ ([^)]+)\)$/);
        const cat = m ? m[2] : 'UNKNOWN';
        perCategorySkipped[cat] = (perCategorySkipped[cat] || 0) + 1;
      }
      const toastMessage = `Imported ${totalSelected} rows — ${importedCount} added, ${skippedCount} skipped (duplicates).`;
      try { window.dispatchEvent(new CustomEvent('cts:import:summary', { detail: { total: totalSelected, added: importedCount, skipped: skippedCount, perCategoryAdded, perCategorySkipped, toastMessage } })); } catch (_) { }
      // write system log with per-category breakdown
      try {
        const parts: string[] = [];
        for (const k of Object.keys(perCategoryAdded)) parts.push(`${k}: ${perCategoryAdded[k]}`);
        const summaryMsg = `Imported ${importedCount} rows — ${parts.join('; ')}`;
        const notifs = storage.getNotifications();
        const newN = { id: Date.now(), timestamp: new Date(), message: summaryMsg, type: 'info' as const };
        storage.setNotifications([newN, ...(notifs || [])].slice(0, 100));
        try { window.dispatchEvent(new CustomEvent('cts:notifications:changed')); } catch (_) { }
      } catch (_) { }
    } catch (e) { console.warn('Import summary build failed', e); }

    // persist mirror and watchlist
    try { localStorage.setItem('cts_stocks', JSON.stringify(mirror)); } catch (_) { }
    try { storage.setWatchlist(wl); } catch (_) { }

    // Ensure Active Watchlist in-memory store is updated so UI reflects imported items immediately
    try {
      const addRowToStore = useWatchlistStore.getState().addRow;
      for (const added of toImport) {
        const mappedKey = added.mappedCategoryKey || mapCategoryToExistingKey(added.rawCategory || '') || added.rawCategory || '';
        try {
          addRowToStore({
            symbol: added.symbol,
            name: (instruments.find(x => x.symbol === added.symbol)?.name) || added.symbol,
            instrument_token: '',
            exchange: (instruments.find(x => x.symbol === added.symbol)?.exchange) || '',
            date: added.date,
            category: mappedKey,
            price: null,
            priceSource: 'manual'
          });
        } catch (_) { /* best-effort - ignore failures */ }
      }
    } catch (_) { }

    // write system log notification
    try {
      const summaryMsg = `Imported: ${summaryParts.join('; ')}`;
      const notifs = storage.getNotifications();
      const newN = { id: Date.now(), timestamp: new Date(), message: summaryMsg, type: 'info' as const };
      storage.setNotifications([newN, ...(notifs || [])].slice(0, 100));
      try { window.dispatchEvent(new CustomEvent('cts:notifications:changed')); } catch (_) { }
    } catch (_) { }

    // cache undo context
    try {
      (window as any).__cts_last_import = { imported: toImport.map(r => ({ symbol: r.symbol, date: r.date, category: r.mappedCategoryKey })), originalRows: rows, backupKey };
      (window as any).__cts_undo_last_import = async function undoLastImport() {
        try {
          const ctx = (window as any).__cts_last_import;
          if (!ctx) return;
          const raw = localStorage.getItem('cts_stocks');
          const arr = raw ? JSON.parse(raw) : [];
          const remaining = arr.filter((s: any) => !ctx.imported.some((x: any) => x.symbol === (s.stockName || s.symbol) && ((x.date || '') === (s.date || '')) && ((x.categoryKey || s.category || s.categoryRaw || '') === (x.category || x.categoryKey))));
          try { localStorage.setItem('cts_stocks', JSON.stringify(remaining)); } catch (_) { }
          // restore backup if available
          if (ctx.backupKey) {
            const b = localStorage.getItem(ctx.backupKey);
            if (b) try { localStorage.setItem('cts_stocks', b); } catch (_) { }
          }
          // remove from grouped watchlist
          try {
            const w = storage.getWatchlist();
            for (const im of ctx.imported) {
              const key = im.category || '';
              for (const p of Object.keys(w)) {
                if (Object.prototype.hasOwnProperty.call(w[p], key)) {
                  w[p][key] = (w[p][key] || []).filter((s: any) => !(s.stockName === im.symbol && ((s.date || '') === (im.date || ''))));
                }
              }
            }
            storage.setWatchlist(w);
            window.dispatchEvent(new CustomEvent('cts:watchlist:imported', { detail: { count: remaining.length } }));
          } catch (_) { }
          // restore modal rows
          try { window.dispatchEvent(new CustomEvent('cts:manualimport:restore', { detail: { rows: ctx.originalRows || [] } })); } catch (_) { }
          (window as any).__cts_last_import = null;
          try { window.dispatchEvent(new CustomEvent('cts:toast', { detail: { message: 'Import undone', kind: 'info' } })); } catch (_) { }
        } catch (e) { console.warn('Undo failed', e); }
      };
    } catch (_) { }

    // reset modal and parsed preview
    setRows([]);
    setParsedRows([]);

    // notify UI
    try { window.dispatchEvent(new CustomEvent('cts:watchlist:imported', { detail: { count: mirror.length } })); } catch (_) { }
    // Additional safety: ask backend for authoritative stocks and refresh local watchlist storage
    try {
      (async () => {
        try {
          const backend = (window as any).__CTS_API_BASE || (import.meta as any).env?.VITE_API_BASE || '';
          if (backend) {
            const stocks = await api.getStocks();
            // build canonical watchlist from stocks
            // let AnalysisHub handle mapping; but ensure mirror is up-to-date
            try { localStorage.setItem('cts_stocks', JSON.stringify(stocks || [])); } catch (_) { }
            // trigger import event again to ensure listeners refresh
            window.dispatchEvent(new CustomEvent('cts:watchlist:imported', { detail: { count: (stocks || []).length } }));
          }
        } catch (e) { /* ignore */ }
      })();
    } catch (_) { }
    try {
      const dupMsg = duplicatesFound.length ? `; Skipped duplicates: ${duplicatesFound.join(', ')}` : '';
      window.dispatchEvent(new CustomEvent('cts:toast', { detail: { message: `Imported ${toImport.length} rows — [Undo]${dupMsg}`, kind: 'success' } }));
    } catch (_) { }
  }

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
      {/* Styles moved to ManualImport.css */}
      <div
        className="absolute inset-0 bg-black/60"
        onClick={() => onClose?.()}
        aria-hidden="true"
      />
      <div className="relative bg-slate-900 rounded-lg border border-slate-700 shadow-lg p-5 max-w-full max-h-full w-auto h-auto"
        role="dialog"
        aria-modal="true"
      >
        <div className="flex items-center justify-between mb-2">
          <div className="text-sm text-slate-300">
            Preview ({parsedRows.length})
            {(() => {
              // selected preview distribution
              const dist: Record<string, number> = {};
              for (const r of parsedRows) {
                if (!r.selected) continue;
                const k = r.mappedCategoryKey || r.rawCategory || 'UNMAPPED';
                dist[k] = (dist[k] || 0) + 1;
              }
              const keys = Object.keys(dist);
              if (keys.length === 0) return null;
              return (<span className="ml-3 text-slate-400 text-xs">Preview: {keys.slice(0, 6).map(k => `${k}: ${dist[k]}`).join(' | ')}{keys.length > 6 ? ' | …' : ''}</span>);
            })()}
            <button
              aria-label={expanded ? 'Restore' : 'Expand'}
              onClick={() => setExpanded(e => !e)}
              className="px-2 py-1 rounded hover:bg-slate-800 text-slate-200"
              title={expanded ? 'Restore' : 'Expand'}
            >
              {expanded ? '🗗' : '🗖'}
            </button>
            <button
              aria-label="Close"
              onClick={() => onClose?.()}
              className="px-2 py-1 rounded hover:bg-slate-800"
            >
              ✕
            </button>
          </div>
        </div>

        <div className="space-y-3">
          <div className="flex gap-3 items-center">
            <div className="flex items-center gap-2">
              <label className="text-slate-300 text-sm">Import from file</label>
            </div>
            <div className="flex-1">
              <input
                aria-label="Choose file to import watchlist"
                type="file"
                accept=".csv,.txt,text/plain"
                onChange={(e) => handleFileUpload(e.target.files?.[0] ?? null)}
                className="block w-full text-sm text-slate-400"
              />
              {isParsing && <div className="text-xs text-slate-400 mt-1">Parsing file... {parseProgress}%</div>}
            </div>
            <button
              type="button"
              onClick={() => {
                // read clipboard (if allowed)
                navigator.clipboard?.readText().then(t => handlePaste(t)).catch(() => { });
              }}
              className="px-3 py-1 rounded bg-slate-800 text-slate-200"
            >
              Paste
            </button>
            <button
              type="button"
              onClick={() => addRow()}
              className="px-3 py-1 rounded bg-slate-800 text-slate-200"
            >
              + Add Row
            </button>
          </div>

          {/* File preview table when parsedRows exist */}
          {parsedRows && parsedRows.length > 0 && (
            <div className="mt-3 border border-slate-700 rounded p-2 bg-slate-800/40 relative manual-import-preview">
              <div className="flex items-center justify-between mb-2">
                <div className="text-sm text-slate-300">
                  Preview ({parsedRows.length})
                  {(() => {
                    const dups = parsedRows.filter(r => r.status === 'DUPLICATE');
                    if (dups.length === 0) return null;
                    return (
                      <span className="ml-3 text-amber-300 text-xs">
                        Duplicates detected: {dups.length}
                        <span className="ml-2 opacity-80">[{dups.slice(0, 5).map(r => r.symbol).join(', ')}{dups.length > 5 ? '…' : ''}]</span>
                      </span>
                    );
                  })()}
                </div>
                <div className="flex items-center gap-2">
                  {unmappedCategories.length > 0 && (
                    <button onClick={() => setShowMapPanel(true)} className="text-xs px-2 py-1 rounded border border-amber-400 text-amber-300">Map Unmapped ({unmappedCategories.length})</button>
                  )}
                  <button onClick={() => setParsedRows(prev => prev.map(r => ({ ...r, selected: r.status === 'READY' })))} className="text-xs px-2 py-1 rounded border">Select non-duplicates</button>
                  <button onClick={() => setParsedRows([])} className="text-xs px-2 py-1 rounded border">Clear</button>
                  <button onClick={() => setParsedRows(prev => prev.map(r => ({ ...r, selected: true })))} className="text-xs px-2 py-1 rounded border">Select All</button>
                  <button onClick={importSelectedFromPreview} className="text-xs px-2 py-1 rounded bg-emerald-600 text-white">Import Selected</button>
                </div>
              </div>
              <table className="w-full text-sm table-fixed">
                <thead>
                  <tr className="text-slate-300 text-left text-xs">
                    <th className="w-1/12 sticky top-0 bg-slate-800 z-10">Sel</th>
                    <th className="w-3/12 sticky top-0 bg-slate-800 z-10">Symbol</th>
                    <th className="w-2/12 sticky top-0 bg-slate-800 z-10">Date</th>
                    <th className="w-5/12 sticky top-0 bg-slate-800 z-10">Category</th>
                    <th className="w-1/12 sticky top-0 bg-slate-800 z-10">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {parsedRows.map((pr, idx) => (
                    <tr key={pr.id} className="border-b border-slate-700">
                      <td className="py-1 text-center">
                        <input aria-label={`select-row-${idx}`} type="checkbox" checked={pr.selected} onChange={e => setParsedRows(prev => prev.map(r => r.id === pr.id ? { ...r, selected: e.target.checked } : r))} />
                      </td>
                      <td className="py-1">
                        <input aria-label={`symbol-${idx}`} className="bg-transparent text-slate-100 w-full font-mono" value={pr.symbol} onChange={e => setParsedRows(prev => prev.map(r => r.id === pr.id ? { ...r, symbol: e.target.value.toUpperCase().trim() } : r))} />
                      </td>
                      <td className="py-1">
                        <input aria-label={`date-${idx}`} type="date" className="bg-transparent text-slate-100 w-full" value={pr.date} onChange={e => setParsedRows(prev => prev.map(r => r.id === pr.id ? { ...r, date: e.target.value } : r))} />
                      </td>
                      <td className="py-1">
                        {/* select value is canonical key when available, otherwise a synthetic raw:value to show file text */}
                        <select aria-label={`preview-category-${idx}`} className="bg-slate-800 border border-slate-700 rounded px-2 py-1 text-slate-100 text-xs w-full" value={pr.mappedCategoryKey ? pr.mappedCategoryKey : `__RAW__:${pr.rawCategory}`} onChange={e => {
                          const val = e.target.value;
                          if (val.startsWith('__RAW__:')) {
                            const raw = val.slice('__RAW__:'.length);
                            setParsedRows(prev => prev.map(r => r.id === pr.id ? { ...r, rawCategory: raw, mappedCategoryKey: null, status: 'UNMAPPED' } : r));
                          } else {
                            const mappedKey = val || null;
                            const label = categoryEntries.find(c => c.key === mappedKey)?.label || '';
                            setParsedRows(prev => prev.map(r => r.id === pr.id ? { ...r, rawCategory: label || r.rawCategory, mappedCategoryKey: mappedKey, status: mappedKey ? (r.status === 'DUPLICATE' ? 'DUPLICATE' : 'READY') : 'UNMAPPED' } : r));
                          }
                        }}>
                          <option value="">-- pick category --</option>
                          {categoryEntries.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
                          {pr.rawCategory && !categoryEntries.some(c => c.label === pr.rawCategory) && <option value={`__RAW__:${pr.rawCategory}`}>{pr.rawCategory}</option>}
                        </select>
                      </td>
                      <td className="py-1 text-xs text-amber-300">{pr.status}{pr.status === 'UNMAPPED' && <button onClick={() => {/* inline edit handled above */ }} className="ml-2 text-xs underline">Edit</button>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {showMapPanel && (
            <div className="absolute inset-0 z-50 flex items-center justify-center">
              <div className="absolute inset-0 bg-black/50" onClick={() => setShowMapPanel(false)} />
              <div className="relative bg-slate-900 rounded-lg border border-slate-700 p-4 w-[min(700px,95vw)] max-h-[70vh] overflow-auto">
                <div className="flex items-center justify-between mb-3">
                  <div className="text-slate-200 font-medium">Map Unmapped Categories</div>
                  <button onClick={() => setShowMapPanel(false)} className="px-2 py-1 rounded hover:bg-slate-800" aria-label="close-map-panel">✕</button>
                </div>
                {unmappedCategories.length === 0 ? (
                  <div className="text-slate-400 text-sm">No unmapped categories.</div>
                ) : (
                  <div className="space-y-3">
                    {unmappedCategories.map((u) => (
                      <div key={u.raw} className="flex items-center gap-3">
                        <div className="flex-1 text-slate-300 text-sm">{u.raw} <span className="text-slate-500">(x{u.count})</span></div>
                        <select
                          aria-label={`map-selection-${u.raw}`}
                          value={mapSelections[u.raw] || ''}
                          onChange={(e) => setMapSelections(prev => ({ ...prev, [u.raw]: e.target.value }))}
                          className="bg-slate-800 border border-slate-700 rounded px-2 py-1 text-slate-100 text-xs"
                        >
                          <option value="">-- choose --</option>
                          {categoryEntries.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
                        </select>
                      </div>
                    ))}
                    <div className="flex justify-end gap-2 pt-2">
                      <button onClick={() => setShowMapPanel(false)} className="text-xs px-3 py-1 rounded border">Cancel</button>
                      <button
                        onClick={() => {
                          const chosen = Object.entries(mapSelections).filter(([_, v]) => !!v) as Array<[string, string]>;
                          if (chosen.length === 0) { setShowMapPanel(false); return; }
                          // apply selections to rows
                          setParsedRows(prev => prev.map(r => {
                            const e = chosen.find(([raw]) => raw === r.rawCategory);
                            if (!e) return r;
                            const key = e[1];
                            const mirrorRaw2 = localStorage.getItem('cts_stocks');
                            const mirror2 = mirrorRaw2 ? JSON.parse(mirrorRaw2) : [];
                            const isDup = mirror2.some((s: any) => ((s.stockName || s.symbol) === r.symbol) && ((s.date || '') === r.date) && ((s.categoryKey || s.category || s.categoryRaw || '') === key));
                            return { ...r, mappedCategoryKey: key, status: isDup ? 'DUPLICATE' : 'READY' };
                          }));
                          // persist as hints
                          const hints = loadHints();
                          for (const [raw, key] of chosen) hints[normalizeForHint(raw)] = key;
                          saveHints(hints);
                          setShowMapPanel(false);
                          setMapSelections({});
                        }}
                        className="text-xs px-3 py-1 rounded bg-emerald-600 text-white"
                      >Apply</button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          <div className="max-h-64 overflow-auto border border-slate-700 rounded p-2 bg-slate-800/40">
            <table className="w-full table-fixed text-sm">
              <thead>
                <tr className="text-slate-300 text-left">
                  <th className="w-1/12">#</th>
                  <th className="w-4/12">Symbol</th>
                  <th className="w-3/12">Date</th>
                  <th className="w-3/12">Category</th>
                  <th className="w-1/12">Del</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, idx) => (
                  <tr key={idx} className="border-b border-slate-700">
                    <td className="py-2">{idx + 1}</td>
                    <td className="py-2">
                      <div className="relative">
                        <input
                          data-manual-symbol
                          ref={idx === 0 ? firstInputRef : undefined}
                          value={r.symbol}
                          onChange={(e) => {
                            const v = e.target.value.toUpperCase();
                            setRow(idx, { symbol: v });
                            // compute suggestions
                            const s = suggestSymbols(v, instruments, 8);
                            setSuggestions(prev => ({ ...prev, [idx]: s }));
                            setActiveSuggestion(prev => ({ ...prev, [idx]: -1 }));
                          }}
                          onKeyDown={(e) => {
                            const list = suggestions[idx] || [];
                            if (e.key === 'ArrowDown') {
                              e.preventDefault();
                              const next = (activeSuggestion[idx] ?? -1) + 1;
                              setActiveSuggestion(prev => ({ ...prev, [idx]: Math.min(next, list.length - 1) }));
                            } else if (e.key === 'ArrowUp') {
                              e.preventDefault();
                              const prevIdx = (activeSuggestion[idx] ?? -1) - 1;
                              setActiveSuggestion(prev => ({ ...prev, [idx]: Math.max(prevIdx, 0) }));
                            } else if (e.key === 'Enter') {
                              const ai = activeSuggestion[idx] ?? -1;
                              if (ai >= 0 && list[ai]) {
                                e.preventDefault();
                                setRow(idx, { symbol: list[ai].symbol });
                                setSuggestions(prev => ({ ...prev, [idx]: [] }));
                              }
                            } else if (e.key === 'Escape') {
                              setSuggestions(prev => ({ ...prev, [idx]: [] }));
                            }
                          }}
                          onBlur={(e) => {
                            // if user clicked suggestion, skip immediate blur autocorrect
                            setTimeout(() => {
                              if (selectingRef.current) return;
                              handleSymbolBlur(idx, e.target.value);
                              setSuggestions(prev => ({ ...prev, [idx]: [] }));
                            }, 0);
                          }}
                          placeholder="Stock Symbol"
                          className="w-full bg-transparent border border-slate-700 rounded px-2 py-1 text-slate-100"
                        />
                        {autocorrected[idx] && autocorrected[idx].length > 0 && (
                          <div className="absolute right-0 top-0 px-2 py-1 text-xs bg-emerald-700 text-white rounded">Auto-corrected to {autocorrected[idx]}</div>
                        )}
                        {r.error && <div className="text-xs text-amber-300 mt-1">{r.error}</div>}
                      </div>
                      {/* Suggestion box */}
                      {suggestions[idx] && suggestions[idx].length > 0 && (
                        <div
                          ref={el => { rowContainerRefs.current[idx] = el ?? null }}
                          className="mt-1 relative"
                        >
                          <div
                            role="listbox"
                            aria-label="symbol-suggestions"
                            ref={el => { dropdownRefs.current[idx] = el ?? null }}
                            data-position={flipAbove[idx] ? 'above' : 'below'}
                            data-scroll={suggestionLayout[idx]?.useScroll ? 'true' : 'false'}
                            className="suggestion-dropdown"
                            onMouseLeave={() => setActiveSuggestion(prev => ({ ...prev, [idx]: -1 }))}
                          >
                            {suggestions[idx].slice(0, 100).map((sug, sidx) => {
                              const isActive = (activeSuggestion[idx] ?? -1) === sidx;
                              return (
                                <div
                                  key={sug.symbol}
                                  role="option"
                                  onMouseDown={(e) => { e.preventDefault(); selectingRef.current = true; }}
                                  onTouchStart={() => { selectingRef.current = true; }}
                                  onClick={() => {
                                    setRow(idx, { symbol: sug.symbol });
                                    setSuggestions(prev => ({ ...prev, [idx]: [] }));
                                    setActiveSuggestion(prev => ({ ...prev, [idx]: -1 }));
                                    setTimeout(() => { selectingRef.current = false; }, 0);
                                    if (announcerRef.current) announcerRef.current.textContent = `${sug.symbol} selected`;
                                  }}
                                  onMouseEnter={() => setActiveSuggestion(prev => ({ ...prev, [idx]: sidx }))}
                                  className={`flex items-center gap-2 px-2 py-1 cursor-pointer ${isActive ? 'bg-slate-900 border-l-4 border-l-emerald-500' : ''}`}
                                >
                                  <span className="font-mono min-w-[80px]">{sug.symbol}</span>
                                  <span className="text-xs text-slate-300 truncate"> — {sug.name}</span>
                                </div>
                              );
                            })}
                            {/* +N more indicator handling */}
                            {(() => {
                              const total = suggestions[idx].length;
                              const visible = suggestionLayout[idx]?.visibleCount ?? Math.min(total, 20);
                              const more = Math.max(0, total - visible);
                              if (more > 0 && (!suggestionLayout[idx]?.useScroll)) {
                                return (
                                  <div
                                    onClick={() => {
                                      // switch to scroll mode and cap height to 220
                                      setSuggestionLayout(prev => ({ ...prev, [idx]: { ...(prev[idx] || { height: 220, useScroll: true, visibleCount: visible, moreCount: more, position: 'below' }), height: 220, useScroll: true, visibleCount: visible, moreCount: more } }));
                                      // after switching to scroll, focus the dropdown
                                      setTimeout(() => { dropdownRefs.current[idx]?.scrollTo({ top: 99999, behavior: 'smooth' }); }, 0);
                                    }}
                                    className="px-2 text-center cursor-pointer text-slate-300 text-xs"
                                  >
                                    +{more} more
                                  </div>
                                );
                              }
                              return null;
                            })()}
                          </div>
                        </div>
                      )}
                    </td>
                    <td className="py-2">
                      <input
                        aria-label={`row-date-${idx}`}
                        type="date"
                        value={/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(r.date) ? r.date : ''}
                        onChange={(e) => setRow(idx, { date: e.target.value })}
                        className="w-full bg-transparent border border-slate-700 rounded px-2 py-1 text-slate-100"
                      />
                    </td>
                    <td className="py-2">
                      <select
                        aria-label={`row-category-${idx}`}
                        value={r.category}
                        onChange={(e) => setRow(idx, { category: e.target.value })}
                        className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1 text-slate-100 manual-import-select"
                      >
                        {categoryOptions.map(opt => (
                          <option key={opt} value={opt}>{opt}</option>
                        ))}
                      </select>
                    </td>
                    <td className="py-2 text-center">
                      <button
                        onClick={() => deleteRow(idx)}
                        className="px-2 py-1 rounded bg-rose-700 text-white"
                        aria-label={`Delete row ${idx + 1}`}
                      >
                        🗑
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex justify-end gap-3 mt-3">
            {skippedRows.length > 0 && (
              <div className="text-sm text-amber-300 mr-auto">Skipped: {skippedRows.join('; ')}</div>
            )}
            <button
              onClick={() => { onClose?.(); }}
              className="px-4 py-2 rounded bg-slate-700 text-slate-200"
            >
              Cancel
            </button>
            <button
              onClick={handleImport}
              disabled={!allValid}
              className={`px-4 py-2 rounded text-white ${allValid ? 'bg-emerald-600' : 'bg-emerald-600/40 cursor-not-allowed'}`}
            >
              Import Stocks
            </button>
          </div>
        </div>
        {/* resizer handle bottom-right */}
        {!expanded && (
          <div
            onMouseDown={(e) => {
              resizingRef.current = { startX: e.clientX, startY: e.clientY, startW: modalSize.w, startH: modalSize.h };
              document.body.style.cursor = 'nwse-resize';
            }}
            className="absolute right-2 bottom-2 w-4 h-4 cursor-nwse-resize"
            aria-hidden
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M0 16L16 0M10 16L16 10M0 6L6 0" stroke="#94a3b8" strokeWidth="1.2" strokeLinecap="round" />
            </svg>
          </div>
        )}
      </div>
    </div>
  );
}


//this



