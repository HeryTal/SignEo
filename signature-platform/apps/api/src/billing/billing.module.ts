import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Envelope } from '../envelopes/envelope.entity.js';
import { Organization } from '../organizations/organization.entity.js';
import { WorkspacesModule } from '../workspaces/workspaces.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { BillingController, StripeWebhookController } from './billing.controller.js';
import { BillingService } from './billing.service.js';

@Module({
  imports: [TypeOrmModule.forFeature([Organization, Envelope]), WorkspacesModule, AuthModule],
  controllers: [BillingController, StripeWebhookController],
  providers: [BillingService],
})
export class BillingModule {}
