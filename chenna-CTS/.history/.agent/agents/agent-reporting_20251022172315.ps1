<#
Agent Name: Agent Reporting
Version: 1.0.0
Author: Chennakesava
Created: 2025-10-22
Description: Aggregates agent logs and metadata for reporting.
#>

$timestamp = Get-Date -Format "yyyy-MM-ddTHH-mm-ss"
$logDir = ".agent/logs"
$metadataFile = ".agent/agents/agent-metadata.json"
$reportFile = ".agent/reports/agent-report-$timestamp.txt"

# Create reports folder if missing
if (-not (Test-Path ".agent/reports")) {
    New-Item -ItemType Directory -Path ".agent/reports" | Out-Null
}

$report = @()
$report += "Agent Reporting Summary - $timestamp"
$report += "====================================="
$report += ""

# Load metadata
try {
    $metadata = Get-Content $metadataFile | ConvertFrom-Json
    $report += "Agent Metadata:"
    foreach ($agent in $metadata.PSObject.Properties.Name) {
        $info = $metadata.$agent
        $report += " - ${agent}: Version $($info.version), Last Run $($info.lastRun), Status $($info.status)"
    }
} catch {
    $report += "Error: Unable to load metadata."
}

$report += ""
$report += "Recent Logs:"
$report += "------------"

# Get latest 5 logs
$logs = Get-ChildItem $logDir -Filter *.log | Sort-Object LastWriteTime -Descending | Select-Object -First 5

foreach ($log in $logs) {
    $report += "`nLog: $($log.Name)"
    $report += Get-Content $log.FullName | Select-Object -First 10
}

# Save and display report
$report | Out-File -FilePath $reportFile -Encoding UTF8
$report | ForEach-Object { Write-Output $_ }

function Write-Run-Report {
    param([hashtable]$report)
    if (-not (Test-Path '.agent/reports/history')) { New-Item -ItemType Directory -Path '.agent/reports/history' -Force | Out-Null }
    $latest = '.agent/reports/run-latest.json'
    $history = '.agent/reports/history/run-' + (Get-Date).ToString('yyyyMMddTHHmmss') + '.json'
    $json = $report | ConvertTo-Json -Depth 6
    # backups-first
    $bk = Join-Path (New-Item -Path '.agent/backups' -ItemType Directory -Force -ErrorAction SilentlyContinue | Out-Null; (Get-ChildItem -Path '.agent/backups' | Sort-Object Name -Descending | Select-Object -First 1).FullName) 'run-latest.json'
    $json | Out-File -FilePath $bk -Encoding utf8
    $json | Out-File -FilePath $latest -Encoding utf8
    $json | Out-File -FilePath $history -Encoding utf8
}

function Compare-Shadow {
    param()
    if (-not (Test-Path '.agent/reports/shadow')) { New-Item -ItemType Directory -Path '.agent/reports/shadow' -Force | Out-Null }
    $out = @{ hit_rate = 0; pnl = 0; mdd = 0; alert_latency_ms = 0 }
    $path = '.agent/reports/shadow/compare-latest.json'
    $out | ConvertTo-Json | Out-File -FilePath $path -Encoding utf8
}

