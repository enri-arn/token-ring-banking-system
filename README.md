# Token Ring Banking System

A distributed banking system implementation using the Token Ring mutual exclusion algorithm. This project simulates a distributed ATM network where 4 independent nodes safely access and modify a shared bank account balance.

## Overview

This system demonstrates distributed mutual exclusion through a Token Ring architecture, where 4 independent ATM nodes coordinate access to a shared resource (bank account) by passing a token around a logical ring.

### Key Features

- **Token Ring Algorithm**: Only the node holding the token can execute transactions
- **Distributed Architecture**: 4 independent nodes running on localhost (ports 3001-3004)
- **Safe Transactions**: Atomic deposit and withdrawal operations with mutual exclusion
- **Message-based Coordination**: No shared memory, all communication via HTTP message passing
- **Transaction Queueing**: Each node can queue multiple transactions, executed when token arrives
- **Fault Tolerance**: Automatic retry mechanism if successor node is temporarily unavailable
- **Complete Logging**: Full audit trail of token circulation and transaction execution

## System Architecture

The system consists of 4 ATM nodes arranged in a logical ring:

```
ATM1 → ATM2 → ATM3 → ATM4 → ATM1
```

Each node:
- Runs as a separate process on localhost
- Knows only its successor in the ring
- Can perform deposits and withdrawals
- Passes the token when not in use

## How It Works

### Token Circulation

1. **Single Token**: A unique token circulates continuously through the ring, carrying the current account balance
2. **Mutual Exclusion**: Only the token holder can access the critical section (execute transactions)
3. **Token Hold Time**: Each node holds the token for up to 5 seconds to process transactions
4. **Automatic Forwarding**: After processing, the node forwards the token to its successor

### Transaction Execution

When a node receives the token:
1. **Check pending transactions**: If transactions are queued, execute ONE transaction
2. **Execute atomically**:
   - Read current balance from token
   - Validate operation (sufficient funds for withdrawal)
   - Calculate new balance
   - Update balance in token
   - Log transaction with timestamp
3. **Forward token**: Pass token with updated balance to next node
4. **Repeat**: If more transactions are pending, execute them when token returns

### Shared Resource Management

The system implements a **distributed shared resource** (bank account balance) without shared memory:
- The balance travels **inside the token** as it circulates
- Each node operates on the balance only when holding the token
- Token passing via HTTP POST ensures **message-based coordination**
- No global variables or shared memory between nodes
- This respects the "no shared memory" constraint of distributed systems

### Fault Tolerance

**Current Implementation:**

The system handles **temporary node unavailability** through an automatic retry mechanism:
- If a successor node is temporarily unreachable, the predecessor **keeps the token** and retries every 5 seconds
- Token is **never lost** during forwarding failures
- When the failed node recovers, circulation automatically resumes

**Limitations:**
- **No token recovery**: If a node crashes while holding the token, the system cannot recover automatically
- **Manual intervention required**: In case of permanent node failure with token, manual restart is needed
- This implementation focuses on the core Token Ring algorithm rather than advanced failure recovery mechanisms

## Description

