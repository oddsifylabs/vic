@echo off
cls
echo.
echo   VIC — Update from GitHub
echo   ------------------------
echo.

cd /d "%~dp0"

:: Check git
where git >nul 2>&1
if %errorlevel% neq 0 (
    echo   ERROR: Git not found.
    echo   Download from: https://git-scm.com/download/win
    echo.
    pause
    exit /b 1
)

:: Check we're in a git repo
git status >nul 2>&1
if %errorlevel% neq 0 (
    echo   ERROR: This folder is not a git repository.
    echo   Clone VIC first:
    echo     git clone https://github.com/YOUR_USERNAME/vic .
    echo.
    pause
    exit /b 1
)

echo   Fetching latest from GitHub...
echo.
git fetch origin

:: Show what's changed
echo   Changes incoming:
git log HEAD..origin/main --oneline 2>nul
if %errorlevel% neq 0 (
    echo   (already up to date)
    echo.
    pause
    exit /b 0
)

echo.
echo   Pulling updates (your data folder is safe)...
git pull origin main

if %errorlevel% neq 0 (
    echo.
    echo   Pull failed. You may have local changes conflicting.
    echo   To force update (keeps your data folder safe):
    echo     git fetch origin
    echo     git reset --hard origin/main
    echo.
    pause
    exit /b 1
)

echo.
echo   +------------------------------------------+
echo   ^|  VIC updated successfully!               ^|
echo   ^|  Run start.bat to launch.                ^|
echo   +------------------------------------------+
echo.
pause
