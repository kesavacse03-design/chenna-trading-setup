# Build and run the run-worker image for a smoke test
param(
  [string]$PayloadPath = "$PWD\payload.json",
  [int]$MemoryMB = 512,
  [decimal]$CPUs = 0.5
)

# Build image
Write-Host "Building cts-run-worker image..."
$buildOutput = & npm run docker:build-runworker 2>&1
$buildExit = $LASTEXITCODE
Write-Host $buildOutput

if ($buildExit -ne 0) {
  Write-Host "Docker build failed or Docker is not available. Ensure Docker Desktop is installed and running." -ForegroundColor Red
  exit 1
}

# Run container with limits
$memArg = "--memory=${MemoryMB}m"
$cpuArg = "--cpus=$CPUs"
Write-Host "Running container with $memArg and $cpuArg"
$pwdEscaped = (Get-Location).Path
$runCmd = "docker run --rm $memArg $cpuArg -v `"$pwdEscaped`":/app -v `"$PayloadPath`":/run/payload.json:ro cts-run-worker /run/payload.json"
Write-Host $runCmd
Invoke-Expression $runCmd
