export interface Transaction {
  type: 'deposit' | 'withdrawal';
  amount: number;
  timestamp: Date;
  atmId: number;
}

export interface Token {
  id: string;
  holderId: number;
}

export interface BankAccount {
  balance: number;
  lastUpdated: Date;
}
