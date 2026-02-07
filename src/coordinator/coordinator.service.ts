import { Injectable } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { Logger } from '../common/logger';
import { Token, RecoveryMessage, TopologyMessage } from '../common/types';
import {
  BASE_PORT,
  NODE_RESPONSE_TIMEOUT,
  INITIAL_BALANCE,
} from '../common/constants';

/**
 * CoordinatorService manages coordinator responsibilities in the Bully Algorithm.
 *
 * When a node becomes coordinator after an election, it is responsible for:
 * 1. Regenerating the token if it was lost (Scenario A)
 * 2. Reconstructing the ring topology without failed nodes (Scenario B)
 * 3. Handling node recovery announcements
 * 4. Reintegrating recovered nodes into the ring
 *
 * @remarks
 * This service works in conjunction with ElectionService and is only
 * active when the node is the current coordinator.
 */
@Injectable()
export class CoordinatorService {
  /**
   * The unique identifier of this node
   */
  private nodeId: number;

  /**
   * Logger instance for this node
   */
  private logger: Logger;

  /**
   * List of currently active nodes in the ring
   */
  private activeNodes: number[] = [];

  /**
   * The current token ID (for validation and duplicate detection)
   */
  private currentTokenId: string | null = null;

  /**
   * Flag indicating if this node is currently the coordinator
   */
  private isCoordinator: boolean = false;

  /**
   * Creates a new CoordinatorService instance
   */
  constructor(private readonly httpService: HttpService) {}

  /**
   * Initializes the coordinator service with a specific node ID
   * @param nodeId - The unique identifier of this node
   */
  initialize(nodeId: number): void {
    this.nodeId = nodeId;
    this.logger = new Logger(nodeId);
  }

  /**
   * Sets whether this node is currently the coordinator
   * @param isCoordinator - true if this node is coordinator
   */
  setCoordinatorStatus(isCoordinator: boolean): void {
    this.isCoordinator = isCoordinator;
  }

  /**
   * Updates the list of active nodes in the ring
   * @param activeNodes - Array of active node IDs
   */
  updateActiveNodes(activeNodes: number[]): void {
    this.activeNodes = [...activeNodes].sort((a, b) => a - b);
    this.logger.info(`Active nodes updated: [${this.activeNodes.join(', ')}]`);
  }

  /**
   * Regenerates the token after it has been lost (Scenario A).
   * This is called when the coordinator determines the token is lost
   * (e.g., node holding token died).
   *
   * @param tokenId - Unique ID for the new token
   * @param balance - Balance to set in the new token (use last known or initial)
   * @returns The newly created token
   */
  regenerateToken(tokenId: string, balance: number = INITIAL_BALANCE): Token {
    if (!this.isCoordinator) {
      throw new Error('Only coordinator can regenerate token');
    }

    this.logger.info(`*** REGENERATING TOKEN *** (balance: $${balance})`);

    const newToken: Token = {
      id: tokenId,
      holderId: this.nodeId,
      balance: balance,
    };

    this.currentTokenId = tokenId;
    return newToken;
  }

  /**
   * Reconstructs the ring topology by removing failed nodes.
   * Calculates the next active node for each node in the ring.
   *
   * @returns Map of nodeId -> nextNodeId in the reconstructed ring
   */
  reconstructRing(): Map<number, number> {
    if (!this.isCoordinator) {
      throw new Error('Only coordinator can reconstruct ring');
    }

    this.logger.info('*** RECONSTRUCTING RING TOPOLOGY ***');

    const topology = new Map<number, number>();

    // For each active node, find the next active node (circular)
    for (let i = 0; i < this.activeNodes.length; i++) {
      const currentNode = this.activeNodes[i];
      const nextNode = this.activeNodes[(i + 1) % this.activeNodes.length];
      topology.set(currentNode, nextNode);
      this.logger.info(`ATM${currentNode} -> ATM${nextNode}`);
    }

    return topology;
  }

  /**
   * Broadcasts the new ring topology to all active nodes.
   * Each node will update its next node ID accordingly.
   *
   * @param topology - Map of nodeId -> nextNodeId
   */
  async broadcastTopology(topology: Map<number, number>): Promise<void> {
    if (!this.isCoordinator) {
      throw new Error('Only coordinator can broadcast topology');
    }

    this.logger.info('Broadcasting topology to all active nodes');

    const topologyMessage: TopologyMessage = {
      coordinatorId: this.nodeId,
      activeNodes: this.activeNodes,
      tokenId: this.currentTokenId || undefined,
      timestamp: new Date(),
    };

    // Send topology update to all active nodes (except self)
    const promises = this.activeNodes
      .filter((nodeId) => nodeId !== this.nodeId)
      .map((nodeId) =>
        this.sendTopologyUpdate(nodeId, topologyMessage, topology.get(nodeId)!),
      );

    await Promise.allSettled(promises);
  }

