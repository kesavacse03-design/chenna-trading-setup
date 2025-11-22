function Get-Probes {
    # Probe backend health
    $backend_ok = $false
    try {
        $resp = Invoke-WebRequest -UseBasicParsing -TimeoutSec 3 -Uri 'http://localhost:3001/health' -Method GET -ErrorAction Stop
        if ($resp.StatusCode -eq 200) { $backend_ok = $true }
    } catch {
        $backend_ok = $false
    }

    # Upstox probe - stubbed: require env vars to be present to be considered OK
    $upstox_ok = $false
    if ($env:UPSTOX_API_KEY -and $env:UPSTOX_API_SECRET) {
        $upstox_ok = $true
    } else {
        $upstox_ok = $false
    }

    # Quotes probe - stubbed as true for now
    $quotes_ok = $true

    $all_ok = ($backend_ok -and $upstox_ok -and $quotes_ok)

    return @{ backend_ok = $backend_ok; upstox_ok = $upstox_ok; quotes_ok = $quotes_ok; all_ok = $all_ok }
}
function Get-Probes {
    # backend probe
    $backend_ok = $false
    try {
        $r = Invoke-WebRequest -Uri 'http://localhost:3001/health' -UseBasicParsing -TimeoutSec 3 -ErrorAction Stop
        if ($r.StatusCode -eq 200) { $backend_ok = $true }
    } catch {
        $backend_ok = $false
    }

    # upstox probe: require API keys to be set, otherwise stub as false
    $upstox_ok = $false
    if ($env:UPSTOX_API_KEY -and $env:UPSTOX_API_SECRET) { $upstox_ok = $true } else { $upstox_ok = $false }

    # quotes probe: stub as true for now
    $quotes_ok = $true

    $all_ok = ($backend_ok -and $upstox_ok -and $quotes_ok)
    return @{ backend_ok = $backend_ok; upstox_ok = $upstox_ok; quotes_ok = $quotes_ok; all_ok = $all_ok }
}
