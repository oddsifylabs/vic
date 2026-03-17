# VIC — Vegas Intelligence Console

## Cross-Platform USB Drive App

VIC runs on both Windows and Linux from the same USB drive.
Your bets, API keys, and all data are stored in the data/
folder on the USB — shared automatically between both OSes.

─────────────────────────────────────────────────────────────

## WINDOWS

  PowerShell (recommended):
    Right-click start.ps1 -> Run with PowerShell
    Or in PowerShell:  .\start.ps1

  Command Prompt:
    Double-click start.bat
    Or in CMD:  start.bat

  NOTE: If PowerShell blocks .ps1 scripts, run this once:
    Set-ExecutionPolicy -Scope CurrentUser RemoteSigned

  First run: dependencies install to C:\Users\YOU\.vic_modules\
  (USB drives block npm on FAT32/exFAT -- installs to home drive)
  Takes ~30 seconds. Subsequent runs start instantly.

## LINUX / MAC

  In terminal:    bash start.sh

  IMPORTANT: Use "bash start.sh" — NOT "./start.sh"
  USB drives are mounted noexec on Linux, which blocks direct
  script execution.

  First run installs dependencies to ~/.vic_modules/ on your
  home drive (USB drives are FAT32/exFAT which can't store
  npm's symlinks). This takes ~30 seconds once.

  If the install step inside start.sh fails, run separately:
    bash install.sh

─────────────────────────────────────────────────────────────

## HOW THE DATA SHARING WORKS

  USB Drive (travels with you):
    data/config.json    ← API keys, settings
    data/bets.json      ← All bets
    data/clv.json       ← CLV tracking
    data/parlays.json   ← Saved parlays
    data/alerts.json    ← Line alert watchlist
    data/logs.json      ← System logs

  Linux home drive (stays on that machine):
    ~/.vic_modules/     ← node_modules (Linux only)

  Windows USB:
    node_modules/       ← node_modules (Windows, on USB)

  Because data/ is always read from __dirname (the USB),
  switching between Windows and Linux is seamless — plug in,
  run, your bets and settings are right there.

─────────────────────────────────────────────────────────────

## OPEN IN BROWSER

  http://localhost:3747

## STOP VIC

  Press Ctrl+C in the terminal / command prompt window.

─────────────────────────────────────────────────────────────

## DEFAULT SPORTSBOOK

  Hard Rock Bet is the default book throughout VIC.
  Change in: Settings → Model Parameters → Default Book

