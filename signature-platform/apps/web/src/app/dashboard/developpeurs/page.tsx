"use client";

import { FormEvent, useEffect, useState } from "react";
import { DashboardLayout } from "@/app/ui/dashboard/dashboard-layout";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";
type Environment = "SANDBOX" | "PRODUCTION";
type ApiKey = { id: string; name: string; environment: Environment; prefix: string; createdAt: string; lastUsedAt: string | null; revokedAt: string | null };

export default function DevelopersPage() {
  const [environment, setEnvironment] = useState<Environment>("SANDBOX");
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [name, setName] = useState("");
  const [secret, setSecret] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const headers = () => ({ "Content-Type": "application/json", Authorization: `Bearer ${localStorage.getItem("signeo_access_token") ?? ""}` });
  async function load() { const response = await fetch(`${API}/developer/api-keys`, { headers: { Authorization: `Bearer ${localStorage.getItem("signeo_access_token") ?? ""}` } }); if (response.ok) setKeys(await response.json()); else setNotice("Impossible de charger les clés API."); }
  useEffect(() => { load(); }, []);
  async function create(event: FormEvent) { event.preventDefault(); setBusy(true); setNotice(""); const response = await fetch(`${API}/developer/api-keys`, { method: "POST", headers: headers(), body: JSON.stringify({ name, environment }) }); const data = await response.json().catch(() => null); if (!response.ok) setNotice(data?.message ?? "Impossible de créer la clé."); else { setSecret(data.secret); setName(""); setKeys((current) => [{ ...data, secret: undefined }, ...current]); } setBusy(false); }
  async function revoke(key: ApiKey) { if (!window.confirm(`Révoquer la clé « ${key.name} » ? Cette action est définitive.`)) return; const response = await fetch(`${API}/developer/api-keys/${key.id}`, { method: "DELETE", headers: { Authorization: `Bearer ${localStorage.getItem("signeo_access_token") ?? ""}` } }); const data = await response.json().catch(() => null); if (!response.ok) setNotice(data?.message ?? "Impossible de révoquer la clé."); else setKeys((current) => current.map((item) => item.id === key.id ? data : item)); }
  const visible = keys.filter((key) => key.environment === environment);
  return <DashboardLayout eyebrow="DÉVELOPPEURS" title="Clés API" description="Créez et gérez les accès de vos intégrations à Signeo.">
    <div className="developer-intro"><div><p>Une clé API permet à un logiciel externe de consulter les enveloppes de cet espace via notre API REST.</p><a className="dashboard-outline-button" href="#documentation">Documentation ↗</a></div></div>
    <div className="developer-tabs" role="tablist"><button className={environment === "SANDBOX" ? "active" : ""} type="button" onClick={() => setEnvironment("SANDBOX")}>Sandbox</button><button className={environment === "PRODUCTION" ? "active" : ""} type="button" onClick={() => setEnvironment("PRODUCTION")}>Production</button></div>
    <section className="developer-card"><p className="eyebrow">ENVIRONNEMENT {environment}</p>{secret && <div className="developer-key-created"><h3>Copiez votre nouvelle clé maintenant.</h3><code>{secret}</code><p>Pour votre sécurité, Signeo ne l’affichera plus après cette page.</p><button className="dashboard-outline-button" type="button" onClick={() => navigator.clipboard.writeText(secret)}>Copier la clé</button></div>}<form className="developer-key-form" onSubmit={create}><label className="form-field">Nom de la clé<input required maxLength={80} value={name} onChange={(event) => setName(event.target.value)} placeholder="Ex. Intégration CRM" /></label><button className="button" disabled={busy} type="submit">Créer une clé {environment.toLowerCase()}</button></form>{visible.length ? <div className="developer-key-list">{visible.map((key) => <article key={key.id}><div><b>{key.name}</b><small><code>{key.prefix}…</code> · créée le {new Date(key.createdAt).toLocaleDateString("fr-FR")}{key.lastUsedAt ? ` · utilisée le ${new Date(key.lastUsedAt).toLocaleDateString("fr-FR")}` : ""}</small></div>{key.revokedAt ? <em>Révoquée</em> : <button className="dashboard-outline-button" type="button" onClick={() => revoke(key)}>Révoquer</button>}</article>)}</div> : <p className="workflow-hint">Aucune clé active dans cet environnement.</p>}</section>
    {notice && <p className="workflow-hint" role="status">{notice}</p>}
    <section className="developer-docs" id="documentation"><div><p className="eyebrow">PREMIER APPEL</p><h3>Lire vos enveloppes.</h3><p>Ajoutez la clé dans l’en-tête Authorization. La limite actuelle est de 60 requêtes par minute et par clé.</p></div><pre><code>{`curl http://localhost:3001/v1/envelopes \\
  -H "Authorization: Bearer VOTRE_CLE_API"`}</code></pre></section>
  </DashboardLayout>;
}
