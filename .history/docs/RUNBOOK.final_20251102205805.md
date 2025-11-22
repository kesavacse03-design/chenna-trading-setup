Runbook: CTS Backtest Engine (FINAL)

Purpose
-------
This runbook documents operational procedures for the CTS backtest engine: detection, emergency stop, recovery, and maintenance.

Contacts
--------
- On-call: @team-backtest
- Owner: Trading infra
- Pager: team-backtest-pager

Quick checks
------------
- Liveness: GET /health (should return JSON with status: ok)
- Metrics: GET /metrics (Prometheus)
- Recent runs: `backend/strategy/output/runs-index.json`
- Job artifacts: `backend/jobs/job_<runId>.json` or S3

Common incidents
----------------
- Backtest failures: check `backtest_run_errors_total`, job JSONs, and validation-error files.
- Memory spikes/OOM: pause new runs, terminate hung workers, restart service, analyze perf JSONs.

Emergency stop
--------------
- Use `/api/backtest/cancel` for graceful cancellation.
- If unresponsive, kill the child process or scale down run-worker workers.

Recovery
--------
- Restart the server if down.
- Re-run failed jobs using the local runner: `node backend/strategy/run-worker.cjs '<payload.json path>'` or use `scripts/run-worker-local.ps1`.

Maintenance
-----------
- Rotate secrets in Vault.
- Backup runs-index and job JSONs weekly.
- Run perf smoke tests weekly.

Run-level diagnostics
---------------------
- Job status: GET `/api/backtest/status?jobId=<id>`
- Trades CSV: `/strategy/trades/<runId>`
- Results JSON: `/strategy/results/<runId>`

Rollback criteria
-----------------
- Errors +5% vs baseline within 30m
- Memory increase >30% sustained for 15m
- P99 latency above threshold for 15m

Postmortem
---------
- Capture timeline, root cause, fix, and prevention, then update this runbook.
