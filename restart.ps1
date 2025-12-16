# Quick Restart Script for Backend + Frontend
# Run this from PowerShell: .\restart.ps1

Write-Host "========================================"
Write-Host " Restarting Backend and Frontend" -ForegroundColor Cyan
Write-Host "========================================"

# Kill existing node processes
Write-Host "`nStopping existing processes..." -ForegroundColor Yellow
Get-Process node -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 2

# Start Backend in new PowerShell window
Write-Host "Starting Backend..." -ForegroundColor Green
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd 'D:\chenna-trading-system-dashboard\chenna-CTS\backend'; npm run dev"

Start-Sleep -Seconds 3

# Start Frontend in new PowerShell window
Write-Host "Starting Frontend..." -ForegroundColor Green
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd 'D:\chenna-trading-system-dashboard'; npm run dev"

Write-Host "`n========================================"
Write-Host " Both servers starting!" -ForegroundColor Cyan
Write-Host " Backend: http://localhost:3001" -ForegroundColor White
Write-Host " Frontend: http://localhost:5173" -ForegroundColor White
Write-Host "========================================"
