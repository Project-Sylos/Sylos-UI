#!/usr/bin/env bash
set -euo pipefail

# Determine the directory of this script (so it works anywhere)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Define frontend path relative to the script location
FRONTEND="$SCRIPT_DIR/frontend"

# Start Vite dev server
cd "$FRONTEND"
npm run dev
