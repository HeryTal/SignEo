import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes } from 'node:crypto';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { WorkspacesService } from '../workspaces/workspaces.service.js';
import { WebhookEndpoint } from './webhook-endpoint.entity.js';

const EVENTS = ['envelope.created', 'envelope.sent', 'envelope.completed'];

@Injectable()
export class WebhooksService {
  constructor(@InjectRepository(WebhookEndpoint) private readonly endpoints: Repository<WebhookEndpoint>, private readonly workspaces: WorkspacesService) {}

  async list(userId: string) { const membership = await this.workspaces.activeForUser(userId); const items = await this.endpoints.find({ where: { workspace: { id: membership.workspace.id } }, order: { createdAt: 'DESC' } }); return items.map(({ secretCiphertext: _secret, ...item }) => item); }
  async create(userId: string, name: string, url: string, events: string[]) {
    const membership = await this.workspaces.activeForUser(userId); this.workspaces.requireAdmin(membership.role);
    if (!name.trim() || name.trim().length > 120 || !/^https:\/\//i.test(url) || url.length > 2048 || !Array.isArray(events) || !events.length || events.some((event) => !EVENTS.includes(event))) throw new BadRequestException('Nom, URL HTTPS ou événements invalides.');
    const secret = `whsec_${randomBytes(32).toString('base64url')}`;
    const endpoint = await this.endpoints.save(this.endpoints.create({ name: name.trim(), url, events, secretCiphertext: this.encrypt(secret), workspace: membership.workspace }));
    return { ...endpoint, secretCiphertext: undefined, secret };
  }
  async remove(userId: string, id: string) { const membership = await this.workspaces.activeForUser(userId); this.workspaces.requireAdmin(membership.role); const endpoint = await this.endpoints.findOne({ where: { id, workspace: { id: membership.workspace.id } } }); if (!endpoint) throw new NotFoundException('Webhook introuvable.'); await this.endpoints.remove(endpoint); return { deleted: true }; }
  async dispatch(workspaceId: string, event: string, data: Record<string, unknown>) {
    const endpoints = await this.endpoints.find({ where: { workspace: { id: workspaceId }, disabledAt: IsNull() } });
    const payload = JSON.stringify({ id: randomBytes(12).toString('hex'), event, createdAt: new Date().toISOString(), data });
    await Promise.allSettled(endpoints.filter((endpoint) => endpoint.events.includes(event)).map(async (endpoint) => {
      const timestamp = Math.floor(Date.now() / 1000).toString();
      const signature = createHmac('sha256', this.decrypt(endpoint.secretCiphertext)).update(`${timestamp}.${payload}`).digest('hex');
      await fetch(endpoint.url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'User-Agent': 'Signeo-Webhooks/1.0', 'X-Signeo-Event': event, 'X-Signeo-Timestamp': timestamp, 'X-Signeo-Signature': `v1=${signature}` }, body: payload, signal: AbortSignal.timeout(10_000) });
    }));
  }
  private key() { return createHash('sha256').update(process.env.WEBHOOK_ENCRYPTION_SECRET ?? process.env.JWT_SECRET ?? 'local-development-secret-change-me').digest(); }
  private encrypt(value: string) { const iv = randomBytes(12); const cipher = createCipheriv('aes-256-gcm', this.key(), iv); const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]); return `${iv.toString('base64url')}.${cipher.getAuthTag().toString('base64url')}.${encrypted.toString('base64url')}`; }
  private decrypt(value: string) { const [iv, tag, encrypted] = value.split('.'); const decipher = createDecipheriv('aes-256-gcm', this.key(), Buffer.from(iv, 'base64url')); decipher.setAuthTag(Buffer.from(tag, 'base64url')); return Buffer.concat([decipher.update(Buffer.from(encrypted, 'base64url')), decipher.final()]).toString('utf8'); }
}
