// Type-only facade over the runtime CommonJS module. This avoids duplicate
// declarations and keeps the TypeScript language service happy while the
// Node runtime uses backend/strategy/dataAdapter.cjs.

export type Candle = { date: string; open: number; high: number; low: number; close: number; volume: number };
export interface FetchParams { symbol: string; from: string; to: string; interval: string; }
export interface DataAdapter { fetch(params: FetchParams): Promise<Candle[] | { ok: false; error: string; detail?: any }>; }

// Re-export CJS implementations with minimal typing.
declare const require: any;
const cjs: any = (() => {
  try { return require('./dataAdapter.cjs'); } catch { return {}; }
})();

export const MockDataAdapter: new () => DataAdapter = cjs.MockDataAdapter as any;
export const UpstoxAdapter: new () => DataAdapter = cjs.UpstoxAdapter as any;

export default { MockDataAdapter, UpstoxAdapter };
