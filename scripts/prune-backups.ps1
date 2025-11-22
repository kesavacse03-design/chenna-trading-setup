<#
Prune large backup files into `archive/` and record moves in moves.json.
Run with -WhatIf for dry run.
#>
param(
    [switch]$WhatIf
)
$root = Resolve-Path ..\
$archive = Join-Path $root Path 'archive'
if (-not (Test-Path $archive)) { if (-not $WhatIf) { New-Item -ItemType Directory -Path $archive | Out-Null } }

$patterns = @("backup*", "backups", "*.gz", "*.zip", "*.sql", "*.ibd", "*.ib_logfile*", "run_*", "*.log")
$moves = @()
Get-ChildItem -Path $root -Recurse -File -ErrorAction SilentlyContinue | ForEach-Object {
    $p = $_.FullName
    foreach ($pat in $patterns) {
        if ($_.Name -like $pat -or $_.DirectoryName -like "*\\backups\\*") {
            $dest = Join-Path $archive ($_.Name)
            Write-Output ("Move: {0} -> {1}" -f $p, $dest)
            if (-not $WhatIf) {
                Move-Item -Path $p -Destination $dest -Force
                $moves += @{ from = $p; to = $dest }
            }
            break
        }
    }
}
if (-not $WhatIf -and $moves.Count -gt 0) {
    $moves | ConvertTo-Json | Out-File -FilePath (Join-Path $root 'moves.json') -Encoding utf8
    Write-Output "Recorded $($moves.Count) moves to moves.json"
}
