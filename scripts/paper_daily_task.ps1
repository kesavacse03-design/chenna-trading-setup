$ErrorActionPreference = 'Stop'
$env:ALLOW_LIVE_CALLS = '1'
$env:CTS_API_BASE = 'http://127.0.0.1:3001'
Set-Location 'D:\chenna-trading-system-dashboard'
# Run daily PAPER rollout and then monitor
npm run paper:daily
npm run paper:monitor
