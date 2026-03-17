# VIC - Vegas Intelligence Console
# PowerShell launcher
# Run with: .\start.ps1

$ErrorActionPreference = "Stop"
$VicDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $VicDir

Write-Host ""
Write-Host "  VIC - Vegas Intelligence Console" -ForegroundColor Cyan
Write-Host "  ---------------------------------" -ForegroundColor DarkGray
Write-Host ""

# Check Node.js
try {
    $nodeVer = (node --version 2>&1).ToString().Trim()
    Write-Host "  Node.js: $nodeVer" -ForegroundColor Green
} catch {
    Write-Host "  ERROR: Node.js not found." -ForegroundColor Red
    Write-Host ""
    Write-Host "  Download from: https://nodejs.org  (LTS version)"
    Write-Host "  After installing, re-run this script."
    Write-Host ""
    Read-Host "Press Enter to exit"
    exit 1
}

# Where to find / install modules
$UsbMods  = Join-Path $VicDir "node_modules"
$HomeMods = Join-Path $env:USERPROFILE ".vic_modules\node_modules"

function Test-Express($path) {
    $result = node -e "require('$($path.Replace('\','\\'))/express')" 2>&1
    return $LASTEXITCODE -eq 0
}

# 1. Try USB node_modules first (works on NTFS drives)
if (Test-Path (Join-Path $UsbMods "express")) {
    Write-Host "  Modules: USB drive" -ForegroundColor Green
    $env:NODE_PATH = $UsbMods
}
# 2. Try home drive modules
elseif (Test-Path (Join-Path $HomeMods "express")) {
    Write-Host "  Modules: $HomeMods" -ForegroundColor Green
    $env:NODE_PATH = $HomeMods
}
# 3. Install to home drive
else {
    Write-Host ""
    Write-Host "  Installing dependencies..." -ForegroundColor Yellow
    Write-Host "  (USB drives block npm symlinks - installing to home drive)" -ForegroundColor DarkGray
    Write-Host "  Location: $env:USERPROFILE\.vic_modules\" -ForegroundColor DarkGray
    Write-Host "  Takes ~30 seconds. Do not close this window." -ForegroundColor DarkGray
    Write-Host ""

    $installDir = Join-Path $env:USERPROFILE ".vic_modules"
    if (-not (Test-Path $installDir)) { New-Item -ItemType Directory -Path $installDir | Out-Null }
    Copy-Item -Path (Join-Path $VicDir "package.json") -Destination $installDir -Force

    Push-Location $installDir
    npm install --no-fund --no-audit
    Pop-Location

    if (-not (Test-Path (Join-Path $HomeMods "express"))) {
        Write-Host ""
        Write-Host "  ERROR: Install failed. Try manually:" -ForegroundColor Red
        Write-Host "    cd `"$installDir`""
        Write-Host "    npm install"
        Write-Host ""
        Read-Host "Press Enter to exit"
        exit 1
    }

    Write-Host ""
    Write-Host "  Dependencies installed successfully." -ForegroundColor Green
    $env:NODE_PATH = $HomeMods
}

Write-Host ""
Write-Host "  +------------------------------------------+" -ForegroundColor Cyan
Write-Host "  |  Open browser:  http://localhost:3747    |" -ForegroundColor Cyan
Write-Host "  |  Press Ctrl+C to stop VIC               |" -ForegroundColor Cyan
Write-Host "  +------------------------------------------+" -ForegroundColor Cyan
Write-Host ""

# Open browser after 2s delay
Start-Job { Start-Sleep 2; Start-Process "http://localhost:3747" } | Out-Null

# Launch server
node proxy.js

Write-Host ""
Write-Host "  VIC server stopped."
Read-Host "Press Enter to exit"
