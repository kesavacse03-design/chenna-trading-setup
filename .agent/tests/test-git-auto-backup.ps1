<# Simple smoke test for git-auto-backup Test mode #>
try {
    pwsh -NoProfile -ExecutionPolicy Bypass -File "../scripts/git-auto-backup.ps1" -Test
    if ($LASTEXITCODE -eq 0) { Write-Host "PASS: git-auto-backup -Test returned 0"; exit 0 }
    else { Write-Host "FAIL: git-auto-backup -Test returned $LASTEXITCODE"; exit 2 }
} catch {
    Write-Host "ERROR: $_"; exit 3
}
