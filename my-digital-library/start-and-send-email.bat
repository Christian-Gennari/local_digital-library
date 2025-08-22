@echo off
cls
echo Building frontend...
call npm run build

echo.
echo Starting server...
start /B node server.mjs
timeout /t 3 >nul

echo.
echo Starting Bore tunnel and sending email...
echo ========================================
python capture_bore.py
pause