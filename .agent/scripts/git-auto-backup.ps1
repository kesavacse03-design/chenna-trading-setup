param(
  [string]$RepoRoot = (Resolve-Path "$PSScriptRoot\..\..").Path,   # two levels up from .agent\scripts
  [string]$Branch   = "backup/CHENNA",
  [int]   $IntervalSeconds = 60
)

function Write-Info($msg){ Write-Host ("[$(Get-Date -Format s)] " + $msg) -ForegroundColor Cyan }
function Write-Warn($msg){ Write-Host ("[$(Get-Date -Format s)] " + $msg) -ForegroundColor Yellow }
function Write-Err ($msg){ Write-Host ("[$(Get-Date -Format s)] " + $msg) -ForegroundColor Red }

# sanity: git available?
$gitVer = git --version 2>$null
if (-not $gitVer){ Write-Err "git not found on PATH"; exit 1 }

# sanity: repo root contains .git
if (-not (Test-Path (Join-Path $RepoRoot ".git"))) {
  Write-Err "Repo not found at $RepoRoot"
  exit 1
}

Set-Location $RepoRoot
Write-Info "RepoRoot  : $RepoRoot"

# ensure branch exists and is checked out
$cur = (git rev-parse --abbrev-ref HEAD).Trim()
if ($cur -ne $Branch) {
  Write-Info "Checking out $Branch (creating if needed)"
  git checkout -B $Branch | Out-Null
}

# check remote
$hasOrigin = (git remote 2>$null | Select-String -SimpleMatch "origin") -ne $null
if (-not $hasOrigin) { Write-Warn "No 'origin' remote set. Commits will be local only until you add one." }

Write-Info "Starting watcher on branch $Branch. Interval: $IntervalSeconds sec."
while ($true) {
  try {
    # stage changes
    git add -A

    # skip commit if nothing changed
    $dirty = git status --porcelain
    if ([string]::IsNullOrWhiteSpace($dirty)) {
      Start-Sleep -Seconds $IntervalSeconds
      continue
    }

    $msg = "auto backup: $(Get-Date -Format 'yyyy-MM-ddTHH:mm:ss')"
    git commit -m $msg | Out-Null

    if ($hasOrigin) {
      git push -u origin $Branch | Out-Null
      Write-Info "Committed & pushed: $msg"
    } else {
      Write-Info "Committed locally (no origin): $msg"
    }
  }
  catch {
    Write-Err ("Backup loop error: " + $_.Exception.Message)
  }
  Start-Sleep -Seconds $IntervalSeconds
}
