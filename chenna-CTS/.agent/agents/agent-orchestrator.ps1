<#
Agent Name: Agent Orchestrator
Version: 1.0.0
Author: Chennakesava
Created: 2025-10-22
Description: Chains agents based on task type and logs decisions.
#>

param (
    [string]$TaskType
)

$timestamp = Get-Date -Format "yyyy-MM-ddTHH-mm-ss"
$logFile = ".agent/logs/orchestrator-$timestamp.log"
$logOutput = @()

$logOutput += "🧠 Starting Agent Orchestrator for task: $TaskType"

switch ($TaskType) {
    "system-check" {
        $logOutput += "Running health-check agent..."
        powershell .\.agent\agents\agent-health-check.ps1
        $logOutput += "Running env-healer agent..."
        powershell .\.agent\agents\env-healer-agent.ps1
    }
    "flag-review" {
        $logOutput += "Running flag-audit agent..."
        powershell .\.agent\agents\flag-audit-agent.ps1
        $logOutput += "Running env-healer agent..."
        powershell .\.agent\agents\env-healer-agent.ps1
    }
    default {
        $logOutput += "Unknown task type: $TaskType"
    }
}

$logOutput += "✅ Orchestration complete."
$logOutput | Out-File -FilePath $logFile -Encoding UTF8
