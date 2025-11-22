#!/usr/bin/env bash
set -euo pipefail

PAYLOAD=${1:-/run/payload.json}

if [ ! -f "$PAYLOAD" ]; then
  echo "Payload file not found: $PAYLOAD"
  exit 2
fi

# Run with node directly to preserve IPC behavior if needed
exec node /app/backend/strategy/run-worker.cjs "$PAYLOAD"
