$registryPath = "config/strategies/registry.json"
$logPath = ".agent/logs/strategy-errors.log"

$registry = Get-Content $registryPath | ConvertFrom-Json
$errors = @()

foreach ($s in $registry) {
    if (-not $s.id) { $errors += "Missing id" }
    if (-not $s.version) { $errors += "Missing version for $($s.id)" }
    if (-not $s.session) { $errors += "Missing session for $($s.id)" }
    if (-not $s.max_exposure.per_symbol -or -not $s.max_exposure.total) {
        $errors += "Missing exposure limits for $($s.id)"
    }
    if (-not $s.rr -or $s.rr -lt 1) {
        $errors += "Invalid RR for $($s.id)"
    }
    # Add more checks as needed
}

if ($errors.Count -gt 0) {
    $errors | Out-File $logPath
    Write-Error "Validation failed. See $logPath"
    exit 1
} else {
    Write-Host "✅ Strategy registry is valid."
}
