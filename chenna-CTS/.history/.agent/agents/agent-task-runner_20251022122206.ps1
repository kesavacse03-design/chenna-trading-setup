param (
    [string]$TaskName
)

$timestamp = Get-Date -Format "yyyy-MM-ddTHH-mm-ss"
$logFile = ".agent/logs/$TaskName-$timestamp.log"

Write-Output "Running agent task: $TaskName" | Tee-Object -FilePath $logFile

switch ($TaskName) {
    "backup" {
        powershell .\.agent\scripts\backup-repo.ps1 | Tee-Object -FilePath $logFile -Append
    }
    "cleanup" {
        powershell .\.agent\scripts\cleanup-backups.ps1 | Tee-Object -FilePath $logFile -Append
    }
    default {
        Write-Output "Unknown task: $TaskName" | Tee-Object -FilePath $logFile -Append
    }
    "flag-audit" {
    powershell .\.agent\agents\flag-audit-agent.ps1 | Tee-Object -FilePath $logFile -Append
  }
}
