import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { BankingModule } from './banking/banking.module';

@Module({
  imports: [BankingModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
