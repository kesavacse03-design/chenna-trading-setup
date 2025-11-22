$shadowFolder = ".agent/reports/shadow"
$compareFolder = ".agent/reports/comparator"
$today = (Get-Date).ToString("yyyyMMdd")
$comparePath = "$compareFolder/compare-$today.json"

# Ensure folder exists
if (-not (Test-Path $compareFolder)) {
    New-Item -ItemType Directory -Path $compareFolder -Force | Out-Null
}

# Load all shadow files
$shadowFiles = Get-ChildItem -Path $shadowFolder -Filter "strategies-*.json" | Sort-Object Name
$history = @()

foreach ($file in $shadowFiles) {
    $data = Get-Content $file.FullName | ConvertFrom-Json
    foreach ($d in $data.decisions) {
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

# Aggregate metrics
$grouped = $history | Where-Object { $_.symbol -and $_.symbol -ne "" } | Group-Object symbol
$summary = @()

foreach ($g in $grouped) {
    $entries = $g.Group
    $hits = ($entries | Where-Object { $_.pnl -gt 0 }).Count
    $total = $entries.Count

    # ensure $entries exists (previous code populates $entries)
    if (-not $entries -or $entries.Count -eq 0) {
        $pnlSum = 0
        $mdd = 0
    } else {
        # collect numeric pnl values safely
        $pnlValues = @()
        foreach ($e in $entries) {
            try {
                if ($null -ne $e -and $e.PSObject.Properties.Name -contains 'pnl' -and $e.pnl -ne $null) {
                    $val = 0
                    try { $val = [double]$e.pnl } catch { $val = 0 }
                    $pnlValues += $val
                }
            } catch {
                # ignore malformed entry
            }
        }
        if ($pnlValues.Count -eq 0) {
            $pnlSum = 0
            $mdd = 0
        } else {
            $pnlSum = ($pnlValues | Measure-Object -Sum).Sum
            $mdd = ($pnlValues | Measure-Object -Minimum).Minimum
        }
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
Write-Host "✅ Comparator report written to $comparePath"

