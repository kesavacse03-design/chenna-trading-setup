# realtime-agent.ps1

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition

# Ensure required folders exist
$reportPath = Join-Path $scriptDir '..\reports'
$historyPath = Join-Path $reportPath 'history'
$logPath = Join-Path $scriptDir '..\logs'
New-Item -ItemType Directory -Force -Path $reportPath, $historyPath, $logPath | Out-Null

# Load flags from config
$flags = @{}
$configPath = Join-Path $scriptDir '..\..\config\flags.json'
if (Test-Path $configPath) { $flags = Get-Content $configPath | ConvertFrom-Json }

# Overlay ENV flags
$liveEnabled = $false
$hybridEnabled = $true
if ($env:LIVE_TRADING_ENABLED) { $liveEnabled = $env:LIVE_TRADING_ENABLED -eq 'true' }
if ($env:HYBRID_MODE_ENABLED) { $hybridEnabled = $env:HYBRID_MODE_ENABLED -eq 'true' }

# Import probes safely
$probes = $null
$probesPath = Join-Path $scriptDir '..\scripts\probes.ps1'
if (Test-Path $probesPath) { . $probesPath; try { $probes = Get-Probes } catch { $probes = $null } }
if (-not $probes) { $probes = @{ backend_ok=$false; upstox_ok=$false; quotes_ok=$false; all_ok=$false } }

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

# Save report (always write to reports)
$out = $report | ConvertTo-Json -Depth 5
$latestPath = Join-Path $reportPath 'run-latest.json'
$ts = (Get-Date).ToString('yyyy-MM-ddTHH-mm-ss')
$historyFile = Join-Path $historyPath ("run-{0}.json" -f $ts)
$out | Set-Content -Path $latestPath -Encoding utf8
$out | Set-Content -Path $historyFile -Encoding utf8

# Output summary
Write-Output ("mode:{0} all_ok:{1}" -f $mode, $all_ok)
