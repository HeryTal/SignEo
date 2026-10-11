import { afterEach, describe, expect, it, vi } from 'vitest';
import { createHmac } from 'node:crypto';
import { BillingService } from './billing.service.js';
import { quotaFor } from './quotas.js';

afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
describe('Billing', () => {
  it.each([['FREE', 'TRIAL', 5], ['BUSINESS', 'ACTIVE', 50], ['ENTERPRISE', 'ACTIVE', 250], ['ENTERPRISE', 'PAST_DUE', 5], ['BUSINESS', 'CANCELED', 5]] as const)('quota %s %s', (subscriptionPlan, subscriptionStatus, expected) => {
    expect(quotaFor({ subscriptionPlan, subscriptionStatus })).toBe(expected);
  });
  it('rejects stale and forged webhook signatures', async () => {
    vi.stubEnv('STRIPE_WEBHOOK_SECRET', 'test-secret');
    const service = new BillingService({} as never, {} as never, {} as never);
    const raw = Buffer.from('{}');
    const t = Math.floor(Date.now() / 1000) - 600;
    const digest = createHmac('sha256', 'test-secret').update(`${t}.{}`).digest('hex');
    await expect(service.webhook(`t=${t},v1=${digest}`, raw)).rejects.toThrow('Signature');
    await expect(service.webhook(`t=${Math.floor(Date.now() / 1000)},v1=invalid`, raw)).rejects.toThrow('Signature');
  });
  it('reads current Stripe prices, ignores stale metadata and handles duplicate delivery', async () => {
    vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_fake'); vi.stubEnv('STRIPE_WEBHOOK_SECRET', 'test-secret');
    vi.stubEnv('STRIPE_PRICE_ENTERPRISE', 'price_enterprise');
    const organization = { billingCustomerId: 'cus_test', subscriptionPlan: 'FREE', subscriptionStatus: 'TRIAL' };
    const repo = { findOne: vi.fn().mockResolvedValue(organization), save: vi.fn(async (value) => value) };
    const repository = { manager: { transaction: async (callback: (m: unknown) => unknown) => callback({ getRepository: () => repo }) } };
    const service = new BillingService(repository as never, {} as never, {} as never);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ data: [{ status: 'active', items: { data: [{ price: { id: 'price_enterprise' } }] } }] }) }));
    const raw = Buffer.from(JSON.stringify({ type: 'customer.subscription.updated', data: { object: { customer: 'cus_test', status: 'canceled', metadata: { plan: 'BUSINESS' } } } }));
    const t = Math.floor(Date.now() / 1000);
    const signature = `t=${t},v1=${createHmac('sha256', 'test-secret').update(`${t}.`).update(raw).digest('hex')}`;
    await service.webhook(signature, raw); await service.webhook(signature, raw);
    expect(organization).toMatchObject({ subscriptionPlan: 'ENTERPRISE', subscriptionStatus: 'ACTIVE', includedEnvelopesPerMonth: 250 });
  });
});
