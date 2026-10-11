"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { DashboardLayout } from "../../ui/dashboard/dashboard-layout";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";
type Envelope = { id: string; title: string; status: string; createdAt: string; documents: { id: string; name: string; size: number }[] };
export default function DocumentsPage() {
  const [items, setItems] = useState<Envelope[]>([]); const [loading, setLoading] = useState(true); const [removing, setRemoving] = useState<string | null>(null); const [notice, setNotice] = useState("");
  useEffect(() => { const token = localStorage.getItem("signeo_access_token"); fetch(`${API}/envelopes`, { headers: { Authorization: `Bearer ${token ?? ""}` } }).then((response) => response.ok ? response.json() : []).then(setItems).catch(() => setItems([])).finally(() => setLoading(false)); }, []);
  const documents = items.flatMap((envelope) => envelope.documents.map((document) => ({ ...document, envelope })));
  async function removeDocument(envelopeId: string, documentId: string, name: string) {
    if (!window.confirm(`Supprimer définitivement « ${name} » ? Cette action est disponible uniquement pour les brouillons.`)) return;
    setRemoving(documentId); setNotice("");
    try {
      const token = localStorage.getItem("signeo_access_token");
      const response = await fetch(`${API}/envelopes/${envelopeId}/documents/${documentId}`, { method: "DELETE", headers: { Authorization: `Bearer ${token ?? ""}` } });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.message ?? "Impossible de supprimer ce document.");
      setItems((current) => current.map((envelope) => envelope.id === envelopeId ? { ...envelope, documents: envelope.documents.filter((document) => document.id !== documentId) } : envelope));
      setNotice("Document supprimé.");
    } catch (error) { setNotice(error instanceof Error ? error.message : "Erreur réseau."); }
    finally { setRemoving(null); }
  }
  return <DashboardLayout title="Documents" description="Retrouvez les fichiers associés à vos enveloppes."><div className="envelopes-toolbar"><p>{documents.length} document{documents.length === 1 ? "" : "s"}</p><Link href="/dashboard/enveloppes/nouvelle" className="envelope-next">+ Importer un document</Link></div>{notice && <p className="document-notice" role="status">{notice}</p>}{loading ? <p className="envelope-loading">Chargement de vos documents…</p> : documents.length ? <div className="envelope-table">{documents.map(({ id, name, size, envelope }) => { const canDelete = envelope.status === "DRAFT" && envelope.documents.length > 1; return <div className="envelope-row document-row" key={id}><Link className="document-row-main" href={`/dashboard/enveloppes/${envelope.id}`}><span className="envelope-row-icon">▤</span><span className="envelope-row-main"><b>{name}</b><small>{envelope.title}</small></span><span className="envelope-row-main document-size"><small>{(size / 1024 / 1024).toFixed(2)} Mo</small></span><time>{new Date(envelope.createdAt).toLocaleDateString("fr-FR")}</time></Link>{canDelete ? <button type="button" className="document-delete" disabled={removing !== null} onClick={() => void removeDocument(envelope.id, id, name)} aria-label={`Supprimer ${name}`}>{removing === id ? "Suppression…" : "Supprimer"}</button> : <span className="document-locked" title={envelope.status === "DRAFT" ? "Conservez au moins un document dans l’enveloppe." : "Les documents envoyés ne peuvent plus être supprimés."}>Protégé</span>}</div>; })}</div> : <section className="envelopes-empty"><span>▤</span><h3>Votre espace est prêt</h3><p>Les documents apparaîtront ici après la création d’une enveloppe.</p><Link href="/dashboard/enveloppes/nouvelle" className="envelope-next">Importer un document →</Link></section>}</DashboardLayout>;
}
