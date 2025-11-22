<#
Agent Name: Health Check Agent
Version: 1.0.0
Author: Chennakesava
Created: 2025-10-22
Description: Scans repo for missing files, broken links, and uncommitted changes.
#>

$timestamp = Get-Date -Format "yyyy-MM-ddTHH-mm-ss"
$logFile = ".agent/logs/health-check-$timestamp.log"
$logOutput = @()

$logOutput += "🔍 Starting health check..."

# Check for missing .env
if (-Not (Test-Path ".env")) {
    $logOutput += "⚠️ Missing .env file"
}

# Check for uncommitted changes
$gitStatus = git status --porcelain
if ($gitStatus) {
    $logOutput += "⚠️ Uncommitted changes detected:"
    $logOutput += $gitStatus
}

# Check for broken backups
$backupDirs = Get-ChildItem ".agent/backups" -Directory
foreach ($dir in $backupDirs) {
    if (-Not (Test-Path "$($dir.FullName)/repo-*.zip")) {
        $logOutput += "⚠️ Backup folder missing ZIP: $($dir.Name)"
    }
}

$logOutput += "✅ Health check completed."
$logOutput | Out-File -FilePath $logFile -Encoding UTF8
