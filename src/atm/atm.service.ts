import { Injectable, OnApplicationBootstrap } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { BankingService } from '../banking/banking.service';
import { TokenService } from '../token/token.service';
import { ElectionService } from '../election/election.service';
import { CoordinatorService } from '../coordinator/coordinator.service';
import { Logger } from '../common/logger';
import { Token, TopologyMessage } from '../common/types';
import {
  BASE_PORT,
  NUMBER_OF_NODES,
  INITIAL_BALANCE,
  TOKEN_DISPLAY_DELAY,
  MAX_RETRY_ATTEMPTS,
  RETRY_DELAY,
} from '../common/constants';
import { v4 as uuidv4 } from 'uuid';

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
export class ATMService implements OnApplicationBootstrap {
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
   * Flag to prevent concurrent token processing
   */
  private isProcessing: boolean = false;

  /**
   * Creates a new ATMService instance
   * @param bankingService - The shared banking service
   * @param tokenService - The token management service
   * @param httpService - HTTP client for network communication
   * @param electionService - Service for Bully Algorithm elections
   * @param coordinatorService - Service for coordinator responsibilities
   */
  constructor(
    private readonly bankingService: BankingService,
    private readonly tokenService: TokenService,
    private readonly httpService: HttpService,
    private readonly electionService: ElectionService,
    private readonly coordinatorService: CoordinatorService,
  ) {}

