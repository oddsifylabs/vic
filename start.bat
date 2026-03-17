@echo off
cls
echo.
echo   VIC - Vegas Intelligence Console
echo   ---------------------------
echo.

:: Go to the folder this script lives in (the USB drive)
cd /d "%~dp0"
set "VIC_DIR=%~dp0"

:: ?? Check Node.js ????????????????????????????????????????
where node >nul 2>&1
if %errorlevel% neq 0 (
    echo   ERROR: Node.js not found.
    echo.
    echo   Download from: https://nodejs.org  ^(LTS version^)
    echo   After installing, restart this script.
    echo.
    pause
    exit /b 1
)
for /f "tokens=*" %%v in ('node --version') do set "NODE_VER=%%v"
echo   Node.js: %NODE_VER%

:: ?? Where to install node_modules ????????????????????????
:: USB drives (FAT32/exFAT) block npm symlinks on ALL platforms.
:: We install to %USERPROFILE%\.vic_modules\ on the C: drive instead.
:: NODE_PATH tells Node to find modules there ? no code changes needed.

set "HOME_MODS=%USERPROFILE%\.vic_modules\node_modules"
set "USB_MODS=%VIC_DIR%node_modules"

:: Prefer USB node_modules if they already exist and work (NTFS USB)
node -e "require('%USB_MODS%/express')" >nul 2>&1
if %errorlevel% equ 0 (
    echo   Modules found on USB drive.
    set "NODE_PATH=%USB_MODS%"
    goto :launch
)

:: Check if home drive modules exist and work
node -e "require('%HOME_MODS%/express')" >nul 2>&1
if %errorlevel% equ 0 (
    echo   Modules found in %USERPROFILE%\.vic_modules\
    set "NODE_PATH=%HOME_MODS%"
    goto :launch
)

:: ?? Install to home drive ?????????????????????????????????
echo.
echo   Installing dependencies to %USERPROFILE%\.vic_modules\
echo   ^(USB drives block npm symlinks ? installing to your home drive^)
echo   This takes about 30 seconds the first time.
echo   DO NOT close this window.
echo.

if not exist "%USERPROFILE%\.vic_modules" mkdir "%USERPROFILE%\.vic_modules"
copy /Y "%VIC_DIR%package.json" "%USERPROFILE%\.vic_modules\package.json" >nul

cd /d "%USERPROFILE%\.vic_modules"
call npm install --no-fund --no-audit

if %errorlevel% neq 0 (
    echo.
    echo   ERROR: npm install failed.
    echo   Try running manually:
    echo     cd "%USERPROFILE%\.vic_modules"
    echo     npm install
    echo.
    pause
    exit /b 1
)

:: Verify express installed correctly
node -e "require('%HOME_MODS%/express')" >nul 2>&1
if %errorlevel% neq 0 (
    echo.
    echo   ERROR: express still not found after install.
    echo   Try deleting %USERPROFILE%\.vic_modules and run again.
    echo.
    pause
    exit /b 1
)

echo.
echo   Dependencies installed successfully.
set "NODE_PATH=%HOME_MODS%"

:: ?? Launch ????????????????????????????????????????????????
:launch
cd /d "%VIC_DIR%"
echo.
echo   +------------------------------------------+
echo   ^|  VIC is starting...                      ^|
echo   ^|                                          ^|
echo   ^|  Open browser:  http://localhost:3747    ^|
echo   ^|                                          ^|
echo   ^|  Press Ctrl+C to stop VIC               ^|
echo   +------------------------------------------+
echo.

:: Open browser after 2 second delay
start "" /b cmd /c "timeout /t 2 /nobreak >nul && start http://localhost:3747"

:: Launch with NODE_PATH so proxy.js finds modules on home drive
set "NODE_PATH=%NODE_PATH%"
node proxy.js

echo.
echo   VIC server stopped.
pause
