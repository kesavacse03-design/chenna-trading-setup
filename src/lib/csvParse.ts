import { WatchlistRow } from '../types/watchlist';

function todayDDMMYYYY(): string {
  const d = new Date();
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  return `${dd}-${mm}-${yyyy}`;
}

function uid() {
  return Math.random().toString(36).slice(2, 9);
}

export function parseCSVorTSV(text: string): WatchlistRow[] {
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  if (lines.length === 0) return [];

  // detect header
  const headerMatch = lines[0].toLowerCase().split(/[,\t]/).map(h => h.trim());
  let start = 0;
  if (headerMatch.includes('symbol')) start = 1;

  const rows: WatchlistRow[] = [];
  for (let i = start; i < lines.length; i++) {
    const line = lines[i];
    const sep = line.includes('\t') ? '\t' : ',';
    const parts = line.split(sep).map(p => p.trim());

    const symbol = (parts[0] || '').toUpperCase();
    let date = parts[1] || '';
  let category = (parts[2] || '').toUpperCase();

    if (!date) date = todayDDMMYYYY();

    rows.push({ id: uid(), symbol, date, category });
  }

  return rows;
}
