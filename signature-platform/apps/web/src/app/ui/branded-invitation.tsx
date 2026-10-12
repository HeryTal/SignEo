"use client";
import type {CSSProperties} from 'react';
import styles from './branded-invitation.module.css';
export type Brand = {displayName?:string;accentColor?:string;logoUrl?:string;textFont?:string;textColor?:string;textSize?:number};
export function brandStyles(brand:Brand):CSSProperties{
 const accent=/^#[\da-f]{6}$/i.test(brand.accentColor??'')?brand.accentColor!:'#496b50';
 const rgb=accent.slice(1).match(/../g)!.map(value=>parseInt(value,16));
 return {'--brand-accent':accent,'--brand-button-ink':rgb[0]*.299+rgb[1]*.587+rgb[2]*.114>155?'#172e24':'#fff','--brand-font':brand.textFont==='SERIF'?'Georgia,serif':brand.textFont==='MONO'?'monospace':'var(--sans)','--brand-text':brand.textColor??'#24352b'} as CSSProperties;
}
export function InvitationContent({brand,recipient='Camille',title='Contrat de prestation',message,approver=false,onContinue}:{brand:Brand;recipient?:string;title?:string;message?:string;approver?:boolean;onContinue?:()=>void}){
 return <div className={styles.content} style={brandStyles(brand)}><div className={styles.art} aria-hidden="true"><span>▤</span><i>✓</i></div><span className={styles.eyebrow}>{approver?'VOTRE APPROBATION EST ATTENDUE':'C’EST À VOUS DE SIGNER'}</span><h2>Un accord commence<br/>par une signature.</h2><div className={styles.message} style={{fontSize:Math.max(11,brand.textSize??12)}}><p>Bonjour {recipient},</p><p>{brand.displayName||'Votre organisation'} vous invite à consulter et {approver?'approuver':'signer'} un document. Tout est prêt, il ne manque que vous.</p>{message&&<p>{message}</p>}</div><div className={styles.document}>▤ <span>{title}<small>Document à {approver?'approuver':'signer'}</small></span></div>{onContinue?<button type="button" className={styles.cta} onClick={onContinue}>Découvrir le document <span>↗</span></button>:<span className={styles.cta}>Découvrir le document <span>↗</span></span>}<small className={styles.footer}>Votre espace de signature sécurisé</small></div>;
}
