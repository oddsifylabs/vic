#!/usr/bin/env bash
set -e

cd "$(dirname "$0")"

echo ""
echo "  VIC — Update from GitHub"
echo "  ------------------------"
echo ""

# Check git
if ! command -v git &>/dev/null; then
  echo "  ERROR: git not found. Install with:"
  echo "    sudo apt install git   # Ubuntu/Debian"
  echo "    brew install git       # Mac"
  exit 1
fi

# Check repo
if [ ! -d .git ]; then
  echo "  ERROR: not a git repository."
  echo "  Clone VIC first:"
  echo "    git clone https://github.com/YOUR_USERNAME/vic ."
  exit 1
fi

echo "  Fetching latest from GitHub..."
git fetch origin

CHANGES=$(git log HEAD..origin/main --oneline 2>/dev/null | wc -l)

if [ "$CHANGES" -eq 0 ]; then
  echo "  Already up to date."
  echo ""
  exit 0
fi

echo ""
echo "  Changes incoming:"
git log HEAD..origin/main --oneline
echo ""
echo "  Pulling updates (your data/ folder is safe)..."
git pull origin main

echo ""
echo "  ✓ VIC updated! Run: bash start.sh"
echo ""
