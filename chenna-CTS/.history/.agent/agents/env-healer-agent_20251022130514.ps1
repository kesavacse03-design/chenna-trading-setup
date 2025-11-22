<#
Agent Name: Env Healer Agent
Version: 1.0.0
Author: Chennakesava
Created: 2025-10-22
Description: Repairs missing or corrupted .env file with safe defaults.
#>

$timestamp = Get-Date -Format "yyyy-MM-ddTHH-mm-ss"
$logFile = ".agent/logs/env-healer-$timestamp.log"
$logOutput = @()

$logOutput += "Starting Env Healer Agent..."

# Check for missing .env
if (-Not (Test-Path ".env")) {
    $logOutput += "Missing .env file. Recreating..."
    @(
        "ENABLE_NEW_DASHBOARD=true",
        "USE_EXPERIMENTAL_CHARTS=false",
        "SHOW_BETA_BANNER=true"
    ) | Out-File -FilePath ".env" -Encoding UTF8
    $logOutput += ".env file recreated with safe defaults."
} else {
    # Check if .env is empty or corrupted
    $envContent = Get-Content ".env"
    if ($envContent.Count -eq 0) {
        $logOutput += ".env file is empty. Rewriting defaults..."
        @(
            "ENABLE_NEW_DASHBOARD=true",
            "USE_EXPERIMENTAL_CHARTS=false",
            "SHOW_BETA_BANNER=true"
        ) | Out-File -FilePath ".env" -Encoding UTF8
        $logOutput += ".env file repaired."
    } else {
        $logOutput += ".env file looks healthy. No action needed."
    }
}

$logOutput += "Env Healer Agent completed."
$logOutput | Out-File -FilePath $logFile -Encoding UTF8
