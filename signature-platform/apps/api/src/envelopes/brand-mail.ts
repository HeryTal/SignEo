import type { UserBranding } from '../users/user.entity.js';
export const escapeHtml=(value:string)=>value.replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]!));
export function invitationHtml(input:{recipientName:string;envelopeTitle:string;signingUrl:string;branding?:Partial<UserBranding>;reminder?:boolean}){
 const brand=input.branding??{};
 const accent=/^#[\da-f]{6}$/i.test(brand.accentColor??'')?brand.accentColor!:'#496b50';
 const textColor=/^#[\da-f]{6}$/i.test(brand.textColor??'')?brand.textColor!:'#24352b';
 const rgb=accent.slice(1).match(/../g)!.map(value=>parseInt(value,16));
 const ink=rgb[0]*.299+rgb[1]*.587+rgb[2]*.114>155?'#172e24':'#ffffff';
 const font=brand.textFont==='SERIF'?'Georgia,serif':brand.textFont==='MONO'?'Courier New,monospace':'Arial,sans-serif';
 const name=escapeHtml(brand.displayName||'Signeo');
 const logo=brand.logoUrl?.startsWith('https://')?'<img src="'+escapeHtml(brand.logoUrl)+'" alt="" width="36" height="36" style="object-fit:contain;vertical-align:middle;margin-right:10px">':'';
 return '<!doctype html><html lang="fr"><body style="margin:0;background:#eef2e8;font-family:'+font+';color:'+textColor+'"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td style="padding:36px 16px"><table role="presentation" cellpadding="0" cellspacing="0" style="max-width:500px;margin:auto;width:100%;background:#fff;border-top:4px solid '+accent+'"><tr><td style="padding:32px"><div style="font-size:18px;font-weight:bold">'+logo+name+'</div><p style="font-size:11px;letter-spacing:2px;margin-top:32px">'+(input.reminder?'VOTRE DOCUMENT VOUS ATTEND':'C’EST À VOUS DE SIGNER')+'</p><h1 style="font:normal 30px Georgia,serif">Un accord commence<br>par une signature.</h1><p>Bonjour '+escapeHtml(input.recipientName)+',</p><p style="line-height:1.7">'+name+' vous invite à consulter et signer un document.</p><p style="padding:16px;border:1px solid #e2e7dd">'+escapeHtml(input.envelopeTitle)+'</p><a href="'+escapeHtml(input.signingUrl)+'" style="display:block;padding:16px;background:'+accent+';color:'+ink+';text-decoration:none;text-align:center;border-radius:6px">Découvrir le document ↗</a><p style="font-size:11px;color:#69775e;margin-top:24px">Ce lien est personnel. Ne le partagez pas.</p></td></tr></table><p style="text-align:center;font-size:11px;color:#69775e">Une expérience propulsée par Signeo.</p></td></tr></table></body></html>';
}
