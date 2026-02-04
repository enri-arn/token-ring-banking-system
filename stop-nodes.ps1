# Stop Token Ring Banking System - Kill all ATM nodes
# This script stops all running Node.js processes (ATM nodes)

Write-Host "================================================" -ForegroundColor Cyan
Write-Host "  Stopping Token Ring Banking System" -ForegroundColor Cyan
Write-Host "================================================" -ForegroundColor Cyan
Write-Host ""

# Find all node processes running the NestJS application
$nodeProcesses = Get-Process -Name "node" -ErrorAction SilentlyContinue | Where-Object {
    $_.MainWindowTitle -match "npm" -or 
    $_.Path -match "node.exe"
}

if ($nodeProcesses) {
    Write-Host "Found $($nodeProcesses.Count) Node.js process(es) to stop..." -ForegroundColor Yellow
    Write-Host ""
    
    foreach ($process in $nodeProcesses) {
        try {
            Write-Host "Stopping process $($process.Id)..." -ForegroundColor Red
            Stop-Process -Id $process.Id -Force
            Write-Host "  ✓ Process $($process.Id) stopped" -ForegroundColor Green
        } catch {
            Write-Host "  ✗ Failed to stop process $($process.Id): $_" -ForegroundColor Red
        }
    }
    
    Write-Host ""
    Write-Host "================================================" -ForegroundColor Cyan
    Write-Host "  All nodes stopped!" -ForegroundColor Green
    Write-Host "================================================" -ForegroundColor Cyan
} else {
    Write-Host "No running Node.js processes found." -ForegroundColor Yellow
    Write-Host ""
    Write-Host "================================================" -ForegroundColor Cyan
    Write-Host "  Nothing to stop" -ForegroundColor Green
    Write-Host "================================================" -ForegroundColor Cyan
}
