import { lookup } from 'node:dns/promises';
import { BlockList, isIP } from 'node:net';
import { request } from 'node:https';
const blocked = new BlockList();
const blockedV6 = new BlockList();
for(const [ip,prefix] of [['0.0.0.0',8],['10.0.0.0',8],['100.64.0.0',10],['127.0.0.0',8],['169.254.0.0',16],['172.16.0.0',12],['192.0.0.0',24],['192.168.0.0',16],['198.18.0.0',15],['224.0.0.0',4],['240.0.0.0',4]] as const) blocked.addSubnet(ip,prefix,'ipv4');
for(const [ip,prefix] of [['::',128],['::1',128],['::ffff:0:0',96],['fc00::',7],['fe80::',10],['ff00::',8],['2001:db8::',32],['2002::',16]] as const) blockedV6.addSubnet(ip,prefix,'ipv6');
export function publicAddress(ip:string){const family=isIP(ip);return family!==0&&!(family===4?blocked:blockedV6).check(ip,family===4?'ipv4':'ipv6');}
export function webhookUrl(value:string){const url=new URL(value);if(url.protocol!=='https:'||url.username||url.password||(url.port&&url.port!=='443'))throw new Error('Une URL HTTPS publique sur le port 443 est requise.');return url;}
export async function deliverWebhook(target:string,payload:string,headers:Record<string,string>):Promise<number>{
 const url=webhookUrl(target);
 const addresses=await lookup(url.hostname.replace(/^\[|\]$/g,''),{all:true});
 if(!addresses.length||addresses.some(item=>!publicAddress(item.address)))throw new Error('Destination réseau privée ou réservée refusée.');
 const address=addresses[0];
 return new Promise((resolve,reject)=>{
  const req=request(url,{method:'POST',headers:{...headers,'Content-Length':String(Buffer.byteLength(payload))},
   // Pin the validated address; a second DNS resolution could allow rebinding.
   lookup:(_host,_options,callback)=>callback(null,address.address,address.family),
   signal:AbortSignal.timeout(10000),
  },res=>{const status=res.statusCode??0;res.resume();resolve(status);});
  req.on('error',reject);req.end(payload);
 });
}
