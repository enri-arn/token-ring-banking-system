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

function Get-ATMStatusParallel {
    param([int]$id)

    $port = 3000 + $id
    $statusUrl = "http://localhost:$port/atm/status"

    try {
        # Use shorter timeout for faster checks (1 second)
        $response = Invoke-RestMethod -Uri $statusUrl -Method GET -UseBasicParsing -TimeoutSec 1

        # Get token ID if node has token (requires calling token service)
        $tokenId = $null

        return @{
            nodeId = $response.nodeId
            hasToken = $response.hasToken
            pendingTransactions = $response.pendingTransactions
            balance = $response.balance
            tokenId = $tokenId
            online = $true
            error = $null
        }
    }
    catch {
        return @{
            nodeId = $id
            hasToken = $false
            pendingTransactions = 0
            balance = 0
            tokenId = $null
            online = $false
            error = $_.Exception.Message
        }
    }
}

function Display-ATMStatus {
    param($status, $id)

    Write-Host "ATM$id (port $($3000 + $id))" -ForegroundColor Cyan

    if ($status.online) {
        Write-Host "  Node ID:            " -NoNewline -ForegroundColor Yellow
        Write-Host $status.nodeId -ForegroundColor White
        Write-Host "  Has Token:          " -NoNewline -ForegroundColor Yellow
        if ($status.hasToken) {
            Write-Host "YES" -ForegroundColor Green
        } else {
            Write-Host "NO" -ForegroundColor Gray
        }
        Write-Host "  Pending Transactions: " -NoNewline -ForegroundColor Yellow
        Write-Host $status.pendingTransactions -ForegroundColor White
        Write-Host "  Balance:            " -NoNewline -ForegroundColor Yellow
        Write-Host "`$$($status.balance)" -ForegroundColor White
    } else {
        Write-Host "  Status:             " -NoNewline -ForegroundColor Yellow
        Write-Host "OFFLINE" -ForegroundColor Red
        Write-Host "  Error:              " -NoNewline -ForegroundColor Yellow
        Write-Host $status.error -ForegroundColor Red
    }
    Write-Host ""
}

Write-Host ""
Write-Host "================================================" -ForegroundColor Cyan
Write-Host "  Token Ring Banking System - Status Check" -ForegroundColor Cyan
Write-Host "================================================" -ForegroundColor Cyan
Write-Host ""

if ($NodeId -eq 0) {
    # Check all nodes IN PARALLEL for atomic snapshot
    $jobs = @()
    $startTime = Get-Date

    # Start parallel jobs for all nodes
    for ($i = 1; $i -le 4; $i++) {
        $jobs += Start-Job -ScriptBlock ${function:Get-ATMStatusParallel} -ArgumentList $i
    }

    # Wait for all jobs to complete (max 2 seconds)
    $jobs | Wait-Job -Timeout 2 | Out-Null

    # Collect results
    $allStatuses = @()
    for ($i = 0; $i -lt $jobs.Count; $i++) {
        $status = Receive-Job -Job $jobs[$i]
        if ($status -eq $null) {
            # Job didn't complete in time - create offline status
            $status = @{
                nodeId = $i + 1
                hasToken = $false
                pendingTransactions = 0
                balance = 0
                tokenId = $null
                online = $false
                error = "Timeout - node did not respond"
            }
        }
        $allStatuses += $status
        # Force remove the job even if not completed
        Remove-Job -Job $jobs[$i] -Force
    }

    $snapshotTime = (Get-Date) - $startTime
    Write-Host "Snapshot captured in $([math]::Round($snapshotTime.TotalMilliseconds))ms" -ForegroundColor DarkGray
    Write-Host ""

    # Display all statuses
    for ($i = 0; $i -lt $allStatuses.Count; $i++) {
        Display-ATMStatus -status $allStatuses[$i] -id ($i + 1)
    }

    # Summary
    $onlineStatuses = $allStatuses | Where-Object { $_.online -eq $true }
    if ($onlineStatuses.Count -gt 0) {
        Write-Host "================================================" -ForegroundColor Cyan
        Write-Host "  SUMMARY" -ForegroundColor Cyan
        Write-Host "================================================" -ForegroundColor Cyan
        Write-Host "Online Nodes:       " -NoNewline -ForegroundColor Yellow
        Write-Host "$($onlineStatuses.Count)/4" -ForegroundColor White

        $tokenHolders = @($onlineStatuses | Where-Object { $_.hasToken -eq $true })
        Write-Host "Token Holder:       " -NoNewline -ForegroundColor Yellow

        # Force array evaluation to get correct count
        $holderCount = @($tokenHolders).Count

        if ($holderCount -eq 0) {
            Write-Host "None (token in transit)" -ForegroundColor Gray
        } elseif ($holderCount -eq 1) {
            Write-Host "ATM$($tokenHolders[0].nodeId)" -ForegroundColor Green
        } else {
            # Multiple token holders - could be duplicates or token in transit
            $holderIds = ($tokenHolders | ForEach-Object { $_.nodeId }) -join " "
            Write-Host "ATM$holderIds " -NoNewline -ForegroundColor Yellow
            Write-Host "[MULTIPLE - may be in transit or duplicate]" -ForegroundColor Magenta
        }

        # Calculate total pending by manual iteration (safer with PowerShell Jobs)
        $totalPending = 0
        foreach ($status in $onlineStatuses) {
            if ($status.pendingTransactions -ne $null -and $status.pendingTransactions -is [int]) {
                $totalPending += $status.pendingTransactions
            }
        }
        Write-Host "Total Pending:      " -NoNewline -ForegroundColor Yellow
        Write-Host "$totalPending transaction(s)" -ForegroundColor White

        $balance = $onlineStatuses[0].balance  # All nodes share the same balance
        Write-Host "Shared Balance:     " -NoNewline -ForegroundColor Yellow
        Write-Host "`$$balance" -ForegroundColor White
        Write-Host "================================================" -ForegroundColor Cyan
    }
} else {
    # Check single node
    $status = Get-ATMStatusParallel -id $NodeId
    Display-ATMStatus -status $status -id $NodeId
}

Write-Host ""
