import React, { useEffect, useRef, useState } from 'react';
import { WatchlistRow } from '../types/watchlist';
import { parseCSVorTSV } from '../lib/csvParse';
import { loadWatchlist, saveWatchlist } from '../lib/watchlistStorage';
import IconWarning from './IconWarning';

export interface ManualImportWatchlistProps {
  isOpen: boolean;
  onClose: () => void;
  onImport?: (rows: WatchlistRow[]) => Promise<void> | void;
}

const CATEGORY_OPTIONS = ['OPTIONS', 'FUTURES'];

function uid() { return Math.random().toString(36).slice(2, 9); }

function todayDDMMYYYY(): string {
  const d = new Date();
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  return `${dd}-${mm}-${yyyy}`;
}

function validateRow(r: WatchlistRow) {
  const errors: string[] = [];
  if (!/^[A-Z0-9]+$/.test(r.symbol)) errors.push('Invalid symbol');
  if (!/^\d{2}-\d{2}-\d{4}$/.test(r.date)) errors.push('Invalid date');
  if (!CATEGORY_OPTIONS.includes(r.category)) errors.push('Invalid category');
  return errors;
}

export default function ManualImportWatchlist({ isOpen, onClose, onImport }: ManualImportWatchlistProps) {
  const [rows, setRows] = useState<WatchlistRow[]>(() => loadWatchlist() || []);
  const [toast, setToast] = useState<string | null>(null);
  const firstInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => firstInputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  useEffect(() => {
    if (toast) {
      const t = setTimeout(() => setToast(null), 3000);
      return () => clearTimeout(t);
    }
  }, [toast]);

  useEffect(() => {
    // focus trap basic
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    if (isOpen) window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  function addRow(r?: Partial<WatchlistRow>) {
    const row: WatchlistRow = {
      id: uid(),
      symbol: (r?.symbol || '').toUpperCase(),
      date: r?.date || todayDDMMYYYY(),
  category: (r?.category || '').toUpperCase(),
    };
    row.errors = validateRow(row);
    setRows(prev => [...prev, row]);
  }

  function deleteRow(id: string) {
    setRows(prev => prev.filter(r => r.id !== id));
  }

  function updateRow(id: string, patch: Partial<WatchlistRow>) {
    setRows(prev => prev.map(r => r.id === id ? { ...r, ...patch, errors: validateRow({ ...r, ...patch } as WatchlistRow) } : r));
  }

  function handlePaste(e: React.ClipboardEvent) {
    const text = e.clipboardData.getData('text');
    if (!text) return;
    const parsed = parseCSVorTSV(text);
    if (parsed.length) setRows(prev => [...prev, ...parsed.map(p => ({ ...p, errors: validateRow(p) }))]);
  }

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result || '');
      const parsed = parseCSVorTSV(text);
      if (parsed.length) setRows(prev => [...prev, ...parsed.map(p => ({ ...p, errors: validateRow(p) }))]);
    };
    reader.readAsText(f);
    e.currentTarget.value = '';
  }

  async function handleImport() {
    // validate all
    const validated = rows.map(r => ({ ...r, errors: validateRow(r) }));
    setRows(validated);
    const firstInvalid = validated.find(r => (r.errors || []).length > 0);
    if (firstInvalid) {
      setToast('Please fix highlighted errors');
      // focus first invalid row input
      const el = document.querySelector(`[data-row-id="${firstInvalid.id}"] input` ) as HTMLElement | null;
      el?.focus();
      return;
    }

    try {
      if (onImport) {
        const res = onImport(rows);
        await Promise.resolve(res);
        // success: do not duplicate localStorage
        window.dispatchEvent(new CustomEvent('cts:watchlist:imported', { detail: rows }));
        onClose();
        return;
      }
    } catch (e) {
      console.warn('onImport failed, falling back to localStorage', e);
      setToast('Saved locally (backend unavailable)');
    }

    // fallback
    try {
      saveWatchlist(rows);
      window.dispatchEvent(new CustomEvent('cts:watchlist:imported', { detail: rows }));
      setToast('Saved locally');
      onClose();
    } catch (e) {
      setToast('Failed to save');
    }
  }

  // removed unused handler: Enter-to-add-row can be handled directly on inputs if needed

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50" onPaste={handlePaste}>
      <div className="w-full max-w-3xl bg-slate-800 text-white rounded shadow-lg p-4" role="dialog" aria-modal="true" aria-label="Manual Import Watchlist">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Manual Import Watchlist</h2>
          <button onClick={onClose} aria-label="Close" className="text-slate-300 hover:text-white">✕</button>
        </div>

        <div className="space-y-2 max-h-96 overflow-auto">
          {rows.map((r, idx) => (
            <div key={r.id} data-row-id={r.id} className="flex items-center gap-2 p-2 rounded bg-slate-700">
              <div className="w-6 text-sm text-slate-300">{idx + 1}</div>
              <input ref={idx === 0 ? firstInputRef : undefined} className="flex-1 bg-slate-800 border border-slate-600 rounded px-2 py-1" placeholder="Stock Symbol" value={r.symbol} onChange={e => updateRow(r.id, { symbol: e.target.value.toUpperCase() })} />
              <input type="date" className="w-36 bg-slate-800 border border-slate-600 rounded px-2 py-1" value={(() => { const [d,m,y] = r.date.split('-'); return `${y}-${m}-${d}`; })()} onChange={e => { const v = e.target.value; const [y,m,d] = v.split('-'); updateRow(r.id, { date: `${d}-${m}-${y}` }); }} />
              <select className="bg-slate-800 border border-slate-600 rounded px-2 py-1" value={r.category} onChange={e => updateRow(r.id, { category: e.target.value })}>
                {CATEGORY_OPTIONS.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
              <button onClick={() => deleteRow(r.id)} className="text-red-400 hover:text-red-200" aria-label="Delete row">🗑</button>
              <div className="w-6">
                {r.errors && r.errors.length > 0 ? <span title={r.errors.join(',')}><IconWarning /></span> : null}
              </div>
            </div>
          ))}
        </div>

        <div className="mt-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button onClick={() => addRow()} className="bg-sky-600 px-3 py-1 rounded">Add Row</button>
            <label className="bg-slate-600 px-3 py-1 rounded cursor-pointer">
              Paste/Upload
              <input type="file" accept=".csv,.tsv,text/csv,text/tab-separated-values" onChange={handleFile} className="hidden" />
            </label>
          </div>

          <div className="flex items-center gap-2">
            <button onClick={onClose} className="px-3 py-1 rounded border border-slate-600">Cancel</button>
            <button onClick={handleImport} className="px-3 py-1 rounded bg-green-600">Import Stocks</button>
          </div>
        </div>

        {toast ? <div className="mt-3 text-sm text-yellow-300">{toast}</div> : null}
      </div>
    </div>
  );
}
