import Link from 'next/link';
import type {ReactNode} from 'react';
import {legalContent} from '../legal-content';
export function LegalPage({title,children}:{title:string;children:ReactNode}){
 return <main style={{maxWidth:820,margin:'0 auto',padding:'40px 24px 80px',lineHeight:1.85}}><Link href="/" style={{fontSize:25,fontFamily:'var(--serif)'}}>signeo.</Link><h1 style={{fontFamily:'var(--serif)',fontSize:42,lineHeight:1.15,margin:'40px 0 24px'}}>{title}</h1>{!legalContent.reviewed&&<p role="note" style={{padding:18,background:'#fff4db',border:'1px solid #e5d1a4',borderRadius:8}}>Document de préparation. Les informations de l’éditeur et les conditions du service doivent encore être complétées et validées avant l’ouverture publique.</p>}{children}<nav style={{display:'flex',flexWrap:'wrap',gap:24,marginTop:40,borderTop:'1px solid #dce3d4',paddingTop:20}} aria-label="Informations du service"><Link href="/mentions-legales">Mentions légales</Link><Link href="/confidentialite">Confidentialité</Link><Link href="/conditions">Conditions d’utilisation</Link></nav></main>;
}
