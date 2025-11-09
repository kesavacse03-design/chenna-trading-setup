#!/usr/bin/env bash
set -euo pipefail
STATUS_FILE="backend/jobs/marketdata_status.json"
mkdir -p "$(dirname "$STATUS_FILE")"
jq -n '{ provider: "UPSTOX", execution_mode: "LIVE", ts: (now | todate) }' > "$STATUS_FILE"
echo "Wrote $STATUS_FILE"
