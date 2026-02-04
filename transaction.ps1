# Transaction Script for Token Ring Banking System
# Usage: .\transaction.ps1 -NodeId <1-4> -Type <deposit|withdrawal> -Amount <number>
#
# Examples:
#   .\transaction.ps1 -NodeId 1 -Type deposit -Amount 100
#   .\transaction.ps1 -NodeId 2 -Type withdrawal -Amount 50
#   .\transaction.ps1 -NodeId 3 -Type deposit -Amount 1200

param(
    [Parameter(Mandatory=$true)]
    [ValidateRange(1,4)]
    [int]$NodeId,
    
    [Parameter(Mandatory=$true)]
    [ValidateSet("deposit", "withdrawal")]
    [string]$Type,
    
    [Parameter(Mandatory=$true)]
    [ValidateRange(1, [int]::MaxValue)]
    [int]$Amount
)

# Calculate port based on node ID (3001-3004)
$port = 3000 + $NodeId

# Build the URL
$url = "http://localhost:$port/atm/transaction"

# Build the request body
$body = @{
    type = $Type
    amount = $Amount
} | ConvertTo-Json

Write-Host "================================================" -ForegroundColor Cyan
Write-Host "  Token Ring Banking System - Transaction" -ForegroundColor Cyan
Write-Host "================================================" -ForegroundColor Cyan
Write-Host "ATM Node:    " -NoNewline -ForegroundColor Yellow
Write-Host "ATM$NodeId (port $port)" -ForegroundColor White
Write-Host "Type:        " -NoNewline -ForegroundColor Yellow
Write-Host $Type.ToUpper() -ForegroundColor White
Write-Host "Amount:      " -NoNewline -ForegroundColor Yellow
Write-Host "`$$Amount" -ForegroundColor White
Write-Host "URL:         " -NoNewline -ForegroundColor Yellow
Write-Host $url -ForegroundColor Gray
Write-Host "================================================" -ForegroundColor Cyan
Write-Host ""

try {
    # Make the HTTP request
    Write-Host "Sending transaction request..." -ForegroundColor Yellow
    
    $response = Invoke-WebRequest `
        -Uri $url `
        -Method POST `
        -Headers @{ "Content-Type" = "application/json" } `
        -Body $body `
        -UseBasicParsing
    
    Write-Host ""
    Write-Host "SUCCESS!" -ForegroundColor Green
    Write-Host "Status Code: " -NoNewline -ForegroundColor Yellow
    Write-Host $response.StatusCode -ForegroundColor Green
    
    # Parse and display response
    $responseData = $response.Content | ConvertFrom-Json
    Write-Host "Message:     " -NoNewline -ForegroundColor Yellow
    Write-Host $responseData.message -ForegroundColor White
    Write-Host "Pending:     " -NoNewline -ForegroundColor Yellow
    Write-Host "$($responseData.pendingCount) transaction(s)" -ForegroundColor White
    
    Write-Host ""
    Write-Host "The transaction will be executed when ATM$NodeId receives the token." -ForegroundColor Cyan
}
catch {
    Write-Host ""
    Write-Host "ERROR!" -ForegroundColor Red
    Write-Host "Failed to send transaction: $($_.Exception.Message)" -ForegroundColor Red
    
    if ($_.Exception.Response) {
        Write-Host "Status Code: $($_.Exception.Response.StatusCode.value__)" -ForegroundColor Red
    }
}

Write-Host ""
Write-Host "================================================" -ForegroundColor Cyan
