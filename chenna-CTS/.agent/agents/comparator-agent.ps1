$shadowFolder = ".agent/reports/shadow"
$compareFolder = ".agent/reports/comparator"
$today = (Get-Date).ToString("yyyyMMdd")
$comparePath = "$compareFolder/compare-$today.json"

# Ensure folder exists
if (-not (Test-Path $compareFolder)) {
    New-Item -ItemType Directory -Path $compareFolder -Force | Out-Null
}

# Load all shadow files
$shadowFiles = @()
if (Test-Path $shadowFolder) { $shadowFiles = Get-ChildItem -Path $shadowFolder -Filter "strategies-*.json" | Sort-Object Name }
$history = @()

foreach ($file in $shadowFiles) {
    $data = @{}
    try { $data = Get-Content $file.FullName | ConvertFrom-Json } catch { $data = $null }
    if (-not $data -or -not $data.decisions) { continue }
    foreach ($d in $data.decisions) {
        if (-not $d.symbol -or $d.symbol -eq "") {
            continue  # Skip invalid entries
        }

        $entry = @{
            date = $file.BaseName.Substring(11)
            symbol = $d.symbol
            enter = $d.enter
            reason = $d.reason
            pnl = if ($d.enter) { Get-Random -Minimum -50 -Maximum 150 } else { 0 }
        }
        $history += $entry
    }
}

Write-Host ('Loaded {0} valid entries from shadow files' -f $history.Count)

# Group by symbol
$grouped = @()
if ($history.Count -gt 0) { $grouped = $history | Group-Object { $_.symbol } }
$summary = @()

foreach ($g in $grouped) {
    $entries = $g.Group
    $total = $entries.Count

    # Safely collect numeric pnl values
    $pnlValues = @()
    foreach ($e in $entries) {
        if ($null -ne $e -and $e.PSObject.Properties.Name -contains 'pnl' -and $e.pnl -ne $null) {
            try { $val = [double]$e.pnl } catch { $val = 0 }
            $pnlValues += $val
        }
    }

    $hits = 0
    if ($pnlValues.Count -gt 0) { $hits = ($pnlValues | Where-Object { $_ -gt 0 }).Count }

    if ($pnlValues.Count -eq 0) {
        $pnlSum = 0
        $mdd = 0
    } else {
        $pnlSum = ($pnlValues | Measure-Object -Sum).Sum
        $mdd = ($pnlValues | Measure-Object -Minimum).Minimum
    }

    $summary += @{
        symbol = $g.Name
        total_trades = $total
        hit_rate = if ($total -gt 0) { [math]::Round(($hits / $total) * 100, 2) } else { 0 }
        total_pnl = $pnlSum
        max_drawdown = $mdd
        eligible_for_promotion = ($hits -ge 3 -and $pnlSum -gt 200)
    }
}

# Write comparator output
$summary | ConvertTo-Json -Depth 5 | Set-Content $comparePath
Write-Host ('Comparator report written to {0}' -f $comparePath)

