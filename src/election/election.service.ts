import { Injectable } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { Logger } from '../common/logger';
import { ElectionMessage, NodeInfo, NodeStatus } from '../common/types';
import {
  BASE_PORT,
  NUMBER_OF_NODES,
  COORDINATOR_TIMEOUT,
  NODE_RESPONSE_TIMEOUT,
  MAX_RETRY_ATTEMPTS,
  RETRY_DELAY,
} from '../common/constants';

/**
 * ElectionService implements the Bully Algorithm for coordinator election.
 *
 * The Bully Algorithm works as follows:
 * 1. When a node detects coordinator failure, it starts an election
 * 2. The node sends ELECTION messages to all nodes with higher IDs
 * 3. If a higher node responds with OK, it takes over the election
 * 4. If no OK response within timeout, the node declares itself coordinator
 * 5. The new coordinator sends COORDINATOR message to all nodes
 *
 * @remarks
 * This service coordinates with ATMService for failure detection and
 * with CoordinatorService for coordinator duties.
 */
@Injectable()
export class ElectionService {
  /**
   * The unique identifier of this node
   */
  private nodeId: number;

  /**
   * Logger instance for this node
   */
  private logger: Logger;

  /**
   * Current coordinator ID (null if unknown)
   */
  private coordinatorId: number | null = null;

  /**
   * Flag indicating if an election is currently in progress
   */
  private electionInProgress: boolean = false;

  /**
   * Flag indicating if this node is the coordinator
   */
  private isCoordinator: boolean = false;

  /**
   * Information about all nodes in the ring
   */
  private nodeInfo: Map<number, NodeInfo> = new Map();

  /**
   * Timeout handle for election timeout
   */
  private electionTimeoutHandle: NodeJS.Timeout | null = null;

  /**
   * Timeout handle for coordinator announcement timeout
   */
  private coordinatorTimeoutHandle: NodeJS.Timeout | null = null;

  /**
   * Creates a new ElectionService instance
   */
  constructor(private readonly httpService: HttpService) {}

  /**
   * Initializes the election service with a specific node ID
   * @param nodeId - The unique identifier of this node
   */
  initialize(nodeId: number): void {
    this.nodeId = nodeId;
    this.logger = new Logger(nodeId);

    // Initialize node information for all nodes
    for (let i = 1; i <= NUMBER_OF_NODES; i++) {
      this.nodeInfo.set(i, {
        id: i,
        status: 'ACTIVE',
        lastSeen: new Date(),
        failureCount: 0,
      });
    }

    // Initially, assume the highest ID node is coordinator
    this.coordinatorId = NUMBER_OF_NODES;
    this.isCoordinator = nodeId === NUMBER_OF_NODES;

    if (this.isCoordinator) {
      this.logger.info(`Node ${nodeId} initialized as initial coordinator`);
    }
  }

  /**
   * Starts an election process according to Bully Algorithm
   * @returns Promise that resolves when election is complete
   */
  async startElection(): Promise<void> {
    // Prevent multiple concurrent elections
    if (this.electionInProgress) {
      this.logger.info('Election already in progress, skipping');
      return;
    }

    this.electionInProgress = true;
    this.logger.info('Starting election (Bully Algorithm)');

    // Send ELECTION messages to all nodes with higher IDs
    const higherNodes = this.getNodesWithHigherIds();

    if (higherNodes.length === 0) {
      // No higher nodes, declare self as coordinator
      this.logger.info(
        'No higher nodes available, declaring self as coordinator',
      );
      await this.becomeCoordinator();
      return;
    }

    this.logger.info(
      `Sending ELECTION messages to nodes: ${higherNodes.join(', ')}`,
    );

    const electionMessage: ElectionMessage = {
      type: 'ELECTION',
      senderId: this.nodeId,
      timestamp: new Date(),
    };

    // Send ELECTION to all higher nodes and collect responses
    const responses = await Promise.allSettled(
      higherNodes.map((nodeId) =>
        this.sendElectionMessage(nodeId, electionMessage),
      ),
    );

    // Check if any higher node responded with OK
    const receivedOk = responses.some(
      (result) => result.status === 'fulfilled' && result.value === true,
    );

    if (receivedOk) {
      this.logger.info(
        'Received OK from higher node(s), waiting for COORDINATOR announcement',
      );

      // Wait for COORDINATOR message from higher node
      this.coordinatorTimeoutHandle = setTimeout(() => {
        this.logger.info(
          'COORDINATOR timeout - no announcement received, restarting election',
        );
        this.electionInProgress = false;
        this.startElection();
      }, COORDINATOR_TIMEOUT);
    } else {
      // No OK received, become coordinator
      this.logger.info(
        'No OK responses received, declaring self as coordinator',
      );
      await this.becomeCoordinator();
    }
  }

