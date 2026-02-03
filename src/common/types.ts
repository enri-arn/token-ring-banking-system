/**
 * Represents a banking transaction (deposit or withdrawal)
 */
export interface Transaction {
  /** Type of transaction */
  type: 'deposit' | 'withdrawal';
  /** Amount of money involved */
  amount: number;
  /** When the transaction occurred */
  timestamp: Date;
  /** ID of the ATM that executed the transaction */
  atmId: number;
}

/**
 * Represents the token in the Token Ring algorithm
 */
export interface Token {
  /** Unique identifier for the token */
  id: string;
  /** ID of the node currently holding the token */
  holderId: number;
  /** Current shared bank account balance carried with the token */
  balance: number;
}

/**
 * Represents the shared bank account state
 */
export interface BankAccount {
  /** Current account balance */
  balance: number;
  /** Timestamp of the last balance update */
  lastUpdated: Date;
}
