import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { config as loadEnvironment } from 'dotenv';
import { NestFactory } from '@nestjs/core';

const rootEnvironmentFile = resolve(process.cwd(), '../../.env');
const localEnvironmentFile = resolve(process.cwd(), '.env');
const environmentFile = existsSync(rootEnvironmentFile)
  ? rootEnvironmentFile
  : localEnvironmentFile;

if (existsSync(environmentFile)) {
  // In local development, the repository .env is the source of truth even
  // when PowerShell already has an older DATABASE_PASSWORD in its environment.
  loadEnvironment({ path: environmentFile, override: true });
}

// Load AppModule only after dotenv has populated process.env. Static imports
// are evaluated before this file's code runs.
const { AppModule } = await import('./app.module.js');

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableCors({ origin: process.env.WEB_ORIGIN ?? 'http://localhost:3000' });
  app.enableShutdownHooks();
  await app.listen(process.env.PORT ?? 3001, process.env.HOST ?? '127.0.0.1');
}
await bootstrap();
