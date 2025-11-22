# Start server with timestamped log file and without committing secrets
# Usage examples (do not commit secrets):
#   $env:TOKENS_ENCRYPTION_KEY = 'your-32-byte-base64-or-hex-key'; $env:ADMIN_API_TOKEN='strong-secret'; .\scripts\start-server.ps1
#   OR run in one-liner: powershell -NoProfile -Command "$env:TOKENS_ENCRYPTION_KEY='...'; $env:ADMIN_API_TOKEN='...'; \".\\scripts\\start-server.ps1\""

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
$backend = Split-Path -Parent $scriptDir
$ts = Get-Date -Format 'yyyyMMdd-HHmmss'
$outLog = Join-Path $backend ("server-" + $ts + ".out.log")
$errLog = Join-Path $backend ("server-" + $ts + ".err.log")
Write-Host "Starting server in directory:" $backend
Write-Host "Stdout log:" $outLog
Write-Host "Stderr log:" $errLog
# Start node detached; use Start-Process and redirect stdout/err to different files
Start-Process -FilePath "node" -ArgumentList ".\server.cjs" -WorkingDirectory $backend -RedirectStandardOutput $outLog -RedirectStandardError $errLog
Write-Host "Server started (detached). Check the latest logs with:`n  Get-Content $outLog -Tail 200 -Wait`n  Get-Content $errLog -Tail 200 -Wait"
