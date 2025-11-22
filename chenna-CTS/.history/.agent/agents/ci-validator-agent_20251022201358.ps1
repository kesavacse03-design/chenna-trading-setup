$errors = @()
$requiredFiles = @(
    ".agent/reports/run-latest.json",
    ".agent/reports/comparator/compare-*.json",
    ".agent/reports/tracker/state.json",
    ".agent/rules/promotion-rule.json"
)

foreach ($path in $requiredFiles) {
    $exists = Get-ChildItem -Path $path -ErrorAction SilentlyContinue
    if (-not $exists) {
        $errors += "Missing: $path"
    }
}

if ($errors.Count -gt 0) {
    $errors | Set-Content ".agent/logs/ci-errors.log"
    Write-Host "❌ CI validation failed. See .agent/logs/ci-errors.log"
    exit 1
} else {
    Write-Host "✅ CI validation passed."
}
