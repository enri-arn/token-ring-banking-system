import { Controller, Post, Get, Body, HttpCode } from '@nestjs/common';
import { ATMService } from './atm.service';
import {
  Token,
  ElectionMessage,
  RecoveryMessage,
  TopologyMessage,
  TokenStatusVoteRequest,
  TokenStatusVoteResponse,
  InvalidateTokenCommand,
} from '../common/types';

/**
 * ATMController handles HTTP endpoints for Token Ring communication.
 * Each ATM node exposes these endpoints to:
 * - Receive tokens from predecessor nodes
 * - Accept transaction requests
 * - Provide status information
 *
 * @remarks
 * These endpoints enable the distributed communication between ATM nodes
 * in the Token Ring system.
 */
@Controller('atm')
export class ATMController {
  constructor(private readonly atmService: ATMService) {}

  /**
   * Endpoint to receive the token from the previous node in the ring.
   * This is called by the predecessor when forwarding the token.
   *
   * IMPORTANT: Returns immediately (200 OK) then processes token asynchronously.
   * This prevents the sender from timing out while waiting for response.
   *
   * @param token - The token being passed to this node
   * @returns Immediate acknowledgment of token receipt
   *
   * @example
   * POST /atm/token
   * Body: { "id": "uuid", "holderId": 1, "balance": 1000 }
   */
  @Post('token')
  @HttpCode(200)
  async receiveToken(@Body() token: Token): Promise<{ message: string }> {
    // Process token asynchronously (don't await - return immediately)
    this.atmService.receiveToken(token).catch((error) => {
      console.error(`[ATMController] Error processing token: ${error.message}`);
    });

    // Return immediately so sender doesn't timeout
    return { message: 'Token received' };
  }

  /**
   * Endpoint to request a new transaction.
   * The transaction will be queued and executed when this node receives the token.
   *
   * @param body - Transaction details (type and amount)
   * @returns Confirmation of transaction request
   *
   * @example
   * POST /atm/transaction
   * Body: { "type": "deposit", "amount": 100 }
   */
  @Post('transaction')
  @HttpCode(202)
  async requestTransaction(
    @Body() body: { type: 'deposit' | 'withdrawal'; amount: number },
  ): Promise<{ message: string; pendingCount: number }> {
    await this.atmService.requestTransaction(body.type, body.amount);
    return {
      message: 'Transaction request queued',
      pendingCount: this.atmService.getPendingTransactionCount(),
    };
  }

  /**
   * Endpoint to get the current status of this ATM node.
   * Provides information about node ID, token possession, pending transactions, and balance.
   *
   * @returns Status information
   *
   * @example
   * GET /atm/status
   */
  @Get('status')
  getStatus(): {
    nodeId: number;
    hasToken: boolean;
    pendingTransactions: number;
    balance: number;
  } {
    return {
      nodeId: this.atmService.getNodeId(),
      hasToken: this.atmService.hasToken(),
      pendingTransactions: this.atmService.getPendingTransactionCount(),
      balance: this.atmService.getBalance(),
    };
  }

  /**
   * Health check endpoint to verify if the node is ready to participate in the Token Ring.
   * This is used by other nodes to ensure this node is fully initialized before starting token circulation.
   *
   * @returns Health status
   *
   * @example
   * GET /atm/health
   */
  @Get('health')
  healthCheck(): { status: string; nodeId: number } {
    return {
      status: 'ok',
      nodeId: this.atmService.getNodeId(),
    };
  }

  /**
   * Endpoint to receive an ELECTION message (Bully Algorithm).
   * When a node receives an ELECTION message from a lower ID node,
   * it responds with OK and may start its own election.
   *
   * @param message - The election message
   * @returns OK response if this node has higher ID
   *
   * @example
   * POST /atm/election
   * Body: { "type": "ELECTION", "senderId": 2, "timestamp": "..." }
   */
  @Post('election')
  @HttpCode(200)
  async receiveElection(
    @Body() message: ElectionMessage,
  ): Promise<{ ok: boolean }> {
    const ok = await this.atmService.handleElectionMessage(message.senderId);
    return { ok };
  }

