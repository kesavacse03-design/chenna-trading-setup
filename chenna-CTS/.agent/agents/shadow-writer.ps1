$runReportPath = ".agent/reports/run-latest.json"
$shadowFolder = ".agent/reports/shadow"
$today = (Get-Date).ToString("yyyyMMdd")
$shadowPath = "$shadowFolder/strategies-$today.json"

# Ensure folder exists
if (-not (Test-Path $shadowFolder)) {
    New-Item -ItemType Directory -Path $shadowFolder -Force | Out-Null
}

# Copy today's run-latest.json to shadow file
Copy-Item -Path $runReportPath -Destination $shadowPath -Force

Write-Host "✅ Shadow report written to $shadowPath"
