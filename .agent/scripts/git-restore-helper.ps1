param(
  [string]$Timestamp
)

$repoRoot = "D:\chenna-trading-system-dashboard"
$tag = "snapshot-$Timestamp"

Set-Location $repoRoot

# Check if tag exists
$tagExists = git tag | Where-Object { $_ -eq $tag }
if (-not $tagExists) {
  Write-Host "❌ Snapshot tag '$tag' not found."
  exit 1
}

git checkout backup/$env:COMPUTERNAME
git reset --hard $tag
Write-Host "✅ Restored to snapshot: $tag"

code .
