import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module.js';
import { User } from '../users/user.entity.js';
import { AuditEvent } from './audit-event.entity.js';
import { EnvelopeDocument } from './envelope-document.entity.js';
import { Envelope } from './envelope.entity.js';
import { EnvelopesController } from './envelopes.controller.js';
import { EnvelopesService } from './envelopes.service.js';
import { Recipient } from './recipient.entity.js';
import { MailService } from './mail.service.js';
import { WorkspacesModule } from '../workspaces/workspaces.module.js';

@Module({
  imports: [TypeOrmModule.forFeature([Envelope, EnvelopeDocument, Recipient, AuditEvent, User]), AuthModule, WorkspacesModule],
  controllers: [EnvelopesController],
  providers: [EnvelopesService, MailService],
})
export class EnvelopesModule {}
