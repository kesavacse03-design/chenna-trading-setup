# realtime-agent.ps1

# Ensure required folders exist
$reportPath = ".\agent\reports"
$historyPath = "$reportPath\history"
$logPath = ".\agent\logs"
New-Item -ItemType Directory -Force -Path $reportPath, $historyPath, $logPath | Out-Null

# Load flags from config
$flags = @{}
if (Test-Path ".\config\flags.json") {
    $flags = Get-Content ".\config\flags.json" | ConvertFrom-Json
}

# Overlay ENV flags
$liveEnabled = $env:LIVE_TRADING_ENABLED -eq "true"
$hybridEnabled = $env:HYBRID_MODE_ENABLED -eq "true"

# Import probes
. ".\agent\scripts\probes.ps1"
$probes = Get-Probes
$backend_ok = $probes.backend_ok
$upstox_ok = $probes.upstox_ok
$quotes_ok = $probes.quotes_ok
$all_ok = $probes.all_ok

# Resolve mode
if ($hybridEnabled) {
    $mode = if ($all_ok -and $liveEnabled) { "LIVE" } else { "MOCK" }
} else {
    $mode = if ($all_ok -and $liveEnabled) { "LIVE" } else { "OFF" }
}

# Build report object
$report = @{
    timestamp = (Get-Date).ToString("s")
    mode = $mode
    probes = @{
        backend_ok = $backend_ok
        upstox_ok = $upstox_ok
        quotes_ok = $quotes_ok
        all_ok = $all_ok
    }
    flags = $flags
}

# Save report
$report | ConvertTo-Json -Depth 3 | Set-Content "$reportPath\run-latest.json"
$timestamp = (Get-Date).ToString("yyyy-MM-ddTHH-mm-ss")
$report | ConvertTo-Json -Depth 3 | Set-Content "$historyPath\run-$timestamp.json"

# Output summary
Write-Host "mode:$mode all_ok:$all_ok"
