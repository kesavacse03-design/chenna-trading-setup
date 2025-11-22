$botToken = $env:TELEGRAM_BOT_TOKEN
$chatId = $env:TELEGRAM_CHAT_ID
$runReportPath = ".agent/reports/run-latest.json"
$logPath = ".agent/logs/telegram-alerts.log"
$deadLetterPath = ".agent/logs/dead-letter.json"

# Ensure log folder exists
New-Item -ItemType Directory -Path ".agent/logs" -Force | Out-Null

# Load decisions
$report = Get-Content $runReportPath | ConvertFrom-Json
$decisions = $report.decisions | Where-Object { $_.enter -eq $true }

foreach ($d in $decisions) {
    $message = "🚨 Entry Alert: $($d.symbol)`nSession: $($d.session)`nTrail: $($d.trail)`nTargets: $($d.targets -join ', ')"
    $url = "https://api.telegram.org/bot$botToken/sendMessage"
    $body = @{
        chat_id = $chatId
        text = $message
        parse_mode = "Markdown"
    }

    try {
        $response = Invoke-RestMethod -Uri $url -Method Post -Body $body
        Add-Content -Path $logPath -Value "[$(Get-Date)] Sent alert for $($d.symbol)"
    } catch {
        Add-Content -Path $logPath -Value "[$(Get-Date)] FAILED alert for $($d.symbol): $_"
        $dead = @{
            symbol = $d.symbol
            message = $message
            error = $_.Exception.Message
            timestamp = (Get-Date).ToString("s")
        }
        $dead | ConvertTo-Json -Depth 5 | Add-Content -Path $deadLetterPath
    }
}
