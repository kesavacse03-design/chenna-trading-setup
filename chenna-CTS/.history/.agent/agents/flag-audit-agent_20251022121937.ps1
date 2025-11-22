# Agent: Flag Audit
$timestamp = Get-Date -Format "yyyy-MM-ddTHH-mm-ss"
$logFile = ".agent/logs/flag-audit-$timestamp.log"

Write-Output "Starting flag audit..." | Tee-Object -FilePath $logFile

# Search for common flag patterns
$patterns = @("FEATURE_FLAG", "featureFlag", "flag_", "REACT_APP_", "process.env")
$matches = @()

foreach ($pattern in $patterns) {
    $result = Select-String -Path "src\**\*.ts", "src\**\*.tsx", "src\**\*.js" -Pattern $pattern -CaseSensitive:$false
    if ($result) {
        $matches += $result
    }
}

if ($matches.Count -eq 0) {
    Write-Output "✅ No scattered flags found." | Tee-Object -FilePath $logFile -Append
} else {
    Write-Output "⚠️ Found potential scattered flags:" | Tee-Object -FilePath $logFile -Append
    $matches | ForEach-Object { $_.Line } | Tee-Object -FilePath $logFile -Append
}

Write-Output "Flag audit completed." | Tee-Object -FilePath $logFile -Append
