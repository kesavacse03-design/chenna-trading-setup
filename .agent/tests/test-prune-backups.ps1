<# Smoke test for prune-backups dry-run #>
try {
    pwsh -NoProfile -ExecutionPolicy Bypass -File "../scripts/prune-backups.ps1" -KeepLatestPerHost 1
    if ($LASTEXITCODE -eq 0) { Write-Host "PASS: prune-backups dry-run returned 0"; exit 0 }
    else { Write-Host "FAIL: prune-backups returned $LASTEXITCODE"; exit 2 }
} catch {
    Write-Host "ERROR: $_"; exit 3
}
