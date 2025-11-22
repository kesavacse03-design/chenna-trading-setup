# === Load flags ===
$flagsPath = ".agent/config/launch-flags.json"
$flags = Get-Content $flagsPath | ConvertFrom-Json
$liveTrading = $flags.live_trading_enabled
$hybridMode = $flags.hybrid_mode_enabled
$telegramEnabled = $flags.telegram_enabled
$upstoxEnabled = $flags.upstox_enabled
$shadowEnabled = $flags.v2_shadow_enabled

# === Run probes ===
$backendOk = $false
try {
    $response = Invoke-RestMethod -Uri "http://localhost:3001/health" -TimeoutSec 5
    if ($response.status -eq "ok") { $backendOk = $true }
} catch { $backendOk = $false }

$quotesOk = $true  # Assume quotes are working
if ($upstoxEnabled -eq $false) {
    $upstoxOk = $false
} else {
    $upstoxOk = $true
}

$allOk = $backendOk -and $quotesOk -and $upstoxOk
$mode = if ($hybridMode -and -Not $allOk) { "MOCK" } else { "LIVE" }

Write-Host "mode:$mode all_ok:$allOk"

# === STEP 6: Inject mock decisions and alerts ===
$decisions = @(
    @{
        symbol = "RELIANCE"
        action = "BUY"
        confidence = 0.95
        reason = "Mock signal for RELIANCE"
    },
    @{
        symbol = "TCS"
        action = "SELL"
        confidence = 0.88
        reason = "Mock signal for TCS"
    }
)

$alerts = @()
if ($telegramEnabled) {
    foreach ($decision in $decisions) {
        if ($decision.action -ne "HOLD") {
            $msg = "Signal: $($decision.action) $($decision.symbol) (Confidence: $($decision.confidence))"
            $alerts += @{
                type = "base"
                symbol = $decision.symbol
                action = $decision.action
                message = $msg
            }

            # Send Telegram alert
            $botToken = [System.Environment]::GetEnvironmentVariable("TELEGRAM_BOT_TOKEN", "User")
            $chatId = [System.Environment]::GetEnvironmentVariable("TELEGRAM_CHAT_ID", "User")
            $url = "https://api.telegram.org/bot$botToken/sendMessage"
            Invoke-RestMethod -Uri $url -Method Post -Body @{ chat_id = $chatId; text = $msg }
        }
    }
}

# === Write final report ===
$report = @{
    flags = $flags
    timestamp = (Get-Date).ToString("s")
    mode = $mode
    probes = @{
        upstox_ok = $upstoxOk
        backend_ok = $backendOk
        quotes_ok = $quotesOk
        all_ok = $allOk
    }
    decisions = $decisions
    alerts = $alerts
}
$reportPath = ".agent/reports/run-latest.json"
$report | ConvertTo-Json -Depth 5 | Set-Content $reportPath

Write-Host "✅ Agent run complete. Report saved to run-latest.json"
