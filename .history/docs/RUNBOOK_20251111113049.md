````markdown
# Runbook — Operator Playbook

This runbook captures essential commands for running, pausing, resuming, and recovering optimizer/backtester runs.

Quick commands

- Start optimizer (paper/mock):

  ```bash
  CTS_UPSTOX_MOCK=1 MARKETDATA_DISABLE_SNAPSHOTS=1 node backend/strategy/optimizer.cjs --symbols-file config/smoke_symbols_50.txt --grid config/small_grid.json --folds 3 --parallel 6 --run-id smoke_prod_$(date +%s) --from 2025-10-01 --to 2025-10-15 --out jobs/run_prod_smoke_<id>_report.json --csv jobs/run_prod_smoke_<id>_trades.csv
  ```

- Force pause (graceful):

  ```bash
  ./scripts/force-pause.sh
  ```

- Resume run:

  ```bash
  ./scripts/resume-run.sh
  ```

- Collect artifacts after a failure:
  ```bash
  ./scripts/collect_artifacts.sh jobs/run_prod_smoke_<id>_artifacts.tar.gz
  ```

Health snapshots

- Health snapshots are written by the marketdata monitor (if enabled) to `jobs/marketdata_health_<ts>.json`.
- To enable snapshots during a run, unset `MARKETDATA_DISABLE_SNAPSHOTS` and start the run.

Promotion & archive

- Promotion records are written to `backend/jobs/promotion_records/` after an optimizer run.
- Archive promotions:
  ```bash
  node scripts/archive_artifacts.cjs
  ```

Secrets

- Keep API keys in environment/secrets manager; do not store them in repo. Use `.env` for local development (examples in `.env.example`).

Emergency restore

- To restore a run from backup:
  1. Copy backup files into a temporary `jobs/restore_<id>/` folder.
  2. Verify `trades.csv` and `report.json` parse with pandas or `node`.
  3. Point the UI or runbook to load from that folder.

Contact & escalation

- On marketdata fallback, notify the on-call and inspect `jobs/marketdata_health_<ts>.json`.
  Runbook: CTS Backtest Engine

## Purpose

This runbook captures operational procedures for the CTS backtest engine: how to detect problems, emergency stop, recover, and routine maintenance. Use this when running the engine in production or during canary rollouts.

## Contacts

- On-call engineer: @team-backtest
- Owner: Trading infra team
- Pager: team-backtest-pager

## Quick health checks

1. Server liveness: `curl http://<host>:3001/health` — should return JSON with `status: ok` and `uptimeSec`.
2. Metrics endpoint: `curl http://<host>:3001/metrics` — returns Prometheus metrics (process mem, run counters, per-run p99).
3. Runs index: inspect `backend/strategy/output/runs-index.json` for recent runs and statuses.
4. Jobs persisted: check `backend/jobs/job_<runId>.json` or S3 path for job artifacts.

## Common incidents and responses

Incident: Backtest run failing repeatedly

- Symptoms: increased `backtest_run_errors_total`, UI shows job.status='error', `/metrics` shows p99 anomalies.
- Immediate actions:
  1. Identify failing runId from runs-index or logs.
  2. Inspect job JSON and `backend/strategy/output/<runId>-results.json` for validation errors.
  3. If validation-error file exists, copy it to staging for investigation and revert the last code changes if necessary.
  4. If multiple runs fail after a deploy, rollback the deployment and open an incident.

Incident: Memory spike / OOM

- Symptoms: server logs show OOM, `/metrics` shows RSS beyond threshold.
- Immediate actions:
  1. Pause new jobs at entrypoint (set a stop flag or scale to zero in orchestrator).
  2. Find active runs and terminate long-running child workers (use job.cancel via API or kill child processes carefully).
  3. Restart the server and verify `/health` returns ok.
  4. Investigate memory snapshots in `backend/strategy/output/*-perf.json` for leaks.

## Emergency stop / kill switch

