import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ATMService } from './atm.service';
import { ATMController } from './atm.controller';
import { BankingModule } from '../banking/banking.module';
import { TokenModule } from '../token/token.module';
import { ElectionModule } from '../election/election.module';
import { CoordinatorModule } from '../coordinator/coordinator.module';

/**
 * ATMModule encapsulates the ATM node functionality.
 * This module brings together:
 * - Banking operations (BankingModule)
 * - Token Ring mutual exclusion (TokenModule)
 * - Bully Algorithm elections (ElectionModule)
 * - Coordinator responsibilities (CoordinatorModule)
 * - HTTP communication for token passing (HttpModule)
 * - Node coordination and communication (ATMService, ATMController)
 *
 * @remarks
 * Each running instance of this module represents one ATM node
 * in the distributed Token Ring system with fault tolerance via Bully Algorithm.
 */
@Module({
  imports: [
    BankingModule,
    TokenModule,
    ElectionModule,
    CoordinatorModule,
    HttpModule,
  ],
  controllers: [ATMController],
  providers: [ATMService],
  exports: [ATMService],
})
export class ATMModule {}