  /**
   * Handles receiving an ELECTION message from another node
   * @param message - The election message
   * @returns true if this node will take over the election
   */
  async handleElectionMessage(message: ElectionMessage): Promise<boolean> {
    this.logger.info(`Received ELECTION from ATM${message.senderId}`);

    // If sender has lower ID, respond with OK and start own election
    if (message.senderId < this.nodeId) {
      this.logger.info(
        `Responding with OK to ATM${message.senderId} (lower ID)`,
      );

      // Start own election (if not already in progress)
      if (!this.electionInProgress) {
        // Don't await - respond immediately then start election
        this.startElection().catch((error) => {
          this.logger.error(`Error starting election: ${error.message}`);
        });
      }

      return true; // Return OK
    }

    // Sender has higher ID, they should become coordinator
    return false;
  }

  /**
   * Handles receiving a COORDINATOR message announcing new coordinator
   * @param message - The coordinator message
   */
  handleCoordinatorMessage(message: ElectionMessage): void {
    if (message.coordinatorId === undefined) {
      this.logger.error('Received COORDINATOR message without coordinatorId');
      return;
    }

    this.logger.info(`New coordinator announced: ATM${message.coordinatorId}`);

    // Clear any pending timeouts
    if (this.coordinatorTimeoutHandle) {
      clearTimeout(this.coordinatorTimeoutHandle);
      this.coordinatorTimeoutHandle = null;
    }

    // Update coordinator information
    this.coordinatorId = message.coordinatorId;
    this.isCoordinator = message.coordinatorId === this.nodeId;
    this.electionInProgress = false;

    // Mark coordinator as active
    const coordInfo = this.nodeInfo.get(message.coordinatorId);
    if (coordInfo) {
      coordInfo.status = 'ACTIVE';
      coordInfo.lastSeen = new Date();
      coordInfo.failureCount = 0;
    }
  }

  /**
   * Declares this node as the new coordinator
   * @private
   */
  private async becomeCoordinator(): Promise<void> {
    this.isCoordinator = true;
    this.coordinatorId = this.nodeId;
    this.electionInProgress = false;

    this.logger.info('*** BECAME COORDINATOR ***');

    // Send COORDINATOR announcement to all other nodes
    const coordinatorMessage: ElectionMessage = {
      type: 'COORDINATOR',
      senderId: this.nodeId,
      coordinatorId: this.nodeId,
      timestamp: new Date(),
    };

    // Send to all nodes with lower IDs
    const lowerNodes = this.getNodesWithLowerIds();
    this.logger.info(
      `Announcing coordinator to nodes: ${lowerNodes.join(', ')}`,
    );

    await Promise.allSettled(
      lowerNodes.map((nodeId) =>
        this.sendCoordinatorMessage(nodeId, coordinatorMessage),
      ),
    );
  }

