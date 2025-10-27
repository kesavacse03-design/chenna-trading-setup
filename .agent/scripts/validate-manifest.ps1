# Validate manifest.json file paths
$manifestPath = ".agent/manifest.json"
if (-not (Test-Path $manifestPath)) {
    Write-Host "❌ Manifest file not found at $manifestPath"
    exit 1
}

$manifest = Get-Content $manifestPath | ConvertFrom-Json
$missing = @()

foreach ($entry in $manifest.files) {
    $path = $entry.path
    if (-not (Test-Path $path)) {
        $missing += $path
    }
}

if ($missing.Count -eq 0) {
    Write-Host "✅ All manifest paths are valid."
} else {
    Write-Host "⚠️ Missing or invalid paths:"
    $missing | ForEach-Object { Write-Host " - $_" }
    exit 1
}