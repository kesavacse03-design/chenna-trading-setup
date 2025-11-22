param([string]$TaskName = "realtime")

# Timestamped log file
$timestamp = Get-Date -Format "yyyy-MM-ddTHH-mm-ss"
$logFile = ".agent/logs/$TaskName-$timestamp.log"

# Validate strategy registry
Write-Host "🔍 Validating strategy registry..."
powershell -ExecutionPolicy Bypass -File ".agent/validators/validate-strategy-registry.ps1"

# Log task start
Write-Output "Running agent task: $TaskName" | Tee-Object -FilePath $logFile

# Backup helper
function New-BackupFolder {
    param([string]$Base = ".agent/backups")
    $ts = (Get-Date).ToString('yyyy-MM-ddTHH-mm-ss')
    $dest = Join-Path $Base $ts
    New-Item -ItemType Directory -Path $dest -Force | Out-Null
    return $dest
}

# Backup pruning
function Prune-Backups {
    param([string]$Base = ".agent/backups", [int]$keep = 20)
    if (-Not (Test-Path $Base)) { return }
    $dirs = Get-ChildItem -Path $Base | Where-Object { $_.PSIsContainer } | Sort-Object Name -Descending
    $toDelete = $dirs | Select-Object -Skip $keep
    foreach ($d in $toDelete) { Remove-Item -Recurse -Force $d.FullName }
}

# Mode resolver
function Resolve-Mode {
    param([hashtable]$probes)

    $flags = @{  
        live = [bool](if ($env:LIVE_TRADING_ENABLED) { $env:LIVE_TRADING_ENABLED -eq 'true' } else { $false })
        hybrid = [bool](if ($env:HYBRID_MODE_ENABLED) { $env:HYBRID_MODE_ENABLED -eq 'true' } else { $true })
    }

    $all_ok = $true
    foreach ($k in $probes.Keys) {
        if (-not $probes[$k]) { $all_ok = $false; break }
    }

    $mode = 'OFF'
    if (-not $flags.hybrid) {
        if ($flags.live -and $all_ok) { $mode = 'LIVE' }
    } else {
        if ($all_ok -and $flags.live) { $mode = 'LIVE' } else { $mode = 'MOCK' }
    }

    $report = @{
        mode = $mode
        probes = $probes
        timestamp = (Get-Date).ToString('o')
    }

    if (-not (Test-Path '.agent/reports')) {
        New-Item -ItemType Directory -Path '.agent/reports/history' -Force | Out-Null
    }

    $latest = '.agent/reports/run-latest.json'
    $history = '.agent/reports/history/run-' + (Get-Date).ToString('yyyyMMddTHHmmss') + '.json'
    $json = $report | ConvertTo-Json -Depth 5

    $backupFolder = New-BackupFolder
    $bkLatest = Join-Path $backupFolder 'run-latest.json'
    $json | Out-File -FilePath $bkLatest -Encoding utf8
    $json | Out-File -FilePath $latest -Encoding utf8
    $json | Out-File -FilePath $history -Encoding utf8

    Prune-Backups
    return $report
}

# LIVE mode gate
function Ensure-Live {
    param([string]$mode)
    return ($mode -eq 'LIVE')
}

# Task dispatcher
switch ($TaskName) {
    'realtime' {
        if (-not (Test-Path '.agent/logs')) {
            New-Item -ItemType Directory -Path '.agent/logs' -Force | Out-Null
        }

        powershell -NoProfile -ExecutionPolicy Bypass -File ".\.agent\agents\realtime-agent.ps1" 2>&1 | Tee-Object -FilePath $logFile -Append
        break
    }

    default {
        Write-Host "Unknown task: $TaskName"
        break
    }
}

