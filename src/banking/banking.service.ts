import { Injectable } from '@nestjs/common';
import { BankAccount, Transaction } from '../common/types';
import { INITIAL_BALANCE } from '../common/constants';

/**
 * BankingService manages the shared bank account and all banking operations.
 * This service represents the critical section resource that must be accessed
 * with mutual exclusion using the Token Ring algorithm.
 *
 * The service maintains:
 * - Current account balance
 * - Transaction validation logic
 * - Atomic deposit and withdrawal operations
 *
 * @remarks
 * In a distributed system, this service's methods should only be called
 * by the ATM node currently holding the token to ensure mutual exclusion.
 *
 * @example
 * const bankingService = new BankingService();
 * const result = await bankingService.deposit(100, 1);
 * console.log(`New balance: ${result.balance}`);
 */
@Injectable()
export class BankingService {
  /**
   * The shared bank account state
   * This is the critical resource protected by mutual exclusion
   */
  private account: BankAccount;

  /**
   * Initializes the banking service with the default account balance
   */
  constructor() {
    this.account = {
      balance: INITIAL_BALANCE,
      lastUpdated: new Date(),
    };
  }

  /**
   * Retrieves the current bank account state
   * @returns A copy of the current account state
   *
   * @example
   * const account = bankingService.getAccount();
   * console.log(`Current balance: ${account.balance}`);
   */
  getAccount(): BankAccount {
    return { ...this.account };
  }

  /**
   * Retrieves the current account balance
   * @returns The current balance as a number
   */
  getBalance(): number {
    return this.account.balance;
  }

  /**
   * Executes a deposit transaction, adding money to the account.
   * This operation constitutes a critical section and should only be
   * called by the token holder.
   *
   * @param amount - The amount to deposit (must be positive)
   * @param atmId - The ID of the ATM executing the transaction
   * @returns A Transaction object containing the transaction details and new balance
   * @throws {Error} If the amount is not positive
   *
   * @example
   * const transaction = await bankingService.deposit(100, 1);
   * console.log(`Deposited ${transaction.amount}, new balance: ${account.balance}`);
   */
  async deposit(amount: number, atmId: number): Promise<Transaction> {
    // Validation
    if (amount <= 0) {
      throw new Error('Deposit amount must be positive');
    }

    // Read current balance
    const currentBalance = this.account.balance;

    // Update balance
    const newBalance = currentBalance + amount;
    this.account.balance = newBalance;
    this.account.lastUpdated = new Date();

    // Create transaction record
    const transaction: Transaction = {
      type: 'deposit',
      amount,
      timestamp: new Date(),
      atmId,
    };

    return transaction;
  }

  /**
   * Executes a withdrawal transaction, removing money from the account.
   * This operation constitutes a critical section and should only be
   * called by the token holder.
   *
   * The transaction will fail if:
   * - The amount is not positive
   * - There are insufficient funds in the account
   *
   * @param amount - The amount to withdraw (must be positive)
   * @param atmId - The ID of the ATM executing the transaction
   * @returns A Transaction object containing the transaction details and new balance
   * @throws {Error} If the amount is not positive or if there are insufficient funds
   *
   * @example
   * try {
   *   const transaction = await bankingService.withdraw(200, 2);
   *   console.log(`Withdrew ${transaction.amount}, new balance: ${account.balance}`);
   * } catch (error) {
   *   console.error('Withdrawal failed:', error.message);
   * }
   */
  async withdraw(amount: number, atmId: number): Promise<Transaction> {
    // Validation
    if (amount <= 0) {
      throw new Error('Withdrawal amount must be positive');
    }

    // Read current balance
    const currentBalance = this.account.balance;

    // Check sufficient funds
    if (currentBalance < amount) {
      throw new Error(
        `Insufficient funds. Current balance: ${currentBalance}, requested: ${amount}`,
      );
    }

    // Update balance
    const newBalance = currentBalance - amount;
    this.account.balance = newBalance;
    this.account.lastUpdated = new Date();

    // Create transaction record
    const transaction: Transaction = {
      type: 'withdrawal',
      amount,
      timestamp: new Date(),
      atmId,
    };

    return transaction;
  }

  /**
   * Resets the account to its initial state.
   * Useful for testing and demonstration purposes.
   */
  reset(): void {
    this.account = {
      balance: INITIAL_BALANCE,
      lastUpdated: new Date(),
    };
  }
}
