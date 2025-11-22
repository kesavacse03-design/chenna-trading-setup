Canary Plan: CTS Backtest Engine (FINAL)

## Goal

Safely roll out backtest engine changes by validating on a narrow set of runs and observing key metrics.

## Prerequisites

- Prometheus scraping `/metrics` and alerting rules.
- Vault for secrets (or env fallback) confirmed.
- Canary namespace or isolated cluster matching production config.

## Phased rollout

1. CI: contract test + 50-symbol perf smoke.
2. Small canary: 5 low-risk backtests for 30 minutes. Monitor errors, p99 latency, and host resources.
3. Widen: 25 backtests for 60 minutes with same monitoring.
4. Gradual shift: 10% -> 50% -> 100% of scheduled runs over safe windows.

## Acceptance

- No schema validation failures.
- Errors within baseline +1%.
- P99 within 20% of baseline.
- No OOMs or host restarts.

## Rollback

- If criteria fail, stop new runs, revert deployment, and re-run canaries on previous version.

## Post-Canary

- Observe for 2 hours after full rollout with stricter alerts.
- Update runbook and playbooks with lessons learned.

## Live Trading Canary Extension

For live trading rollouts, extend the canary plan with paper/dry-run phases:

1. **Dry-Run Canary**: Deploy live runner in `CANARY_MODE=1` (forces dry-run). Run for 1 hour with simulated market data. Monitor metrics at `/metrics` (trades, orders, errors, exposure).
2. **Paper Trading Canary**: If dry-run passes, enable paper trading mode (if supported by broker) for 4 hours. Validate order submission without real capital.
3. **Live Pilot**: Start with 1% of capital or single symbol for 24 hours. Monitor drawdown, error rates, and circuit breaker activations.
4. **Gradual Live Rollout**: Increase exposure 10% -> 50% -> 100% over days, with daily reviews.

### Live Acceptance Criteria

- Dry-run: 0 real orders submitted.
- Paper/Live: Error rate <1/min, drawdown <5%, no kill-switch activations.
- Metrics: Exposure stays within limits, rate limits not hit.

### Live Rollback

- Activate `/admin/stop-live` endpoint.
- Revert to previous version, monitor for 24 hours.

Reuse backtest canary metrics and extend with live-specific ones (e.g., order latency, fill rates).
