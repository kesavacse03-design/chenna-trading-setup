# Wrapper launcher: forwards to the real cts-backup.ps1 inside the chenna-CTS folder (if present)
# This allows calling: PowerShell -ExecutionPolicy Bypass -File ".agent\scripts\cts-backup.ps1"

$scriptCandidates = @(
    Join-Path $PSScriptRoot '..\chenna-CTS\.agent\scripts\cts-backup.ps1',
    Join-Path $PSScriptRoot '..\..\chenna-CTS\.agent\scripts\cts-backup.ps1',
    Join-Path $PSScriptRoot '.\chenna-CTS\.agent\scripts\cts-backup.ps1'
)

$target = $null
foreach ($c in $scriptCandidates) {
    $resolved = Resolve-Path -Path $c -ErrorAction SilentlyContinue
    if ($resolved) { $target = $resolved.Path; break }
}

if (-not $target) {
    Write-Host "cts-backup.ps1 not found in expected locations. Checked: $($scriptCandidates -join ', ')"
    exit 1
}

# Invoke the real script and forward any arguments
& $target @args
