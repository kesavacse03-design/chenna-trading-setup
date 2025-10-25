# .agent/scripts/git-restore-helper.ps1

param(
  [string]$Timestamp
)

$repoRoot = Resolve-Path "$PSScriptRoot\..\.."
$tag = "snapshot-$Timestamp"

Set-Location $repoRoot

# Check if tag exists
$tagExists = git tag | Where-Object { $_ -eq $tag }
if (-not $tagExists) {
  Write-Host "❌ Snapshot tag '$tag' not found."
  exit 1
}

# Checkout backup branch and reset to snapshot
git checkout backup/$env:COMPUTERNAME
git reset --hard $tag
Write-Host "✅ Restored to snapshot: $tag"

# Optional: open in VS Code
code .