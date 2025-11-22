# safe-backup-watcher.ps1
# Watches a folder and copies changed files into .backups/<timestamp>/<relative-path>
param(
  [string]$WatchPath = ".\src",          # folder to watch (adjust if you want other folder)
  [int]$DebounceMs = 600,                # debounce window to group rapid changes
  [int]$MaxSnapshotsToKeep = 0           # 0 = keep all; set to e.g. 30 to keep last 30 snapshots
)

$WatchPath = (Resolve-Path $WatchPath).ProviderPath
$RepoRoot = (Get-Location).ProviderPath
$BackupRoot = Join-Path -Path $RepoRoot -ChildPath ".backups"

Write-Host "Starting safe-backup-watcher..."
Write-Host "Watching: $WatchPath"
Write-Host "Backups root: $BackupRoot"

New-Item -ItemType Directory -Path $BackupRoot -Force | Out-Null

# pending change dictionary for debounce
$pending = [ordered]@{}

# create timer to flush pending after debounce
$timer = New-Object Timers.Timer
$timer.Interval = 500
$timer.AutoReset = $true
$timer.Enabled = $true

$timer.Add_Elapsed({
  $now = [DateTime]::UtcNow
  $keys = $pending.Keys | ForEach-Object { $_ }
  foreach ($k in $keys) {
    $entry = $pending[$k]
    if ((($now - $entry.when).TotalMilliseconds) -ge $DebounceMs) {
      try {
        $src = $entry.path
        if (Test-Path $src) {
          $rel = Resolve-Path -Path $src | ForEach-Object { $_.Path.Replace($RepoRoot, '').TrimStart('\','/') }
          $ts = $entry.timestamp
          $destDir = Join-Path $BackupRoot $ts
          $destFull = Join-Path $destDir $rel
          New-Item -ItemType Directory -Path (Split-Path $destFull) -Force | Out-Null
          Copy-Item -Path $src -Destination $destFull -Force
          Write-Host "Backed up: $rel -> $destFull"
        }
      } catch {
        Write-Host "Backup error for $src : $_"
      }
      $pending.Remove($k) | Out-Null
    }
  }
})

# helper to get current timestamp folder name (one per batch)
function Get-Ts { (Get-Date).ToString("yyyyMMdd-HHmmss") }

# filesystem watcher
$fsw = New-Object System.IO.FileSystemWatcher
$fsw.Path = $WatchPath
$fsw.IncludeSubdirectories = $true
$fsw.NotifyFilter = [IO.NotifyFilters]'FileName, LastWrite, Size'
$fsw.Filter = '*.*'

# event action - add to pending with a timestamp bucket
$action = {
  param($src, $e)
  $full = $e.FullPath
  if ($full -like "*\.backups\*") { return }
  $key = $full.ToLower()
  $ts = Get-Ts
  $pending[$key] = @{ path = $full; when = [DateTime]::UtcNow; timestamp = $ts }
}

$created = Register-ObjectEvent $fsw Created -Action $action
$changed = Register-ObjectEvent $fsw Changed -Action $action
$renamed = Register-ObjectEvent $fsw Renamed -Action $action
$deleted = Register-ObjectEvent $fsw Deleted -Action $action

$fsw.EnableRaisingEvents = $true

Write-Host "safe-backup-watcher running. Press Ctrl+C to stop."

try {
  while ($true) { Start-Sleep -Seconds 1 }
} finally {
  Unregister-Event -SourceIdentifier $created.Name -ErrorAction SilentlyContinue
  Unregister-Event -SourceIdentifier $changed.Name -ErrorAction SilentlyContinue
  Unregister-Event -SourceIdentifier $renamed.Name -ErrorAction SilentlyContinue
  Unregister-Event -SourceIdentifier $deleted.Name -ErrorAction SilentlyContinue
  $timer.Stop()
  $fsw.Dispose()
}
