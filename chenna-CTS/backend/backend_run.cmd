@echo off
setlocal EnableDelayedExpansion
cd /d D:\chenna-trading-system-dashboard\chenna-CTS\backend

REM Load .env if present (ignore comments and blank lines)
if exist .env (
	for /f "usebackq tokens=1,* delims== eol=#" %%a in (".env") do (
		if not "%%a"=="" (
			set "%%a=%%b"
		)
	)
)

if not defined BACKEND_PORT set BACKEND_PORT=3001

echo Starting backend on 0.0.0.0:%BACKEND_PORT% ...
node server.cjs
echo Backend exited with code %errorlevel%
pause