  /**
   * Endpoint to receive a COORDINATOR announcement (Bully Algorithm).
   * This message announces the new coordinator after an election.
   *
   * @param message - The coordinator message
   * @returns Acknowledgment
   *
   * @example
   * POST /atm/coordinator
   * Body: { "type": "COORDINATOR", "senderId": 4, "coordinatorId": 4, "timestamp": "..." }
   */
  @Post('coordinator')
  @HttpCode(200)
  receiveCoordinator(@Body() message: ElectionMessage): { message: string } {
    if (message.coordinatorId === undefined) {
      return { message: 'Invalid coordinator message' };
    }
    // Process asynchronously - don't block response
    this.atmService
      .handleCoordinatorMessage(message.coordinatorId, message.senderId)
      .catch((error) => {
        console.error(
          `[ATMController] Error handling coordinator message: ${error.message}`,
        );
      });
    return { message: 'Coordinator acknowledged' };
  }

  /**
   * Endpoint to receive ring topology update from coordinator.
   * The coordinator sends this after removing failed nodes or adding recovered nodes.
   *
   * @param body - The topology message with nextNodeId
   * @returns Acknowledgment
   *
   * @example
   * POST /atm/topology
   * Body: { "coordinatorId": 4, "activeNodes": [1,3,4], "tokenId": "uuid", "nextNodeId": 3, "timestamp": "..." }
   */
  @Post('topology')
  @HttpCode(200)
  receiveTopology(@Body() body: TopologyMessage & { nextNodeId: number }): {
    message: string;
  } {
    const { nextNodeId, ...topologyMessage } = body;
    this.atmService.handleTopologyUpdate(topologyMessage, nextNodeId);
    return { message: 'Topology updated' };
  }

  /**
   * Endpoint to receive recovery announcement from a node that came back online.
   * Only the coordinator handles this and reintegrates the node.
   *
   * @param message - The recovery message
   * @returns Success status
   *
   * @example
   * POST /atm/recovery
   * Body: { "nodeId": 2, "timestamp": "..." }
   */
  @Post('recovery')
  @HttpCode(200)
  async receiveRecovery(
    @Body() message: RecoveryMessage,
  ): Promise<{ success: boolean; message: string }> {
    const success = await this.atmService.handleRecoveryAnnouncement(
      message.nodeId,
    );
    return {
      success,
      message: success
        ? `Node ${message.nodeId} reintegrated into ring`
        : `Failed to reintegrate node ${message.nodeId}`,
    };
  }

  /**
   * Endpoint to get election and coordinator information.
   * Useful for debugging and monitoring.
   *
   * @returns Election status information
   *
   * @example
   * GET /atm/coordinator-status
   */
  @Get('coordinator-status')
  getCoordinatorStatus(): {
    nodeId: number;
    coordinatorId: number | null;
    isCoordinator: boolean;
  } {
    return {
      nodeId: this.atmService.getNodeId(),
      coordinatorId: this.atmService.getCoordinatorId(),
      isCoordinator: this.atmService.isCoordinator(),
    };
  }

  /**
   * Endpoint to vote on token status (consensus mechanism).
   * The coordinator requests all nodes to report if they have the token.
   * This prevents race conditions when deciding between Scenario A and B.
   *
   * @param request - The vote request from coordinator
   * @returns Token status information
   *
   * @example
   * POST /atm/token-status-vote
   * Body: { "requestId": "uuid", "coordinatorId": 4, "timestamp": "..." }
   */
  @Post('token-status-vote')
  @HttpCode(200)
  voteTokenStatus(
    @Body() request: TokenStatusVoteRequest,
  ): TokenStatusVoteResponse {
    return this.atmService.voteTokenStatus(request);
  }

  /**
   * Endpoint to receive command to invalidate old token.
   * The coordinator sends this before regenerating a new token
   * to ensure no duplicate tokens exist in the system.
   *
   * @param command - The invalidation command from coordinator
   * @returns Acknowledgment
   *
   * @example
   * POST /atm/invalidate-token
   * Body: { "coordinatorId": 4, "reason": "Token lost, regenerating", "timestamp": "..." }
   */
  @Post('invalidate-token')
  @HttpCode(200)
  invalidateToken(
    @Body() command: InvalidateTokenCommand,
  ): { message: string } {
    this.atmService.invalidateToken(command);
    return { message: 'Token invalidated' };
  }
}
