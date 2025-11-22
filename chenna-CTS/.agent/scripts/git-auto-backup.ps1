# Clean one-shot backup script — no loop, no logging

$repoRoot = Resolve-Path "$PSScriptRoot\..\.."
$branchName = "backup/$env:COMPUTERNAME"

Set-Location $repoRoot
git checkout -B $branchName | Out-Null

$changes = git status --porcelain
if ($changes) {
    $ts = Get-Date -Format "yyyy-MM-dd_HH-mm-ss"
    git add -A
    git commit -m "Auto-backup: $ts"
    git push origin $branchName
    $tag = "snapshot-" + $ts
    git tag -a $tag -m "Snapshot created at $ts"
    git push origin $tag
    Write-Host "✅ Backup complete. Tag: $tag"
} else {
    Write-Host "ℹ️ No changes to back up."
}

git checkout main
