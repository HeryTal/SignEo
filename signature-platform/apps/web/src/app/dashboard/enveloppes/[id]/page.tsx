"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { DashboardLayout } from "../../../ui/dashboard/dashboard-layout";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";
type CollectionFile = { requestId: string; name: string; uploadedAt?: string };
type Detail = {
  id: string;
  title: string;
  message: string;
  status: string;
  cryptographicPdfEnabled: boolean;
  createdAt: string;
  documents: { id: string; name: string; size: number; signedPdfAvailable: boolean }[];
  recipients: {
    id: string;
    name: string;
    email: string;
    role: string;
    status: string;
    signingOrder: number;
    viewedAt?: string;
    collectionFiles: CollectionFile[];
  }[];
  events: {
    id: string;
    action: string;
    actorEmail: string;
    createdAt: string;
    details: Record<string, unknown>;
  }[];
};
const labels: Record<string, string> = {
  DRAFT: "Brouillon",
  SENT: "Envoyée",
  PARTIALLY_SIGNED: "En cours",
  COMPLETED: "Terminée",
  VOIDED: "Annulée",
  EXPIRED: "Expirée",
  ENVELOPE_CREATED: "Enveloppe créée",
  ENVELOPE_SENT: "Invitations préparées",
  DOCUMENT_SIGNED: "Document signé",
  ENVELOPE_APPROVED: "Enveloppe approuvée",
  COLLECTION_DOCUMENT_UPLOADED: "Pièce justificative reçue",
  SIGNATURE_DECLINED: "Signature refusée",
  INVITATION_VIEWED: "Invitation consultée",
  INVITATION_EMAIL_SENT: "E-mail d’invitation envoyé",
  INVITATION_EMAIL_PENDING: "E-mail d’invitation à configurer",
  REMINDER_EMAIL_SENT: "E-mail de rappel envoyé",
  COMPLETION_EMAIL_SENT: "E-mail de fin de dossier envoyé",
  COMPLETION_EMAIL_PENDING: "E-mail de fin de dossier à configurer",
};

