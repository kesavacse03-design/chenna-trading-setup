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
