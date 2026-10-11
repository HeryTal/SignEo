import { BadRequestException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Envelope } from '../envelopes/envelope.entity.js';
import { Organization } from '../organizations/organization.entity.js';
import { WorkspacesService } from '../workspaces/workspaces.service.js';
import { monthlyUsage, quotaFor } from './quotas.js';

@Injectable()
export class BillingService {
  constructor(
    @InjectRepository(Organization) private readonly organizations: Repository<Organization>,
    @InjectRepository(Envelope) private readonly envelopes: Repository<Envelope>,
    private readonly workspaces: WorkspacesService,
  ) {}

  async current(userId: string) {
    const membership = await this.workspaces.activeForUser(userId);
    let organization = membership.workspace.organization;
    if (organization.billingCustomerId) organization = await this.syncCustomer(organization.billingCustomerId) ?? organization;
    if (!organization) throw new NotFoundException('Organisation introuvable.');
    const usedEnvelopes = await monthlyUsage(this.organizations.manager, organization.id);
    return {
      organization: { id: organization.id, name: organization.name },
      billingEmail: organization.billingEmail,
      plan: organization.subscriptionPlan,
      subscriptionStatus: organization.subscriptionStatus,
      usage: { envelopesThisMonth: usedEnvelopes, includedEnvelopesPerMonth: quotaFor(organization) },
    };
  }

  async updateBillingEmail(userId: string, billingEmail: string) {
    const membership = await this.workspaces.activeForUser(userId);
    this.workspaces.requirePermission(membership.role, 'BILLING_MANAGE');
    const email = billingEmail.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new BadRequestException('Adresse de facturation invalide.');
    await this.organizations.update(membership.workspace.organization.id, { billingEmail: email });
    return this.current(userId);
  }

  async checkout(userId: string, plan: 'BUSINESS' | 'ENTERPRISE') {
    const membership = await this.workspaces.activeForUser(userId);
    this.workspaces.requirePermission(membership.role, 'BILLING_MANAGE');
    const organization = membership.workspace.organization;
    const price = process.env[`STRIPE_PRICE_${plan}`]?.trim();
    if (!price) throw new BadRequestException(`STRIPE_PRICE_${plan} est requis.`);
    const customerId = await this.ensureCustomer(organization);
    const current = await this.syncCustomer(customerId);
    if (current && current.subscriptionPlan !== 'FREE' && current.subscriptionStatus !== 'CANCELED') {
      throw new BadRequestException('Un abonnement existe déjà. Utilisez Gérer l’abonnement.');
    }
    const origin = process.env.WEB_ORIGIN ?? 'http://localhost:3000';
    const form = new URLSearchParams({ mode: 'subscription', customer: customerId, success_url: `${origin}/dashboard/parametres?checkout=success`, cancel_url: `${origin}/dashboard/parametres?checkout=cancel`, 'line_items[0][price]': price, 'line_items[0][quantity]': '1', 'metadata[organization_id]': organization.id, 'metadata[plan]': plan, 'subscription_data[metadata][organization_id]': organization.id, 'subscription_data[metadata][plan]': plan });
    const session = await this.stripePost('/v1/checkout/sessions', form, `checkout:${organization.id}:${plan}:${Math.floor(Date.now() / 1800000)}`);
    if (!session.url) throw new BadRequestException('Stripe n’a pas créé de page de paiement.');
    return { url: session.url };
  }

  async portal(userId: string) {
    const membership = await this.workspaces.activeForUser(userId);
    this.workspaces.requirePermission(membership.role, 'BILLING_MANAGE');
    const customerId = membership.workspace.organization.billingCustomerId;
    if (!customerId) throw new BadRequestException('Aucun abonnement Stripe n’existe encore pour cette organisation.');
    const session = await this.stripePost('/v1/billing_portal/sessions', new URLSearchParams({ customer: customerId, return_url: `${process.env.WEB_ORIGIN ?? 'http://localhost:3000'}/dashboard/parametres` }));
    if (!session.url) throw new BadRequestException('Stripe n’a pas créé de portail client.');
    return { url: session.url };
  }