export default function EnvelopeDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [item, setItem] = useState<Detail | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const token = localStorage.getItem("signeo_access_token");
    fetch(`${API}/envelopes/${id}`, {
      headers: { Authorization: `Bearer ${token ?? ""}` },
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("Enveloppe introuvable.");
        return response.json();
      })
      .then(setItem)
      .catch((cause: Error) => setError(cause.message));
  }, [id]);

  async function downloadCollection(recipientId: string, file: CollectionFile) {
    const token = localStorage.getItem("signeo_access_token");
    const response = await fetch(
      `${API}/envelopes/${id}/collections/${recipientId}/${file.requestId}`,
      { headers: { Authorization: `Bearer ${token ?? ""}` } },
    );
    if (!response.ok) {
      setError("Impossible de télécharger cette pièce jointe.");
      return;
    }
    const objectUrl = URL.createObjectURL(await response.blob());
    const anchor = document.createElement("a");
    anchor.href = objectUrl;
    anchor.download = file.name;
    anchor.click();
    URL.revokeObjectURL(objectUrl);
  }

  async function downloadSigned(documentId: string, name: string) {
    const token = localStorage.getItem("signeo_access_token");
    const response = await fetch(`${API}/envelopes/${id}/documents/${documentId}/signed`, { headers: { Authorization: `Bearer ${token ?? ""}` } });
    if (!response.ok) { const payload = await response.json().catch(() => null); setError(payload?.message ?? "Le PDF signé n’est pas disponible."); return; }
    const objectUrl = URL.createObjectURL(await response.blob());
    const anchor = document.createElement("a"); anchor.href = objectUrl; anchor.download = name.replace(/\.pdf$/i, "") + "-signe.pdf"; anchor.click(); URL.revokeObjectURL(objectUrl);
  }
  async function downloadAuditTrail() {
    const token = localStorage.getItem("signeo_access_token");
    const response = await fetch(`${API}/envelopes/${id}/audit-trail`, { headers: { Authorization: `Bearer ${token ?? ""}` } });
    if (!response.ok) { setError("Impossible de générer le journal de preuve."); return; }
    const objectUrl = URL.createObjectURL(new Blob([JSON.stringify(await response.json(), null, 2)], { type: "application/json" }));
    const anchor = document.createElement("a"); anchor.href = objectUrl; anchor.download = `journal-de-preuve-${id}.json`; anchor.click(); URL.revokeObjectURL(objectUrl);
  }

  return (
    <DashboardLayout
      title={item?.title ?? "Détail de l’enveloppe"}
      description="Suivez les destinataires et consultez l’historique."
      eyebrow="SUIVI"
    >
      <Link href="/dashboard/enveloppes" className="back-step">
        ← Toutes les enveloppes
      </Link>
      {error ? (
        <p className="upload-error">{error}</p>
      ) : !item ? (
        <p className="envelope-loading">Chargement…</p>
      ) : (
        <div className="envelope-detail-grid">
          <section className="detail-card">
            <p className="eyebrow">DESTINATAIRES</p>
            {item.recipients.map((recipient) => (
              <article className="detail-recipient" key={recipient.id}>
                <span className="recipient-number">
                  {recipient.signingOrder}
                </span>
                <span>
                  <b>{recipient.name}</b>
                  <small>
                    {recipient.email} ·{" "}
                    {recipient.role === "SIGNER" ? "Signataire" : "Approbateur"}
                  </small>
                </span>
                <em
                  className={`envelope-status status-${recipient.status.toLowerCase()}`}
                >
                  {recipient.status === "SIGNED"
                    ? "Signé"
                    : recipient.status === "APPROVED"
                      ? "Approuvé"
                      : recipient.status === "DECLINED"
                        ? "Refusé"
                    : recipient.viewedAt ? "Consulté" : "En attente"}
                </em>
              </article>
            ))}
          </section>
          <section className="detail-card">
            <p className="eyebrow">DOCUMENTS</p>
            {item.documents.map((doc) => (
              <article className="detail-document" key={doc.id}>
                <span>▤</span>
                <b>{doc.name}</b>
                <small>{(doc.size / 1024 / 1024).toFixed(2)} Mo</small>
                {item.status === "COMPLETED" && (doc.name.toLowerCase().endsWith(".pdf") ? <button type="button" className="download-collected-file" disabled={!doc.signedPdfAvailable} onClick={() => downloadSigned(doc.id, doc.name)}>{doc.signedPdfAvailable ? "Télécharger le PDF signé" : item.cryptographicPdfEnabled ? "Scellement à vérifier" : "Certificat à configurer"}</button> : <small>Le scellement n’est disponible que pour les PDF.</small>)}
              </article>
            ))}
            <p className="detail-date">
              Créée le {new Date(item.createdAt).toLocaleString("fr-FR")}
            </p>
            {item.status === "COMPLETED" && <button type="button" className="download-collected-file" onClick={downloadAuditTrail}>Télécharger le journal de preuve</button>}
          </section>
          <section className="detail-card">
            <p className="eyebrow">PIÈCES JUSTIFICATIVES REÇUES</p>
            {item.recipients.flatMap((recipient) =>
              recipient.collectionFiles.map((file) => (
                <article
                  className="detail-document"
                  key={recipient.id + file.requestId}
                >
                  <span>▧</span>
                  <b>{file.name}</b>
                  <small>{recipient.name}</small>
                  <button
                    type="button"
                    className="download-collected-file"
                    onClick={() => downloadCollection(recipient.id, file)}
                  >
                    Télécharger
                  </button>
                </article>
              )),
            )}
            {!item.recipients.some(
              (recipient) => recipient.collectionFiles.length,
            ) && (
              <p className="detail-date">Aucune pièce reçue pour le moment.</p>
            )}
          </section>
          <section className="detail-card detail-history">
            <p className="eyebrow">HISTORIQUE</p>
            {item.events.map((event) => (
              <article className="history-event" key={event.id}>
                <span className="history-dot" />
                <div>
                  <b>{labels[event.action] ?? event.action}</b>
                  <small>
                    {event.actorEmail} ·{" "}
                    {new Date(event.createdAt).toLocaleString("fr-FR")}
                  </small>
                </div>
              </article>
            ))}
          </section>
        </div>
      )}
    </DashboardLayout>
  );
}
