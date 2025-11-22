Containerizing run-worker (quick guide)

## Purpose

Run `backend/strategy/run-worker.cjs` inside a container to enforce per-run resource limits and provide isolation.

## Build

From repo root run:

```powershell
# from D:\chenna-trading-system-dashboard
docker build -t cts-run-worker -f backend/strategy/docker/Dockerfile .
```

## Run (smoke)

Prepare a payload file (example `payload.json`) mounting it to `/run/payload.json`:

```powershell
docker run --rm --memory=512m --cpus=0.5 -v ${PWD}:/app -v ${PWD}/payload.json:/run/payload.json:ro \
  cts-run-worker /run/payload.json
```

## Notes

- Use `--memory` and `--cpus` to limit container resources.
- For production, run inside an orchestrator (Kubernetes, Nomad) and use the platform resource limits.
- The image runs Node.js as non-root user `cts`.
