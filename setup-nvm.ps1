# Quick script to set up NVM and Node.js in current terminal
# Run this with: . .\setup-nvm.ps1

$nvmHome = [Environment]::GetEnvironmentVariable('NVM_HOME', 'User')
$nvmSymlink = [Environment]::GetEnvironmentVariable('NVM_SYMLINK', 'User')

if ($nvmHome -and $nvmSymlink) {
    $env:NVM_HOME = $nvmHome
    $env:NVM_SYMLINK = $nvmSymlink
    
    # Refresh PATH and expand environment variables
    $userPath = [Environment]::GetEnvironmentVariable('Path', 'User') -replace '%NVM_HOME%', $nvmHome -replace '%NVM_SYMLINK%', $nvmSymlink
    $machinePath = [Environment]::GetEnvironmentVariable('Path', 'Machine') -replace '%NVM_HOME%', $nvmHome -replace '%NVM_SYMLINK%', $nvmSymlink
    $env:PATH = "$machinePath;$userPath"
    
    # Auto-activate Node version
    if (Test-Path "$nvmHome\nvm.exe") {
        $installedList = & "$nvmHome\nvm.exe" list 2>$null
        if ($installedList -match '\*.*?(\d+\.\d+\.\d+)') {
            $version = $matches[1]
            if ($version) {
                Write-Host "Node.js $version is already active" -ForegroundColor Green
            }
        } elseif ($installedList -match '(\d+\.\d+\.\d+)') {
            $version = $matches[1]
            if ($version) {
                & "$nvmHome\nvm.exe" use $version | Out-Null
                Write-Host "Activated Node.js $version" -ForegroundColor Green
            }
        }
    }
    
    Write-Host "`nNVM and Node.js are ready!" -ForegroundColor Cyan
    Write-Host "Node version: $(node --version 2>$null)" -ForegroundColor Yellow
    Write-Host "NPM version: $(npm --version 2>$null)" -ForegroundColor Yellow
} else {
    Write-Host "Error: NVM environment variables not found!" -ForegroundColor Red
}

