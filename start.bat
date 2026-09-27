@echo off
cd /d "%~dp0"
echo Starting OmniExtractor Desktop...
call npx electron .
if errorlevel 1 (
    echo.
    echo [Error] Failed to start. Press any key to exit...
    pause >nul
)
