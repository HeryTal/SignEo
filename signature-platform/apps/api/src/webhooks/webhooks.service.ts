import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes } from 'node:crypto';
import { InjectRepository } from '@nestjs/typeorm';
import { Interval } from '@nestjs/schedule';
import { WebhookDelivery } from './webhook-delivery.entity.js';
import { deliverWebhook, webhookUrl } from './webhook-transport.js';
import { DataSource, EntityManager, IsNull, Repository } from 'typeorm';
import { WorkspacesService } from '../workspaces/workspaces.service.js';
import { WebhookEndpoint } from './webhook-endpoint.entity.js';

const EVENTS = ['envelope.created', 'envelope.sent', 'envelope.completed'];

@Injectable()
export class WebhooksService {
  constructor(@InjectRepository(WebhookEndpoint) private readonly endpoints: Repository<WebhookEndpoint>, private readonly workspaces: WorkspacesService, private readonly db: DataSource) {}

  async list(userId: string) { const membership = await this.workspaces.activeForUser(userId); const items = await this.endpoints.find({ where: { workspace: { id: membership.workspace.id } }, order: { createdAt: 'DESC' } }); return items.map(({ secretCiphertext: _secret, ...item }) => item); }
  async create(userId: string, name: string, url: string, events: string[]) {
    const membership = await this.workspaces.activeForUser(userId); this.workspaces.requireAdmin(membership.role);
    if (!name.trim() || name.trim().length > 120 || !/^https:\/\//i.test(url) || url.length > 2048 || !Array.isArray(events) || !events.length || events.some((event) => !EVENTS.includes(event))) throw new BadRequestException('Nom, URL HTTPS ou événements invalides.');
    try { webhookUrl(url); } catch { throw new BadRequestException('URL HTTPS publique requise, sans identifiants et sur le port 443.'); }
    const secret = `whsec_${randomBytes(32).toString('base64url')}`;
    const endpoint = await this.endpoints.save(this.endpoints.create({ name: name.trim(), url, events, secretCiphertext: this.encrypt(secret), workspace: membership.workspace }));
    return { ...endpoint, secretCiphertext: undefined, secret };
  }
  async remove(userId: string, id: string) { const membership = await this.workspaces.activeForUser(userId); this.workspaces.requireAdmin(membership.role); const endpoint = await this.endpoints.findOne({ where: { id, workspace: { id: membership.workspace.id } } }); if (!endpoint) throw new NotFoundException('Webhook introuvable.'); await this.endpoints.remove(endpoint); return { deleted: true }; }
  async dispatch(workspaceId: string, event: string, data: Record<string, unknown>, manager?: EntityManager) {
    const endpoints = await (manager ? manager.getRepository(WebhookEndpoint) : this.endpoints).find({ where: { workspace: { id: workspaceId }, disabledAt: IsNull() } });
    const payload = JSON.stringify({ id: randomBytes(12).toString('hex'), event, createdAt: new Date().toISOString(), data });
    const deliveries=(manager??this.db).getRepository(WebhookDelivery);
    await deliveries.save(endpoints.filter(endpoint=>endpoint.events.includes(event)).map(endpoint=>deliveries.create({endpointId:endpoint.id,payload,event})));
  }
  async history(userId:string,endpointId:string) {
    const member=await this.workspaces.activeForUser(userId);this.workspaces.requireAdmin(member.role);
    if(!await this.endpoints.existsBy({id:endpointId,workspace:{id:member.workspace.id}}))throw new NotFoundException('Webhook introuvable.');
    return this.db.getRepository(WebhookDelivery).find({where:{endpointId},select:{id:true,event:true,status:true,attempts:true,nextAttemptAt:true,responseStatus:true,lastError:true,createdAt:true,deliveredAt:true},order:{createdAt:'DESC'},take:100});
  }
  async retry(userId:string,endpointId:string,id:string) {
    await this.history(userId,endpointId);
    const result=await this.db.getRepository(WebhookDelivery).update({id,endpointId,status:'FAILED'},{status:'PENDING',attempts:0,nextAttemptAt:new Date(),lockedUntil:null,lastError:null});
    if(!result.affected)throw new BadRequestException('Seuls les envois en échec peuvent être relancés.');
    return {queued:true};
  }
  @Interval(5000)
  async processQueue() {
    // One durable lease per delivery; multiple workers cannot claim the same row.
    const batch=await this.db.transaction(async manager=>{
      const repository=manager.getRepository(WebhookDelivery);
      const rows=await repository.createQueryBuilder('delivery').where('delivery.status = :status',{status:'PENDING'}).andWhere('delivery.nextAttemptAt <= :now',{now:new Date()}).andWhere('(delivery.lockedUntil IS NULL OR delivery.lockedUntil < :now)',{now:new Date()}).setLock('pessimistic_write').setOnLocked('skip_locked').take(10).getMany();
      for(const row of rows){row.lockedUntil=new Date(Date.now()+60000);row.attempts+=1;}
      return repository.save(rows);
    });
    await Promise.allSettled(batch.map(async delivery=>{
      const repository=this.db.getRepository(WebhookDelivery);
      const endpoint=await this.endpoints.findOneBy({id:delivery.endpointId,disabledAt:IsNull()});
      if(!endpoint){await repository.update(delivery.id,{status:'FAILED',lastError:'Destination supprimée ou désactivée.',lockedUntil:null});return;}
      let responseStatus:number|null=null;
      try {
      const payload=delivery.payload;
      const timestamp = Math.floor(Date.now() / 1000).toString();
      const signature = createHmac('sha256', this.decrypt(endpoint.secretCiphertext)).update(`${timestamp}.${payload}`).digest('hex');
      responseStatus=await deliverWebhook(endpoint.url,payload,{'Content-Type':'application/json','User-Agent':'Signeo-Webhooks/1.0','X-Signeo-Event':delivery.event,'X-Signeo-Delivery':delivery.id,'X-Signeo-Timestamp':timestamp,'X-Signeo-Signature':`v1=${signature}`});
      if(responseStatus<200||responseStatus>=300)throw new Error('Réponse HTTP '+responseStatus);
      await repository.update(delivery.id,{status:'DELIVERED',responseStatus,deliveredAt:new Date(),lockedUntil:null,lastError:null});
      } catch(error) {
        await repository.update(delivery.id,{status:delivery.attempts>=8?'FAILED':'PENDING',responseStatus,lockedUntil:null,nextAttemptAt:new Date(Date.now()+Math.min(3600000,30000*2**(delivery.attempts-1))),lastError:responseStatus?'Réponse HTTP '+responseStatus:'Destination inaccessible, interdite ou délai dépassé.'});
      }
    }));
  }
  private key() { return createHash('sha256').update(process.env.WEBHOOK_ENCRYPTION_SECRET ?? process.env.JWT_SECRET ?? 'local-development-secret-change-me').digest(); }
  private encrypt(value: string) { const iv = randomBytes(12); const cipher = createCipheriv('aes-256-gcm', this.key(), iv); const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]); return `${iv.toString('base64url')}.${cipher.getAuthTag().toString('base64url')}.${encrypted.toString('base64url')}`; }
  private decrypt(value: string) { const [iv, tag, encrypted] = value.split('.'); const decipher = createDecipheriv('aes-256-gcm', this.key(), Buffer.from(iv, 'base64url')); decipher.setAuthTag(Buffer.from(tag, 'base64url')); return Buffer.concat([decipher.update(Buffer.from(encrypted, 'base64url')), decipher.final()]).toString('utf8'); }
}
