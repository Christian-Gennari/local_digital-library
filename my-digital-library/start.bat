@echo off
cls

:: Build
echo Building frontend...
call npm run build

:: Start server in NEW window (so you can see logs)
echo Starting server in new window...
start "Node Server" cmd /k node server.mjs

:: Wait for server
echo Waiting for server to start...
timeout /t 5

:: Get hostname and setup funnel in this window
for /f "tokens=2" %%a in ('tailscale status ^| findstr /R "^[a-z]"') do (
    set HOSTNAME=%%a
    goto :found
)
:found

:: Generate certificates if needed
if not exist "%LOCALAPPDATA%\Tailscale\certs\%HOSTNAME%.key" (
    echo Generating certificates...
    tailscale cert %HOSTNAME%
)

:: Setup funnel
echo Setting up Tailscale Funnel...
tailscale serve reset
tailscale serve --bg 8080
tailscale funnel --bg 8080

:: Show result
cls
echo ========================================
echo    DIGITAL LIBRARY READY!
echo ========================================
echo.
echo Server is running in the other window
echo.
echo PUBLIC URL (KOReader):
echo   https://%HOSTNAME%/opds/all
echo.
echo This URL works from anywhere!
echo ========================================
echo.
pause