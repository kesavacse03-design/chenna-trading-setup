<#
Agent Name: Decision Logic Agent
Version: 1.0.0
Author: Chennakesava
Created: 2025-10-22
Description: Runs audit and triggers fallback healing if needed.
#>

$timestamp = Get-Date -Format "yyyy-MM-ddTHH-mm-ss"
$logFile = ".agent/logs/decision-logic-$timestamp.log"
$logOutput = @()

$logOutput += "🧠 Starting Decision Logic Agent..."

# Run flag audit and capture output
$flagAuditLog = ".agent/logs/flag-audit-$timestamp.log"
powershell .\.agent\agents\flag-audit-agent.ps1
Start-Sleep -Seconds 1  # Ensure log file is flushed

# Count scattered flags from audit log
$flagLines = Get-Content $flagAuditLog | Where-Object { $_ -like "*scattered flags*" }
$flagCount = $flagLines.Count

if ($flagCount -ge 1) {
    $logOutput += "⚠️ Scattered flags detected. Triggering env-healer..."
    powershell .\.agent\agents\env-healer-agent.ps1
    $logOutput += "✅ Healing agent executed."
} else {
    $logOutput += "✅ No scattered flags. System is clean."
}

$logOutput += "Decision Logic Agent completed."
$logOutput | Out-File -FilePath $logFile -Encoding UTF8