- Use `/api/backtest/cancel` endpoint with jobId to request cancellation (graceful). If worker becomes unresponsive, kill the child process on the host or scale down the run worker pool.

## Recovery after crash

1. Ensure server is running (node chenna-CTS/backend/server.cjs). If not, check logs and restart.
2. Verify persisted jobs exist in S3 (if configured) or local output folder.
3. For partially written artifacts, inspect `.part` temp files and re-trigger upload from a known-good file.
4. Re-run failed critical runs using `node backend/strategy/run-worker.cjs '<json-payload>'`.

## Maintenance tasks

- Rotate secrets: rotate S3 keys in Vault and validate the service can re-read secrets (no restart required if using dynamic secrets).
- Backup runs-index and jobs.json to long-term storage weekly.
- Run perf smoke weekly and monitor trends.

## Market Data fallback and execution mode

- MarketData health snapshots are written to `backend/jobs/marketdata_health_<ts>.json`.
- Status file is `backend/jobs/marketdata_status.json` and includes `provider` and `execution_mode`.
- On fallback, execution mode switches to PAPER automatically (configurable). To force PAUSE/LIVE:
  - PowerShell: `scripts/force-pause.ps1` or `scripts/resume-run.ps1`.

## Run-level diagnostics

- Get job status: `curl "http://<host>:3001/api/backtest/status?jobId=<job-id>"`
- Download trades CSV: `http://<host>:3001/strategy/trades/<runId>`
- Fetch results JSON: `http://<host>:3001/strategy/results/<runId>`
- Fetch persisted job JSON: `http://<host>:3001/api/backtest/result/<runId>`

## Rollback criteria

- Any deploy that increases `backtest_run_errors_total` by >5% vs baseline within 30m.
- Memory increase >30% sustained for 15m.
- P99 per-symbol latency increases above threshold (default 500ms) for >15m.

## Post-incident postmortem

- Capture timeline, root cause, fix, and prevention steps. Update this runbook with any new playbooks created during incident.

# Runbook — Operator Playbook

This runbook captures essential commands for running, pausing, resuming, and recovering optimizer/backtester runs.

Quick commands

- Start optimizer (paper/mock):

  ```bash
  CTS_UPSTOX_MOCK=1 MARKETDATA_DISABLE_SNAPSHOTS=1 node backend/strategy/optimizer.cjs --symbols-file config/smoke_symbols_50.txt --grid config/small_grid.json --folds 3 --parallel 6 --run-id smoke_prod_$(date +%s) --from 2025-10-01 --to 2025-10-15 --out jobs/run_prod_smoke_<id>_report.json --csv jobs/run_prod_smoke_<id>_trades.csv
  ```

- Force pause (graceful):

  ```bash
  ./scripts/force-pause.sh
  ```

- Resume run:

  ```bash
  ./scripts/resume-run.sh
  ```

- Collect artifacts after a failure:
  ```bash
  ./scripts/collect_artifacts.sh jobs/run_prod_smoke_<id>_artifacts.tar.gz
  ```

Health snapshots

- Health snapshots are written by the marketdata monitor (if enabled) to `jobs/marketdata_health_<ts>.json`.
- To enable snapshots during a run, unset `MARKETDATA_DISABLE_SNAPSHOTS` and start the run.

Promotion & archive

- Promotion records are written to `backend/jobs/promotion_records/` after an optimizer run.
- Archive promotions:
  ```bash
  node scripts/archive_artifacts.cjs
  ```

Secrets

- Keep API keys in environment/secrets manager; do not store them in repo. Use `.env` for local development (examples in `.env.example`).

Emergency restore

- To restore a run from backup:
  1. Copy backup files into a temporary `jobs/restore_<id>/` folder.
  2. Verify `trades.csv` and `report.json` parse with pandas or `node`.
  3. Point the UI or runbook to load from that folder.

Contact & escalation

