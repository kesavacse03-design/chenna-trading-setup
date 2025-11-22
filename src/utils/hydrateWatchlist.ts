import { PREPOPULATED_WATCHLIST } from '../constants';
import { attachCategoryMetaToItem, mapToCanonical } from './categoryMap';

export function buildBaseWatchlist() {
  return JSON.parse(JSON.stringify(PREPOPULATED_WATCHLIST));
}

export function hydrateIntoGrouped(serverStocks: any[], base?: any) {
  const copy = base || buildBaseWatchlist();
  for (const s of serverStocks) {
    const s2 = attachCategoryMetaToItem(s);
    const incomingCatNorm = s2.categoryKey || (s2.category || s2.categoryRaw || '');
    const mappedIncoming = mapToCanonical(incomingCatNorm || '') || incomingCatNorm;
    let added = false;
    for (const pKey of Object.keys(copy)) {
      const existingCats = Object.keys(copy[pKey] || {});
      const targetKey = existingCats.includes(incomingCatNorm) ? incomingCatNorm : (existingCats.includes(mappedIncoming) ? mappedIncoming : null);
      if (!targetKey) continue;
      const arr = copy[pKey][targetKey] || [];
      const exists = (arr as any[]).some((x: any) => x.stockName === s.stockName && (x.date||'') === (s.date||''));
      if (!exists) arr.push({ stockName: s.stockName, date: s.date });
      copy[pKey][targetKey] = arr;
      added = true;
      break;
    }
    if (!added) {
      // ignore placement failure silently for test
    }
  }
  return copy;
}

export function flattenGrouped(grouped: any): any[] {
  const out: any[] = [];
  for (const page of Object.keys(grouped || {})) {
    for (const cat of Object.keys(grouped[page] || {})) {
      for (const it of grouped[page][cat] || []) {
        out.push({ symbol: it.stockName, category: cat, date: it.date });
      }
    }
  }
  return out;
}
