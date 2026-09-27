"use client";

import { FormEvent, useEffect, useState } from "react";
import { DashboardLayout } from "@/app/ui/dashboard/dashboard-layout";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";
type Branding = { displayName: string; accentColor: string; logoUrl: string; textFont: "SANS" | "SERIF" | "MONO"; signatureFont: "SCRIPT" | "SERIF" | "SANS"; textColor: string; signatureColor: string; textSize: number; signatureSize: number };

export default function SettingsPage() {
  const [branding, setBranding] = useState<Branding>({ displayName: "Signeo", accentColor: "#496b50", logoUrl: "", textFont: "SANS", signatureFont: "SCRIPT", textColor: "#24352b", signatureColor: "#315b45", textSize: 11, signatureSize: 22 });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  useEffect(() => {
    const token = localStorage.getItem("signeo_access_token");
    if (!token) return;
    fetch(`${API}/auth/me`, { headers: { Authorization: `Bearer ${token}` } })
      .then(async (response) => { if (response.ok) { const profile = await response.json(); if (profile.branding) setBranding(profile.branding); } })
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
          {branding.logoUrl ? <img src={branding.logoUrl} alt="Logo" /> : <span className="brand-mark" style={{ background: branding.accentColor }}>s.</span>}
          <b>{branding.displayName || "Votre organisation"}</b>
        </div>
        <h2>Une invitation vous attend</h2><p style={{ fontFamily: branding.textFont === "SERIF" ? "Georgia, serif" : branding.textFont === "MONO" ? "monospace" : "Arial, sans-serif", fontSize: branding.textSize, color: branding.textColor }}>Consultez le document et suivez les étapes de signature dans cet espace sécurisé.</p>
        <div className="style-signature-preview" style={{ fontFamily: branding.signatureFont === "SCRIPT" || branding.signatureFont === "SERIF" ? "Georgia, serif" : "Arial, sans-serif", fontSize: branding.signatureSize, color: branding.signatureColor }}>Votre signature</div>
        <button type="button" style={{ background: branding.accentColor }}>Consulter le document</button>
        <small>La couleur et le nom sont enregistrés dans PostgreSQL avec votre compte.</small>
      </section>
    </div>
  </DashboardLayout>;
}
