import 'reflect-metadata';
import { config } from 'dotenv';
import { existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DataSource } from 'typeorm';

const here = dirname(fileURLToPath(import.meta.url));
const rootEnv = resolve(here, '../../../../.env');
if (existsSync(rootEnv)) config({ path: rootEnv, quiet: true });

export default new DataSource({
  type: 'postgres',
  host: process.env.DATABASE_HOST ?? '127.0.0.1',
  port: Number(process.env.DATABASE_PORT ?? 5432),
  username: process.env.DATABASE_USER ?? 'signeo',
  password: process.env.DATABASE_PASSWORD,
  database: process.env.DATABASE_NAME ?? 'signeo',
  schema: process.env.DATABASE_SCHEMA ?? 'public',
  ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : false,
  entities: [resolve(here, '../**/*.entity.js')],
  migrations: [resolve(here, 'migrations/*.js')],
  migrationsTableName: 'schema_migrations',
  synchronize: false,
});
