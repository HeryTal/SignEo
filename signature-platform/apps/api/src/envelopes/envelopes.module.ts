import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module.js';
import { User } from '../users/user.entity.js';
import { AuditEvent } from './audit-event.entity.js';
import { EnvelopeDocument } from './envelope-document.entity.js';
import { EnvelopeTemplate } from './envelope-template.entity.js';
import { Envelope } from './envelope.entity.js';
import { EnvelopesController } from './envelopes.controller.js';
import { EnvelopesService } from './envelopes.service.js';
import { Recipient } from './recipient.entity.js';
import { MailService } from './mail.service.js';
import { WorkspacesModule } from '../workspaces/workspaces.module.js';
import { WorkspaceMember } from '../workspaces/workspace-member.entity.js';
import { WebhooksModule } from '../webhooks/webhooks.module.js';

@Module({
  imports: [TypeOrmModule.forFeature([Envelope, EnvelopeDocument, EnvelopeTemplate, Recipient, AuditEvent, User, WorkspaceMember]), AuthModule, WorkspacesModule, WebhooksModule],
  controllers: [EnvelopesController],
  providers: [EnvelopesService, MailService],
  exports: [EnvelopesService],
})
export class EnvelopesModule {}
