const KEY = 'cts_categoryLocks';

export function readLocks(): Record<string, boolean> {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : {};
  } catch (_) { return {}; }
}

export function writeLock(categoryKey: string, locked: boolean) {
  try {
    const cur = readLocks();
    cur[categoryKey] = !!locked;
    localStorage.setItem(KEY, JSON.stringify(cur));
  } catch (_) {}
}

export function isLocked(categoryKey: string): boolean {
  try { return !!readLocks()[categoryKey]; } catch (_) { return false; }
}

export { KEY as LOCKS_KEY };
