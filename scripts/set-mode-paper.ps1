$status = Join-Path (Join-Path $PSScriptRoot '..') 'backend/jobs/marketdata_status.json'
Write-Output 'Switching execution_mode=PAPER'
$obj = @{ provider = 'UNKNOWN'; execution_mode = 'PAPER'; ts = (Get-Date).ToString('s') }
$json = $obj | ConvertTo-Json -Compress
$dir = Split-Path $status -Parent
if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Force -Path $dir | Out-Null }
Set-Content -Path $status -Value $json -Encoding UTF8
Write-Output "OK: $status"