  /**
   * Sends topology update to a specific node
   * @param targetNodeId - The target node ID
   * @param topologyMessage - The topology message
   * @param nextNodeId - The next node ID for the target node
   * @private
   */
  private async sendTopologyUpdate(
    targetNodeId: number,
    topologyMessage: TopologyMessage,
    nextNodeId: number,
  ): Promise<void> {
    const targetPort = BASE_PORT + targetNodeId - 1;
    const targetUrl = `http://127.0.0.1:${targetPort}/atm/topology`;

    try {
      await firstValueFrom(
        this.httpService.post(
          targetUrl,
          { ...topologyMessage, nextNodeId },
          {
            timeout: NODE_RESPONSE_TIMEOUT,
            headers: { 'Content-Type': 'application/json' },
          },
        ),
      );
      this.logger.info(
        `Topology update sent to ATM${targetNodeId} (next: ATM${nextNodeId})`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to send topology update to ATM${targetNodeId}: ${error.message}`,
      );
    }
  }

  /**
   * Handles a recovery announcement from a node that has come back online.
   * The coordinator must:
   * 1. Verify the node is actually back
   * 2. Reinsert it into the ring topology
   * 3. Broadcast the updated topology
   *
   * @param recoveryMessage - The recovery message from the recovered node
   * @returns true if node was successfully reintegrated
   */
  async handleNodeRecovery(recoveryMessage: RecoveryMessage): Promise<boolean> {
    if (!this.isCoordinator) {
      this.logger.error('Only coordinator can handle node recovery');
      return false;
    }

    const recoveredNodeId = recoveryMessage.nodeId;
    this.logger.info(
      `*** NODE RECOVERY *** ATM${recoveredNodeId} is back online`,
    );

    // Check if node is already in active list
    if (this.activeNodes.includes(recoveredNodeId)) {
      this.logger.info(`ATM${recoveredNodeId} already in active nodes`);
      return true;
    }

    // Verify node is actually responsive
    const isResponsive = await this.checkNodeHealth(recoveredNodeId);
    if (!isResponsive) {
      this.logger.error(
        `ATM${recoveredNodeId} failed health check, not reintegrating`,
      );
      return false;
    }

    // Add node to active list and reconstruct ring
    this.activeNodes.push(recoveredNodeId);
    this.activeNodes.sort((a, b) => a - b);

    this.logger.info(`Reintegrating ATM${recoveredNodeId} into ring`);

    // Reconstruct and broadcast new topology
    const newTopology = this.reconstructRing();
    await this.broadcastTopology(newTopology);

    return true;
  }

  /**
   * Checks if a node is healthy and responsive
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
          timeout: NODE_RESPONSE_TIMEOUT,
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
   * Removes a failed node from the active nodes list and reconstructs the ring.
   * This is called when a node is confirmed as failed.
   *
   * @param failedNodeId - The ID of the failed node
   */
  async handleNodeFailure(failedNodeId: number): Promise<void> {
    if (!this.isCoordinator) {
      return;
    }

    this.logger.info(
      `*** NODE FAILURE *** Removing ATM${failedNodeId} from ring`,
    );

    // Remove from active nodes
    this.activeNodes = this.activeNodes.filter((id) => id !== failedNodeId);

    if (this.activeNodes.length === 0) {
      this.logger.error('All nodes have failed! System cannot continue.');
      return;
    }

    // Reconstruct and broadcast new topology
    const newTopology = this.reconstructRing();
    await this.broadcastTopology(newTopology);
  }

  /**
   * Sets the current token ID for tracking
   * @param tokenId - The token ID to track
   */
  setCurrentTokenId(tokenId: string): void {
    this.currentTokenId = tokenId;
  }

  /**
   * Gets the current token ID
   * @returns The current token ID or null if unknown
   */
  getCurrentTokenId(): string | null {
    return this.currentTokenId;
  }

  /**
   * Checks if a token ID is valid (matches the current token)
   * @param tokenId - The token ID to validate
   * @returns true if token is valid
   */
  isValidTokenId(tokenId: string): boolean {
    // If we don't have a current token ID, any token could be valid
    if (this.currentTokenId === null) {
      return true;
    }
    return tokenId === this.currentTokenId;
  }

  /**
   * Gets the list of active nodes
   * @returns Array of active node IDs
   */
  getActiveNodes(): number[] {
    return [...this.activeNodes];
  }

  /**
   * Checks if this service is currently acting as coordinator
   * @returns true if coordinator
   */
  isCurrentCoordinator(): boolean {
    return this.isCoordinator;
  }
}
