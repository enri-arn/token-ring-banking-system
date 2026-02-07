import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ElectionService } from './election.service';

/**
 * ElectionModule provides the Bully Algorithm election functionality.
 * This module handles:
 * - Starting and managing elections
 * - Handling ELECTION and COORDINATOR messages
 * - Tracking node status (active/failed)
 * - Coordinator selection
 *
 * @remarks
 * This module is used by ATMService to implement fault-tolerant
 * coordinator election in the Token Ring system.
 */
@Module({
  imports: [HttpModule],
  providers: [ElectionService],
  exports: [ElectionService],
})
export class ElectionModule {}
