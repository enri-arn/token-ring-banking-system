import { Injectable } from '@nestjs/common';

/**
 * BankingService manages banking operations without maintaining state.
 * In the Token Ring system, the balance is carried in the token itself,
 * ensuring no shared memory between distributed nodes.
 *
 * The service provides:
 * - Transaction validation logic
 * - Pure functions for deposit and withdrawal calculations
 *
 * @remarks
 * This service does NOT store the balance internally. The balance
 * travels with the token, respecting the "no shared memory" constraint
 * of the distributed system.
 *
 * @example
 * const bankingService = new BankingService();
 * const newBalance = bankingService.deposit(currentBalance, 100, 1);
 */
@Injectable()
export class BankingService {
  /**
   * Executes a deposit transaction.
   * This is a pure function that calculates the new balance without side effects.
   *
   * @param currentBalance - The current balance from the token
   * @param amount - The amount to deposit (must be positive)
   * @returns The new balance after deposit
   * @throws {Error} If the amount is not positive
   *
   * @example
   * const newBalance = bankingService.deposit(1000, 100);
   * // Returns: 1100
   */
  deposit(currentBalance: number, amount: number): number {
    // Validation
    if (amount <= 0) {
      throw new Error('Deposit amount must be positive');
    }

    // Calculate new balance
    return currentBalance + amount;
  }

  /**
   * Executes a withdrawal transaction.
   * This is a pure function that calculates the new balance without side effects.
   *
   * The transaction will fail if:
   * - The amount is not positive
   * - There are insufficient funds in the account
   *
   * @param currentBalance - The current balance from the token
   * @param amount - The amount to withdraw (must be positive)
   * @returns The new balance after withdrawal
   * @throws {Error} If the amount is not positive or if there are insufficient funds
   *
   * @example
   * const newBalance = bankingService.withdraw(1000, 200);
   * // Returns: 800
   */
  withdraw(currentBalance: number, amount: number): number {
    // Validation
    if (amount <= 0) {
      throw new Error('Withdrawal amount must be positive');
    }

    // Check sufficient funds
    if (currentBalance < amount) {
      throw new Error(
        `Insufficient funds. Current balance: ${currentBalance}, requested: ${amount}`,
      );
    }

    // Calculate new balance
    return currentBalance - amount;
  }
}
