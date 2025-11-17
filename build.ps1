# PowerShell script to start the web app
$ErrorActionPreference = "Stop"

# Determine the directory of this script (so it works anywhere)
$SCRIPT_DIR = Split-Path -Parent $MyInvocation.MyCommand.Path

# Define frontend path relative to the script location
$FRONTEND = Join-Path $SCRIPT_DIR "frontend"

# Check if npm is available
if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
    Write-Error "npm not found. Make sure Node.js is installed. Try running: . .\setup-nvm.ps1"
    exit 1
}

# Start Vite dev server (will open browser automatically on localhost:3000)
Set-Location $FRONTEND
npm run dev

