import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { BankingModule } from './banking/banking.module';
import { TokenModule } from './token/token.module';

@Module({
  imports: [BankingModule, TokenModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
