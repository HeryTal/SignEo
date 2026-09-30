import { BadRequestException, Body, Controller, Delete, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { type ApiKeyEnvironment } from './api-key.entity.js';
import { ApiKeyService } from './api-key.service.js';
type AuthenticatedRequest = Request & { user: { sub: string } };

@Controller('developer/api-keys')
@UseGuards(JwtAuthGuard)
export class DeveloperController {
  constructor(private readonly keys: ApiKeyService) {}
  @Get() list(@Req() request: AuthenticatedRequest) { return this.keys.list(request.user.sub); }
  @Post() create(@Req() request: AuthenticatedRequest, @Body() body: { name?: string; environment?: ApiKeyEnvironment }) { if (!body.environment) throw new BadRequestException('Environnement requis.'); return this.keys.create(request.user.sub, body.name ?? '', body.environment); }
  @Delete(':id') revoke(@Req() request: AuthenticatedRequest, @Param('id') id: string) { return this.keys.revoke(request.user.sub, id); }
}
