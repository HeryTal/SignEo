"use client";

import { FormEvent, useEffect, useState } from "react";
import { DashboardLayout } from "@/app/ui/dashboard/dashboard-layout";
import { SigneoMark } from "@/app/ui/signeo-logo";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";
type Branding = { displayName: string; accentColor: string; logoUrl: string; textFont: "SANS" | "SERIF" | "MONO"; signatureFont: "SCRIPT" | "SERIF" | "SANS"; textColor: string; signatureColor: string; textSize: number; signatureSize: number };
type IdentityVerification = { status: "NOT_STARTED" | "PENDING" | "VERIFIED" | "REJECTED"; provider: string | null; verifiedAt: string | null; rejectionReason: string | null };
type Billing = { organization: { id: string; name: string }; billingEmail: string | null; plan: string; subscriptionStatus: string; usage: { envelopesThisMonth: number; includedEnvelopesPerMonth: number } };

export default function SettingsPage() {
  const [branding, setBranding] = useState<Branding>({ displayName: "Signeo", accentColor: "#496b50", logoUrl: "", textFont: "SANS", signatureFont: "SCRIPT", textColor: "#24352b", signatureColor: "#315b45", textSize: 11, signatureSize: 22 });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [role, setRole] = useState("");
  const [identity, setIdentity] = useState<IdentityVerification>({ status: "NOT_STARTED", provider: null, verifiedAt: null, rejectionReason: null });
  const [billing, setBilling] = useState<Billing | null>(null);
  const [billingEmail, setBillingEmail] = useState("");
  useEffect(() => {
    const token = localStorage.getItem("signeo_access_token");
    if (!token) return;
    Promise.all([fetch(`${API}/auth/me`, { headers: { Authorization: `Bearer ${token}` } }), fetch(`${API}/billing`, { headers: { Authorization: `Bearer ${token}` } })])
      .then(async ([profileResponse, billingResponse]) => { if (profileResponse.ok) { const profile = await profileResponse.json(); if (profile.branding) setBranding(profile.branding); if (profile.identityVerification) setIdentity(profile.identityVerification); setRole(profile.activeWorkspace?.role ?? ""); } if (billingResponse.ok) { const value = await billingResponse.json(); setBilling(value); setBillingEmail(value.billingEmail ?? ""); } })
      .catch(() => setNotice("Impossible de charger les paramètres. Vérifiez que l’API est démarrée."))
      .finally(() => setLoading(false));
  }, []);
  async function save(event: FormEvent) {
    event.preventDefault();
    setBusy(true); setNotice("");
    try {
      const token = localStorage.getItem("signeo_access_token");
      const response = await fetch(`${API}/auth/branding`, { method: "PATCH", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify(branding) });
      const result = await response.json().catch(() => null);
      if (!response.ok) throw new Error(result?.message ?? "La personnalisation n’a pas été enregistrée.");
      setNotice("Identité de marque enregistrée. Les prochaines enveloppes l’utiliseront.");
    } catch (error) { setNotice(error instanceof Error ? error.message : "Erreur réseau."); }
    finally { setBusy(false); }
  }
  async function startIdentityVerification() {
    setBusy(true); setNotice("");
    try {
      const token = localStorage.getItem("signeo_access_token");
      const response = await fetch(`${API}/auth/identity-verification`, { method: "POST", headers: { Authorization: `Bearer ${token}` } });
      const result = await response.json().catch(() => null);
      if (!response.ok) throw new Error(result?.message ?? "La vérification n’a pas pu démarrer.");
      setIdentity(result); setNotice(result.verificationUrl ? "Vérification créée. Ouvrez le parcours sécurisé du prestataire." : "Vérification en attente.");
      if (result.verificationUrl) window.open(result.verificationUrl, "_blank", "noopener,noreferrer");
    } catch (error) { setNotice(error instanceof Error ? error.message : "Erreur réseau."); }
    finally { setBusy(false); }
  }
  async function saveBilling(event: FormEvent) {
    event.preventDefault(); setBusy(true); setNotice("");
    try {
      const token = localStorage.getItem("signeo_access_token");
      const response = await fetch(`${API}/billing`, { method: "PATCH", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ billingEmail }) });
      const result = await response.json().catch(() => null);
      if (!response.ok) throw new Error(result?.message ?? "La facturation n’a pas pu être enregistrée.");
      setBilling(result); setNotice("Adresse de facturation enregistrée.");
    } catch (error) { setNotice(error instanceof Error ? error.message : "Erreur réseau."); }
    finally { setBusy(false); }
  }
  async function billingAction(path: "checkout" | "portal", plan?: "BUSINESS" | "ENTERPRISE") {
    setBusy(true); setNotice("");
    try {
      const token = localStorage.getItem("signeo_access_token");
      const response = await fetch(`${API}/billing/${path}`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: plan ? JSON.stringify({ plan }) : undefined });
      const result = await response.json().catch(() => null);
      if (!response.ok || !result?.url) throw new Error(result?.message ?? "Le portail Stripe n’est pas disponible.");
      window.location.assign(result.url);
    } catch (error) { setNotice(error instanceof Error ? error.message : "Erreur réseau."); }
    finally { setBusy(false); }
  }
  return <DashboardLayout title="Personnalisation de marque" description="Adaptez l’expérience des invitations à l’identité de votre organisation.">
    <div className="brand-settings-grid">
      <form className="settings-card" onSubmit={save}>
        <h2>Identité de l’expéditeur</h2>
        <p>Cette marque apparaît sur les prochaines pages de signature. Chaque enveloppe garde une copie de ces réglages.</p>
        <label className="form-field">Nom affiché<input required maxLength={80} value={branding.displayName} onChange={(event) => setBranding({ ...branding, displayName: event.target.value })} /></label>
        <label className="form-field">Couleur principale<input type="color" value={branding.accentColor} onChange={(event) => setBranding({ ...branding, accentColor: event.target.value })} /></label>
        <label className="form-field">Logo (URL HTTPS)<input type="url" placeholder="https://exemple.fr/logo.png" value={branding.logoUrl} onChange={(event) => setBranding({ ...branding, logoUrl: event.target.value })} /></label>
        <h2 className="style-settings-title">Style du texte dans les documents</h2>
        <label className="form-field">Police du texte
          <select value={branding.textFont} onChange={(event) => setBranding({ ...branding, textFont: event.target.value as Branding["textFont"] })}><option value="SANS">Sans sérif</option><option value="SERIF">Sérif</option><option value="MONO">Machine à écrire</option></select>
        </label>
        <div className="style-control-row"><label className="form-field">Couleur du texte<input type="color" value={branding.textColor} onChange={(event) => setBranding({ ...branding, textColor: event.target.value })} /></label><label className="form-field">Taille du texte ({branding.textSize}px)<input type="range" min="8" max="18" value={branding.textSize} onChange={(event) => setBranding({ ...branding, textSize: Number(event.target.value) })} /></label></div>
        <h2 className="style-settings-title">Style des signatures</h2>
        <label className="form-field">Écriture de la signature
          <select value={branding.signatureFont} onChange={(event) => setBranding({ ...branding, signatureFont: event.target.value as Branding["signatureFont"] })}><option value="SCRIPT">Italique</option><option value="SERIF">Classique</option><option value="SANS">Moderne</option></select>
        </label>
        <div className="style-control-row"><label className="form-field">Couleur de la signature<input type="color" value={branding.signatureColor} onChange={(event) => setBranding({ ...branding, signatureColor: event.target.value })} /></label><label className="form-field">Taille de la signature ({branding.signatureSize}px)<input type="range" min="14" max="30" value={branding.signatureSize} onChange={(event) => setBranding({ ...branding, signatureSize: Number(event.target.value) })} /></label></div>
        {notice && <p role="status" className="workflow-hint">{notice}</p>}
        <button className="envelope-next" type="submit" disabled={busy || loading}>{busy ? "Enregistrement…" : "Enregistrer la marque"}</button>
      </form>
      <section className="settings-card brand-preview">
        <p className="eyebrow">APERÇU DESTINATAIRE</p>
        <div className="brand-preview-header" style={{ borderColor: branding.accentColor }}>
          {branding.logoUrl ? <img src={branding.logoUrl} alt="Logo" /> : <SigneoMark />}
          <b>{branding.displayName || "Votre organisation"}</b>
        </div>
        <h2>Une invitation vous attend</h2><p style={{ fontFamily: branding.textFont === "SERIF" ? "Georgia, serif" : branding.textFont === "MONO" ? "monospace" : "Arial, sans-serif", fontSize: branding.textSize, color: branding.textColor }}>Consultez le document et suivez les étapes de signature dans cet espace sécurisé.</p>
        <div className="style-signature-preview" style={{ fontFamily: branding.signatureFont === "SCRIPT" || branding.signatureFont === "SERIF" ? "Georgia, serif" : "Arial, sans-serif", fontSize: branding.signatureSize, color: branding.signatureColor }}>Votre signature</div>
        <button type="button" style={{ background: branding.accentColor }}>Consulter le document</button>
        <small>La couleur et le nom sont enregistrés dans PostgreSQL avec votre compte.</small>
      </section>
      <section className="settings-card">
        <p className="eyebrow">IDENTITÉ ET FACTURATION</p>
        <h2>Vérification d’identité</h2>
        <p>Statut : <b>{identity.status === "VERIFIED" ? "Vérifiée" : identity.status === "PENDING" ? "En attente" : identity.status === "REJECTED" ? "Refusée" : "Non démarrée"}</b></p>
        {identity.rejectionReason && <p className="upload-error">{identity.rejectionReason}</p>}
        {identity.status !== "VERIFIED" && <button type="button" className="secondary-action" onClick={() => void startIdentityVerification()} disabled={busy}>{identity.status === "PENDING" ? "Reprendre la vérification" : "Vérifier mon identité"}</button>}
        {billing && <><h2 className="style-settings-title">Facturation · {billing.organization.name}</h2><p>Forfait <b>{billing.plan}</b> · {billing.usage.envelopesThisMonth}/{billing.usage.includedEnvelopesPerMonth} enveloppes ce mois.</p>{role === "ADMIN" ? <form onSubmit={saveBilling}><label className="form-field">E-mail de facturation<input required type="email" value={billingEmail} onChange={(event) => setBillingEmail(event.target.value)} /></label><button className="secondary-action" type="submit" disabled={busy}>Enregistrer la facturation</button></form> : <p className="workflow-hint">Seul un administrateur peut modifier la facturation.</p>}</>}
      </section>
      {billing && role === "ADMIN" && <section className="settings-card">
        <p className="eyebrow">ABONNEMENT</p>
        <h2>Stripe Billing</h2>
        <p>Le paiement et la gestion de l’abonnement se font sur la page sécurisée de Stripe.</p>
        <button type="button" className="secondary-action" disabled={busy} onClick={() => void billingAction("checkout", "BUSINESS")}>Choisir Business</button>
        <button type="button" className="secondary-action" disabled={busy} onClick={() => void billingAction("checkout", "ENTERPRISE")}>Choisir Enterprise</button>
        <button type="button" className="secondary-action" disabled={busy} onClick={() => void billingAction("portal")}>Gérer l’abonnement</button>
      </section>}
    </div>
  </DashboardLayout>;
}
