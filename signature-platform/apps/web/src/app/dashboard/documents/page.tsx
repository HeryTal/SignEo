"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { DashboardLayout } from "../../ui/dashboard/dashboard-layout";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";
type Envelope = { id: string; title: string; createdAt: string; documents: { id: string; name: string; size: number }[] };
export default function DocumentsPage() {
  const [items, setItems] = useState<Envelope[]>([]); const [loading, setLoading] = useState(true);
  useEffect(() => { const token = localStorage.getItem("signeo_access_token"); fetch(`${API}/envelopes`, { headers: { Authorization: `Bearer ${token ?? ""}` } }).then((response) => response.ok ? response.json() : []).then(setItems).catch(() => setItems([])).finally(() => setLoading(false)); }, []);
  const documents = items.flatMap((envelope) => envelope.documents.map((document) => ({ ...document, envelope })));
  return <DashboardLayout title="Documents" description="Retrouvez les fichiers associés à vos enveloppes."><div className="envelopes-toolbar"><p>{documents.length} document{documents.length === 1 ? "" : "s"}</p><Link href="/dashboard/enveloppes/nouvelle" className="envelope-next">+ Importer un document</Link></div>{loading ? <p className="envelope-loading">Chargement de vos documents…</p> : documents.length ? <div className="envelope-table">{documents.map(({ id, name, size, envelope }) => <Link className="envelope-row" key={id} href={`/dashboard/enveloppes/${envelope.id}`}><span className="envelope-row-icon">▤</span><span className="envelope-row-main"><b>{name}</b><small>{envelope.title}</small></span><span className="envelope-row-main"><small>{(size / 1024 / 1024).toFixed(2)} Mo</small></span><time>{new Date(envelope.createdAt).toLocaleDateString("fr-FR")}</time><span className="envelope-row-arrow">→</span></Link>)}</div> : <section className="envelopes-empty"><span>▤</span><h3>Votre espace est prêt</h3><p>Les documents apparaîtront ici après la création d’une enveloppe.</p><Link href="/dashboard/enveloppes/nouvelle" className="envelope-next">Importer un document →</Link></section>}</DashboardLayout>;
}
