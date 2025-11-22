# Agent health check: probes backend, upstox (stub), quotes (stub)
$backend_ok = $false
try {
    $r = Invoke-WebRequest -Uri 'http://localhost:3001/health' -UseBasicParsing -TimeoutSec 3 -ErrorAction Stop
    if ($r.StatusCode -eq 200) { $backend_ok = $true }
} catch {
    $backend_ok = $false
}

# upstox probe: if env var missing, stub as true if UPSTOX_ENABLED is false
$upstox_ok = $false
if ($env:UPSTOX_ENABLED -and $env:UPSTOX_ENABLED -eq 'true') {
    try {
        # Attempt a lightweight probe; placeholder URL
        $upstox_ok = $true # stubbed: assume OK when enabled
    } catch { $upstox_ok = $false }
} else { $upstox_ok = $true }

# quotes probe: stubbed; could ping a local quote service
$quotes_ok = $false
try {
    # If a quotes service exists at http://localhost:3002/ohlc sample, ping it
    $quotes_ok = $true
} catch { $quotes_ok = $false }

$all_ok = ($backend_ok -and $upstox_ok -and $quotes_ok)

$result = @{ backend_ok = $backend_ok; upstox_ok = $upstox_ok; quotes_ok = $quotes_ok; all_ok = $all_ok }
$result | ConvertTo-Json -Depth 5
