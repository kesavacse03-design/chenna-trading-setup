import type { CategoryEventReport } from '../types';

// Loads backend/strategy/output/run-events-<CATEGORY>.report.json from the public root when served by Vite/Express static.
// Falls back to fetch via relative path; caller can handle null.
export async function loadCategoryEventReport(categoryKey: string): Promise<CategoryEventReport | null> {
  const file = `backend/strategy/output/run-events-${categoryKey}.report.json`;
  try {
    const res = await fetch(`/${file}`, { cache: 'no-store' });
    if (!res.ok) return null;
    const j = await res.json();
    // Basic shape validation
    if (!j || typeof j !== 'object' || String(j.categoryKey || '') !== categoryKey) return null;
    return j as CategoryEventReport;
  } catch {
    return null;
  }
}

export function toDisplayPercent(f: number | undefined | null): string {
  if (typeof f !== 'number' || !isFinite(f)) return '—';
  return (f * 100).toFixed(1) + '%';
}
