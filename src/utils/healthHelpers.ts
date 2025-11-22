export type HealthCheckId =
  | 'frontend_reachable'
  | 'backend_alive'
  | 'stocks_endpoint'
  | 'upstox_auth'
  | 'db'
  | 'ohlc_coverage'
  | 'last_job_json'
  | 'optimizer_binary'
  | 'replay_running'
  | 'puppeteer_capture';

export const STAGES: Array<{ id: string; label: string; checks: HealthCheckId[] }> = [
  { id: 'ui', label: 'UI / Frontend', checks: ['frontend_reachable'] },
  { id: 'backend', label: 'CTS Backend', checks: ['backend_alive'] },
  { id: 'api', label: 'Market Data / API', checks: ['stocks_endpoint', 'upstox_auth'] },
  { id: 'data', label: 'Data & Storage', checks: ['db', 'ohlc_coverage', 'last_job_json'] },
  { id: 'optimizer', label: 'Optimizer', checks: ['optimizer_binary'] },
  { id: 'replay', label: 'Replay / Worker', checks: ['replay_running'] },
  { id: 'capture', label: 'Dashboard Capture', checks: ['puppeteer_capture'] },
];

export const LABELS: Partial<Record<HealthCheckId, string>> = {
  frontend_reachable: 'Frontend reachable',
  backend_alive: 'Backend process',
  stocks_endpoint: 'Marketdata/Stocks endpoint',
  upstox_auth: 'Upstox auth tokens',
  db: 'Strategy output storage',
  ohlc_coverage: 'OHLC cache coverage',
  last_job_json: 'Last jobs.json',
  optimizer_binary: 'Optimizer engine',
  replay_running: 'Replay/Shadow worker',
  puppeteer_capture: 'Dashboard capture script',
};

export const HINTS: Partial<Record<HealthCheckId, string>> = {
  frontend_reachable: 'Open the dashboard /health or UI directly to verify.',
  backend_alive: 'Restart backend_run.cmd or pm2 if down.',
  stocks_endpoint: 'Ensure backend/marketdata/health.cjs exists and routes are mounted.',
  upstox_auth: 'Re-run Upstox login flow; tokens.json may be empty/expired.',
  db: 'Create backend/strategy/output or fix container volume.',
  ohlc_coverage: 'Prefetch or run a backtest to populate cache.',
  last_job_json: 'Run an optimizer/backtest job to persist jobs.json.',
  optimizer_binary: 'Include backend/strategy/optimizer.cjs in image/build.',
  replay_running: 'Add backend/shadowWorker.cjs or relax this check.',
  puppeteer_capture: 'Copy scripts/capture_dashboard.cjs if screenshots needed.',
};
