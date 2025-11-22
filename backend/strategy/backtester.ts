// Placeholder - to be implemented in Phase E
export interface BacktestParams { symbols: string[]; from: string; to: string; interval: string; mode?: 'mock'|'upstox'; }
// TS placeholder; actual runtime is implemented in backtester.cjs
export async function runBacktest(_params: BacktestParams) { throw new Error('Use backtester.cjs at runtime'); }
