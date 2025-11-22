param(
    [string]$TaskName = "ChennaPaperDailyRun",
    [string]$StartTime = "03:00",
    [string]$WorkingDir = "$(Split-Path -Parent $MyInvocation.MyCommand.Definition)"
)

# This script registers a daily scheduled task that runs scripts/paper_daily_task.ps1.
# It does NOT run the task immediately; it only registers it. Run this script with
# elevated/admin rights if required by your environment.

$scriptPath = Join-Path -Path $WorkingDir -ChildPath "paper_daily_task.ps1"
if (-not (Test-Path $scriptPath)) {
    Write-Error "Could not find $scriptPath. Ensure scripts/paper_daily_task.ps1 exists in the same folder as this script."
    exit 2
}

$action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$scriptPath`""
$parsedTime = $null
try {
    # Accept times like 03:00 or 03:00:00 or 3:00
    $parsedTime = [datetime]::ParseExact($StartTime, @('HH:mm', 'H:mm', 'HH:mm:ss', 'H:mm:ss'), $null)
}
catch {
    try { $parsedTime = Get-Date $StartTime } catch { $parsedTime = $null }
}
if (-not $parsedTime) { Write-Error "Could not parse StartTime='$StartTime' as a time."; exit 2 }
$trigger = New-ScheduledTaskTrigger -Daily -At $parsedTime
$principal = New-ScheduledTaskPrincipal -UserId "NT AUTHORITY\SYSTEM" -RunLevel Highest

try {
    Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Principal $principal -Force | Out-Null
    Write-Output "Scheduled task '$TaskName' registered to run daily at $StartTime executing: $scriptPath"
}
catch {
    Write-Error "Failed to register scheduled task: $_"
    exit 1
}
