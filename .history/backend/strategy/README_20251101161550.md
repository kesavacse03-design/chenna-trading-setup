# Strategy runtime (backtester)

Quick start — run a mock backtest from the workspace root:

- node backend/strategy/runner.cjs --symbols TCS,RELIANCE --from 2025-10-30 --to 2025-10-30 --interval 5m --mode mock

Outputs are written to `backend/strategy/output/` (results.json, trades.csv, suggestions.json).

See below for adapters, tests and CI hooks.
