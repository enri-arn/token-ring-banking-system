import { Module } from '@nestjs/common';
import { BankingService } from './banking.service';

/**
 * BankingModule encapsulates all banking-related functionality.
 * This module provides the BankingService which manages the shared
 * bank account resource in the distributed Token Ring system.
 *
 */
@Module({
  providers: [BankingService],
  exports: [BankingService],
})
export class BankingModule {}
