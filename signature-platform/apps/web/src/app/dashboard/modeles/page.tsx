"use client";

import { useEffect, useState, type FormEvent } from "react";
import { DashboardLayout } from "@/app/ui/dashboard/dashboard-layout";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";
type TemplateRecipient = {
  name: string;
  role: "SIGNER" | "APPROVER";
  signingOrder: number;
  signatureLevel: "SIMPLE" | "ADVANCED" | "QUALIFIED";
  authenticationMethod: "NONE" | "EMAIL_OTP" | "SMS_OTP";
};
type Template = {
  id: string;
  title: string;
  message: string;
  recipients: TemplateRecipient[];
  expirationDays: number | null;
  createdAt: string;
};
type Envelope = { id: string; title: string; status: string };
type RecipientInput = { name: string; email: string };

export default function ModelsPage() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [envelopes, setEnvelopes] = useState<Envelope[]>([]);
  const [sourceId, setSourceId] = useState("");
  const [templateTitle, setTemplateTitle] = useState("");
  const [activeTemplate, setActiveTemplate] = useState<Template | null>(null);
  const [recipients, setRecipients] = useState<RecipientInput[]>([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [sentLinks, setSentLinks] = useState<{ name: string; email: string; signingUrl: string; active?: boolean; delivered?: boolean }[]>([]);

  async function load() {
    const token = localStorage.getItem("signeo_access_token");
    const headers = { Authorization: `Bearer ${token ?? ""}` };
    const [templatesResponse, envelopesResponse] = await Promise.all([
      fetch(`${API}/templates`, { headers }),
      fetch(`${API}/envelopes`, { headers }),
    ]);
    if (!templatesResponse.ok || !envelopesResponse.ok) {
      throw new Error("Les modèles ou les enveloppes n’ont pas pu être chargés.");
    }
    setTemplates(await templatesResponse.json());
    setEnvelopes(await envelopesResponse.json());
  }

  useEffect(() => {
    const timer = window.setTimeout(() => {
      load().catch((cause: Error) => setError(cause.message));
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  async function saveTemplate(event: FormEvent) {
    event.preventDefault();
    if (!sourceId) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const token = localStorage.getItem("signeo_access_token");
      const response = await fetch(`${API}/envelopes/${sourceId}/templates`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token ?? ""}` },
        body: JSON.stringify({ title: templateTitle }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.message ?? "Le modèle n’a pas pu être créé.");
      setNotice(`Le modèle « ${payload.title} » a été enregistré avec ses documents et ses champs.`);
      setTemplateTitle("");
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Une erreur est survenue.");
    } finally {
      setBusy(false);
    }
  }

  function chooseTemplate(template: Template) {
    setActiveTemplate(template);
    setRecipients(template.recipients.map(() => ({ name: "", email: "" })));
    setSentLinks([]);
    setError("");
  }

  async function sendFromTemplate(event: FormEvent) {
    event.preventDefault();
    if (!activeTemplate) return;
    setBusy(true);
    setError("");
    try {
      const token = localStorage.getItem("signeo_access_token");
      const response = await fetch(`${API}/templates/${activeTemplate.id}/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token ?? ""}` },
        body: JSON.stringify({
          recipients: recipients.map((recipient, index) => ({
            ...recipient,
            role: activeTemplate.recipients[index].role,
            signatureLevel: activeTemplate.recipients[index].signatureLevel,
            authenticationMethod: activeTemplate.recipients[index].authenticationMethod,
          })),
        }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.message ?? "L’enveloppe n’a pas pu être envoyée.");
      const deliveries = new Map((payload.deliveries ?? []).map((delivery: { id: string; delivered: boolean }) => [delivery.id, delivery.delivered]));
      setSentLinks((payload.invitations ?? []).map((invite: { id: string; name: string; email: string; signingUrl: string; active?: boolean }) => ({
        ...invite,
        delivered: deliveries.get(invite.id) as boolean | undefined,
      })));
      setActiveTemplate(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Une erreur est survenue.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <DashboardLayout title="Modèles" description="Réutilisez vos documents, champs et parcours de destinataires." eyebrow="AUTOMATISATION">
      {error && <p className="upload-error" role="alert">{error}</p>}
      {notice && <p className="template-notice" role="status">{notice}</p>}
      <section className="template-create-card">
        <h2>Enregistrer un modèle</h2>
        <p>Choisissez une enveloppe existante. Ses documents, champs placés, ordre et options de parcours seront réutilisables.</p>
        <form onSubmit={saveTemplate}>
          <label className="form-field">Enveloppe source
            <select value={sourceId} onChange={(event) => {
              const envelope = envelopes.find((item) => item.id === event.target.value);
              setSourceId(event.target.value);
              setTemplateTitle(envelope?.title ?? "");
            }} required>
              <option value="">Choisir une enveloppe</option>
              {envelopes.map((envelope) => <option key={envelope.id} value={envelope.id}>{envelope.title} · {envelope.status}</option>)}
            </select>
          </label>
          <label className="form-field">Nom du modèle
            <input value={templateTitle} onChange={(event) => setTemplateTitle(event.target.value)} maxLength={180} required />
          </label>
          <button className="envelope-next" type="submit" disabled={busy || !sourceId}>{busy ? "Enregistrement…" : "Enregistrer comme modèle"}</button>
        </form>
      </section>

      {sentLinks.length > 0 && (
        <section className="template-create-card" aria-live="polite">
          <h2>Invitations préparées</h2>
          <p>Les liens privés sont disponibles ci-dessous. Les destinataires d’une étape ultérieure recevront leur invitation lorsque l’étape précédente sera terminée.</p>
          <div className="invitation-link-list">{sentLinks.map((item) => <article key={item.email}><div><b>{item.name}</b><small>{item.email} · {item.active === false ? "Invitation après l’étape précédente" : item.delivered ? "E-mail envoyé" : "E-mail non envoyé"}</small></div><a href={item.signingUrl} target="_blank" rel="noreferrer">Ouvrir le lien ↗</a></article>)}</div>
        </section>
      )}

      <section className="template-list-section">
        <h2>Vos modèles</h2>
        {!templates.length ? <p className="template-empty">Aucun modèle enregistré. Sélectionnez une enveloppe ci-dessus pour en créer un.</p> : (
          <div className="template-list">
            {templates.map((template) => (
              <article className="template-card" key={template.id}>
                <div><p className="eyebrow">MODÈLE RÉUTILISABLE</p><h3>{template.title}</h3><p>{template.recipients.length} destinataire{template.recipients.length === 1 ? "" : "s"} · {template.expirationDays ? `expiration après ${template.expirationDays} jours · ` : ""}{new Date(template.createdAt).toLocaleDateString("fr-FR")}</p></div>
                <button className="envelope-next" type="button" onClick={() => chooseTemplate(template)}>Utiliser ce modèle →</button>
              </article>
            ))}
          </div>
        )}
      </section>

      {activeTemplate && (
        <div className="template-modal-backdrop">
          <section className="template-modal" role="dialog" aria-modal="true" aria-labelledby="template-send-title">
            <button className="template-close" type="button" aria-label="Fermer" onClick={() => setActiveTemplate(null)}>×</button>
            <h2 id="template-send-title">Utiliser « {activeTemplate.title} »</h2>
            <p>Renseignez les destinataires prévus par le modèle. Les rôles et l’ordre sont conservés.</p>
            <form onSubmit={sendFromTemplate}>
              {activeTemplate.recipients.map((slot, index) => (
                <fieldset className="template-recipient" key={`${slot.role}-${index}`}>
                  <legend>{slot.name} · {slot.role === "APPROVER" ? "Approbateur" : `Étape ${slot.signingOrder}`}</legend>
                  <label className="form-field">Nom<input required maxLength={120} value={recipients[index]?.name ?? ""} onChange={(event) => setRecipients((items) => items.map((item, i) => i === index ? { ...item, name: event.target.value } : item))} /></label>
                  <label className="form-field">E-mail<input required type="email" value={recipients[index]?.email ?? ""} onChange={(event) => setRecipients((items) => items.map((item, i) => i === index ? { ...item, email: event.target.value } : item))} /></label>
                </fieldset>
              ))}
              <div className="template-modal-actions">
                <button type="button" className="secondary-action" onClick={() => setActiveTemplate(null)}>Annuler</button>
                <button type="submit" className="envelope-next" disabled={busy}>{busy ? "Envoi…" : "Créer et envoyer →"}</button>
              </div>
            </form>
          </section>
        </div>
      )}
    </DashboardLayout>
  );
}
