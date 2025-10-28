param(
    [int]$PollIntervalSeconds = 20,
    [switch]$Test,
    [object]$Watch = $false,
    [int]$DebounceSeconds = 3
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

# Ensure we run from the repository root so git commands use the correct working directory
try {
    $RepoRoot = (Resolve-Path -Path (Join-Path $PSScriptRoot '..\..')).Path
    Push-Location -LiteralPath $RepoRoot
} catch {
    # fallback: keep current location
}

# Normalize Watch parameter so callers can pass -Watch:$false or -Watch true/false strings
function Convert-ToBool {
    param($v)
    if ($v -is [System.Management.Automation.SwitchParameter]) { return [bool]$v.IsPresent }
    if ($v -is [bool]) { return $v }
    if ($null -eq $v) { return $false }
    try {
        $s = $v.ToString().ToLower()
        if ($s -in @('1','true','t','yes','y')) { return $true }
        return $false
    } catch { return $false }
}

$Watch = Convert-ToBool $Watch

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

function Add-FilesSafely {
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

function Invoke-OneCycle {
    # Discover changed files
    # Force array to avoid scalar/string outputs that break .Count checks
    $changed = @(Get-ChangedFiles)
    if ($changed.Count -eq 0) {
        return @{ acted = $false; pushOutput = '' }
    }

    # Stage safely (skip large files)
    $result = Add-FilesSafely -Paths $changed
    $staged = $result.staged
    $skipped = $result.skipped

    # If nothing staged after skipping, log and continue
    if (-not $staged -or $staged.Count -eq 0) {
        Write-Log 'INFO' 'no-staged' '' '' "Files changed but none staged (maybe all were large or deleted). Skipped: $($skipped -join ',')"
    return @{ acted = $false; pushOutput = '' }
    }

    $timestamp = (Get-Date).ToString('yyyy-MM-dd_HH-mm-ss')
    $branch = "auto-backup/$env:COMPUTERNAME/$timestamp"

    # Commit
    $commitMsg = "Auto-backup $timestamp"
    $commitOutput = git commit -m "$commitMsg" 2>&1 | Out-String
    $commitExit = $LASTEXITCODE
    if ($commitExit -ne 0) {
        # Could be nothing to commit if index unchanged
        Write-Log 'ERROR' 'commit' $branch '' "Commit failed or nothing to commit. Output: $commitOutput"
    return @{ acted = $false; pushOutput = '' }
    }

    $commitHash = (git rev-parse --short HEAD) -join ''

    # Create or move local branch to HEAD (force-update local branch only)
    git branch -f "$branch" HEAD 2>$null
    if ($LASTEXITCODE -ne 0) { Write-Log 'ERROR' 'branch-create' $branch $commitHash "Failed to create local branch $branch."; return @{ acted = $false } }

    # Push branch to origin (safe push without force)
    # Use HEAD:refs/heads/<branch> to avoid constructing malformed refspecs
    $pushOutput = git push -u origin "HEAD:refs/heads/$branch" 2>&1 | Out-String
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
    $res = Invoke-OneCycle
    if ($res.acted) { Write-Host "Test run: pushed $($res.branch) commit $($res.commit)"; exit 0 } else { Write-Host "Test run: nothing pushed or push failed."; exit 1 }
}

# Watch mode: use FileSystemWatcher to trigger backups on filesystem changes (debounced)
if ($Watch -and -not $Test) {
    try {
        # Repo root is two levels up from scripts folder (.agent\scripts)
        $repoRoot = (Resolve-Path -Path (Join-Path $PSScriptRoot '..\..')).Path
    } catch {
        $repoRoot = (Get-Location).Path
    }

    Write-Host "Starting watch mode on: $repoRoot (debounce=${DebounceSeconds}s)"


    $fsw = New-Object System.IO.FileSystemWatcher $repoRoot -Property @{ IncludeSubdirectories = $true; NotifyFilter = [System.IO.NotifyFilters]'FileName, LastWrite, DirectoryName' }

    # Helper function to ignore events under .git or .agent (use absolute repoRoot)
    function Test-ShouldIgnore {
        param([string]$path)
        if (-not $path) { return $true }
        $p = $path.ToString()
        return ($p -like "$repoRoot\\.git\\*" -or $p -like "$repoRoot\\.agent\\*" -or $p -match '\\.git\\' -or $p -match '\\.agent\\')
    }

    $script:pending = $false
    # Use approved verb (Test-ShouldIgnore) and avoid automatic variable names in the event handler
    $action = {
        param($src, $args)
        try {
            if (Test-ShouldIgnore $args.FullPath) { return }
            if ($script:pending) { return }
            $script:pending = $true
            Start-Sleep -Seconds $DebounceSeconds
            Invoke-OneCycle | Out-Null
        } finally {
            $script:pending = $false
        }
    }

    Register-ObjectEvent -InputObject $fsw -EventName Created -Action $action | Out-Null
    Register-ObjectEvent -InputObject $fsw -EventName Changed -Action $action | Out-Null
    Register-ObjectEvent -InputObject $fsw -EventName Renamed -Action $action | Out-Null
    Register-ObjectEvent -InputObject $fsw -EventName Deleted -Action $action | Out-Null

    $fsw.EnableRaisingEvents = $true

    Write-Host "Watching for file changes. Press Ctrl+C to exit."
    while ($true) { Start-Sleep -Seconds 3600 }
}

while ($true) {
    try {
    $res = Invoke-OneCycle
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


