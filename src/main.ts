import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { BASE_PORT } from './common/constants';

/**
 * Bootstrap function to start the ATM node.
 * Reads NODE_ID from environment variable to determine:
 * - Which ATM node this is (1-4)
 * - Which port to listen on (BASE_PORT + NODE_ID - 1)
 *
 * @example
 * # Start ATM1 on port 3001
 * NODE_ID=1 npm run start
 *
 * # Start ATM2 on port 3002
 * NODE_ID=2 npm run start
 */
async function bootstrap() {
  const nodeId = parseInt(process.env.NODE_ID || '1', 10);
  const port = BASE_PORT + nodeId - 1;

  const app = await NestFactory.create(AppModule, {
    logger: ['error', 'warn', 'log'],
  });

  await app.listen(port);

  console.log(`\n${'='.repeat(50)}`);
  console.log(`🏦 ATM Node ${nodeId} started on port ${port}`);
  console.log(`📡 Ready to participate in Token Ring`);
  console.log(`${'='.repeat(50)}\n`);
}

bootstrap();
