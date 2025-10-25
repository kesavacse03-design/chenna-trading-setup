param (
    [string]$Timestamp
)

# If input is like "1h", "30m", "2d", "7d", convert to actual timestamp
if ($Timestamp -match '^\d+[hmd]$') {
    $now = Get-Date
    switch -Regex ($Timestamp) {
        '^(\d+)h$' { $target = $now.AddHours(-[int]$matches[1]) }
        '^(\d+)m$' { $target = $now.AddMinutes(-[int]$matches[1]) }
        '^(\d+)d$' { $target = $now.AddDays(-[int]$matches[1]) }
    }

    $formatted = $target.ToString("yyyy-MM-dd_HH-mm-ss")

    # Find closest snapshot tag before that time
    $tags = git tag --list "snapshot-*" | Sort-Object
    $closest = $tags | Where-Object { $_ -le "snapshot-$formatted" } | Select-Object -Last 1

    if (-not $closest) {
        Write-Host "No snapshot found before $formatted"
        exit 1
    }

    $Timestamp = $closest -replace '^snapshot-', ''
    Write-Host "Using closest snapshot: $closest"
}

$repoRoot = "D:\chenna-trading-system-dashboard"
$tag = "snapshot-$Timestamp"

Set-Location $repoRoot

# Check if tag exists
$tagExists = git tag | Where-Object { $_ -eq $tag }
if (-not $tagExists) {
    Write-Host "Snapshot tag '$tag' not found."
    exit 1
}

git checkout backup/$env:COMPUTERNAME
git reset --hard $tag
Write-Host "Restored to snapshot: $tag"

code .
