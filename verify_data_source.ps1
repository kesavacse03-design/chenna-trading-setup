# Database vs LocalStorage Verification Script
Write-Host "=== Verifying Stock Data Source ===" -ForegroundColor Cyan

# 1. Check Database
Write-Host "`n1. Checking Database Content..." -ForegroundColor Yellow
$dbStocks = Invoke-RestMethod -Uri "http://localhost:3001/api/stocks" -Method Get
Write-Host "   Database has $($dbStocks.Count) stocks:" -ForegroundColor Green
foreach ($stock in $dbStocks) {
    Write-Host "   - $($stock.stockName) in $($stock.category) (added: $($stock.date))" -ForegroundColor Cyan
}

# 2. Open browser and clear localStorage
Write-Host "`n2. Opening browser to clear localStorage..." -ForegroundColor Yellow
Write-Host "   Follow these steps in the browser:" -ForegroundColor Gray
Write-Host "   a. Press F12 to open DevTools" -ForegroundColor Gray
Write-Host "   b. Go to Console tab" -ForegroundColor Gray
Write-Host "   c. Run: localStorage.clear()" -ForegroundColor Gray
Write-Host "   d. Refresh page (F5)" -ForegroundColor Gray
Write-Host "   e. Check if stocks still appear" -ForegroundColor Gray

Start-Process "http://localhost:5173"
Start-Sleep -Seconds 3

# 3. Instructions for incognito test
Write-Host "`n3. Testing in Incognito Mode:" -ForegroundColor Yellow
Write-Host "   If you see stocks in Incognito, they're from DATABASE ✓" -ForegroundColor Green
Write-Host "   If you don't see stocks, they're from localStorage ✗" -ForegroundColor Red

Write-Host "`n=== Quick LocalStorage Clear Commands ===" -ForegroundColor Cyan
Write-Host "Open browser console (F12) and run:" -ForegroundColor Yellow
Write-Host "  localStorage.clear()" -ForegroundColor White
Write-Host "  sessionStorage.clear()" -ForegroundColor White
Write-Host "  location.reload()" -ForegroundColor White

Write-Host "`n=== Summary ===" -ForegroundColor Cyan
if ($dbStocks.Count -gt 0) {
    Write-Host "✓ Database has $($dbStocks.Count) stocks" -ForegroundColor Green
    Write-Host "✓ Backend is working correctly" -ForegroundColor Green
    Write-Host "→ If you see MORE stocks in UI than in database, they're from localStorage" -ForegroundColor Yellow
} else {
    Write-Host "✗ Database is empty" -ForegroundColor Red
    Write-Host "→ All UI stocks are from localStorage" -ForegroundColor Yellow
}
