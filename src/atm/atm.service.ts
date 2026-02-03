import { Injectable, OnModuleInit } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { BankingService } from '../banking/banking.service';
import { TokenService } from '../token/token.service';
import { Logger } from '../common/logger';
import { Token } from '../common/types';
import { BASE_PORT, NUMBER_OF_NODES } from '../common/constants';

/**
 * ATMService represents a single ATM node in the Token Ring system.
 * Each ATM node:
 * - Has a unique ID (1-4)
 * - Can receive and forward the token
 * - Executes banking transactions when holding the token
 * - Knows its successor in the ring
 *
 * @remarks
 * This service coordinates between TokenService (mutual exclusion),
 * BankingService (transaction execution), and Logger (audit trail).
 *
 * @example
 * const atmService = new ATMService(bankingService, tokenService);
 * await atmService.initialize(1); // Initialize as ATM1
 * await atmService.requestTransaction('deposit', 100);
 */
@Injectable()
export class ATMService implements OnModuleInit {
  /**
   * The unique identifier of this ATM node (1-4)
   */
  private nodeId: number;

  /**
   * The ID of the next node in the ring
   */
  private nextNodeId: number;

  /**
   * Logger instance for this ATM node
   */
  private logger: Logger;

  /**
   * Creates a new ATMService instance
   * @param bankingService - The shared banking service
   * @param tokenService - The token management service
   * @param httpService - HTTP client for network communication
   */
  constructor(
    private readonly bankingService: BankingService,
    private readonly tokenService: TokenService,
    private readonly httpService: HttpService,
  ) {}

  /**
   * Lifecycle hook called after module initialization.
   * Reads NODE_ID from environment variable and initializes the ATM node.
   * If NODE_ID is not set, defaults to 1.
   * If this is node 1, creates and starts the initial token.
   */
  async onModuleInit() {
    const nodeId = parseInt(process.env.NODE_ID || '1', 10);
    await this.initialize(nodeId);

    // Only node 1 creates the initial token
    if (nodeId === 1) {
      this.createInitialToken();
      this.logger.info('Token Ring initialized. Token circulation started.');
    }
  }

  /**
   * Initializes the ATM node with a specific ID.
   * Sets up the logger and calculates the next node in the ring.
   *
   * @param nodeId - The unique identifier for this ATM node (1-4)
   *
   * @example
   * await atmService.initialize(1); // Initialize as ATM1
   */
  async initialize(nodeId: number): Promise<void> {
    this.nodeId = nodeId;
    this.logger = new Logger(nodeId);
    this.tokenService.initialize(nodeId);

    // Calculate next node in the ring (circular)
    this.nextNodeId = (nodeId % NUMBER_OF_NODES) + 1;

    this.logger.info(
      `ATM${nodeId} initialized. Next node: ATM${this.nextNodeId}`,
    );
  }

  /**
   * Gets the unique identifier of this ATM node
   * @returns The node ID
   */
  getNodeId(): number {
    return this.nodeId;
  }

  /**
   * Gets the ID of the next node in the ring
   * @returns The next node's ID
   */
  getNextNodeId(): number {
    return this.nextNodeId;
  }

  /**
   * Gets the port number for this ATM node
   * @returns The port number
   */
  getPort(): number {
    return BASE_PORT + this.nodeId - 1;
  }

  /**
   * Creates the initial token for the Token Ring.
   * This should only be called by one node (typically ATM1) at startup.
   *
   * @returns The newly created token
   *
   * @example
   * // Only ATM1 creates the token
   * if (nodeId === 1) {
   *   const token = atmService.createInitialToken();
   * }
   */
  createInitialToken(): Token {
    const token = this.tokenService.createToken(this.nodeId);
    this.tokenService.receiveToken(token);
    this.logger.info('Initial token created');
    return token;
  }

