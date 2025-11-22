<#
Agent Name: Git Hook Agent
Version: 1.0.1
Author: Chennakesava
Created: 2025-10-22
Description: Runs agents based on Git commit or push events.
#>

$timestamp = Get-Date -Format "yyyy-MM-ddTHH-mm-ss"
$logFile = ".agent/logs/git-hook-$timestamp.log"
$logOutput = @()

$logOutput += "Git Hook Agent triggered at $timestamp"

# Get latest commit message
$recentCommit = git log -1 --pretty=format:"%h - %s (%an)"
$logOutput += "Latest commit: $recentCommit"

# Get changed files in last commit
$changedFiles = git diff --name-only HEAD~1 HEAD
$logOutput += "Changed files:`n$changedFiles"

# Check for critical file changes
if ($changedFiles -match "\.env" -or $changedFiles -match "flags.json") {
    $logOutput += "Critical config changed. Running env-healer and flag-audit..."
    powershell .\.agent\agents\env-healer-agent.ps1
    powershell .\.agent\agents\flag-audit-agent.ps1
} else {
    $logOutput += "No critical changes detected. No agents triggered."
}

$logOutput += "Git Hook Agent completed."
$logOutput | Out-File -FilePath $logFile -Encoding UTF8
$logOutput | ForEach-Object { Write-Output $_ }

