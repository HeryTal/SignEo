"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";
type Envelope = { id: string; title: string; status: string; createdAt: string; documents: { id: string; name: string }[]; recipients: { id: string; name: string; email: string; status: string }[] };
export function RecentDocuments() {
  const [items, setItems] = useState<Envelope[]>([]); const [loading, setLoading] = useState(true);
  useEffect(() => { const token = localStorage.getItem("signeo_access_token"); fetch(`${API}/envelopes`, { headers: { Authorization: `Bearer ${token ?? ""}` } }).then((response) => response.ok ? response.json() : []).then(setItems).catch(() => setItems([])).finally(() => setLoading(false)); }, []);
  return <section className="dashboard-table-section" id="signatures"><div className="panel-heading"><div><p className="eyebrow">VOS ENVELOPPES</p><h3>Documents récents</h3></div><Link href="/dashboard/enveloppes">Voir toutes les enveloppes</Link></div>{loading ? <div className="dashboard-table-empty"><p>Chargement…</p></div> : items.length ? <div className="recent-envelope-list">{items.slice(0, 5).map((item) => <Link href={`/dashboard/enveloppes/${item.id}`} key={item.id}><span>▤</span><div><b>{item.title}</b><small>{item.recipients.length} destinataire{item.recipients.length === 1 ? "" : "s"} · {new Date(item.createdAt).toLocaleDateString("fr-FR")}</small></div><span>→</span></Link>)}</div> : <div className="dashboard-table-empty"><span aria-hidden="true">▤</span><p>Vous n’avez pas encore créé d’enveloppe.</p><Link href="/dashboard/enveloppes/nouvelle">Créer votre première enveloppe</Link></div>}</section>;
}
