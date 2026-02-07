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

/**
 * Message types for Bully Algorithm election protocol
 */
export type ElectionMessageType = 'ELECTION' | 'OK' | 'COORDINATOR';

/**
 * Message for Bully Algorithm election
 */
export interface ElectionMessage {
  /** Type of election message */
  type: ElectionMessageType;
  /** ID of the node sending the message */
  senderId: number;
  /** ID of the new coordinator (only for COORDINATOR message) */
  coordinatorId?: number;
  /** Timestamp when message was sent */
  timestamp: Date;
}

/**
 * Message for node recovery announcement
 */
export interface RecoveryMessage {
  /** ID of the node that is recovering */
  nodeId: number;
  /** Timestamp of recovery */
  timestamp: Date;
}

/**
 * Message for topology update from coordinator
 */
export interface TopologyMessage {
  /** ID of the coordinator sending the update */
  coordinatorId: number;
  /** List of active node IDs in the ring */
  activeNodes: number[];
  /** ID of the token (for validation) */
  tokenId?: string;
  /** Timestamp of update */
  timestamp: Date;
}

/**
 * Node status in the ring
 */
export type NodeStatus = 'ACTIVE' | 'SUSPECTED' | 'FAILED' | 'RECOVERING';

/**
 * Information about a node in the ring
 */
export interface NodeInfo {
  /** Node ID */
  id: number;
  /** Current status */
  status: NodeStatus;
  /** Timestamp of last successful communication */
  lastSeen: Date;
  /** Number of consecutive failures */
  failureCount: number;
}