  async webhook(signature: string | undefined, rawBody: Buffer | undefined) {
    const secret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!secret || !signature || !rawBody || !this.validSignature(signature, rawBody, secret)) throw new UnauthorizedException('Signature Stripe invalide.');
    const event = JSON.parse(rawBody.toString('utf8')) as { type?: string; data?: { object?: { customer?: string; status?: string; metadata?: { organization_id?: string; plan?: 'BUSINESS' | 'ENTERPRISE' } } } };
    const object = event.data?.object;
    if (object?.customer && (event.type?.startsWith('customer.subscription.') || event.type === 'checkout.session.completed' || event.type?.startsWith('invoice.'))) {
      await this.syncCustomer(object.customer);
    }
    return { received: true };
  }

  private async ensureCustomer(organization: Organization) {
    return this.organizations.manager.transaction(async (manager) => {
      const repository = manager.getRepository(Organization);
      const current = await repository.findOneOrFail({ where: { id: organization.id }, lock: { mode: 'pessimistic_write' } });
      if (current.billingCustomerId) return current.billingCustomerId;
      const customer = await this.stripePost('/v1/customers', new URLSearchParams({ name: current.name, email: current.billingEmail ?? '', 'metadata[organization_id]': current.id }), `customer:${current.id}`);
      if (!customer.id) throw new BadRequestException('Stripe n’a pas créé de client.');
      current.billingCustomerId = customer.id; await repository.save(current); return customer.id;
    });
  }

  private async syncCustomer(customer: string) {
    return this.organizations.manager.transaction(async (manager) => {
      const repository = manager.getRepository(Organization);
      const organization = await repository.findOne({ where: { billingCustomerId: customer }, lock: { mode: 'pessimistic_write' } });
      if (!organization) return null;
      const key = process.env.STRIPE_SECRET_KEY?.trim();
      if (!key) throw new BadRequestException('Configuration Stripe manquante.');
      const response = await fetch(`https://api.stripe.com/v1/subscriptions?customer=${encodeURIComponent(customer)}&status=all&limit=100`, {
        headers: { Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(15000),
      });
      if (!response.ok) throw new BadRequestException('Impossible de synchroniser l’abonnement Stripe.');
      const result = await response.json() as { has_more?: boolean; data: { status: string; items: { data: { price: { id: string } }[] } }[] };
      if (result.has_more) throw new BadRequestException('Trop d’abonnements Stripe : contactez le support.');
      const candidates = result.data.flatMap((subscription) => {
        const price = subscription.items.data[0]?.price.id;
        const plan = price && price === process.env.STRIPE_PRICE_BUSINESS ? 'BUSINESS' : price && price === process.env.STRIPE_PRICE_ENTERPRISE ? 'ENTERPRISE' : null;
        return plan && !['canceled', 'incomplete_expired'].includes(subscription.status) ? [{ plan, status: subscription.status }] : [];
      });
      const active = candidates.find((s) => ['active', 'trialing'].includes(s.status)) ?? candidates[0];
      organization.subscriptionPlan = (active?.plan ?? 'FREE') as Organization['subscriptionPlan'];
      organization.subscriptionStatus = active ? ({ active: 'ACTIVE', trialing: 'TRIAL' } as const)[active.status as 'active' | 'trialing'] ?? 'PAST_DUE' : 'CANCELED';
      organization.includedEnvelopesPerMonth = quotaFor(organization);
      return repository.save(organization);
    });
  }

  private async stripePost(path: string, body: URLSearchParams, idempotencyKey?: string): Promise<{ id?: string; url?: string; error?: { message?: string } }> {
    const key = process.env.STRIPE_SECRET_KEY?.trim(); if (!key) throw new BadRequestException('STRIPE_SECRET_KEY est requis.');
    const response = await fetch(`https://api.stripe.com${path}`, { method: 'POST', headers: { Authorization: `Basic ${Buffer.from(`${key}:`).toString('base64')}`, 'Content-Type': 'application/x-www-form-urlencoded', ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}) }, body, signal: AbortSignal.timeout(15000) });
    const result = await response.json() as { id?: string; url?: string; error?: { message?: string } };
    if (!response.ok) throw new BadRequestException(result.error?.message || 'Erreur Stripe.'); return result;
  }

  private validSignature(signature: string, rawBody: Buffer, secret: string) {
    const values = signature.split(',').map((part) => part.split('=')); const timestamp = values.find(([key]) => key === 't')?.[1]; const signatures = values.filter(([key]) => key === 'v1').map(([, value]) => value).filter(Boolean) as string[];
    if (!timestamp || !/^\d+$/.test(timestamp) || Math.abs(Date.now() / 1000 - Number(timestamp)) > 300) return false; const expected = createHmac('sha256', secret).update(`${timestamp}.${rawBody.toString('utf8')}`).digest('hex');
    return signatures.some((value) => value.length === expected.length && timingSafeEqual(Buffer.from(value), Buffer.from(expected)));
  }
}
