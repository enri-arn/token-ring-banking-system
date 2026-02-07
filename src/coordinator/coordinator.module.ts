import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { CoordinatorService } from './coordinator.service';

/**
 * CoordinatorModule provides coordinator responsibility management.
 * This module handles:
 * - Token regeneration after failures
 * - Ring topology reconstruction
 * - Node recovery and reintegration
 * - Topology broadcasting
 *
 * @remarks
 * This module is used by ATMService when a node becomes coordinator
 * after a successful election in the Bully Algorithm.
 */
@Module({
  imports: [HttpModule],
  providers: [CoordinatorService],
  exports: [CoordinatorService],
})
export class CoordinatorModule {}
