$registryPath = "config/strategies/registry.json"
$watchlistPath = "templates/sample-watchlist.json"
$runReportPath = ".agent/reports/run-latest.json"
$shadowReportPath = ".agent/reports/shadow/strategies-latest.json"
$trackerPath = ".agent/reports/tracker/state.json"

$registry = Get-Content $registryPath | ConvertFrom-Json
$watchlist = Get-Content $watchlistPath | ConvertFrom-Json
$decisions = @()
$tracker = @()
$totalExposure = 0

foreach ($row in $watchlist) {
    $strategy = $registry | Where-Object { $_.id -eq $row.strategy_id }

    if (-not $strategy) {
        $decisions += @{ symbol = $row.symbol; enter = $false; reason = "Unknown strategy" }
        continue
    }

    $estExposure = $row.quantity_or_risk * 100
    if ($estExposure -gt $strategy.max_exposure.per_symbol -or ($totalExposure + $estExposure) -gt $strategy.max_exposure.total) {
        $decisions += @{ symbol = $row.symbol; enter = $false; reason = "exceeds cap" }
        continue
    }

    $decision = @{
        symbol = $row.symbol
        strategy_id = $row.strategy_id
        session = $row.session
        enter = $true
        reason = "meets criteria"
        entry = "TBD"
        targets = @(1.5, 2.0)
        sl = "TBD"
        trail = $strategy.trail
        exposure_est = $estExposure
        track_10d = $true
    }

    $decisions += $decision
    $totalExposure += $estExposure

    if ($decision.track_10d) {
        $tracker += @{
            symbol = $decision.symbol
            opened_at = (Get-Date).ToString("s")
            current_sl = $decision.sl
            current_target_idx = 0
            last_update = (Get-Date).ToString("s")
            active = $true
            session_end_action = "review"
        }
    }
}

$report = @{ decisions = $decisions }

# Ensure folders exist
New-Item -ItemType Directory -Path ".agent/reports/shadow" -Force | Out-Null
New-Item -ItemType Directory -Path ".agent/reports/tracker" -Force | Out-Null

# Write outputs
$report | ConvertTo-Json -Depth 5 | Set-Content $runReportPath
$report | ConvertTo-Json -Depth 5 | Set-Content $shadowReportPath
$tracker | ConvertTo-Json -Depth 5 | Set-Content $trackerPath
