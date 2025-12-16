@echo off
echo ========================================
echo  Restarting Backend and Frontend
echo ========================================

:: Kill any existing node processes
echo Stopping existing processes...
taskkill /f /im node.exe 2>nul

:: Wait a moment
timeout /t 2 /nobreak >nul

:: Start Backend
echo.
echo Starting Backend...
start "Backend" cmd /k "cd /d D:\chenna-trading-system-dashboard\chenna-CTS\backend && npm run dev"

:: Wait for backend to start
timeout /t 3 /nobreak >nul

:: Start Frontend
echo Starting Frontend...
start "Frontend" cmd /k "cd /d D:\chenna-trading-system-dashboard && npm run dev"

echo.
echo ========================================
echo  Both servers starting!
echo  Backend: http://localhost:3001
echo  Frontend: http://localhost:5173
echo ========================================
