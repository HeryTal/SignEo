import { JwtAuthGuard } from './jwt-auth.guard.js';
import { validateProductionEnvironment } from '../config/production.js';
import { contactInput } from '../contacts/contacts.controller.js';
import { publicAddress,webhookUrl } from '../webhooks/webhook-transport.js';
import { invitationHtml } from '../envelopes/brand-mail.js';
import { RateLimitService } from '../developer/rate-limit.service.js';
describe('security boundaries',()=>{
 it.each(['127.0.0.1','10.1.2.3','169.254.169.254','192.168.0.1','172.16.0.1','::1','::ffff:127.0.0.1','fe80::1','fc00::1'])('rejects webhook private destination %s',ip=>expect(publicAddress(ip)).toBe(false));
 it('allows public addresses and rejects credentials and redirects to HTTP',()=>{expect(publicAddress('1.1.1.1')).toBe(true);expect(()=>webhookUrl('http://example.com')).toThrow();expect(()=>webhookUrl('https://user:pass@example.com')).toThrow();expect(()=>webhookUrl('https://example.com:8443')).toThrow();});
 it('refuses production defaults',()=>{expect(()=>validateProductionEnvironment({NODE_ENV:'production'})).toThrow(/JWT_SECRET/);expect(()=>validateProductionEnvironment({NODE_ENV:'test'})).not.toThrow();});
 it('escapes untrusted branding in emails',()=>{const html=invitationHtml({recipientName:'<script>x</script>',envelopeTitle:'<img onerror=x>',signingUrl:'https://example.com/a?b="c',branding:{displayName:'<b>Fake</b>',accentColor:'red;display:none',logoUrl:'javascript:alert(1)'}});expect(html).not.toContain('<script>');expect(html).not.toContain('<img onerror');expect(html).not.toContain('javascript:');expect(html).toContain('&lt;b&gt;Fake&lt;/b&gt;');});
 it('normalizes contacts and rejects invalid values',()=>{expect(contactInput({name:' Camille ',email:'C@EXAMPLE.COM'}).email).toBe('c@example.com');expect(()=>contactInput({name:'Camille',email:'invalid'})).toThrow();expect(()=>contactInput({name:[],email:'x@example.com'})).toThrow();});
 it('enforces authentication burst limits',async()=>{const previous=process.env.REDIS_URL;delete process.env.REDIS_URL;const limits=new RateLimitService();try{expect((await limits.consume('test',2)).allowed).toBe(true);expect((await limits.consume('test',2)).allowed).toBe(true);expect((await limits.consume('test',2)).allowed).toBe(false);}finally{await limits.onModuleDestroy();if(previous)process.env.REDIS_URL=previous;}});
 it('rejects legacy tokens without a revocable session',async()=>{const guard=new JwtAuthGuard({verifyAsync:async()=>({sub:'user'})} as never,{} as never);const context={switchToHttp:()=>({getRequest:()=>({headers:{authorization:'Bearer legacy'}})})};await expect(guard.canActivate(context as never)).rejects.toThrow(/Session/);});
 it('rejects revoked sessions even with valid JWT signatures',async()=>{const guard=new JwtAuthGuard({verifyAsync:async()=>({sub:'user',jti:'session',version:0})} as never,{getRepository:()=>({findOneBy:async()=>null})} as never);const context={switchToHttp:()=>({getRequest:()=>({headers:{authorization:'Bearer token'}})})};await expect(guard.canActivate(context as never)).rejects.toThrow(/Session/);});
});