Built with [NestJS](https://github.com/nestjs/nest) framework.

## Technical Requirements

- Node.js (v18 or higher)
- npm
- 4 available ports on localhost (default: 3001-3004)
- PowerShell (for Windows automation scripts)

## Quick Start

### Installation

```powershell
npm install
```

### Starting the System

**Option 1: Automated (recommended)**
```powershell
# Start all 4 nodes in separate PowerShell windows
.\start-nodes.ps1
```

**Option 2: Manual (for debugging)**
```powershell
# Terminal 1 - ATM1
$env:NODE_ID=1; $env:PORT=3001; npm run start:dev

# Terminal 2 - ATM2
$env:NODE_ID=2; $env:PORT=3002; npm run start:dev

# Terminal 3 - ATM3
$env:NODE_ID=3; $env:PORT=3003; npm run start:dev

# Terminal 4 - ATM4
$env:NODE_ID=4; $env:PORT=3004; npm run start:dev
```

### Basic Operations

**Send Transactions:**
```powershell
# Deposit $200 to ATM2
.\transaction.ps1 -NodeId 2 -Type deposit -Amount 200

# Withdraw $50 from ATM4
.\transaction.ps1 -NodeId 4 -Type withdrawal -Amount 50
```

**Monitor Token Circulation:**
```powershell
# Check status of all nodes
.\check-status.ps1

# Watch token circulation (check logs in each terminal)
# Token should appear at each node every ~20 seconds (4 nodes × 5 seconds)
```

## System Demonstration

The system correctly implements the Token Ring example from the project specification:

**Initial State:** Balance = $1000, ATM1 creates and holds initial token

**Example Scenario:**
```powershell
# Queue transactions
.\transaction.ps1 -NodeId 2 -Type withdrawal -Amount 200
.\transaction.ps1 -NodeId 3 -Type deposit -Amount 100
.\transaction.ps1 -NodeId 4 -Type withdrawal -Amount 500
```

**Execution Sequence:**
1. **ATM1**: No transaction → forwards token (Balance: $1000)
2. **ATM2**: Receives token → executes withdrawal $200 → forwards (Balance: $800)
3. **ATM3**: Receives token → executes deposit $100 → forwards (Balance: $900)
4. **ATM4**: Receives token → executes withdrawal $500 → forwards (Balance: $400)
5. **ATM1**: Receives token with updated balance $400

### Key Properties Demonstrated

✅ **Mutual Exclusion**: Only one node executes transactions at a time  
✅ **No Shared Memory**: Balance travels in token, no global variables  
✅ **Message Passing**: All communication via HTTP POST  
✅ **Atomicity**: Each transaction is indivisible  
✅ **Ordering**: Transactions execute in token arrival order  
✅ **Audit Trail**: Complete logging of all operations

## Testing Scenarios

### 1. Normal Operation Test
```powershell
.\start-nodes.ps1
Start-Sleep -Seconds 15
.\test-circulation.ps1
```
Expected: Token circulates through all 4 nodes, visible every 5 seconds

### 2. Transaction Test
```powershell
.\transaction.ps1 -NodeId 1 -Type deposit -Amount 100
.\check-status.ps1
```
Expected: Balance increases by $100 when ATM1 receives token

### 3. Multiple Transactions Test
```powershell
.\transaction.ps1 -NodeId 2 -Type deposit -Amount 100
.\transaction.ps1 -NodeId 2 -Type deposit -Amount 200
.\transaction.ps1 -NodeId 2 -Type deposit -Amount 300
```
Expected: ATM2 executes one transaction per token reception

### 4. Node Failure Test
```powershell
# Stop ATM3 manually (Ctrl+C in its terminal)
# Watch ATM2 logs - should show retry attempts
# Restart ATM3
# Circulation should resume automatically
```

## Logging

Each node produces structured logs:
- **[INFO]** Token received/forwarded events
- **[INFO]** Transaction execution start/completion
- **[SUCCESS]** Successful transaction with balance update
- **[ERROR]** Failed operations (insufficient funds, network errors)

Example log:
```
[2026-02-04T19:39:59.435Z] [ATM1] [INFO] Token received
[2026-02-04T19:39:59.435Z] [ATM1] [INFO] Transaction started: deposit $100
[2026-02-04T19:39:59.436Z] [ATM1] [SUCCESS] Transaction completed: deposit $100 | New balance: $1100
[2026-02-04T19:39:59.436Z] [ATM1] [INFO] Token forwarded to ATM2
```

## Implementation Details

### Technologies Used
- **NestJS**: TypeScript framework for scalable server applications
- **Axios**: HTTP client for token forwarding
- **UUID**: Unique token identification
- **PowerShell**: Automation and testing scripts

## Future Enhancements

- [ ] **Token recovery mechanism**: Automatic detection and regeneration of lost tokens
- [ ] **Leader election**: Distributed algorithm to handle permanent node failures
- [ ] **Web interface**: Real-time monitoring dashboard for token circulation and transactions
- [ ] **Transaction history**: Persistent storage and audit trail of all operations
- [ ] **Advanced failure scenarios**: Testing and handling of Byzantine failures

## License

This project is [MIT licensed](LICENSE).
