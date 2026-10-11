import { BadRequestException, Body, Controller, Get, Headers, Patch, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { BillingService } from './billing.service.js';

@Controller('billing')
@UseGuards(JwtAuthGuard)
export class BillingController {
  constructor(private readonly billing: BillingService) {}
  @Get() current(@Req() request: Request & { user: { sub: string } }) { return this.billing.current(request.user.sub); }
  @Patch() update(@Req() request: Request & { user: { sub: string } }, @Body() body: { billingEmail?: string }) {
    if (!body.billingEmail) throw new BadRequestException('Adresse de facturation requise.');
    return this.billing.updateBillingEmail(request.user.sub, body.billingEmail);
  }
  @Post('checkout') checkout(@Req() request: Request & { user: { sub: string } }, @Body() body: { plan?: 'BUSINESS' | 'ENTERPRISE' }) { if (!body.plan || !['BUSINESS', 'ENTERPRISE'].includes(body.plan)) throw new BadRequestException('Forfait invalide.'); return this.billing.checkout(request.user.sub, body.plan); }
  @Post('portal') portal(@Req() request: Request & { user: { sub: string } }) { return this.billing.portal(request.user.sub); }
}

@Controller('stripe')
export class StripeWebhookController {
  constructor(private readonly billing: BillingService) {}
  @Post('webhook') webhook(@Headers('stripe-signature') signature: string | undefined, @Req() request: Request & { rawBody?: Buffer }) { return this.billing.webhook(signature, request.rawBody); }
}
