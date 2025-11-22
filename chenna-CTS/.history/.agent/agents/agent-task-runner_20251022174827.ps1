param([string]$TaskName = "realtime")

$timestamp = Get-Date -Format "yyyy-MM-ddTHH-mm-ss"
$logFile = ".agent/logs/$TaskName-$timestamp.log"

Write-Output "Running agent task: $TaskName" | Tee-Object -FilePath $logFile

# Backups-first helper
function New-BackupFolder {
    param([string]$Base = ".agent/backups")
    $ts = (Get-Date).ToString('yyyy-MM-ddTHH-mm-ss')
    $dest = Join-Path $Base $ts
    New-Item -ItemType Directory -Path $dest -Force | Out-Null
    return $dest
}

function Prune-Backups {
    param([string]$Base = ".agent/backups", [int]$keep = 20)
    if (-Not (Test-Path $Base)) { return }
    $dirs = Get-ChildItem -Path $Base | Where-Object { $_.PSIsContainer } | Sort-Object Name -Descending
    $toDelete = $dirs | Select-Object -Skip $keep
    foreach ($d in $toDelete) { Remove-Item -Recurse -Force $d.FullName }
}

# Resolve-Mode step
function Resolve-Mode {
    param([hashtable]$probes)
    $flags = @{ 
        live = [bool](if ($env:LIVE_TRADING_ENABLED) { ($env:LIVE_TRADING_ENABLED -eq 'true') } else { $false })
        hybrid = [bool](if ($env:HYBRID_MODE_ENABLED) { ($env:HYBRID_MODE_ENABLED -eq 'true') } else { $true })
    }

    $all_ok = $true
    foreach ($k in $probes.Keys) { if (-not $probes[$k]) { $all_ok = $false; break } }

    $mode = 'OFF'
    if (-not $flags.hybrid) {
        if ($flags.live -and $all_ok) { $mode = 'LIVE' } else { $mode = 'OFF' }
    } else {
        if ($all_ok -and $flags.live) { $mode = 'LIVE' } else { $mode = 'MOCK' }
    }

    $report = @{ mode = $mode; probes = $probes; timestamp = (Get-Date).ToString('o') }
    if (-not (Test-Path '.agent/reports')) { New-Item -ItemType Directory -Path '.agent/reports/history' -Force | Out-Null }
    $latest = '.agent/reports/run-latest.json'
    $history = '.agent/reports/history/run-' + (Get-Date).ToString('yyyyMMddTHHmmss') + '.json'
    $json = $report | ConvertTo-Json -Depth 5
    $backupFolder = New-BackupFolder
    # write to backup first
    $bkLatest = Join-Path $backupFolder 'run-latest.json'
    $json | Out-File -FilePath $bkLatest -Encoding utf8
    # copy to final
    $json | Out-File -FilePath $latest -Encoding utf8
    $json | Out-File -FilePath $history -Encoding utf8

    Prune-Backups
    return $report
}

# Hard-gate helper
function Ensure-Live {
    param([string]$mode)
    return ($mode -eq 'LIVE')
}

# Task dispatcher (add realtime default)
switch ($TaskName) {
    'realtime' {
        if (-not (Test-Path '.agent/logs')) { New-Item -ItemType Directory -Path '.agent/logs' -Force | Out-Null }
        $logFile = '.agent/logs/agent-task-runner.log'
        # invoke the realtime agent and tee output to log
        powershell -NoProfile -ExecutionPolicy Bypass -File ".\.agent\agents\realtime-agent.ps1" 2>&1 | Tee-Object -FilePath $logFile -Append
        break
    }
    default {
        Write-Host "Unknown task: $TaskName"
        break
    }
}
