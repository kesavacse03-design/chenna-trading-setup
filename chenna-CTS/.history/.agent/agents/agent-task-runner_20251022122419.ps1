<#
Agent Name: Flag Audit Agent
Version: 1.0.0
Author: Chennakesava
Created: 2025-10-22
Description: Scans repo for scattered feature flags and logs findings.
#>

$timestamp = Get-Date -Format "yyyy-MM-ddTHH-mm-ss"
$logFile = ".agent/logs/flag-audit-$timestamp.log"
$logOutput = @()

$logOutput += "Starting flag audit..."

# Search for common flag patterns
$patterns = @("FEATURE_FLAG", "featureFlag", "flag_", "REACT_APP_", "process.env")
$matches = @()

foreach ($pattern in $patterns) {
    $result = Select-String -Path "src\**\*.ts", "src\**\*.tsx", "src\**\*.js" -Pattern $pattern -CaseSensitive:$false
    if ($result) {
        $matches += $result
    }
}

if ($matches.Count -eq 0) {
    $logOutput += "✅ No scattered flags found."
} else {
    $logOutput += "⚠️ Found potential scattered flags:"
    $logOutput += ($matches | ForEach-Object { $_.Line })
}

$logOutput += "Flag audit completed."

# Write all output to log file once
$logOutput | Out-File -FilePath $logFile -Encoding UTF8
