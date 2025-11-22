# Smoke Test

## What it does

The smoke test triggers the CTS backtest pipeline in mock mode, waits for completion, and validates that a persisted job JSON and the trades CSV were produced and are consistent. It runs the same API calls the frontend uses: POST /api/backtest/start, poll /api/backtest/status, and GET /api/backtest/result/:runId.

## How to run locally

Ensure the backend server is running (the script expects it on http://localhost:3001). Then run:

```bash
npm run smoke:test
```

## CI behavior

A GitHub Actions workflow (`.github/workflows/smoke-test.yml`) runs this smoke test on pushes to `main` and on pull requests. The workflow starts the backend server in the background, waits for the health endpoint, and runs the smoke test with a 2-minute timeout.

If the smoke test fails, the workflow uploads artifacts (persisted job JSON files and CSVs and the server log) for debugging.
