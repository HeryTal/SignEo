import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { Envelope } from '../envelopes/envelope.entity.js';
import { WorkspacesModule } from '../workspaces/workspaces.module.js';
import { ApiKey } from './api-key.entity.js';
import { ApiKeyGuard } from './api-key.guard.js';
import { ApiKeyService } from './api-key.service.js';
import { ApiRequestLog } from './api-request-log.entity.js';
import { DeveloperController } from './developer.controller.js';
import { PublicApiController } from './public-api.controller.js';
import { OpenApiController } from './openapi.controller.js';
import { RateLimitService } from './rate-limit.service.js';
import { EnvelopesModule } from '../envelopes/envelopes.module.js';
import { WebhooksModule } from '../webhooks/webhooks.module.js';
@Module({ imports: [TypeOrmModule.forFeature([ApiKey, ApiRequestLog, Envelope]), WorkspacesModule, EnvelopesModule, WebhooksModule, JwtModule.register({ secret: process.env.JWT_SECRET ?? 'local-development-secret-change-me' })], controllers: [DeveloperController, PublicApiController, OpenApiController], providers: [ApiKeyService, ApiKeyGuard, RateLimitService, JwtAuthGuard] })
export class DeveloperModule {}