- On marketdata fallback, notify the on-call and inspect `jobs/marketdata_health_<ts>.json`.
  Runbook: CTS Backtest Engine

## Purpose

This runbook captures operational procedures for the CTS backtest engine: how to detect problems, emergency stop, recover, and routine maintenance. Use this when running the engine in production or during canary rollouts.

## Contacts

- On-call engineer: @team-backtest
- Owner: Trading infra team
- Pager: team-backtest-pager

## Quick health checks

1. Server liveness: `curl http://<host>:3001/health` — should return JSON with `status: ok` and `uptimeSec`.
2. Metrics endpoint: `curl http://<host>:3001/metrics` — returns Prometheus metrics (process mem, run counters, per-run p99).
3. Runs index: inspect `backend/strategy/output/runs-index.json` for recent runs and statuses.
4. Jobs persisted: check `backend/jobs/job_<runId>.json` or S3 path for job artifacts.

## Common incidents and responses

Incident: Backtest run failing repeatedly

- Symptoms: increased `backtest_run_errors_total`, UI shows job.status='error', `/metrics` shows p99 anomalies.
- Immediate actions:
  1. Identify failing runId from runs-index or logs.
  2. Inspect job JSON and `backend/strategy/output/<runId>-results.json` for validation errors.
  3. If validation-error file exists, copy it to staging for investigation and revert the last code changes if necessary.
  4. If multiple runs fail after a deploy, rollback the deployment and open an incident.

Incident: Memory spike / OOM

- Symptoms: server logs show OOM, `/metrics` shows RSS beyond threshold.
- Immediate actions:
  1. Pause new jobs at entrypoint (set a stop flag or scale to zero in orchestrator).
  2. Find active runs and terminate long-running child workers (use job.cancel via API or kill child processes carefully).
  3. Restart the server and verify `/health` returns ok.
  4. Investigate memory snapshots in `backend/strategy/output/*-perf.json` for leaks.

## Emergency stop / kill switch

- Use `/api/backtest/cancel` endpoint with jobId to request cancellation (graceful). If worker becomes unresponsive, kill the child process on the host or scale down the run worker pool.

## Recovery after crash

1. Ensure server is running (node chenna-CTS/backend/server.cjs). If not, check logs and restart.
2. Verify persisted jobs exist in S3 (if configured) or local output folder.
3. For partially written artifacts, inspect `.part` temp files and re-trigger upload from a known-good file.
4. Re-run failed critical runs using `node backend/strategy/run-worker.cjs '<json-payload>'`.

## Maintenance tasks

- Rotate secrets: rotate S3 keys in Vault and validate the service can re-read secrets (no restart required if using dynamic secrets).
- Backup runs-index and jobs.json to long-term storage weekly.
- Run perf smoke weekly and monitor trends.

## Market Data fallback and execution mode

- MarketData health snapshots are written to `backend/jobs/marketdata_health_<ts>.json`.
- Status file is `backend/jobs/marketdata_status.json` and includes `provider` and `execution_mode`.
- On fallback, execution mode switches to PAPER automatically (configurable). To force PAUSE/LIVE:
  - PowerShell: `scripts/force-pause.ps1` or `scripts/resume-run.ps1`.

## Run-level diagnostics

- Get job status: `curl "http://<host>:3001/api/backtest/status?jobId=<job-id>"`
- Download trades CSV: `http://<host>:3001/strategy/trades/<runId>`
- Fetch results JSON: `http://<host>:3001/strategy/results/<runId>`
- Fetch persisted job JSON: `http://<host>:3001/api/backtest/result/<runId>`

## Rollback criteria

- Any deploy that increases `backtest_run_errors_total` by >5% vs baseline within 30m.
- Memory increase >30% sustained for 15m.
- P99 per-symbol latency increases above threshold (default 500ms) for >15m.

## Post-incident postmortem

- Capture timeline, root cause, fix, and prevention steps. Update this runbook with any new playbooks created during incident.
````
