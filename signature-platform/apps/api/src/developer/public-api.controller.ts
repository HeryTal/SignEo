import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Envelope } from '../envelopes/envelope.entity.js';
import { ApiKey } from './api-key.entity.js';
import { ApiKeyGuard } from './api-key.guard.js';
import { ApiScopes } from './api-scopes.decorator.js';
type ApiRequest = Request & { apiKey: ApiKey };

@Controller('v1')
@UseGuards(ApiKeyGuard)
export class PublicApiController {
  constructor(@InjectRepository(Envelope) private readonly envelopes: Repository<Envelope>) {}
  @Get('envelopes')
  @ApiScopes('envelopes:read')
  async listEnvelopes(@Req() request: ApiRequest) {
    const items = await this.envelopes.find({ where: { workspace: { id: request.apiKey.workspace.id } }, relations: { recipients: true, documents: true }, order: { createdAt: 'DESC' } });
    return { data: items.map((item) => ({ id: item.id, title: item.title, status: item.status, createdAt: item.createdAt, recipientCount: item.recipients.length, documentCount: item.documents.length })), limit: 60, remaining: 'Voir l’en-tête X-RateLimit-Remaining dans une prochaine version.' };
  }
}
