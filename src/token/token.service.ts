import { Injectable } from '@nestjs/common';
import { Token } from '../common/types';
import { v4 as uuidv4 } from 'uuid';

/**
 * TokenService manages the token in the Token Ring mutual exclusion algorithm.
 * This service is responsible for:
 * - Token creation and ownership tracking
 * - Deciding when to enter the critical section
 * - Managing pending transactions
 * - Coordinating token forwarding
 *
 * @remarks
 * In the Token Ring algorithm, only the node possessing the token
 * can access the critical section (execute banking transactions).
 * The token circulates continuously through the ring.
 *
 * @example
 * const tokenService = new TokenService();
 * tokenService.initialize(1);
 * tokenService.receiveToken(token);
 * if (tokenService.canAccessCriticalSection()) {
 *   // Execute transaction
 * }
 */
@Injectable()
export class TokenService {
  /**
   * The current token held by this node (null if not holding token)
   */
  private currentToken: Token | null = null;

  /**
   * Queue of pending transactions for this node
   */
  private pendingTransactions: Array<{
    type: 'deposit' | 'withdrawal';
    amount: number;
  }> = [];

  /**
   * The unique identifier of this ATM node (1-4)
   */
  private nodeId: number;

  /**
   * Creates a new TokenService instance
   */
  constructor() {}

  /**
   * Initializes the service with a specific node ID.
   * This must be called before using the service.
   *
   * @param nodeId - The unique identifier of this ATM node (1-4)
   *
   * @example
   * const tokenService = new TokenService();
   * tokenService.initialize(1);
   */
  initialize(nodeId: number): void {
    this.nodeId = nodeId;
  }

  /**
   * Creates a new token with a unique identifier.
   * This should only be called once at system initialization by one node.
   *
   * @param initialHolderId - The ID of the node that will initially hold the token
   * @returns A new Token object
   *
   * @example
   * // ATM1 creates the token at startup
   * const token = tokenService.createToken(1);
   */
  createToken(initialHolderId: number): Token {
    return {
      id: uuidv4(),
      holderId: initialHolderId,
    };
  }

  /**
   * Receives the token from the previous node in the ring.
   * Updates the token's holder to this node.
   *
   * @param token - The token received from the predecessor
   *
   * @example
   * tokenService.receiveToken(incomingToken);
   */
  receiveToken(token: Token): void {
    this.currentToken = {
      ...token,
      holderId: this.nodeId,
    };
  }

  /**
   * Checks if this node currently holds the token
   * @returns true if this node has the token, false otherwise
   */
  hasToken(): boolean {
    return this.currentToken !== null;
  }

  /**
   * Gets the current token
   * @returns The current token or null if not holding the token
   */
  getToken(): Token | null {
    return this.currentToken ? { ...this.currentToken } : null;
  }

  /**
   * Releases the token so it can be forwarded to the next node.
   * The token is removed from this node's possession.
   *
   * @returns The token to be forwarded, or null if no token is held
   *
   * @example
   * const tokenToForward = tokenService.releaseToken();
   * if (tokenToForward) {
   *   // Send token to next node
   * }
   */
  releaseToken(): Token | null {
    const token = this.currentToken;
    this.currentToken = null;
    return token;
  }

  /**
   * Adds a transaction request to the pending queue.
   * The transaction will be executed when this node receives the token.
   *
   * @param type - The type of transaction (deposit or withdrawal)
   * @param amount - The amount of money for the transaction
   *
   * @example
   * tokenService.addPendingTransaction('deposit', 100);
   */
  addPendingTransaction(type: 'deposit' | 'withdrawal', amount: number): void {
    this.pendingTransactions.push({ type, amount });
  }

  /**
   * Checks if there are any pending transactions waiting to be executed
   * @returns true if there are pending transactions, false otherwise
   */
  hasPendingTransactions(): boolean {
    return this.pendingTransactions.length > 0;
  }

  /**
   * Retrieves and removes the next pending transaction from the queue
   * @returns The next pending transaction or null if queue is empty
   *
   * @example
   * const transaction = tokenService.getNextTransaction();
   * if (transaction) {
   *   // Execute the transaction
   * }
   */
  getNextTransaction(): {
    type: 'deposit' | 'withdrawal';
    amount: number;
  } | null {
    return this.pendingTransactions.shift() || null;
  }

  /**
   * Gets the number of pending transactions in the queue
   * @returns The count of pending transactions
   */
  getPendingTransactionCount(): number {
    return this.pendingTransactions.length;
  }

  /**
   * Determines if this node can access the critical section.
   * Access is granted only if:
   * 1. The node holds the token
   * 2. The node has pending transactions
   *
   * @returns true if can access critical section, false otherwise
   *
   * @example
   * if (tokenService.canAccessCriticalSection()) {
   *   // Execute banking transaction
   * } else {
   *   // Forward token immediately
   * }
   */
  canAccessCriticalSection(): boolean {
    return this.hasToken() && this.hasPendingTransactions();
  }

  /**
   * Determines if the token should be forwarded to the next node.
   * The token should be forwarded if:
   * 1. The node holds the token AND
   * 2. There are no pending transactions
   *
   * @returns true if token should be forwarded, false otherwise
   *
   * @example
   * if (tokenService.shouldForwardToken()) {
   *   const token = tokenService.releaseToken();
   *   // Send token to next node
   * }
   */
  shouldForwardToken(): boolean {
    return this.hasToken() && !this.hasPendingTransactions();
  }

  /**
   * Clears all pending transactions.
   * Useful for testing or emergency reset scenarios.
   */
  clearPendingTransactions(): void {
    this.pendingTransactions = [];
  }

  /**
   * Gets the current node ID
   * @returns The ID of this ATM node
   */
  getNodeId(): number {
    return this.nodeId;
  }
}
