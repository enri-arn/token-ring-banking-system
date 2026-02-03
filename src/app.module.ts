import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { BankingModule } from './banking/banking.module';
import { TokenModule } from './token/token.module';
import { ATMModule } from './atm/atm.module';

@Module({
  imports: [BankingModule, TokenModule, ATMModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
