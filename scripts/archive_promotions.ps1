$ErrorActionPreference='Stop'
$src = Join-Path (Join-Path $PSScriptRoot '..') 'backend/jobs/promotion_records'
$dst = Join-Path (Join-Path $PSScriptRoot '..') 'archive/promotion_records'
New-Item -ItemType Directory -Force -Path $dst | Out-Null
if (Test-Path $src) { Copy-Item -Recurse -Force -Path "$src/*" -Destination $dst; Write-Output "Archived to $dst" } else { Write-Output 'No promotion records found' }