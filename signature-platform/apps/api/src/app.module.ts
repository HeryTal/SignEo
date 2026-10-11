import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { AuthModule } from './auth/auth.module.js';
import { EnvelopesModule } from './envelopes/envelopes.module.js';
import { WorkspacesModule } from './workspaces/workspaces.module.js';
import { DeveloperModule } from './developer/developer.module.js';
import { BillingModule } from './billing/billing.module.js';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    TypeOrmModule.forRoot({
      type: 'postgres',
      host: process.env.DATABASE_HOST ?? '127.0.0.1',
      port: Number(process.env.DATABASE_PORT ?? 5432),
      username: process.env.DATABASE_USER ?? 'signeo',
      password: process.env.DATABASE_PASSWORD ?? 'signeo_dev_password',
      database: process.env.DATABASE_NAME ?? 'signeo',
      schema: process.env.DATABASE_SCHEMA ?? 'public',
      autoLoadEntities: true,
      synchronize: process.env.NODE_ENV !== 'production',
      ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : false,
    }),
    AuthModule,
    WorkspacesModule,
    DeveloperModule,
    BillingModule,
    EnvelopesModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
