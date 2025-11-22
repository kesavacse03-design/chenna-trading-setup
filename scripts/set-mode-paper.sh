#!/usr/bin/env bash
# Kill-switch helper: revert execution mode to PAPER (safe) immediately.
# Writes status file used by monitoring components.
STATUS_FILE="backend/jobs/marketdata_status.json"
echo "[set-mode-paper] Switching execution_mode=PAPER" >&2
tmp=$(mktemp)
cat > "$tmp" <<'JSON'
{
  "provider": "UNKNOWN",
  "execution_mode": "PAPER",
  "ts": "$(date -Iseconds)"
}
JSON
mv "$tmp" "$STATUS_FILE"
echo "OK: execution_mode=PAPER written to $STATUS_FILE"