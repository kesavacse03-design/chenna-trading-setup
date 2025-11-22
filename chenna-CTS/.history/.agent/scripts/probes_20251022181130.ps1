function Get-Probes {
  $backend_ok = $false
  try {
    $r = Invoke-WebRequest -UseBasicParsing -TimeoutSec 3 "http://localhost:3001/health"
    if ($r.StatusCode -eq 200) { $backend_ok = $true }
  } catch { $backend_ok = $false }

  $upstox_ok = [bool]($env:UPSTOX_API_KEY -and $env:UPSTOX_API_SECRET)   # stub true when env set
  $quotes_ok = $true                                                      # stub for now
  $all_ok = ($backend_ok -and $upstox_ok -and $quotes_ok)
  return @{ backend_ok=$backend_ok; upstox_ok=$upstox_ok; quotes_ok=$quotes_ok; all_ok=$all_ok }
}
