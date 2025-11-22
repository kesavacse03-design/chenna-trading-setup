<#
Agent Name: Scheduler Agent
Version: 1.0.1
Author: Chennakesava
Created: 2025-10-22
Description: Runs agents based on time or conditions.
#>

$timestamp = Get-Date -Format "yyyy-MM-ddTHH-mm-ss"
$logFile = ".agent/logs/scheduler-$timestamp.log"
$logOutput = @()

$logOutput += "⏰ Scheduler Agent started at $timestamp"
$hour = (Get-Date).Hour
$agentTriggered = $false

# Run health check every morning at 9 AM
if ($hour -eq 9) {
    $logOutput += "🩺 Running health-check agent (9 AM)..."
    powershell .\.agent\agents\agent-health-check.ps1
    $agentTriggered = $true
}

# Run flag audit every evening at 6 PM
if ($hour -eq 18) {
    $logOutput += "🚩 Running flag-audit agent (6 PM)..."
    powershell .\.agent\agents\flag-audit-agent.ps1
    $agentTriggered = $true
}

# Run decision logic every night at 10 PM
if ($hour -eq 22) {
    $logOutput += "🧠 Running decision logic agent (10 PM)..."
    powershell .\.agent\agents\agent-decision-logic.ps1
    $agentTriggered = $true
}

if (-not $agentTriggered) {
    $logOutput += "⏳ No agents scheduled for current hour ($hour)."
}

$logOutput += "✅ Scheduler Agent completed."
$logOutput | Out-File -FilePath $logFile -Encoding UTF8

# Also show output in terminal
$logOutput | ForEach-Object { Write-Output $_ }
