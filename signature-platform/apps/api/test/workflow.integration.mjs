// Run against an isolated, disposable PostgreSQL schema. No existing user rows are changed.
import 'reflect-metadata';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { config } from 'dotenv';
import { DataSource } from 'typeorm';
import { Test } from '@nestjs/testing';
import { PDFDocument } from 'pdf-lib';

config({ path: '../../.env', quiet: true });
const schema = `workflow_test_${randomUUID().replaceAll('-', '')}`;
const directory = await mkdtemp(join(tmpdir(), 'signeo-workflow-'));
process.env.DATABASE_SCHEMA = schema;
process.env.UPLOAD_DIRECTORY = directory;
process.env.NODE_ENV = 'test';
process.env.IDENTITY_VERIFICATION_PROVIDER = 'test-provider';
process.env.IDENTITY_VERIFICATION_URL = 'https://verify.example.test/session';
process.env.IDENTITY_VERIFICATION_WEBHOOK_SECRET = 'test-identity-callback-secret';
const { default: migrationSource } = await import('../dist/database/data-source.js');
const bootstrap = new DataSource({ ...migrationSource.options, schema: 'public', entities: [], migrations: [] });
await bootstrap.initialize();
await bootstrap.query(`CREATE SCHEMA "${schema}"`);
let app;
try {
  const { AppModule } = await import('../dist/app.module.js');
  const { MailService } = await import('../dist/envelopes/mail.service.js');
  const { WebhooksService } = await import('../dist/webhooks/webhooks.service.js');
  const { EnvelopesService } = await import('../dist/envelopes/envelopes.service.js');
  const { Envelope } = await import('../dist/envelopes/envelope.entity.js');
  const { Recipient } = await import('../dist/envelopes/recipient.entity.js');
  const { AuditEvent } = await import('../dist/envelopes/audit-event.entity.js');
  const sent = [];
  const mail = Object.fromEntries(['sendInvitation', 'sendReminder', 'sendCompletionNotice', 'sendOtp'].map((kind) => [kind, async (...args) => { sent.push({ kind, args }); return { delivered: true }; }]));
  const module = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(MailService).useValue(mail)
    .overrideProvider(WebhooksService).useValue({ dispatch: async () => undefined })
    .compile();
  app = module.createNestApplication({ logger: false });
  await app.listen(0, '127.0.0.1');
  const base = await app.getUrl();
  const db = app.get(DataSource);
  const service = app.get(EnvelopesService);

  // Exercise the real migration on a database with the pre-existing application tables.
  const runner = db.createQueryRunner();
  await runner.dropTable(`${schema}.envelope_templates`);
  const migrations = new DataSource({ ...migrationSource.options, schema });
  await migrations.initialize();
  const applied = await migrations.runMigrations();
  assert.equal(applied.length, 2);
  assert.equal((await migrations.runMigrations()).length, 0);
  const table = await runner.getTable(`${schema}.envelope_templates`);
  assert.equal(table.foreignKeys.length, 2);
  assert.equal(table.columns.length, 13);
  assert.ok(await runner.getTable(`${schema}.organizations`));
  assert.ok(await runner.getTable(`${schema}.identity_verifications`));
  await migrations.destroy();
  await runner.release();
  console.log('PASS migration: table, foreign keys, defaults and second run');

  async function request(path, body, accessToken, extraHeaders = {}, method = body === undefined ? 'GET' : 'POST') {
    const response = await fetch(`${base}${path}`, {
      method,
      headers: { ...(body instanceof FormData ? {} : { 'Content-Type': 'application/json' }), ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}), ...extraHeaders },
      body: body === undefined ? undefined : body instanceof FormData ? body : JSON.stringify(body),
    });
    const data = await response.json();
    assert.ok(response.ok, `${path}: ${response.status} ${JSON.stringify(data)}`);
    return data;
  }
  const email = `workflow-${randomUUID()}@example.test`;
  const password = randomUUID();
  await request('/auth/signup', { name: 'Test workflow', email, password });
  const session = await request('/auth/login', { email, password });
  const token = session.accessToken;
  const ownerId = session.user.id;
  const profile = await request('/auth/me', undefined, token);
  assert.equal(profile.activeWorkspace.organizationId.length, 36);
  assert.equal(profile.identityVerification.status, 'NOT_STARTED');
  const billing = await request('/billing', undefined, token);
  assert.equal(billing.organization.id, profile.activeWorkspace.organizationId);
  const updatedBilling = await request('/billing', { billingEmail: 'finance@example.test' }, token, {}, 'PATCH');
  assert.equal(updatedBilling.billingEmail, 'finance@example.test');
  const startedVerification = await request('/auth/identity-verification', {}, token);
  assert.equal(startedVerification.status, 'PENDING');
  assert.match(startedVerification.verificationUrl, /verify\.example\.test/);
  const callbackBody = { reference: new URL(startedVerification.verificationUrl).searchParams.get('reference'), status: 'VERIFIED' };
  const callback = await request('/auth/identity-verification/callback', callbackBody, undefined, { 'X-Identity-Signature': process.env.IDENTITY_VERIFICATION_WEBHOOK_SECRET });
  assert.equal(callback.status, 'VERIFIED');
  assert.equal((await request('/auth/me', undefined, token)).identityVerification.status, 'VERIFIED');
  console.log('PASS tenant account: organization, billing profile and provider-verified identity lifecycle');
  const pdf = await PDFDocument.create();
  pdf.addPage().drawText('TEST TECHNIQUE - AUCUNE VALEUR CONTRACTUELLE');
  const buffer = Buffer.from(await pdf.save());
  const people = [0, 1].map((index) => ({ name: `Test ${index}`, email: `test${index}@example.test`, role: 'SIGNER' }));
  async function draft(simultaneous = false, count = 2) {
    const form = new FormData();
    form.set('title', 'TEST TECHNIQUE - sans valeur contractuelle');
    form.set('recipients', JSON.stringify(people.slice(0, count)));
    form.set('fields', JSON.stringify(people.slice(0, count).map((person, index) => ({
      id: `signature-${index}`, type: 'SIGNATURE', documentIndex: 0, pageNumber: 1,
      x: 10, y: 25 + index * 20, label: 'Signature de test', recipientEmail: person.email,
    }))));
    form.set('preparationSettings', JSON.stringify({ signingMode: simultaneous ? 'SIMULTANEOUS' : 'CUSTOM' }));
    form.append('files', new Blob([buffer], { type: 'application/pdf' }), 'test.pdf');
    return request('/envelopes', form, token);
  }
  const original = await draft();
  const template = await request(`/envelopes/${original.id}/templates`, { title: 'Modèle de vérification' }, token);
  const reused = await request(`/templates/${template.id}/send`, { recipients: people.map((p, i) => ({ ...p, email: `new${i}@example.test` })) }, token);
  assert.equal(reused.deliveries.length, 1);
  const [first, second] = reused.invitations.map((i) => i.signingUrl.split('/').pop());
  assert.equal((await fetch(`${base}/envelopes/public/${second}`)).status, 400);
  await request(`/envelopes/${reused.envelope.id}/recipients/${reused.invitations[0].id}/remind`, {}, token);
  await request(`/envelopes/public/${first}/sign`, { signatureName: 'Test technique', consent: true });
  await request(`/envelopes/public/${second}`);
  await request(`/envelopes/public/${second}/sign`, { signatureName: 'Test technique', consent: true });
  const complete = await request(`/envelopes/${reused.envelope.id}`, undefined, token);
  assert.equal(complete.status, 'COMPLETED');
  assert.ok((await fetch(`${base}/envelopes/public/${second}`)).status >= 400);
  assert.ok(sent.some((item) => item.kind === 'sendReminder'));
  assert.ok(sent.some((item) => item.kind === 'sendInvitation' && item.args[0].to === 'new1@example.test'));
  console.log('PASS HTTP workflow: login, draft, template, send, reminder, ordered signing, completion, blocked links');

  async function sentEnvelope(simultaneous = false, count = 2) {
    const value = await draft(simultaneous, count);
    return service.send(ownerId, value.id, base);
  }
  const { Organization } = await import('../dist/organizations/organization.entity.js');
  await db.getRepository(Organization).update(profile.activeWorkspace.organizationId, { subscriptionPlan: 'BUSINESS', subscriptionStatus: 'ACTIVE' });
  for (let attempt = 0; attempt < 5; attempt++) {
    const value = await sentEnvelope(true);
    const results = await Promise.all(value.invitations.map((i) => service.sign(i.signingUrl.split('/').pop(), 'Test', true)));
    const row = await db.getRepository(Envelope).findOneByOrFail({ id: value.envelope.id });
    assert.equal(row.status, 'COMPLETED');
    assert.equal(results.filter((r) => r.status === 'COMPLETED').length, 1);
    assert.equal(await db.getRepository(Recipient).countBy({ envelope: { id: row.id }, status: 'SIGNED' }), 2);
  }
  console.log('PASS concurrent signatures: 5 rounds, both signatures retained, one completion');

  for (const cancelFirst of [true, false]) {
    const value = await sentEnvelope(false, 1);
    const id = value.envelope.id;
    const signingToken = value.invitations[0].signingUrl.split('/').pop();
    const held = db.createQueryRunner();
    await held.connect(); await held.startTransaction();
    await held.manager.getRepository(Envelope).findOne({ where: { id }, lock: { mode: 'pessimistic_write' } });
    const sign = () => service.sign(signingToken, 'Test', true);
    const cancel = () => service.cancel(ownerId, id);
    // Queue both operations while a third connection holds the envelope lock.
    const firstCall = cancelFirst ? cancel() : sign();
    const secondCall = cancelFirst ? sign() : cancel();
    const settled = Promise.allSettled([firstCall, secondCall]);
    await held.commitTransaction(); await held.release();
    const results = await settled;
    assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
    const row = await db.getRepository(Envelope).findOneByOrFail({ id });
    const recipient = await db.getRepository(Recipient).findOneByOrFail({ envelope: { id } });
    assert.ok(row.status === 'COMPLETED' || row.status === 'VOIDED');
    assert.equal(recipient.status, row.status === 'COMPLETED' ? 'SIGNED' : 'WAITING');
    assert.equal(await db.getRepository(AuditEvent).countBy({ envelope: { id }, action: 'DOCUMENT_SIGNED' }), row.status === 'COMPLETED' ? 1 : 0);
  }
  console.log('PASS concurrent cancel/sign: one terminal result, no signature after cancellation');

  // Old sends must not consume this month's quota. Two simultaneous sends at
  // the boundary must share the organization's remaining slot.
  await db.getRepository(AuditEvent).createQueryBuilder().update().set({ createdAt: new Date('2020-01-01') }).where('action = :action', { action: 'ENVELOPE_SENT' }).execute();
  await db.getRepository(Organization).update(profile.activeWorkspace.organizationId, { subscriptionPlan: 'FREE', subscriptionStatus: 'TRIAL' });
  for (let i = 0; i < 4; i++) await sentEnvelope(false, 1);
  const pending = await Promise.all([draft(false, 1), draft(false, 1)]);
  const quotaResults = await Promise.allSettled(pending.map((value) => service.send(ownerId, value.id, base)));
  assert.equal(quotaResults.filter((value) => value.status === 'fulfilled').length, 1);
  assert.match(quotaResults.find((value) => value.status === 'rejected').reason.message, /Quota/);
  const quotaBilling = await request('/billing', undefined, token);
  assert.equal(quotaBilling.usage.envelopesThisMonth, 5);
  assert.equal(quotaBilling.usage.includedEnvelopesPerMonth, 5);
  await db.getRepository(Organization).update(profile.activeWorkspace.organizationId, { subscriptionPlan: 'BUSINESS', subscriptionStatus: 'ACTIVE' });
  console.log('PASS quota: monthly reset, drafts excluded, concurrent final slot');

  if (process.env.RUN_STRIPE_BILLING_TEST === '1') {
    assert.ok(process.env.STRIPE_SECRET_KEY?.startsWith('sk_test_'), 'Only Stripe test keys allowed');
    const { BillingService } = await import('../dist/billing/billing.service.js');
    const billingService = app.get(BillingService);
    const stripe = async (path, method = 'GET', fields) => {
      const response = await fetch(`https://api.stripe.com/v1/${path}`, {
        method, headers: { Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}`, 'Content-Type': 'application/x-www-form-urlencoded' },
        body: fields ? new URLSearchParams(fields) : undefined, signal: AbortSignal.timeout(20000),
      });
      const result = await response.json();
      assert.ok(response.ok, `Stripe ${response.status}: ${result.error?.message ?? 'request failed'}`);
      return result;
    };
    let customer;
    const subscriptions = [];
    const sessions = [];
    try {
      for (const [plan, amount, quota] of [['BUSINESS', 1000, 50], ['ENTERPRISE', 2000, 250]]) {
        const checkout = await billingService.checkout(ownerId, plan);
        assert.equal(new URL(checkout.url).hostname, 'checkout.stripe.com');
        const org = await db.getRepository(Organization).findOneByOrFail({ id: profile.activeWorkspace.organizationId });
        customer = org.billingCustomerId;
        const checkouts = await stripe(`checkout/sessions?customer=${customer}`);
        sessions.push(...checkouts.data.filter((s) => s.status === 'open').map((s) => s.id));
        const price = await stripe(`prices/${process.env[`STRIPE_PRICE_${plan}`]}`);
        assert.equal(price.unit_amount, amount); assert.equal(price.currency, 'eur'); assert.equal(price.recurring.interval, 'month');
        const method = await stripe('payment_methods/pm_card_visa/attach', 'POST', { customer });
        const subscription = await stripe('subscriptions', 'POST', { customer, 'items[0][price]': price.id, default_payment_method: method.id });
        subscriptions.push(subscription.id);
        assert.equal(subscription.status, 'active');
        const invoice = await stripe(`invoices/${subscription.latest_invoice}`);
        assert.equal(invoice.status, 'paid'); assert.equal(invoice.amount_remaining, 0);
        const active = await billingService.current(ownerId);
        assert.equal(active.plan, plan); assert.equal(active.subscriptionStatus, 'ACTIVE');
        assert.equal(active.usage.includedEnvelopesPerMonth, quota);
        await assert.rejects(() => billingService.checkout(ownerId, plan), /abonnement existe/);
        await stripe(`subscriptions/${subscription.id}`, 'DELETE');
        const canceled = await billingService.current(ownerId);
        assert.equal(canceled.plan, 'FREE'); assert.equal(canceled.usage.includedEnvelopesPerMonth, 5);
        console.log(`PASS Stripe TEST ${plan}: monthly EUR ${amount / 100}, Checkout, paid invoice, ACTIVE quota ${quota}, duplicate blocked, cancellation`);
      }
      try {
        const portal = await billingService.portal(ownerId);
        assert.equal(new URL(portal.url).hostname, 'billing.stripe.com');
        console.log('PASS Stripe TEST portal');
      } catch (error) { console.log(`PORTAL_NOT_CONFIGURED: ${error.message}`); }
    } finally {
      for (const id of new Set(sessions)) await stripe(`checkout/sessions/${id}/expire`, 'POST');
      for (const id of subscriptions) {
        const subscription = await stripe(`subscriptions/${id}`);
        if (subscription.status !== 'canceled') await stripe(`subscriptions/${id}`, 'DELETE');
      }
      if (customer) await stripe(`customers/${customer}`, 'DELETE');
    }
  }

  if (process.env.SMTP_TEST_TO) {
    const realMail = new MailService();
    mail.sendInvitation = realMail.sendInvitation.bind(realMail);
    mail.sendReminder = realMail.sendReminder.bind(realMail);
    people[0].email = process.env.SMTP_TEST_TO;
    const value = await sentEnvelope(false, 1);
    assert.equal(value.deliveries[0].delivered, true, JSON.stringify(value.deliveries));
    await request(`/envelopes/${value.envelope.id}/recipients/${value.invitations[0].id}/remind`, {}, token);
    await request(`/envelopes/${value.envelope.id}/cancel`, {}, token);
    console.log('PASS live SMTP: invitation and reminder accepted; test envelope then cancelled');
  }
} finally {
  if (app) await app.close();
  // Only the random test schema created above can be removed here.
  assert.match(schema, /^workflow_test_[a-f0-9]{32}$/);
  await bootstrap.query(`DROP SCHEMA "${schema}" CASCADE`);
  await bootstrap.destroy();
  await rm(directory, { recursive: true, force: true });
}
