"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { DashboardLayout } from "../../ui/dashboard/dashboard-layout";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";
type Envelope = { id: string; title: string; status: string; createdAt: string; documents: { id: string; name: string }[]; recipients: { id: string; name: string; email: string; status: string }[] };
const statusNames: Record<string, string> = { DRAFT: "Brouillon", SENT: "En attente", PARTIALLY_SIGNED: "En cours", COMPLETED: "Terminée", VOIDED: "Annulée" };

export default function EnvelopesPage() {
  const [items, setItems] = useState<Envelope[]>([]); const [loading, setLoading] = useState(true); const [error, setError] = useState("");
  useEffect(() => {
    const token = localStorage.getItem("signeo_access_token");
    fetch(`${API}/envelopes`, { headers: { Authorization: `Bearer ${token ?? ""}` } })
      .then(async (response) => { if (!response.ok) throw new Error("Impossible de charger les enveloppes. Vérifiez que l’API est démarrée."); return response.json(); })
      .then(setItems).catch((cause: Error) => setError(cause.message)).finally(() => setLoading(false));
  }, []);
  return <DashboardLayout title="Mes enveloppes" description="Retrouvez vos envois et suivez les signatures en un coup d’œil." eyebrow="SIGNATURES">
    <div className="envelopes-toolbar"><p>{items.length} enveloppe{items.length === 1 ? "" : "s"}</p><Link href="/dashboard/enveloppes/nouvelle" className="envelope-next">+ Nouvelle enveloppe</Link></div>
    {error ? <p className="upload-error" role="alert">{error}</p> : loading ? <p className="envelope-loading">Chargement de vos enveloppes…</p> : items.length ? <div className="envelope-table">{items.map((item) => <Link href={`/dashboard/enveloppes/${item.id}`} className="envelope-row" key={item.id}><span className="envelope-row-icon">▤</span><span className="envelope-row-main"><b>{item.title}</b><small>{item.documents.length} document{item.documents.length === 1 ? "" : "s"} · {item.recipients.length} destinataire{item.recipients.length === 1 ? "" : "s"}</small></span><span className={`envelope-status status-${item.status.toLowerCase()}`}>{statusNames[item.status] ?? item.status}</span><time>{new Date(item.createdAt).toLocaleDateString("fr-FR")}</time><span className="envelope-row-arrow">→</span></Link>)}</div> : <section className="envelopes-empty"><span>✳</span><h3>Votre espace est prêt</h3><p>Créez votre première enveloppe pour envoyer un document à signer.</p><Link href="/dashboard/enveloppes/nouvelle" className="envelope-next">Créer ma première enveloppe →</Link></section>}
  </DashboardLayout>;
}
