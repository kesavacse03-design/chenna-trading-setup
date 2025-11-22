# Clean one-shot Git backup — no watcher, no loop
# Load manifest
$manifestPath = ".agent/manifest.json"
$manifest = Get-Content $manifestPath | ConvertFrom-Json

# Filter files to include in backup
$filesToBackup = $manifest.files | Where-Object { $_.includeInBackup } | ForEach-Object { $_.path }

# Stage only those files
foreach ($file in $filesToBackup) {
    if (Test-Path $file) {
        git add $file
    }
}


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
