# Token Ring Banking System

A distributed banking system implementation using the Token Ring mutual exclusion algorithm. This project simulates a distributed ATM network where multiple nodes safely access and modify a shared bank account balance.

## Overview

This system demonstrates distributed mutual exclusion through a Token Ring architecture, where 4 independent ATM nodes coordinate access to a shared resource (bank account) by passing a token around a logical ring.

### Key Features

- **Token Ring Algorithm**: Only the node holding the token can execute transactions
- **Distributed Architecture**: 4 independent nodes running on localhost
- **Safe Transactions**: Atomic deposit and withdrawal operations
- **Message-based Coordination**: No shared memory, all communication via message passing
- **Transaction Logging**: Complete audit trail of all operations

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

1. A single token circulates continuously through the ring
2. Only the token holder can access the critical section (execute transactions)
3. Nodes without pending transactions immediately forward the token
4. Each transaction is executed atomically:
   - Read current balance
   - Validate operation
   - Update balance
   - Log transaction
   - Forward token

## Description

Built with [NestJS](https://github.com/nestjs/nest) framework.

## Technical Requirements

- Node.js (v18 or higher)
- npm
- 4 available ports on localhost (default: 3001-3004)

## Project Structure

```
src/
  ├── atm/          # ATM node implementation
  ├── token/        # Token Ring algorithm logic
  ├── banking/      # Banking operations and balance management
  └── common/       # Shared utilities and types
```

## Future Enhancements

- [ ] Implement Token Ring algorithm
- [ ] Add ATM node communication
- [ ] Implement banking operations (deposit/withdrawal)
- [ ] Add transaction logging
- [ ] Web interface for monitoring
- [ ] Transaction history persistence
- [ ] Network failure simulation

## License

This project is [MIT licensed](LICENSE).
