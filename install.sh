#!/bin/bash
# VIC Dependency Installer for Linux
# Run with: bash install.sh
#
# Installs to ~/.vic_modules/ (not the USB drive)
# because USB drives (FAT32/exFAT) block npm symlinks.

VIC_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEST="$HOME/.vic_modules"

echo ""
echo "  VIC Installer"
echo "  -------------"
echo "  Installing to: $DEST"
echo "  (Your data stays on USB: $VIC_DIR/data)"
echo ""

if ! command -v node &> /dev/null; then
    echo "  ERROR: Node.js not found."
    echo "  Ubuntu/Debian: sudo apt install nodejs npm"
    exit 1
fi

echo "  Node.js: $(node --version)"
echo ""

mkdir -p "$DEST"
cp "$VIC_DIR/package.json" "$DEST/package.json"
cd "$DEST"

npm install --no-fund --no-audit

if [ $? -eq 0 ]; then
    echo ""
    echo "  ✓ Install complete."
    echo ""
    echo "  Start VIC:  bash start.sh"
    echo "  (run from your USB drive folder)"
else
    echo ""
    echo "  ✗ Install failed. Check internet and try again."
    echo "  Or try:  sudo npm install --no-fund --no-audit"
fi
