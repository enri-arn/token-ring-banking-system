# Start Token Ring Banking System - 4 ATM Nodes
# This script starts all 4 ATM nodes in separate PowerShell windows

Write-Host "================================================" -ForegroundColor Cyan
Write-Host "  Starting Token Ring Banking System" -ForegroundColor Cyan
Write-Host "  4 ATM Nodes on ports 3001-3004" -ForegroundColor Cyan
Write-Host "================================================" -ForegroundColor Cyan
Write-Host ""

# Get the current directory
$currentDir = Get-Location

# Start ATM Node 1
Write-Host "Starting ATM1 on port 3001..." -ForegroundColor Green
Start-Process powershell -ArgumentList "-NoExit", "-Command", "Set-Location '$currentDir'; `$env:NODE_ID='1'; npm run start:dev"

# Wait for first node to compile and start (longer wait)
Start-Sleep -Seconds 8

# Start ATM Node 2
Write-Host "Starting ATM2 on port 3002..." -ForegroundColor Green
Start-Process powershell -ArgumentList "-NoExit", "-Command", "Set-Location '$currentDir'; `$env:NODE_ID='2'; npm run start:dev"

# Wait a bit before starting next node
Start-Sleep -Seconds 3

# Start ATM Node 3
Write-Host "Starting ATM3 on port 3003..." -ForegroundColor Green
Start-Process powershell -ArgumentList "-NoExit", "-Command", "Set-Location '$currentDir'; `$env:NODE_ID='3'; npm run start:dev"

# Wait a bit before starting next node
Start-Sleep -Seconds 3

# Start ATM Node 4
Write-Host "Starting ATM4 on port 3004..." -ForegroundColor Green
Start-Process powershell -ArgumentList "-NoExit", "-Command", "Set-Location '$currentDir'; `$env:NODE_ID='4'; npm run start:dev"

Write-Host ""
Write-Host "================================================" -ForegroundColor Cyan
Write-Host "  All 4 nodes started!" -ForegroundColor Green
Write-Host "  ATM1: http://localhost:3001" -ForegroundColor Yellow
Write-Host "  ATM2: http://localhost:3002" -ForegroundColor Yellow
Write-Host "  ATM3: http://localhost:3003" -ForegroundColor Yellow
Write-Host "  ATM4: http://localhost:3004" -ForegroundColor Yellow
Write-Host "================================================" -ForegroundColor Cyan
