<#
Agent Name: Scheduler Agent
Version: 1.0.0
Author: Chennakesava
Created: 2025-10-22
Description: Runs agents based on time or conditions.
#>

$timestamp = Get-Date -Format "yyyy-MM-ddTHH-mm-ss"
$logFile = ".agent/logs/scheduler-$timestamp.log"
$logOutput = @()

$logOutput += "⏰ Starting Scheduler Agent..."

$hour = (Get-Date).Hour

# Run health check every morning at 9 AM
if ($hour -eq 9) {
    $logOutput += "Running health-check agent (9 AM)..."
    powershell .\.agent\agents\agent-health-check.ps1
}

# Run flag audit every evening at 6 PM
if ($hour -eq 18) {
    $logOutput += "Running flag-audit agent (6 PM)..."
    powershell .\.agent\agents\flag-audit-agent.ps1
}

# Run decision logic every night at 10 PM
if ($hour -eq 22) {
    $logOutput += "Running decision logic agent (10 PM)..."
    powershell .\.agent\agents\agent-decision-logic.ps1
}

$logOutput += "✅ Scheduler Agent completed."
$logOutput | Out-File -FilePath $logFile -Encoding UTF8
