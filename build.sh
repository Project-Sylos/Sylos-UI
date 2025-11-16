#!/usr/bin/env bash
set -euo pipefail

# Determine the directory of this script (so it works anywhere)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Define frontend path relative to the script location
FRONTEND="$SCRIPT_DIR/frontend"

# Step 1: Start Vite dev server in background
cd "$FRONTEND"
npm run dev &
VITE_PID=$!

# Wait a bit for Vite to start
sleep 3

# Step 2: Start Electron
cd "$SCRIPT_DIR"
export NODE_ENV=development
npx electron .

# Cleanup: kill Vite when Electron exits
kill $VITE_PID 2>/dev/null || true
