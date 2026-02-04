# Test Token Circulation Script
# This script monitors the token circulation through all 4 ATM nodes

Write-Host "================================================" -ForegroundColor Cyan
Write-Host "  Token Circulation Test" -ForegroundColor Cyan
Write-Host "================================================" -ForegroundColor Cyan
Write-Host ""

Write-Host "Waiting for all nodes to be ready..." -ForegroundColor Yellow
Start-Sleep -Seconds 40

Write-Host "`nMonitoring token circulation for 20 seconds..." -ForegroundColor Yellow
Write-Host ""

$iterations = 20
for ($i = 1; $i -le $iterations; $i++) {
    Write-Host "[$i/$iterations] Token location: " -NoNewline -ForegroundColor Cyan
    
    $found = $false
    for ($node = 1; $node -le 4; $node++) {
        $port = 3000 + $node
        try {
            $response = Invoke-WebRequest -Uri "http://localhost:$port/atm/status" -UseBasicParsing -ErrorAction Stop | ConvertFrom-Json
            if ($response.hasToken -eq $true) {
                Write-Host "ATM$node (Balance: `$$($response.balance))" -ForegroundColor Green
                $found = $true
                break
            }
        } catch {
            Write-Host "ERROR checking ATM$node" -ForegroundColor Red
        }
    }
    
    if (-not $found) {
        Write-Host "Token not found on any node!" -ForegroundColor Red
    }
    
    Start-Sleep -Seconds 1
}

Write-Host ""
Write-Host "================================================" -ForegroundColor Cyan
Write-Host "  Final Status Check" -ForegroundColor Cyan
Write-Host "================================================" -ForegroundColor Cyan

for ($node = 1; $node -le 4; $node++) {
    $port = 3000 + $node
    try {
        $response = Invoke-WebRequest -Uri "http://localhost:$port/atm/status" -UseBasicParsing | ConvertFrom-Json
        $tokenIndicator = if ($response.hasToken) { "🔴 HAS TOKEN" } else { "⚪ No token" }
        Write-Host "ATM$node`: $tokenIndicator | Balance: `$$($response.balance) | Pending: $($response.pendingTransactions)" -ForegroundColor Yellow
    } catch {
        Write-Host "ATM$node`: ERROR - Cannot connect" -ForegroundColor Red
    }
}

Write-Host ""
