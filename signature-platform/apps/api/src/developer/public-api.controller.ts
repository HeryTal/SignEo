import { BadRequestException, Body, Controller, Get, Param, Post, Req, UploadedFiles, UseGuards, UseInterceptors } from '@nestjs/common';
import type { Request } from 'express';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { FilesInterceptor } from '@nestjs/platform-express';
import { Envelope } from '../envelopes/envelope.entity.js';
import { EnvelopesService, type IncomingField, type IncomingRecipient, type UploadedFile } from '../envelopes/envelopes.service.js';
import { ApiKey } from './api-key.entity.js';
import { ApiKeyGuard } from './api-key.guard.js';
import { ApiScopes } from './api-scopes.decorator.js';
type ApiRequest = Request & { apiKey: ApiKey };

@Controller('v1')
@UseGuards(ApiKeyGuard)
export class PublicApiController {
  constructor(@InjectRepository(Envelope) private readonly envelopes: Repository<Envelope>, private readonly envelopeService: EnvelopesService) {}
  @Get('envelopes')
  @ApiScopes('envelopes:read')
  async listEnvelopes(@Req() request: ApiRequest) {
    const items = await this.envelopes.find({ where: { workspace: { id: request.apiKey.workspace.id }, apiEnvironment: request.apiKey.environment }, relations: { recipients: true, documents: true }, order: { createdAt: 'DESC' } });
    return { data: items.map((item) => ({ id: item.id, title: item.title, status: item.status, environment: item.apiEnvironment, createdAt: item.createdAt, recipientCount: item.recipients.length, documentCount: item.documents.length })) };
  }

  @Post('envelopes')
  @ApiScopes('envelopes:write')
  @UseInterceptors(FilesInterceptor('files', 50, { limits: { fileSize: 50 * 1024 * 1024, files: 50 } }))
  async createEnvelope(@Req() request: ApiRequest, @UploadedFiles() files: UploadedFile[], @Body() body: { title?: string; message?: string; recipients?: string; fields?: string; expiresAt?: string; allowDecline?: string }) {
    return this.envelopeService.createFromApi(request.apiKey.workspace.id, request.apiKey.environment, body.title ?? '', body.message ?? '', this.json<IncomingRecipient[]>(body.recipients, 'recipients'), files ?? [], this.json<IncomingField[]>(body.fields, 'fields'), body.expiresAt, body.allowDecline === 'true');
  }

  @Post('envelopes/:id/send')
  @ApiScopes('envelopes:write')
  sendEnvelope(@Req() request: ApiRequest, @Param('id') id: string) {
    return this.envelopeService.sendFromApi(request.apiKey.workspace.id, request.apiKey.environment, id, process.env.WEB_ORIGIN ?? 'http://localhost:3000');
  }

  private json<T>(value: string | undefined, name: string): T {
    try { return JSON.parse(value ?? '[]') as T; }
    catch { throw new BadRequestException(`Le champ ${name} doit être un JSON valide.`); }
  }
}