  /**
   * Sends an ELECTION message to a specific node
   * @param targetNodeId - The target node ID
   * @param message - The election message
   * @returns Promise resolving to true if OK received, false otherwise
   * @private
   */
  private async sendElectionMessage(
    targetNodeId: number,
    message: ElectionMessage,
  ): Promise<boolean> {
    const targetPort = BASE_PORT + targetNodeId - 1;
    const targetUrl = `http://127.0.0.1:${targetPort}/atm/election`;

    for (let attempt = 1; attempt <= MAX_RETRY_ATTEMPTS; attempt++) {
      try {
        const response = await firstValueFrom(
          this.httpService.post(targetUrl, message, {
            timeout: NODE_RESPONSE_TIMEOUT,
            headers: { 'Content-Type': 'application/json' },
          }),
        );

        // Check if response indicates OK
        return response.data?.ok === true;
      } catch (error) {
        this.logger.error(
          `Attempt ${attempt} - Failed to send ELECTION to ATM${targetNodeId}: ${error.message}`,
        );
        if (attempt < MAX_RETRY_ATTEMPTS) {
          await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY));
        }
      }
    }

    // All attempts failed, mark node as failed
    this.markNodeAsFailed(targetNodeId);
    this.logger.error(
      `Failed to contact ATM${targetNodeId} after ${MAX_RETRY_ATTEMPTS} attempts`,
    );
    return false;
  }

  /**
   * Sends a COORDINATOR message to a specific node
   * @param targetNodeId - The target node ID
   * @param message - The coordinator message
   * @private
   */
  private async sendCoordinatorMessage(
    targetNodeId: number,
    message: ElectionMessage,
  ): Promise<void> {
    const targetPort = BASE_PORT + targetNodeId - 1;
    const targetUrl = `http://127.0.0.1:${targetPort}/atm/coordinator`;

    try {
      await firstValueFrom(
        this.httpService.post(targetUrl, message, {
          timeout: NODE_RESPONSE_TIMEOUT,
          headers: { 'Content-Type': 'application/json' },
        }),
      );
    } catch (error) {
      this.logger.error(
        `Failed to send COORDINATOR to ATM${targetNodeId}: ${error.message}`,
      );
    }
  }

  /**
   * Marks a node as failed
   * @param nodeId - The node ID to mark as failed
   */
  markNodeAsFailed(nodeId: number): void {
    const nodeInfo = this.nodeInfo.get(nodeId);
    if (nodeInfo) {
      nodeInfo.status = 'FAILED';
      nodeInfo.failureCount++;
      this.logger.info(`Marked ATM${nodeId} as FAILED`);
    }

    // If failed node was coordinator, start election
    if (nodeId === this.coordinatorId && !this.electionInProgress) {
      this.logger.info(`Coordinator ATM${nodeId} failed, starting election`);
      this.startElection().catch((error) => {
        this.logger.error(`Error starting election: ${error.message}`);
      });
    }
  }

  /**
   * Marks a node as active (used when communication is successful)
   * @param nodeId - The node ID to mark as active
   */
  markNodeAsActive(nodeId: number): void {
    const nodeInfo = this.nodeInfo.get(nodeId);
    if (nodeInfo) {
      nodeInfo.status = 'ACTIVE';
      nodeInfo.lastSeen = new Date();
      nodeInfo.failureCount = 0;
    }
  }

  /**
   * Gets all nodes with IDs higher than this node
   * @returns Array of node IDs
   * @private
   */
  private getNodesWithHigherIds(): number[] {
    const nodes: number[] = [];
    for (let i = this.nodeId + 1; i <= NUMBER_OF_NODES; i++) {
      const nodeInfo = this.nodeInfo.get(i);
      if (nodeInfo && nodeInfo.status !== 'FAILED') {
        nodes.push(i);
      }
    }
    return nodes;
  }

  /**
   * Gets all nodes with IDs lower than this node
   * @returns Array of node IDs
   * @private
   */
  private getNodesWithLowerIds(): number[] {
    const nodes: number[] = [];
    for (let i = 1; i < this.nodeId; i++) {
      const nodeInfo = this.nodeInfo.get(i);
      if (nodeInfo && nodeInfo.status !== 'FAILED') {
        nodes.push(i);
      }
    }
    return nodes;
  }

  /**
   * Gets the current coordinator ID
   * @returns The coordinator ID or null if unknown
   */
  getCoordinatorId(): number | null {
    return this.coordinatorId;
  }

  /**
   * Checks if this node is the coordinator
   * @returns true if this node is coordinator
   */
  isCurrentCoordinator(): boolean {
    return this.isCoordinator;
  }

  /**
   * Gets the status of a specific node
   * @param nodeId - The node ID to query
   * @returns The node status or null if not found
   */
  getNodeStatus(nodeId: number): NodeStatus | null {
    return this.nodeInfo.get(nodeId)?.status || null;
  }

  /**
   * Gets all active node IDs
   * @returns Array of active node IDs
   */
  getActiveNodes(): number[] {
    const activeNodes: number[] = [];
    this.nodeInfo.forEach((info, nodeId) => {
      if (info.status === 'ACTIVE') {
        activeNodes.push(nodeId);
      }
    });
    return activeNodes;
  }

  /**
   * Checks if election is currently in progress
   * @returns true if election is in progress
   */
  isElectionInProgress(): boolean {
    return this.electionInProgress;
  }
}
