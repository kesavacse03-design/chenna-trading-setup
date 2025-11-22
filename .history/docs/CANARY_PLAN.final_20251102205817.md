Canary Plan: CTS Backtest Engine (FINAL)

Goal
----
Safely roll out backtest engine changes by validating on a narrow set of runs and observing key metrics.

Prerequisites
-------------
- Prometheus scraping `/metrics` and alerting rules.
- Vault for secrets (or env fallback) confirmed.
- Canary namespace or isolated cluster matching production config.

Phased rollout
--------------
1. CI: contract test + 50-symbol perf smoke.
2. Small canary: 5 low-risk backtests for 30 minutes. Monitor errors, p99 latency, and host resources.
3. Widen: 25 backtests for 60 minutes with same monitoring.
4. Gradual shift: 10% -> 50% -> 100% of scheduled runs over safe windows.

Acceptance
----------
- No schema validation failures.
- Errors within baseline +1%.
- P99 within 20% of baseline.
- No OOMs or host restarts.

Rollback
--------
- If criteria fail, stop new runs, revert deployment, and re-run canaries on previous version.

Post-Canary
-----------
- Observe for 2 hours after full rollout with stricter alerts.
- Update runbook and playbooks with lessons learned.
