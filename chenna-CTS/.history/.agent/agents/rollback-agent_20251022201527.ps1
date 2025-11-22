$backupPath = ".agent/backups/last-good"
$restoreTargets = @(
    ".agent/reports/run-latest.json",
    ".agent/reports/tracker/state.json"
)

foreach ($target in $restoreTargets) {
    $fileName = Split-Path $target -Leaf
    Copy-Item "$backupPath/$fileName" -Destination $target -Force
    Write-Host "🔁 Restored $fileName from backup"
}
