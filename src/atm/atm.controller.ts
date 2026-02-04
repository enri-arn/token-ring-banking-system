import { Controller, Post, Get, Body, HttpCode } from '@nestjs/common';
import { ATMService } from './atm.service';
import { Token } from '../common/types';

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
}
