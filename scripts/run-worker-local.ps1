<#
Run the run-worker directly with Node (fallback when Docker isn't available).
Usage:
  .\scripts\run-worker-local.ps1 -PayloadPath .\payload.json
#>
param(
  [string]$PayloadPath = "$PWD\payload.json"
)

if (-not (Test-Path $PayloadPath)) {
  Write-Error "Payload file not found: $PayloadPath"
  exit 1
}

Write-Host "Running run-worker locally with payload: $PayloadPath"
$node = "node"
$script = "backend/strategy/run-worker.cjs"

if (-not (Get-Command $node -ErrorAction SilentlyContinue)) {
  Write-Error "Node.js is not installed or not in PATH. Please install Node.js (v18+) to run locally."
  exit 2
}

# Run and stream output
try {
  $startInfo = @{ FilePath = $node; ArgumentList = @($script, $PayloadPath); NoNewWindow = $true; PassThru = $true; Wait = $true; RedirectStandardOutput = "$PWD\run-worker-local.log"; RedirectStandardError = "$PWD\run-worker-local.err" }
  $proc = Start-Process @startInfo
  $code = $proc.ExitCode
} catch {
  Write-Host "Start-Process failed, attempting direct node invocation (streaming to files)"
  & $node $script $PayloadPath > "$PWD\run-worker-local.log" 2> "$PWD\run-worker-local.err"
  $code = $LASTEXITCODE
}
Write-Host "run-worker exited with code: $code"
Write-Host "Stdout -> $PWD\run-worker-local.log"
Write-Host "Stderr -> $PWD\run-worker-local.err"

exit $code
