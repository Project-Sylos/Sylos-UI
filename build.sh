#!/usr/bin/env bash
set -euo pipefail

# Determine the directory of this script (so it works anywhere)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Define frontend and backend paths relative to the script location
FRONTEND="$SCRIPT_DIR/frontend"
BACKEND="$SCRIPT_DIR"

# Step 1: Build frontend
cd "$FRONTEND"
npm run build

# Step 2: Run Wails dev (or you can swap for wails build for production)
cd "$BACKEND"
wails dev
