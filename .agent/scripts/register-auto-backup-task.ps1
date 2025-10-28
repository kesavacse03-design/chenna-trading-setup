<#
.agent/scripts/register-auto-backup-task.ps1

Create a Scheduled Task "CTS Auto Backup" to run git-auto-backup at user logon.

Usage:
    powershell -File .\.agent\scripts\register-auto-backup-task.ps1 -RunAtLogon -UsePwsh
#>
param(
    [string]$UserName = $env:USERNAME,
    [switch]$RunAtLogon,
    [switch]$UsePwsh
)

Set-StrictMode -Version Latest

$taskName = 'CTS Auto Backup'
$scriptPath = (Resolve-Path -Path "${PSScriptRoot}\git-auto-backup.ps1").Path

if ($UsePwsh) {
    $exe = (Get-Command pwsh -ErrorAction SilentlyContinue).Source
    if (-not $exe) { Write-Host "pwsh not found, falling back to powershell.exe"; $exe = [Environment]::ExpandEnvironmentVariables('%SystemRoot%\\System32\\WindowsPowerShell\\v1.0\\powershell.exe') }
} else {
    $exe = [Environment]::ExpandEnvironmentVariables('%SystemRoot%\\System32\\WindowsPowerShell\\v1.0\\powershell.exe')
}

# Build action
$action = New-ScheduledTaskAction -Execute $exe -Argument "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$scriptPath`""

# Build trigger
if ($RunAtLogon) {
    $trigger = New-ScheduledTaskTrigger -AtLogOn
} else {
    # default: register trigger at logon
    $trigger = New-ScheduledTaskTrigger -AtLogOn
}

# settings: do not start new instance if already running
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -MultipleInstances IgnoreNew

try {
    $exists = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
    if ($exists) {
        Write-Host "Task '$taskName' already exists. Recreating..."
        Unregister-ScheduledTask -TaskName $taskName -Confirm:$false
    }

    Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Settings $settings -User $UserName -RunLevel LeastPrivilege
    Write-Host "Task '$taskName' registered successfully to run at logon."
} catch {
    Write-Host "Failed to register scheduled task: $($_.Exception.Message)"
    exit 1
}
