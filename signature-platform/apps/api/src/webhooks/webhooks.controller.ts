import { Body, Controller, Delete, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { WebhooksService } from './webhooks.service.js';

@Controller('developer/webhooks')
@UseGuards(JwtAuthGuard)
export class WebhooksController {
  constructor(private readonly webhooks: WebhooksService) {}
  @Get() list(@Req() request: Request & { user: { sub: string } }) { return this.webhooks.list(request.user.sub); }
  @Post() create(@Req() request: Request & { user: { sub: string } }, @Body() body: { name?: string; url?: string; events?: string[] }) { return this.webhooks.create(request.user.sub, body.name ?? '', body.url ?? '', body.events ?? []); }
  @Delete(':id') remove(@Req() request: Request & { user: { sub: string } }, @Param('id') id: string) { return this.webhooks.remove(request.user.sub, id); }
}
