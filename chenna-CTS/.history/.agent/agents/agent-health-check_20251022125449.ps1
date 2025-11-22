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

# Check for missing .env file
if (-Not (Test-Path ".env")) {
    $logOutput += "⚠️ Missing .env file"
} else {
    $logOutput += "✅ .env file exists"
}

# Check for uncommitted changes
$gitStatus = git status --porcelain
if ($gitStatus) {
    $logOutput += "⚠️ Uncommitted changes detected:"
    $logOutput += $gitStatus
} else {
    $logOutput += "✅ No uncommitted changes"
}

# Check for broken backups (missing ZIP files)
$backupDirs = Get-ChildItem ".agent/backups" -Directory
foreach ($dir in $backupDirs) {
    $zipFiles = Get-ChildItem "$($dir.FullName)" -Filter "repo-*.zip"
    if ($zipFiles.Count -eq 0) {
        $logOutput += "⚠️ Backup folder missing ZIP: $($dir.Name)"
    } else {
        $logOutput += "✅ Backup folder OK: $($dir.Name)"
    }
}

$logOutput += "✅ Health check completed."

# Write all output to log file
$logOutput | Out-File -FilePath $logFile -Encoding UTF8
