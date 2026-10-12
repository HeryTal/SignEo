import { WebhookDelivery } from './webhook-delivery.entity.js';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WorkspacesModule } from '../workspaces/workspaces.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { WebhookEndpoint } from './webhook-endpoint.entity.js';
import { WebhooksService } from './webhooks.service.js';
import { WebhooksController } from './webhooks.controller.js';
@Module({ imports: [TypeOrmModule.forFeature([WebhookEndpoint, WebhookDelivery]), WorkspacesModule, AuthModule], controllers: [WebhooksController], providers: [WebhooksService], exports: [WebhooksService] })
export class WebhooksModule {}
