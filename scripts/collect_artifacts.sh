#!/usr/bin/env bash
# Collect artifacts into tar.gz
OUT=${1:-jobs/artifacts_$(date +%s).tar.gz}
mkdir -p jobs
tar -czf "$OUT" jobs backend/jobs || exit 1
echo "wrote $OUT"
