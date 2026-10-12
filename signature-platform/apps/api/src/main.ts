import { validateProductionEnvironment } from './config/production.js';
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
  loadEnvironment({ path: environmentFile, override: process.env.NODE_ENV !== 'production' });
}

// Load AppModule only after dotenv has populated process.env. Static imports
// are evaluated before this file's code runs.
validateProductionEnvironment();
const { AppModule } = await import('./app.module.js');

async function bootstrap() {
  // Stripe signs the exact request bytes sent to its webhook. Keeping them is
  // required to validate its signature before parsing the event.
  const app = await NestFactory.create(AppModule, { rawBody: true });
  app.enableCors({ origin: process.env.WEB_ORIGIN ?? 'http://localhost:3000' });
  const server = app.getHttpAdapter().getInstance();
  if (process.env.TRUST_PROXY_HOPS) server.set('trust proxy', Number(process.env.TRUST_PROXY_HOPS));
  server.disable('x-powered-by');
  app.use((_request: unknown, response: {setHeader:(key:string,value:string)=>void}, next:()=>void) => {
    response.setHeader('X-Content-Type-Options','nosniff');
    response.setHeader('Referrer-Policy','no-referrer');
    response.setHeader('Cache-Control','no-store');
    next();
  });
  app.enableShutdownHooks();
  await app.listen(process.env.PORT ?? 3001, process.env.HOST ?? '127.0.0.1');
}
await bootstrap();
