#!/bin/bash
clear
echo ""
echo "  ██╗   ██╗██╗  ██████╗"
echo "  ██║   ██║██║ ██╔════╝"
echo "  ██║   ██║██║ ██║"
echo "  ╚██╗ ██╔╝██║ ██║"
echo "   ╚████╔╝ ██║ ╚██████╗"
echo "    ╚═══╝  ╚═╝  ╚═════╝"
echo ""
echo "  Vegas Intelligence Console"
echo "  ---------------------------"
echo ""

VIC_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$VIC_DIR"

# Check Node.js
if ! command -v node &> /dev/null; then
    echo "  ERROR: Node.js not found."
    echo "  Ubuntu/Debian: sudo apt install nodejs npm"
    echo "  Download: https://nodejs.org"
    exit 1
fi
echo "  Node.js: $(node --version)"
echo "  VIC dir: $VIC_DIR"

# ── Where to look for node_modules ───────────────────────
# USB drives (FAT32/exFAT) can't store npm symlinks.
# We install to ~/.vic_modules/ on the Linux home drive.
# NODE_PATH env var tells Node to look there at startup —
# before any require() calls execute.
HOME_MODS="$HOME/.vic_modules/node_modules"

# Decide which modules dir to use
if [ -d "$VIC_DIR/node_modules/express" ]; then
    # Windows installed node_modules on USB — use those
    MODS_PATH="$VIC_DIR/node_modules"
    echo "  Modules:  $MODS_PATH (USB)"
elif [ -d "$HOME_MODS/express" ]; then
    # Linux home install exists
    MODS_PATH="$HOME_MODS"
    echo "  Modules:  $MODS_PATH (home drive)"
else
    # Need to install
    echo ""
    echo "  Dependencies not found. Installing to ~/.vic_modules/"
    echo "  (USB filesystem can't store npm symlinks)"
    echo "  Takes ~30 seconds. Do NOT press Ctrl+C."
    echo ""
    mkdir -p "$HOME/.vic_modules"
    cp "$VIC_DIR/package.json" "$HOME/.vic_modules/package.json"
    cd "$HOME/.vic_modules"
    npm install --no-fund --no-audit
    if [ $? -ne 0 ]; then
        echo ""
        echo "  ERROR: npm install failed."
        echo "  Run:  bash install.sh"
        exit 1
    fi
    cd "$VIC_DIR"
    if [ ! -d "$HOME_MODS/express" ]; then
        echo ""
        echo "  ERROR: express not found after install."
        echo "  Run:  bash install.sh"
        exit 1
    fi
    MODS_PATH="$HOME_MODS"
    echo ""
    echo "  Dependencies installed OK."
fi

echo "  Data:     $VIC_DIR/data (USB — shared with Windows)"
echo ""
echo "  +------------------------------------------+"
echo "  |  Browser: http://localhost:3747          |"
echo "  |  Stop:    Ctrl+C                         |"
echo "  +------------------------------------------+"
echo ""

# Open browser
sleep 1.5 && (
    xdg-open "http://localhost:3747" 2>/dev/null ||
    gnome-open "http://localhost:3747" 2>/dev/null ||
    open "http://localhost:3747" 2>/dev/null
) &

# NODE_PATH is read by Node at startup BEFORE any require() runs
# This is the only reliable way to redirect modules on Linux USB
export NODE_PATH="$MODS_PATH"
node proxy.js

echo ""
echo "  VIC stopped. Data saved on USB."
