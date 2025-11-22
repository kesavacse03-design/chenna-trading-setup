param()
# Read stdin
$stdin = [Console]::In.ReadToEnd()
if (-not $stdin) { exit 0 }
try { $payload = ConvertFrom-Json $stdin } catch { Write-Error "Invalid JSON"; exit 1 }
$bot = $env:TELEGRAM_BOT_TOKEN
$chat = $env:TELEGRAM_CHAT_ID
$indexPath = '.agent/reports/telegram-index.json'
$deadPath = '.agent/reports/alerts-deadletter.json'
$logsDir = '.agent/logs'
if (-not (Test-Path $logsDir)) { New-Item -ItemType Directory -Path $logsDir -Force | Out-Null }
if (-not (Test-Path '.agent/reports')) { New-Item -ItemType Directory -Path '.agent/reports' -Force | Out-Null }

# Load index
$index = @{}
if (Test-Path $indexPath) { try { $index = Get-Content $indexPath | ConvertFrom-Json } catch { $index = @{} } }
$key = $payload.event_key
if (-not $key) { $key = ("event_" + [guid]::NewGuid().ToString()) }

if (-not $bot -or -not $chat) {
    # Dry run log
    $out = @{timestamp=(Get-Date).ToString('o'); payload=$payload}
    $logFile = '.agent/logs/telegram-dryrun.log'
    $out | ConvertTo-Json | Out-File -FilePath $logFile -Append -Encoding utf8
    exit 0
}

# Simulated send/update: store message id mapping
$entry = @{ last_payload = $payload; last_updated = (Get-Date).ToString('o'); message_id = (Get-Random -Minimum 100000 -Maximum 999999) }
$index[$key] = $entry
$index | ConvertTo-Json | Out-File -FilePath $indexPath -Encoding utf8

# Simulate transient failure handling: random fail
$ok = $true
try {
    if ((Get-Random -Minimum 1 -Maximum 10) -le 2) { throw 'simulated' }
} catch {
    $ok = $false
}
if (-not $ok) {
    $dead = @()
    if (Test-Path $deadPath) { try { $dead = Get-Content $deadPath | ConvertFrom-Json } catch { $dead = @() } }
    $dead += @{ timestamp = (Get-Date).ToString('o'); payload = $payload }
    $dead | ConvertTo-Json | Out-File -FilePath $deadPath -Encoding utf8
    exit 1
}

exit 0
