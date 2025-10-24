# Launcher: forwards to the real cts-backup.ps1 inside the chenna-CTS folder (if present)
# Usage: PowerShell -ExecutionPolicy Bypass -File ".agent\scripts\cts-backup.ps1" @args

$ErrorActionPreference = 'Stop'

$scriptPath = $MyInvocation.MyCommand.Path
$scriptDir  = Split-Path -Parent $scriptPath

# Build candidate paths (as strings) relative to the launcher directory
$scriptCandidates = @(
    "$scriptDir\..\chenna-CTS\.agent\scripts\cts-backup.ps1",
    "$scriptDir\..\..\chenna-CTS\.agent\scripts\cts-backup.ps1",
    "$scriptDir\chenna-CTS\.agent\scripts\cts-backup.ps1",
    "$scriptDir\cts-backup.ps1"
)

$target = $null
foreach ($c in $scriptCandidates) {
    $resolved = Resolve-Path -Path $c -ErrorAction SilentlyContinue
    if ($resolved) { $target = $resolved.Path; break }
}

if (-not $target) {
    Write-Host "cts-backup.ps1 not found in expected locations. Checked:`n$($scriptCandidates -join "`n")"
    exit 1
}

# Invoke the real script and forward any arguments
& $target @args
