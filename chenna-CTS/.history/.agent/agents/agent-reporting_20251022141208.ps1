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

