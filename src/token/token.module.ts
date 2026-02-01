import { Module } from '@nestjs/common';
import { TokenService } from './token.service';

/**
 * TokenModule encapsulates the Token Ring algorithm functionality.
 * This module provides the TokenService which manages token ownership,
 * transaction queuing, and critical section access control.
 *
 * @remarks
 * This module should be imported by the ATM module to enable
 * Token Ring mutual exclusion capabilities.
 */
@Module({
  providers: [TokenService],
  exports: [TokenService],
})
export class TokenModule {}
