import { WebhooksService } from './webhooks.service.js';
import { deliverWebhook } from './webhook-transport.js';
vi.mock('./webhook-transport.js',()=>({deliverWebhook:vi.fn(),webhookUrl:(url:string)=>new URL(url)}));
describe('durable webhook delivery',()=>{
 it('queues before attempting network delivery',async()=>{
  const save=vi.fn();const repository={create:(value:unknown)=>value,save};
  const service=new WebhooksService({find:async()=>[{id:'endpoint',events:['envelope.sent']}]} as never,{} as never,{getRepository:()=>repository} as never);
  await service.dispatch('workspace','envelope.sent',{envelopeId:'envelope'});
  expect(save).toHaveBeenCalledOnce();expect(JSON.parse(save.mock.calls[0][0][0].payload).event).toBe('envelope.sent');expect(deliverWebhook).not.toHaveBeenCalled();
 });
 it.each([200,500])('records success or retry for HTTP %s',async status=>{
  const delivery={id:'delivery',endpointId:'endpoint',event:'envelope.sent',payload:'{}',attempts:0};
  const update=vi.fn();const query:any={where:()=>query,andWhere:()=>query,setLock:()=>query,setOnLocked:()=>query,take:()=>query,getMany:async()=>[delivery]};
  const repository={createQueryBuilder:()=>query,save:async(value:unknown)=>value,update};
  const db:any={getRepository:()=>repository,transaction:async(callback:any)=>callback(db)};
  const service=new WebhooksService({findOneBy:async()=>({url:'https://example.com',secretCiphertext:'mock'})} as never,{} as never,db);
  vi.spyOn(service as any,'decrypt').mockReturnValue('test-secret');
  vi.mocked(deliverWebhook).mockResolvedValue(status);
  await service.processQueue();
  expect(update).toHaveBeenCalledWith('delivery',expect.objectContaining({status:status===200?'DELIVERED':'PENDING',responseStatus:status,lockedUntil:null}));
  expect(delivery.attempts).toBe(1);
 });
});
