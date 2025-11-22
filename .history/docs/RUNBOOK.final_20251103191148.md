Runbook: CTS Backtest Engine (FINAL)

## Purpose

This runbook documents operational procedures for the CTS backtest engine: detection, emergency stop, recovery, and maintenance.

## Contacts

- On-call: @team-backtest
- Owner: Trading infra
- Pager: team-backtest-pager

## Quick checks

- Liveness: GET /health (should return JSON with status: ok)
- Metrics: GET /metrics (Prometheus)
- Recent runs: `backend/strategy/output/runs-index.json`
- Job artifacts: `backend/jobs/job_<runId>.json` or S3

## Common incidents

- Backtest failures: check `backtest_run_errors_total`, job JSONs, and validation-error files.
- Memory spikes/OOM: pause new runs, terminate hung workers, restart service, analyze perf JSONs.

## Emergency stop

- Use `/api/backtest/cancel` for graceful cancellation.
- If unresponsive, kill the child process or scale down run-worker workers.

## Recovery

- Restart the server if down.
- Re-run failed jobs using the local runner: `node backend/strategy/run-worker.cjs '<payload.json path>'` or use `scripts/run-worker-local.ps1`.

## Maintenance

- Rotate secrets in Vault.
- Backup runs-index and job JSONs weekly.
- Run perf smoke tests weekly.

## Run-level diagnostics

- Job status: GET `/api/backtest/status?jobId=<id>`
- Trades CSV: `/strategy/trades/<runId>`
- Results JSON: `/strategy/results/<runId>`

## Rollback criteria

- Errors +5% vs baseline within 30m
- Memory increase >30% sustained for 15m

## Live Trading Operations

### Live Runner Checks

- Liveness: GET /health on live runner port (default 8080)
- Metrics: GET /metrics (live_trades_total, live_exposure_current, etc.)
- Status: WebSocket status message or GET /metrics for is_stopped

### Live Incidents

- High error rate: Check `/metrics` for live_errors_total; if >5/min, circuit breaker should activate.
- Drawdown spike: Monitor live_drawdown_percent; if >10%, trading stops.
- Exposure overrun: Check live_exposure_current vs maxExposure.

### Live Emergency Stop

- POST `/admin/stop-live` to halt trading immediately.
- If unresponsive, kill the live runner process.

### Live Recovery

- Restart live runner with `CANARY_MODE=1` for dry-run recovery.
- Review logs for errors; re-enable after fixes.

### Live Maintenance

- Monitor rate limits and exposure daily.
- Backup trade logs and metrics weekly.
- Run dry-run canaries monthly.

### Live Diagnostics

- Open positions: Via WebSocket status or logs.
- Order history: Check adapter logs or broker API.
- Tracing: All actions logged; grep for "STRATEGY" or "TRADE".
- P99 latency above threshold for 15m

## Postmortem

- Capture timeline, root cause, fix, and prevention, then update this runbook.