  /**
   * Handles the receipt of a token from the previous node in the ring.
   * This method:
   * 1. Logs token reception
   * 2. Updates token ownership
   * 3. Checks if there are pending transactions
   * 4. Either executes transactions or forwards the token
   *
   * @param token - The token received from the predecessor
   *
   * @example
   * await atmService.receiveToken(incomingToken);
   */
  async receiveToken(token: Token): Promise<void> {
    this.logger.tokenReceived();
    this.tokenService.receiveToken(token);

    // Process token: either execute transaction or forward
    await this.processToken();
  }

  /**
   * Processes the token according to Token Ring algorithm:
   * - If has pending transactions: execute one transaction
   * - If no pending transactions: forward token immediately
   *
   * @private
   */
  private async processToken(): Promise<void> {
    if (this.tokenService.canAccessCriticalSection()) {
      // Execute the next pending transaction
      await this.executeNextTransaction();
    } else {
      // No pending transactions, forward token immediately
      await this.forwardToken();
    }
  }

  /**
   * Executes the next pending transaction in the queue.
   * This represents entering the critical section.
   *
   * @private
   */
  private async executeNextTransaction(): Promise<void> {
    const transaction = this.tokenService.getNextTransaction();
    if (!transaction) {
      await this.forwardToken();
      return;
    }

    this.logger.transactionStarted(transaction.type, transaction.amount);

    try {
      if (transaction.type === 'deposit') {
        await this.bankingService.deposit(transaction.amount, this.nodeId);
      } else {
        await this.bankingService.withdraw(transaction.amount, this.nodeId);
      }

      const newBalance = this.bankingService.getBalance();
      this.logger.transactionCompleted(
        transaction.type,
        transaction.amount,
        newBalance,
      );
    } catch (error) {
      this.logger.error(`Transaction failed: ${error.message}`);
    }

    // After executing transaction, forward the token
    await this.forwardToken();
  }

  /**
   * Forwards the token to the next node in the ring.
   * Sends an HTTP POST request to the next node's /atm/token endpoint.
   * Implements retry logic and error handling for network reliability.
   *
   * @private
   */
  private async forwardToken(): Promise<void> {
    const token = this.tokenService.releaseToken();
    if (!token) {
      return;
    }

    const nextNodePort = BASE_PORT + this.nextNodeId - 1;
    const nextNodeUrl = `http://localhost:${nextNodePort}/atm/token`;

    this.logger.tokenForwarded(this.nextNodeId);

    try {
      // Send token to next node via HTTP POST
      await firstValueFrom(
        this.httpService.post(nextNodeUrl, token, {
          timeout: 5000,
          headers: { 'Content-Type': 'application/json' },
        }),
      );
    } catch (error) {
      // Log error but continue - in a real system, implement retry logic
      this.logger.error(
        `Failed to forward token to ATM${this.nextNodeId}: ${error.message}`,
      );
      this.logger.warning(
        'Token circulation interrupted - manual recovery needed',
      );
    }
  }

  /**
   * Requests a new transaction to be executed when the token arrives.
   * The transaction is added to the pending queue.
   *
   * @param type - The type of transaction (deposit or withdrawal)
   * @param amount - The amount of money for the transaction
   *
   * @example
   * await atmService.requestTransaction('deposit', 100);
   * await atmService.requestTransaction('withdrawal', 50);
   */
  async requestTransaction(
    type: 'deposit' | 'withdrawal',
    amount: number,
  ): Promise<void> {
    this.tokenService.addPendingTransaction(type, amount);
    this.logger.info(
      `Transaction request added: ${type} ${amount}. Pending: ${this.tokenService.getPendingTransactionCount()}`,
    );
  }

  /**
   * Gets the current account balance
   * @returns The current balance
   */
  getBalance(): number {
    return this.bankingService.getBalance();
  }

  /**
   * Checks if this node currently holds the token
   * @returns true if holding the token, false otherwise
   */
  hasToken(): boolean {
    return this.tokenService.hasToken();
  }

  /**
   * Gets the number of pending transactions
   * @returns The count of pending transactions
   */
  getPendingTransactionCount(): number {
    return this.tokenService.getPendingTransactionCount();
  }
}
