param(
    [int]$PollIntervalSeconds = 20,
    [switch]$Test
)

<#
.agent/scripts/git-auto-backup.ps1

Main automatic Git watcher.

Features:
- Polls the repository for changes (configurable interval).
- Stages changes while skipping files >50MB.
- Commits with message "Auto-backup <timestamp>".
- Creates a timestamped branch: auto-backup/<COMPUTERNAME>/<YYYY-MM-DD_HH-mm-ss>
- Pushes the branch to origin without forcing remote refs.
- Logs structured events to .agent/git-auto-backup.log
- Supports -Test (single-run) and -PollIntervalSeconds parameter.

Usage examples:
    # run once (test)
    powershell -File .\.agent\scripts\git-auto-backup.ps1 -Test

    # run continuously (default)
    powershell -File .\.agent\scripts\git-auto-backup.ps1

Note: This script does NOT modify other repo files; it only stages/commits changes already in the workspace.
#>


Set-StrictMode -Version Latest

$LogFile = Join-Path -Path $PSScriptRoot -ChildPath "..\git-auto-backup.log" | Resolve-Path -ErrorAction SilentlyContinue
if (-not $LogFile) { $LogFile = (Join-Path -Path $PSScriptRoot -ChildPath "..\git-auto-backup.log") }

function Write-Log {
    param($Level, $Action, $Branch, $Commit, $Message)
    $ts = (Get-Date).ToString('o')
    $line = "{" + "`"timestamp`":`"$ts`", `"level`":`"$Level`", `"action`":`"$Action`", `"branch`":`"$Branch`", `"commit`":`"$Commit`", `"message`":`"$Message`"}" 
    Add-Content -Path $LogFile -Value $line -Encoding UTF8
}

function Get-ChangedFiles {
    # Use git status --porcelain to get modified/untracked files
    $out = git status --porcelain 2>$null
    if ($LASTEXITCODE -ne 0) { return @() }
    $lines = $out -split "`n" | ForEach-Object { $_.Trim() } | Where-Object { $_ }
    $paths = @()
    foreach ($line in $lines) {
        # porcelain lines like: M file.txt  or ?? newfile.txt
        $parts = $line -split '\s+', 3
        $path = $parts[-1]
        if ($path) { $paths += $path }
    }
    return $paths
}

function Stage-Files-Safely {
    param([string[]]$Paths)
    $maxBytes = 50MB
    $staged = @()
    $skipped = @()
    foreach ($p in $Paths) {
        if (-not (Test-Path -LiteralPath $p)) { continue }
        try {
            $fi = Get-Item -LiteralPath $p -ErrorAction Stop
            if ($fi.Length -gt $maxBytes) {
                $skipped += $p
                Write-Log 'WARN' 'skip-large-file' '' '' "Skipped large file $p ($($fi.Length) bytes)."
                continue
            }
        } catch {
            # Could be a directory or removed file; attempt to add anyway
        }
        git add -- "$p" 2>$null
        if ($LASTEXITCODE -eq 0) { $staged += $p }
    }
    return @{ staged = $staged; skipped = $skipped }
}

function Run-OneCycle {
    # Discover changed files
    $changed = Get-ChangedFiles
    if (-not $changed -or $changed.Count -eq 0) {
        return @{ acted = $false }
    }

    # Stage safely (skip large files)
    $result = Stage-Files-Safely -Paths $changed
    $staged = $result.staged
    $skipped = $result.skipped

    # If nothing staged after skipping, log and continue
    if (-not $staged -or $staged.Count -eq 0) {
        Write-Log 'INFO' 'no-staged' '' '' "Files changed but none staged (maybe all were large or deleted). Skipped: $($skipped -join ',')"
        return @{ acted = $false }
    }

    $timestamp = (Get-Date).ToString('yyyy-MM-dd_HH-mm-ss')
    $branch = "auto-backup/$env:COMPUTERNAME/$timestamp"

    # Commit
    $commitMsg = "Auto-backup $timestamp"
    git commit -m "$commitMsg" 2>&1 | Out-String
    if ($LASTEXITCODE -ne 0) {
        # Could be nothing to commit if index unchanged
        Write-Log 'ERROR' 'commit' $branch '' "Commit failed or nothing to commit."
        return @{ acted = $false }
    }

    $commitHash = (git rev-parse --short HEAD) -join ''

    # Create or move local branch to HEAD (force-update local branch only)
    git branch -f "$branch" HEAD 2>$null
    if ($LASTEXITCODE -ne 0) { Write-Log 'ERROR' 'branch-create' $branch $commitHash "Failed to create local branch $branch."; return @{ acted = $false } }

    # Push branch to origin (safe push without force)
    $pushOutput = git push -u origin "refs/heads/$branch:refs/heads/$branch" 2>&1 | Out-String
    $pushExit = $LASTEXITCODE
    if ($pushExit -eq 0) {
        Write-Log 'INFO' 'push' $branch $commitHash "Push success."
        return @{ acted = $true; branch = $branch; commit = $commitHash; pushOutput = $pushOutput }
    } else {
        Write-Log 'ERROR' 'push' $branch $commitHash "Push failed: $pushOutput"
        return @{ acted = $false; branch = $branch; commit = $commitHash; pushOutput = $pushOutput }
    }
}

