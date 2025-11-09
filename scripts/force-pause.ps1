$ErrorActionPreference='Stop'
Write-Output 'Forcing PAUSE: setting execution_mode=PAUSE'
$status = Join-Path (Join-Path $PSScriptRoot '..') 'backend/jobs/marketdata_status.json'
if (Test-Path $status) {
  $j = Get-Content $status | ConvertFrom-Json
  $j.execution_mode = 'PAUSE'
  $j | ConvertTo-Json -Depth 6 | Set-Content $status -Encoding UTF8
  Write-Output 'PAUSE written.'
} else {
  New-Item -Force -Path (Split-Path $status) -ItemType Directory | Out-Null
  '{"provider":"UNKNOWN","execution_mode":"PAUSE"}' | Set-Content $status -Encoding UTF8
  Write-Output 'Status file created with PAUSE.'
}
