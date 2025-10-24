param(
  [string]$BranchPrefix = "backup",
  [int]$IntervalSeconds = 60
)

$ErrorActionPreference = "Stop"
function Write-Info($msg) { Write-Host ("[2025-10-24T08:47:15.658519] " + $msg) }

# Ensure we're in repo root (script is placed in .agent/scripts)
Set-Location -Path (Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path))

if (-not (Test-Path ".git")) {
  Write-Host ".git not found. Initialize a repo first."
  exit 1
}

$pc = "4973f7236721"
$branch = "$BranchPrefix/$pc"

git fetch --all | Out-Null
$current = (git rev-parse --abbrev-ref HEAD).Trim()
if ($current -ne $branch) {
  try {
    git checkout -B $branch
  } catch { }
}

Write-Host "Auto-backup active on branch: $branch (interval: $IntervalSeconds s)"
while ($true) {
  try {
    git add -A
    $ts = (Get-Date).ToString("yyyy-MM-dd HH:mm:ss")
    $hashBefore = (git rev-parse HEAD) 2>$null
    git diff --cached --quiet
    if ($LASTEXITCODE -ne 0) {
      git commit -m "[auto] backup at $ts"
      git push -u origin $branch
      Write-Host "Committed & pushed at $ts"
    }
  } catch {
    Write-Host "Backup loop error: $($_.Exception.Message)"
  }
  Start-Sleep -Seconds $IntervalSeconds
}
