$ErrorActionPreference='Stop'
Write-Output 'Resuming: setting execution_mode=LIVE'
$status = Join-Path (Join-Path $PSScriptRoot '..') 'backend/jobs/marketdata_status.json'
if (Test-Path $status) {
  $j = Get-Content $status | ConvertFrom-Json
  $j.execution_mode = 'LIVE'
  $j | ConvertTo-Json -Depth 6 | Set-Content $status -Encoding UTF8
  Write-Output 'LIVE written.'
} else {
  New-Item -Force -Path (Split-Path $status) -ItemType Directory | Out-Null
  '{"provider":"UNKNOWN","execution_mode":"LIVE"}' | Set-Content $status -Encoding UTF8
  Write-Output 'Status file created with LIVE.'
}