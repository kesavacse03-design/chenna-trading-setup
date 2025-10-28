<#
.agent/scripts/prune-backups.ps1

Prune old auto-backup branches on remote.

Usage:
    pwsh .\.agent\scripts\prune-backups.ps1 -KeepLatestPerHost 10 -Remote origin -WhatIf

Options:
    -KeepLatestPerHost <int>  Number of latest branches to keep per host (default 10)
    -Remote <string>          Remote name (default origin)
    -Confirm                  Perform deletion (default is dry-run)
#>
param(
    [int]$KeepLatestPerHost = 10,
    [string]$Remote = 'origin',
    [switch]$Confirm
)

Set-StrictMode -Version Latest

$log = Join-Path -Path $PSScriptRoot -ChildPath "..\git-auto-backup.log"

function Write-Log { param($m) Add-Content -Path $log -Value $m }

Write-Host "Fetching remote branches from $Remote..."
git fetch $Remote --prune 2>$null | Out-Null

$refs = git ls-remote --heads $Remote 2>$null | ForEach-Object { $_.Trim() } | Where-Object { $_ -ne '' }
if (-not $refs) { Write-Host "No remote branches found for $Remote"; exit 0 }

$branches = @()
foreach ($r in $refs) {
    # lines look like: <hash>\trefs/heads/auto-backup/PCNAME/2025-10-28_12-34-56
    $parts = $r -split '\s+';
    if ($parts.Count -lt 2) { continue }
    $ref = $parts[1]
    if ($ref -match 'refs/heads/(auto-backup/.+)') {
        $branches += $Matches[1]
    }
}

if (-not $branches) { Write-Host "No auto-backup/* branches found on $Remote"; exit 0 }

# Group by PCNAME
$groups = @{}
foreach ($b in $branches) {
    # b like auto-backup/PCNAME/timestamp
    $parts = $b -split '/'
    if ($parts.Count -lt 3) { continue }
    $host = $parts[1]
    if (-not $groups.ContainsKey($host)) { $groups[$host] = @() }
    $groups[$host] += $b
}

$toDelete = @()
foreach ($host in $groups.Keys) {
    $list = $groups[$host] | Sort-Object -Descending
    if ($list.Count -le $KeepLatestPerHost) { continue }
    $old = $list[$KeepLatestPerHost..($list.Count - 1)]
    $toDelete += $old
}

Write-Host "Prune summary: Found $($branches.Count) backup branches; $($toDelete.Count) candidate(s) for deletion."
if ($toDelete.Count -eq 0) { exit 0 }

foreach ($d in $toDelete) { Write-Host "  DRY RUN: would delete $d" }

if ($Confirm) {
    foreach ($d in $toDelete) {
        Write-Host "Deleting $d on $Remote..."
        $out = git push $Remote --delete $d 2>&1 | Out-String
        if ($LASTEXITCODE -eq 0) {
            Write-Host "Deleted $d"
            Write-Log "Deleted $d"
        } else {
            Write-Host "Failed to delete $d: $out"
            Write-Log "Failed to delete $d: $out"
        }
    }
}
