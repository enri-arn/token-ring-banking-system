# Check Status of ATM Nodes
# Usage: .\check-status.ps1 [NodeId]
#
# Examples:
#   .\check-status.ps1           # Check all nodes
#   .\check-status.ps1 -NodeId 1 # Check only ATM1

param(
    [Parameter(Mandatory=$false)]
    [ValidateRange(1,4)]
    [int]$NodeId = 0  # 0 means check all nodes
)

function Get-ATMStatus {
    param([int]$id)
    
    $port = 3000 + $id
    $url = "http://localhost:$port/atm/status"
    
    try {
        $response = Invoke-RestMethod -Uri $url -Method GET -UseBasicParsing
        
        Write-Host "ATM$id (port $port)" -ForegroundColor Cyan
        Write-Host "  Node ID:            " -NoNewline -ForegroundColor Yellow
        Write-Host $response.nodeId -ForegroundColor White
        Write-Host "  Has Token:          " -NoNewline -ForegroundColor Yellow
        if ($response.hasToken) {
            Write-Host "YES" -ForegroundColor Green
        } else {
            Write-Host "NO" -ForegroundColor Gray
        }
        Write-Host "  Pending Transactions: " -NoNewline -ForegroundColor Yellow
        Write-Host $response.pendingTransactions -ForegroundColor White
        Write-Host "  Balance:            " -NoNewline -ForegroundColor Yellow
        Write-Host "`$$($response.balance)" -ForegroundColor White
        Write-Host ""
        
        return $response
    }
    catch {
        Write-Host "ATM$id (port $port)" -ForegroundColor Cyan
        Write-Host "  Status:             " -NoNewline -ForegroundColor Yellow
        Write-Host "OFFLINE" -ForegroundColor Red
        Write-Host "  Error:              " -NoNewline -ForegroundColor Yellow
        Write-Host $_.Exception.Message -ForegroundColor Red
        Write-Host ""
        return $null
    }
}

Write-Host ""
Write-Host "================================================" -ForegroundColor Cyan
Write-Host "  Token Ring Banking System - Status Check" -ForegroundColor Cyan
Write-Host "================================================" -ForegroundColor Cyan
Write-Host ""

if ($NodeId -eq 0) {
    # Check all nodes
    $statuses = @()
    for ($i = 1; $i -le 4; $i++) {
        $status = Get-ATMStatus -id $i
        if ($status) {
            $statuses += $status
        }
    }
    
    # Summary
    if ($statuses.Count -gt 0) {
        Write-Host "================================================" -ForegroundColor Cyan
        Write-Host "  SUMMARY" -ForegroundColor Cyan
        Write-Host "================================================" -ForegroundColor Cyan
        Write-Host "Online Nodes:       " -NoNewline -ForegroundColor Yellow
        Write-Host "$($statuses.Count)/4" -ForegroundColor White
        
        $tokenHolder = $statuses | Where-Object { $_.hasToken -eq $true }
        Write-Host "Token Holder:       " -NoNewline -ForegroundColor Yellow
        if ($tokenHolder) {
            Write-Host "ATM$($tokenHolder.nodeId)" -ForegroundColor Green
        } else {
            Write-Host "None (token circulating or lost)" -ForegroundColor Gray
        }
        
        $totalPending = ($statuses | Measure-Object -Property pendingTransactions -Sum).Sum
        Write-Host "Total Pending:      " -NoNewline -ForegroundColor Yellow
        Write-Host "$totalPending transaction(s)" -ForegroundColor White
        
        $balance = $statuses[0].balance  # All nodes share the same balance
        Write-Host "Shared Balance:     " -NoNewline -ForegroundColor Yellow
        Write-Host "`$$balance" -ForegroundColor White
        Write-Host "================================================" -ForegroundColor Cyan
    }
} else {
    # Check single node
    Get-ATMStatus -id $NodeId | Out-Null
}

Write-Host ""
