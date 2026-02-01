/**
 * Log levels for categorizing log messages
 */
export enum LogLevel {
  INFO = 'INFO',
  SUCCESS = 'SUCCESS',
  WARNING = 'WARNING',
  ERROR = 'ERROR',
}

/**
 * Logger utility class for tracking Token Ring operations and transactions.
 * Each ATM node has its own logger instance with a unique node ID.
 *
 * @example
 * const logger = new Logger(1);
 * logger.tokenReceived();
 * logger.transactionStarted('deposit', 100);
 */
export class Logger {
  /**
   * Creates a new Logger instance for a specific ATM node
   * @param nodeId - The unique identifier of the ATM node (1-4)
   */
  constructor(private readonly nodeId: number) {}

  /**
   * Formats the current timestamp in ISO 8601 format
   * @returns Formatted timestamp string
   */
  private formatTimestamp(): string {
    const now = new Date();
    return now.toISOString();
  }

  /**
   * Internal logging method that formats and outputs log messages
   * @param level - The severity level of the log message
   * @param message - The message to be logged
   */
  private log(level: LogLevel, message: string): void {
    const timestamp = this.formatTimestamp();
    const prefix = `[${timestamp}] [ATM${this.nodeId}] [${level}]`;
    console.log(`${prefix} ${message}`);
  }

  /**
   * Logs an informational message
   * @param message - The message to log
   */
  info(message: string): void {
    this.log(LogLevel.INFO, message);
  }

  /**
   * Logs a success message
   * @param message - The message to log
   */
  success(message: string): void {
    this.log(LogLevel.SUCCESS, message);
  }

  /**
   * Logs a warning message
   * @param message - The message to log
   */
  warning(message: string): void {
    this.log(LogLevel.WARNING, message);
  }

  /**
   * Logs an error message
   * @param message - The message to log
   */
  error(message: string): void {
    this.log(LogLevel.ERROR, message);
  }

  /**
   * Logs when the token is received by this node
   * This is a critical event in the Token Ring algorithm
   */
  tokenReceived(): void {
    this.info('Token received');
  }

  /**
   * Logs when the token is forwarded to the next node in the ring
   * @param nextNodeId - The ID of the next node receiving the token
   */
  tokenForwarded(nextNodeId: number): void {
    this.info(`Token forwarded to ATM${nextNodeId}`);
  }

  /**
   * Logs the start of a banking transaction
   * @param type - The type of transaction (deposit or withdrawal)
   * @param amount - The amount of money involved in the transaction
   */
  transactionStarted(type: string, amount: number): void {
    this.info(`Transaction started: ${type} $${amount}`);
  }

  /**
   * Logs the successful completion of a banking transaction
   * @param type - The type of transaction (deposit or withdrawal)
   * @param amount - The amount of money involved in the transaction
   * @param newBalance - The updated account balance after the transaction
   */
  transactionCompleted(type: string, amount: number, newBalance: number): void {
    this.success(
      `Transaction completed: ${type} $${amount} | New balance: $${newBalance}`,
    );
  }

  /**
   * Logs when the account balance is updated
   * @param oldBalance - The previous account balance
   * @param newBalance - The new account balance
   */
  balanceUpdated(oldBalance: number, newBalance: number): void {
    this.info(`Balance updated: $${oldBalance} -> $${newBalance}`);
  }
}