  /**
   * Lifecycle hook called after application bootstrap (all modules initialized and ready).
   * Reads NODE_ID from environment variable and initializes the ATM node.
   * If NODE_ID is not set, defaults to 1.
   * If this is node 1, creates and starts the initial token.
   */
  async onApplicationBootstrap() {
    const nodeId = parseInt(process.env.NODE_ID || '1', 10);
    await this.initialize(nodeId);

    // Only node 1 creates the initial token
    if (nodeId === 1) {
      await this.createInitialToken();
      this.logger.info('Token Ring initialized. Token circulation started.');
    }

    // After initialization, announce presence to coordinator
    // This handles both initial startup and recovery scenarios
    // Wait a bit for the system to stabilize
    setTimeout(async () => {
      // Always announce recovery - the method itself will handle
      // discovering the real coordinator if we think we are coordinator
      await this.announceRecovery();
    }, 5000); // 5 second delay to allow system stabilization
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
    this.electionService.initialize(nodeId);
    this.coordinatorService.initialize(nodeId);

    // Calculate next node in the ring (circular)
    this.nextNodeId = (nodeId % NUMBER_OF_NODES) + 1;

    // Initialize active nodes for coordinator service
    const allNodes = Array.from({ length: NUMBER_OF_NODES }, (_, i) => i + 1);
    this.coordinatorService.updateActiveNodes(allNodes);

    // Sync coordinator status with CoordinatorService
    this.coordinatorService.setCoordinatorStatus(
      this.electionService.isCurrentCoordinator(),
    );

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
   * Creates the initial token for the Token Ring and starts circulation.
   * This should only be called by one node (typically ATM1) at startup.
   * Waits for other nodes to start up before beginning token circulation.
   *
   * @example
   * // Only ATM1 creates the token
   * if (nodeId === 1) {
   *   await atmService.createInitialToken();
   * }
   */
  async createInitialToken(): Promise<void> {
    this.logger.info(
      `Creating initial token with balance: $${INITIAL_BALANCE}`,
    );
    const token = this.tokenService.createToken(this.nodeId, INITIAL_BALANCE);
    this.tokenService.receiveToken(token);

    // Wait for other nodes to start up before beginning circulation
    this.logger.info('Waiting 10 seconds for other nodes to start...');
    await new Promise((resolve) => setTimeout(resolve, 10000));

    this.logger.info('Starting token circulation...');
    await this.processToken();
  }

  /**
   * Handles the receipt of a token from the previous node in the ring.
   * This method:
   * 1. Logs token reception
   * 2. Validates token (prevents duplicates)
   * 3. Updates token ownership
   * 4. Checks if there are pending transactions
   * 5. Either executes transactions or forwards the token
   *
   * @param token - The token received from the predecessor
   *
   * @example
   * await atmService.receiveToken(incomingToken);
   */
  async receiveToken(token: Token): Promise<void> {
    // Prevent concurrent processing
    if (this.isProcessing) {
      this.logger.info('Already holding token, ignoring duplicate receipt');
      return;
    }

    this.logger.tokenReceived();

    // Validate and receive token (may reject if duplicate/invalid)
    const accepted = this.tokenService.receiveToken(token);
    if (!accepted) {
      this.logger.info('Token rejected (duplicate or invalid), ignoring');
      return;
    }

    // Mark next node as active (successful communication)
    this.electionService.markNodeAsActive(this.nextNodeId);

    // Process token: either execute transaction or forward
    await this.processToken();
  }

  /**
   * Processes the token according to Token Ring algorithm:
   * - If has pending transactions: execute one transaction
   * - If no pending transactions: forward token immediately
   *
   * NOTE: The correct Token Ring algorithm states:
   * "When a node receives the token, it can do two things:
   *  1. Has NO transactions → passes the token IMMEDIATELY
   *  2. Has a transaction → enters the critical section"
   *
   * The TOKEN_DISPLAY_DELAY is added ONLY for educational/demonstration purposes
   * to allow visualization of token circulation in logs during presentations.
   *
   * @private
   */
  private async processToken(): Promise<void> {
    this.isProcessing = true;
    try {
      if (this.tokenService.canAccessCriticalSection()) {
        // Has pending transactions: execute one transaction
        await this.executeNextTransaction();
      } else {
        // No pending transactions: brief display delay, then forward immediately
        // (In production, this delay should be 0 - token should be forwarded immediately)
        if (TOKEN_DISPLAY_DELAY > 0) {
          this.logger.info(
            `No pending transactions. Holding token for ${TOKEN_DISPLAY_DELAY}ms (display only)...`,
          );
          await new Promise((resolve) =>
            setTimeout(resolve, TOKEN_DISPLAY_DELAY),
          );
        }
        await this.forwardToken();
      }
    } finally {
      this.isProcessing = false;
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

    // Get current balance from token
    const currentBalance = this.tokenService.getBalance();
    if (currentBalance === null) {
      this.logger.error('Cannot execute transaction: no token held');
      return;
    }

    this.logger.transactionStarted(transaction.type, transaction.amount);

    try {
      let newBalance: number;

      if (transaction.type === 'deposit') {
        newBalance = this.bankingService.deposit(
          currentBalance,
          transaction.amount,
        );
      } else {
        newBalance = this.bankingService.withdraw(
          currentBalance,
          transaction.amount,
        );
      }

      // Update balance in token
      this.tokenService.updateBalance(newBalance);

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
   * Implements failure detection according to Bully Algorithm:
   * - Tries MAX_RETRY_ATTEMPTS times with RETRY_DELAY between attempts
   * - If all attempts fail, marks node as failed and starts election
   *
   * @private
   */
  private async forwardToken(): Promise<void> {
    const token = this.tokenService.getToken();
    if (!token) {
      return;
    }

    const nextNodePort = BASE_PORT + this.nextNodeId - 1;
    const nextNodeUrl = `http://127.0.0.1:${nextNodePort}/atm/token`;

    // Try MAX_RETRY_ATTEMPTS times
    for (let attempt = 1; attempt <= MAX_RETRY_ATTEMPTS; attempt++) {
      try {
        this.logger.tokenForwarded(this.nextNodeId);

        // Send token to next node via HTTP POST
        await firstValueFrom(
          this.httpService.post(nextNodeUrl, token, {
            timeout: 3000, // 3 second timeout
            headers: { 'Content-Type': 'application/json' },
          }),
        );

        // Success! Mark node as active and release the token
        this.electionService.markNodeAsActive(this.nextNodeId);
        this.tokenService.releaseToken();
        return;
      } catch (error) {
        this.logger.error(
          `Failed to forward to ATM${this.nextNodeId} (attempt ${attempt}/${MAX_RETRY_ATTEMPTS}): ${error.message}`,
        );

        if (attempt < MAX_RETRY_ATTEMPTS) {
          this.logger.info(`Retrying in ${RETRY_DELAY / 1000} seconds...`);
          await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY));
        }
      }
    }

    // All attempts failed - node is considered dead
    this.logger.error(
      `ATM${this.nextNodeId} failed to respond after ${MAX_RETRY_ATTEMPTS} attempts - declaring node as FAILED`,
    );

    // Mark node as failed in election service
    this.electionService.markNodeAsFailed(this.nextNodeId);

    // If we're the coordinator, handle the node failure
    if (this.electionService.isCurrentCoordinator()) {
      this.logger.info('I am coordinator - handling node failure');
      // Sync coordinator status with CoordinatorService
      this.coordinatorService.setCoordinatorStatus(true);
      await this.handleNodeFailureAsCoordinator(this.nextNodeId);
    } else {
      // Not coordinator - start election (coordinator may have failed)
      this.logger.info('Not coordinator - starting election to handle failure');
      await this.electionService.startElection();

      // Wait a bit for election to complete, then check if we became coordinator
      await new Promise((resolve) => setTimeout(resolve, 3000));

      if (this.electionService.isCurrentCoordinator()) {
        // Sync coordinator status with CoordinatorService
        this.coordinatorService.setCoordinatorStatus(true);
        // Verify health of all nodes since we just became coordinator
        this.logger.info(
          'Became coordinator after election - verifying health of all nodes',
        );
        await this.verifyAllNodesHealth();
        // The health check will handle all failed nodes including the one we just detected
      }
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
   * Gets the current account balance from the token.
   * Returns the actual balance if holding token, 0 otherwise.
   * @returns The current balance
   */
  getBalance(): number {
    return this.tokenService.getBalance() ?? 0;
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

  /**
   * Handles node failure as coordinator (Bully Algorithm responsibility).
   * Implements both Scenario A and Scenario B:
   * - Scenario A: Failed node had the token → regenerate token
   * - Scenario B: Failed node didn't have token → just reconstruct ring
   *
   * @param failedNodeId - The ID of the failed node
   * @private
   */
  private async handleNodeFailureAsCoordinator(
    failedNodeId: number,
  ): Promise<void> {
    this.logger.info(
      `*** HANDLING NODE FAILURE AS COORDINATOR *** (ATM${failedNodeId})`,
    );

    // Update coordinator service with failure
    await this.coordinatorService.handleNodeFailure(failedNodeId);

    // Get updated active nodes
    const activeNodes = this.coordinatorService.getActiveNodes();
    this.coordinatorService.updateActiveNodes(activeNodes);

    // Reconstruct ring topology
    const newTopology = this.coordinatorService.reconstructRing();

    // Update our own next node
    const myNextNode = newTopology.get(this.nodeId);
    if (myNextNode) {
      this.nextNodeId = myNextNode;
      this.logger.info(`Updated next node to: ATM${this.nextNodeId}`);
    }

    // Broadcast new topology to all active nodes
    await this.coordinatorService.broadcastTopology(newTopology);

    // Check if we currently have the token
    const hasToken = this.tokenService.hasToken();

    if (hasToken) {
      // Scenario B: We have the token, the failed node didn't
      // Just continue forwarding with new topology
      this.logger.info(
        'Scenario B: Token safe, continuing circulation with new topology',
      );
      await this.forwardToken();
    } else {
      // Scenario A might have occurred: Token may be lost
      // We need to determine if the failed node had the token
      // For simplicity, wait a bit to see if token comes back
      this.logger.info(
        'Waiting to check if token returns (may be Scenario A)...',
      );
      await new Promise((resolve) => setTimeout(resolve, 5000));

      // If still no token in the system, regenerate it (Scenario A)
      if (!this.tokenService.hasToken()) {
        this.logger.info('*** SCENARIO A *** Token was lost, regenerating...');
        const newTokenId = uuidv4();
        const lastKnownBalance =
          this.tokenService.getBalance() || INITIAL_BALANCE;
        const newToken = this.coordinatorService.regenerateToken(
          newTokenId,
          lastKnownBalance,
        );

        // Set valid token ID in token service
        this.tokenService.setValidTokenId(newTokenId);

        // Receive the new token and start circulation
        this.tokenService.receiveToken(newToken);
        this.logger.info('New token created, starting circulation');
        await this.processToken();
      }
    }
  }

  /**
   * Handles receiving an ELECTION message from another node
   * @param senderId - The ID of the node that started the election
   * @returns true if this node will respond with OK
   */
  async handleElectionMessage(senderId: number): Promise<boolean> {
    const electionMessage = {
      type: 'ELECTION' as const,
      senderId: senderId,
      timestamp: new Date(),
    };
    const willRespond =
      await this.electionService.handleElectionMessage(electionMessage);

    // If we responded OK, we may become coordinator
    // Wait a bit and check if we became coordinator
    if (willRespond) {
      setTimeout(async () => {
        if (this.electionService.isCurrentCoordinator()) {
          this.coordinatorService.setCoordinatorStatus(true);
          this.logger.info(
            'Became coordinator after responding to ELECTION - verifying health',
          );
          await this.verifyAllNodesHealth();
        }
      }, 3000); // Wait for election to complete
    }

    return willRespond;
  }

  /**
   * Handles receiving a COORDINATOR announcement
   * @param coordinatorId - The ID of the new coordinator
   * @param senderId - The ID of the node sending the announcement
   */
  async handleCoordinatorMessage(
    coordinatorId: number,
    senderId: number,
  ): Promise<void> {
    const coordinatorMessage = {
      type: 'COORDINATOR' as const,
      senderId: senderId,
      coordinatorId: coordinatorId,
      timestamp: new Date(),
    };
    this.electionService.handleCoordinatorMessage(coordinatorMessage);

    // Update coordinator service status
    const becameCoordinator = coordinatorId === this.nodeId;
    this.coordinatorService.setCoordinatorStatus(becameCoordinator);

    // If we just became coordinator, verify health of all nodes
    if (becameCoordinator) {
      this.logger.info('Became coordinator - verifying health of all nodes');
      // Small delay to let system stabilize
      setTimeout(async () => {
        await this.verifyAllNodesHealth();
      }, 1000);
    }
  }

  /**
   * Verifies health of all nodes and removes failed ones from the ring.
   * Called when this node becomes coordinator.
   * @private
   */
  private async verifyAllNodesHealth(): Promise<void> {
    const activeNodes = this.coordinatorService.getActiveNodes();
    const failedNodes: number[] = [];

    this.logger.info(`Health check: verifying ${activeNodes.length} nodes`);

    // Check each node (except ourselves)
    for (const nodeId of activeNodes) {
      if (nodeId === this.nodeId) continue;

      const isHealthy = await this.checkNodeHealth(nodeId);
      if (!isHealthy) {
        this.logger.info(`Health check: ATM${nodeId} is not responding`);
        failedNodes.push(nodeId);
      } else {
        this.logger.info(`Health check: ATM${nodeId} is healthy`);
      }
    }

    // Handle all failed nodes
    if (failedNodes.length > 0) {
      this.logger.info(
        `Health check: found ${failedNodes.length} failed nodes: ${failedNodes.join(', ')}`,
      );
      for (const failedNode of failedNodes) {
        // Mark as failed in election service
        this.electionService.markNodeAsFailed(failedNode);
        // Handle the failure as coordinator
        await this.handleNodeFailureAsCoordinator(failedNode);
      }
    } else {
      this.logger.info('Health check: all nodes are healthy');
    }
  }

  /**
   * Checks if a specific node is healthy
   * @param nodeId - The node ID to check
   * @returns true if node is responsive
   * @private
   */
  private async checkNodeHealth(nodeId: number): Promise<boolean> {
    const targetPort = BASE_PORT + nodeId - 1;
    const targetUrl = `http://127.0.0.1:${targetPort}/atm/health`;

    try {
      const response = await firstValueFrom(
        this.httpService.get(targetUrl, {
          timeout: 2000,
        }),
      );
      return response.data?.status === 'ok';
    } catch (error) {
      this.logger.error(
        `Health check failed for ATM${nodeId}: ${error.message}`,
      );
      return false;
    }
  }

  /**
   * Handles topology update from coordinator
   * @param topologyMessage - The topology update message
   * @param nextNodeId - The new next node ID for this node
   */
  handleTopologyUpdate(
    topologyMessage: TopologyMessage,
    nextNodeId: number,
  ): void {
    this.logger.info(
      `Received topology update from coordinator ATM${topologyMessage.coordinatorId}`,
    );
    this.logger.info(
      `Active nodes: [${topologyMessage.activeNodes.join(', ')}]`,
    );
    this.logger.info(`New next node: ATM${nextNodeId}`);

    // Update next node
    this.nextNodeId = nextNodeId;

    // Update valid token ID if provided
    if (topologyMessage.tokenId) {
      this.tokenService.setValidTokenId(topologyMessage.tokenId);
    }

    // Update active nodes in coordinator service (for when we become coordinator)
    this.coordinatorService.updateActiveNodes(topologyMessage.activeNodes);
  }

  /**
   * Announces node recovery to the coordinator.
   * Called when this node comes back online after a failure.
   * This method will try to discover the current coordinator if unknown.
   */
  async announceRecovery(): Promise<void> {
    this.logger.info('*** ANNOUNCING RECOVERY TO COORDINATOR ***');

    // Mark as recovering in token service (will discard old token)
    this.tokenService.markAsRecovering();

    // Discard any old token we may have held
    this.tokenService.discardToken();

    // Get current coordinator ID
    let coordinatorId = this.electionService.getCoordinatorId();

    // If we think we're the coordinator, we need to discover the real coordinator
    // (in case another node became coordinator while we were down)
    if (coordinatorId === this.nodeId) {
      this.logger.info(
        'We think we are coordinator - checking if another coordinator exists',
      );
      coordinatorId = await this.discoverCoordinator();

      // If no other coordinator found, we really are the coordinator
      if (coordinatorId === null) {
        this.logger.info('No other coordinator found - we are the coordinator');
        return;
      }
    }

    if (coordinatorId === null) {
      this.logger.error('Unknown coordinator, cannot announce recovery');
      return;
    }

    const recoveryMessage = {
      nodeId: this.nodeId,
      timestamp: new Date(),
    };

    const coordinatorPort = BASE_PORT + coordinatorId - 1;
    const coordinatorUrl = `http://127.0.0.1:${coordinatorPort}/atm/recovery`;

    try {
      await firstValueFrom(
        this.httpService.post(coordinatorUrl, recoveryMessage, {
          timeout: 5000,
          headers: { 'Content-Type': 'application/json' },
        }),
      );
      this.logger.info(`Recovery announced to coordinator ATM${coordinatorId}`);
    } catch (error) {
      this.logger.error(`Failed to announce recovery: ${error.message}`);
    }
  }

  /**
   * Discovers the current coordinator by querying other nodes.
   * Returns the ID of the coordinator, or null if none found.
   * @private
   */
  private async discoverCoordinator(): Promise<number | null> {
    // Try all other nodes starting from highest ID
    for (let id = NUMBER_OF_NODES; id >= 1; id--) {
      if (id === this.nodeId) continue;

      const port = BASE_PORT + id - 1;
      const url = `http://127.0.0.1:${port}/atm/coordinator-status`;

      try {
        const response = await firstValueFrom(
          this.httpService.get(url, { timeout: 2000 }),
        );

        if (response.data?.coordinatorId) {
          const discoveredCoordinator = response.data.coordinatorId;
          this.logger.info(
            `Discovered coordinator: ATM${discoveredCoordinator} (via ATM${id})`,
          );

          // Update our election service with the real coordinator
          const coordinatorMessage = {
            type: 'COORDINATOR' as const,
            senderId: discoveredCoordinator,
            coordinatorId: discoveredCoordinator,
            timestamp: new Date(),
          };
          this.electionService.handleCoordinatorMessage(coordinatorMessage);
          this.coordinatorService.setCoordinatorStatus(false);

          return discoveredCoordinator;
        }
      } catch (error) {
        // Node not responding or error - try next
        this.logger.error(
          `Error discovering coordinator via ATM${id}: ${error.message}`,
        );
        continue;
      }
    }

    return null; // No coordinator found
  }

  /**
   * Handles recovery announcement from another node (coordinator only)
   * @param nodeId - The ID of the recovered node
   */
  async handleRecoveryAnnouncement(nodeId: number): Promise<boolean> {
    const recoveryMessage = {
      nodeId: nodeId,
      timestamp: new Date(),
    };
    const success =
      await this.coordinatorService.handleNodeRecovery(recoveryMessage);

    // If recovery was successful and we're the coordinator, update our own next node
    if (success && this.coordinatorService.isCurrentCoordinator()) {
      const newTopology = this.coordinatorService.reconstructRing();
      const myNextNode = newTopology.get(this.nodeId);
      if (myNextNode) {
        this.nextNodeId = myNextNode;
        this.logger.info(
          `Coordinator updated own next node to: ATM${this.nextNodeId}`,
        );
      }
    }

    return success;
  }

  /**
   * Gets the current coordinator ID
   * @returns The coordinator ID or null if unknown
   */
  getCoordinatorId(): number | null {
    return this.electionService.getCoordinatorId();
  }

  /**
   * Checks if this node is currently the coordinator
   * @returns true if this node is coordinator
   */
  isCoordinator(): boolean {
    return this.electionService.isCurrentCoordinator();
  }
}
