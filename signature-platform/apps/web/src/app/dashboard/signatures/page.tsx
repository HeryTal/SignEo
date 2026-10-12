"use client";
import Link from 'next/link';
import {useEffect,useState} from 'react';
import {DashboardLayout} from '@/app/ui/dashboard/dashboard-layout';
import {apiRequest} from '@/app/ui/api-client';
import styles from '../parametres/settings.module.css';
type Envelope={id:string;title:string;status:string;recipients:{id:string;name:string;email:string;status:string;role:string;signedAt:string|null}[]};
export default function SignaturesPage(){
 const [items,setItems]=useState<Envelope[]>([]);const [filter,setFilter]=useState('WAITING');const [error,setError]=useState('');const [loading,setLoading]=useState(true);
 useEffect(()=>{let active=true;apiRequest<Envelope[]>('/envelopes').then(data=>{if(active)setItems(data);}).catch(error=>{if(active)setError(error.message);}).finally(()=>{if(active)setLoading(false);});return()=>{active=false;};},[]);
 const all=items.filter(item=>item.status!=='DRAFT').flatMap(envelope=>envelope.recipients.map(recipient=>({...recipient,envelope})));
 const visible=all.filter(item=>filter==='ALL'||(filter==='DONE'?['SIGNED','APPROVED'].includes(item.status):item.status==='WAITING'&&['SENT','PARTIALLY_SIGNED'].includes(item.envelope.status)));
 const status:Record<string,string>={WAITING:'En attente',SIGNED:'Signé',APPROVED:'Approuvé',DECLINED:'Refusé'};
 return <DashboardLayout title="Le suivi des signatures" description="Chaque destinataire, chaque réponse, au même endroit." actions={<Link className={styles.primary} href="/dashboard/enveloppes">Gérer les enveloppes ↗</Link>}><nav className={styles.tabs} aria-label="Filtrer les signatures">{[['WAITING','À suivre'],['DONE','Terminées'],['ALL','Toutes']].map(([value,label])=><button key={value} aria-current={filter===value?'page':undefined} onClick={()=>setFilter(value)}>{label}</button>)}</nav><section className={styles.accountCard}>{loading?<p>Chargement…</p>:error?<p role="alert">{error}</p>:visible.length?visible.map(item=><article className={styles.sessionRow} key={item.id}><div><b>{item.name}</b><small>{item.email}</small><small>{item.envelope.title}</small></div><div><span>{status[item.status]??item.status}</span>{item.signedAt&&<small>{new Date(item.signedAt).toLocaleDateString('fr-FR')}</small>}<Link className={styles.secondary} href={'/dashboard/enveloppes/'+item.envelope.id}>Voir le dossier ↗</Link></div></article>):<p>Aucune signature dans cette catégorie.</p>}</section></DashboardLayout>;
}
