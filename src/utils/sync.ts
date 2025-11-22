import * as api from '../api';
import { normalizeAndMapCategory } from './categoryMap';

export async function runSyncQueue(showToasts: (msg: string, kind?: 'info'|'success'|'error')=>void = () => {}) {
  try {
    const raw = localStorage.getItem('cts_stocks');
    if (!raw) return;
    const list: any[] = JSON.parse(raw);
    // process pendingSync
    for (const item of list.filter(i => i.__pendingSync)) {
      try {
  const { categoryKey, categoryRaw } = normalizeAndMapCategory(item.category || item.categoryRaw || '');
        const res = await api.createStock({ symbol: item.stockName, date: item.date, category: categoryKey });
        // replace local item with server id and clear pending flag; persist category metadata
        Object.assign(item, { id: res.id, __pendingSync: false, categoryRaw: categoryRaw, categoryKey });
        showToasts(`Synced ${item.stockName}`, 'success');
        console.log('[sync] Synced', item);
      } catch (e) {
        console.warn('[sync] Failed to sync', item, e);
        showToasts(`Sync failed for ${item.stockName}`, 'error');
      }
    }
    // process pendingDelete
    for (const item of list.filter(i => i.__pendingDelete)) {
      try {
        if (!item.id) {
          // can't delete without id: just remove locally
          const idx = list.indexOf(item);
          if (idx > -1) list.splice(idx, 1);
          continue;
        }
        await api.deleteStock(item.id);
        const idx = list.indexOf(item);
        if (idx > -1) list.splice(idx, 1);
        showToasts(`Removed ${item.stockName}`, 'success');
        console.log('[sync] Deleted', item);
      } catch (e) {
        console.warn('[sync] Failed delete', item, e);
        showToasts(`Delete retry failed for ${item.stockName}`, 'error');
      }
    }
    // persist updated list
    try { localStorage.setItem('cts_stocks', JSON.stringify(list)); } catch (e) { /* ignore */ }
    showToasts('Sync completed', 'success');
  } catch (e) {
    console.error('[sync] Unexpected error', e);
    showToasts('Sync encountered an error', 'error');
  }
}
