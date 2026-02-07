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
   * Flag indicating if this node is recovering from a failure.
   * When recovering, the node must discard any old token it held.
   */
  private isRecovering: boolean = false;

  /**
   * ID of the valid token (set by coordinator after election).
   * Used to prevent duplicate tokens in the system.
   */
  private validTokenId: string | null = null;

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
   * Creates a new token with a unique identifier and initial balance.
   * This should only be called once at system initialization by one node.
   *
   * @param initialHolderId - The ID of the node that will initially hold the token
   * @param initialBalance - The initial bank account balance
   * @returns A new Token object
   *
   * @example
   * // ATM1 creates the token at startup with $1000 initial balance
   * const token = tokenService.createToken(1, 1000);
   */
  createToken(initialHolderId: number, initialBalance: number): Token {
    return {
      id: uuidv4(),
      holderId: initialHolderId,
      balance: initialBalance,
    };
  }

  /**
   * Receives the token from the previous node in the ring.
   * Updates the token's holder to this node.
   *
   * IMPORTANT: If this node is recovering from failure, it must validate
   * the token against the valid token ID from the coordinator.
   *
   * @param token - The token received from the predecessor
   * @returns true if token was accepted, false if rejected (duplicate/invalid)
   *
   * @example
   * const accepted = tokenService.receiveToken(incomingToken);
   * if (!accepted) {
   *   // Token was rejected, don't process it
   * }
   */
  receiveToken(token: Token): boolean {
    // If we have a valid token ID set (by coordinator), validate incoming token
    if (this.validTokenId !== null && token.id !== this.validTokenId) {
      console.warn(
        `[TokenService] Rejecting token ${token.id} - expected ${this.validTokenId}`,
      );
      return false;
    }

    // If recovering and we already have a token, discard the old one
    if (this.isRecovering && this.currentToken !== null) {
      console.log(
        `[TokenService] Discarding old token ${this.currentToken.id} during recovery`,
      );
      this.currentToken = null;
      this.isRecovering = false;
    }

    this.currentToken = {
      ...token,
      holderId: this.nodeId,
    };

    return true;
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
   * Updates the balance in the currently held token.
   * This is used after executing a transaction to update the shared balance.
   *
   * @param newBalance - The new balance to set in the token
   * @throws {Error} If the node doesn't currently hold the token
   *
   * @example
   * tokenService.updateBalance(1200);
   */
  updateBalance(newBalance: number): void {
    if (!this.currentToken) {
      throw new Error('Cannot update balance: node does not hold the token');
    }
    this.currentToken.balance = newBalance;
  }

  /**
   * Gets the current balance from the token
   * @returns The balance or null if not holding the token
   */
  getBalance(): number | null {
    return this.currentToken ? this.currentToken.balance : null;
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

  /**
   * Marks this node as recovering from failure.
   * The node will discard any old token it held and wait for
   * the coordinator to reintegrate it into the ring.
   */
  markAsRecovering(): void {
    this.isRecovering = true;
    console.log(
      '[TokenService] Node marked as recovering - will discard old token',
    );
  }

  /**
   * Clears the recovering flag
   */
  clearRecoveringStatus(): void {
    this.isRecovering = false;
  }

  /**
   * Sets the valid token ID (called by coordinator after election)
   * @param tokenId - The ID of the valid token
   */
  setValidTokenId(tokenId: string): void {
    this.validTokenId = tokenId;
    console.log(`[TokenService] Valid token ID set to: ${tokenId}`);
  }

  /**
   * Gets the valid token ID
   * @returns The valid token ID or null if not set
   */
  getValidTokenId(): string | null {
    return this.validTokenId;
  }

  /**
   * Clears the valid token ID
   */
  clearValidTokenId(): void {
    this.validTokenId = null;
  }

  /**
   * Discards the current token (used when recovering from failure)
   * This prevents duplicate tokens in the system.
   */
  discardToken(): void {
    if (this.currentToken) {
      console.log(`[TokenService] Discarding token ${this.currentToken.id}`);
      this.currentToken = null;
    }
  }

  /**
   * Checks if this node is currently recovering
   * @returns true if recovering
   */
  isNodeRecovering(): boolean {
    return this.isRecovering;
  }
}
