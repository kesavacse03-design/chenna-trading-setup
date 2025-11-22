#!/usr/bin/env bash
set -euo pipefail
STATUS_FILE="backend/jobs/marketdata_status.json"
mkdir -p "$(dirname "$STATUS_FILE")"
jq -n '{ provider: "UNKNOWN", execution_mode: "PAUSE", ts: (now | todate) }' > "$STATUS_FILE"
echo "Wrote $STATUS_FILE"