# Main loop
$failureCount = 0
$maxFailures = 3

if ($Test) {
    $res = Run-OneCycle
    if ($res.acted) { Write-Host "Test run: pushed $($res.branch) commit $($res.commit)"; exit 0 } else { Write-Host "Test run: nothing pushed or push failed."; exit 1 }
}

while ($true) {
    try {
        $res = Run-OneCycle
        if ($res.acted) {
            $failureCount = 0
        } else {
            if ($res.pushOutput -and $res.pushOutput -ne '') { $failureCount++ }
        }

        if ($failureCount -ge $maxFailures) {
            # backoff: sleep longer and reset counter
            Write-Log 'WARN' 'backoff' '' '' "Detected $failureCount consecutive push failures; backing off for 120 seconds."
            Start-Sleep -Seconds 120
            $failureCount = 0
        }
    } catch {
        Write-Log 'ERROR' 'loop-exception' '' '' "Exception: $($_.Exception.Message)"
    }

    Start-Sleep -Seconds $PollIntervalSeconds
}
# .agent/scripts/git-auto-backup.ps1
param(
  [int]$pollSeconds = 20,
  [string]$remote = "origin",
  [string]$backupPrefix = "auto-backup",
  [string]$logFile = ".agent/git-auto-backup.log"
)

function Log($msg) {
  $ts = (Get-Date).ToString("yyyy-MM-dd HH:mm:ss")
  $line = "[$ts] $msg"
  Add-Content -Path $logFile -Value $line -Force
  Write-Output $line
}

Push-Location -LiteralPath (Resolve-Path -Path ".").Path

if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
  Log "ERROR: git not found in PATH. Exiting."
  exit 1
}

Log "Auto-backup watcher starting. pollSeconds=$pollSeconds"

$lastCommitHashFile = ".agent/git-auto-backup-lastcommit.txt"
if (-not (Test-Path $lastCommitHashFile)) {
  New-Item -Path $lastCommitHashFile -ItemType File -Force | Out-Null
}

while ($true) {
  try {
    # Stage everything (respects .gitignore)
    git add -A

    # Any changes?
    $porcelain = git status --porcelain
    if (-not [string]::IsNullOrWhiteSpace($porcelain)) {
      $timestamp = Get-Date -Format "yyyy-MM-dd_HH-mm-ss"
      $commitMsg = "Auto-backup $timestamp"
      git commit -m $commitMsg

      $newHash = git rev-parse --short HEAD
      Log "Committed changes locally: $newHash - $commitMsg"
      Set-Content -Path $lastCommitHashFile -Value $newHash -Force

      $safeBranch = "$backupPrefix/$($env:COMPUTERNAME)/$timestamp"
      git branch -f $safeBranch HEAD
      Log "Created local branch $safeBranch"

      $pushStdout = git push -u $remote refs/heads/$safeBranch:refs/heads/$safeBranch 2>&1
      if ($LASTEXITCODE -eq 0) {
        Log "Pushed backup to $remote/$safeBranch"
      } else {
        Log "Push failed for $remote/${safeBranch}: $pushStdout"
      }
    } 
  } catch {
    Log "Exception during backup loop: $($_.Exception.Message)"
  }

  Start-Sleep -Seconds $pollSeconds
}

