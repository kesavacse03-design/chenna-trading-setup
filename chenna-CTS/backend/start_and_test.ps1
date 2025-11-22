# Startup and Test Script for CTS Backend
Write-Host "=== CTS Backend Startup and Test ===" -ForegroundColor Cyan

# 1. Kill any existing node processes
Write-Host "1. Stopping any existing backend processes..." -ForegroundColor Yellow
Get-Process -Name node -ErrorAction SilentlyContinue | Where-Object {$_.Path -like '*chenna-trading-system-dashboard*'} | Stop-Process -Force
Start-Sleep -Seconds 2

# 2. Start backend in background
Write-Host "2. Starting backend server..." -ForegroundColor Yellow
$backend = Start-Process -FilePath "npm" -ArgumentList "run", "dev" -WorkingDirectory "d:\chenna-trading-system-dashboard\chenna-CTS\backend" -PassThru -WindowStyle Normal

# 3. Wait for server to be ready
Write-Host "3. Waiting for server to start (15 seconds)..." -ForegroundColor Yellow
Start-Sleep -Seconds 15

# 4. Test health endpoint
Write-Host "4. Testing health endpoint..." -ForegroundColor Yellow
try {
    $health = Invoke-RestMethod -Uri "http://localhost:3001/health" -Method Get -TimeoutSec 5
    Write-Host "   ✓ Health check passed: $($health.status)" -ForegroundColor Green
} catch {
    Write-Host "   ✗ Health check failed: $_" -ForegroundColor Red
    exit 1
}

# 5. Test instrument search endpoint
Write-Host "5. Testing instrument search..." -ForegroundColor Yellow
try {
    $instruments = Invoke-RestMethod -Uri "http://localhost:3001/api/instruments/search?q=RELIANCE&limit=5" -Method Get -TimeoutSec 5
    Write-Host "   ✓ Found $($instruments.Count) instruments" -ForegroundColor Green
} catch {
    Write-Host "   ✗ Instrument search failed: $_" -ForegroundColor Red
}

# 6. Test stock import endpoint
Write-Host "6. Testing stock import endpoint..." -ForegroundColor Yellow
$testPayload = @{
    symbol = "RELIANCE"
    date = "2025-11-22"
    category = "INTRADAY BOOST"
} | ConvertTo-Json

try {
    $result = Invoke-RestMethod -Uri "http://localhost:3001/api/stocks" -Method Post -ContentType "application/json" -Body $testPayload -TimeoutSec 5
    Write-Host "   ✓ Stock import successful: $($result.stockName)" -ForegroundColor Green
} catch {
    if ($_.Exception.Response.StatusCode -eq 409) {
        Write-Host "   ✓ Duplicate detection working (stock already exists)" -ForegroundColor Green
    } else {
        Write-Host "   ✗ Stock import failed: $_" -ForegroundColor Red
        Write-Host "   Error details: $($_.Exception.Message)" -ForegroundColor Red
    }
}

# 7. Verify database
Write-Host "7. Verifying database content..." -ForegroundColor Yellow
try {
    $stocks = Invoke-RestMethod -Uri "http://localhost:3001/api/stocks" -Method Get -TimeoutSec 5
    Write-Host "   ✓ Database has $($stocks.Count) stocks" -ForegroundColor Green
    if ($stocks.Count -gt 0) {
        Write-Host "   Sample: $($stocks[0].stockName) in $($stocks[0].category)" -ForegroundColor Cyan
    }
} catch {
    Write-Host "   ✗ Database check failed: $_" -ForegroundColor Red
}

Write-Host "`n=== Test Complete ===" -ForegroundColor Cyan
Write-Host "Backend is running on port 3001" -ForegroundColor Green
Write-Host "Frontend URL: http://localhost:5173" -ForegroundColor Yellow
Write-Host "`nPress Ctrl+C in the backend window to stop the server" -ForegroundColor Gray
