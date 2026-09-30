"use client";

import { useEffect, useState, type FormEvent } from "react";
import { DashboardLayout } from "@/app/ui/dashboard/dashboard-layout";
import styles from "./developers.module.css";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";
type Key = { id: string; name: string; environment: string; prefix: string; scopes: string[]; createdAt: string; revokedAt: string | null };
type Log = { id: string; method: string; path: string; createdAt: string; keyName: string };
type Tab = "keys" | "logs" | "docs" | "limits";
const tabs: [Tab, string][] = [["keys", "Clés API"], ["logs", "Journal des appels"], ["docs", "Documentation"], ["limits", "Limites"]];
const date = (value: string) => new Date(value).toLocaleString("fr-FR");
const message = (error: unknown) => error instanceof Error ? error.message : "Une erreur est survenue.";

async function request(path: string, options: RequestInit = {}) {
  const response = await fetch(API + path, { ...options, headers: { Authorization: `Bearer ${localStorage.getItem("signeo_access_token") ?? ""}`, "Content-Type": "application/json", ...options.headers } });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(data?.message || `Erreur HTTP ${response.status}.`);
  return data;
}

function Code({ title, value }: { title: string; value: string }) {
  const [status, setStatus] = useState("");
  async function copy() {
    try { await navigator.clipboard.writeText(value); setStatus("Copié ✓"); }
    catch { setStatus("Copie impossible : sélectionnez le texte."); }
  }
  return <div className={styles.code}><div><span>{title}</span><button type="button" onClick={copy}>{status || "Copier"}</button></div><pre><code>{value}</code></pre></div>;
}

export default function DevelopersPage() {
  const [tab, setTab] = useState<Tab>("keys");
  const [keys, setKeys] = useState<Key[]>([]);
  const [logs, setLogs] = useState<Log[]>([]);
  const [admin, setAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [logsLoading, setLogsLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState("");
  const [environment, setEnvironment] = useState("SANDBOX");
  const [filter, setFilter] = useState("ALL");
  const [secret, setSecret] = useState("");
  const [error, setError] = useState("");
  const [test, setTest] = useState("");
  const [testing, setTesting] = useState(false);
  const [revokeTarget, setRevokeTarget] = useState<Key | null>(null);

  useEffect(() => {
    let active = true;
    Promise.all([request("/developer/api-keys"), request("/auth/me")])
      .then(([items, profile]) => { if (active) { setKeys(items); setAdmin(profile.activeWorkspace?.role === "ADMIN"); } })
      .catch((cause) => { if (active) setError(message(cause)); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  async function create(event: FormEvent) {
    event.preventDefault(); if (busy || secret) return;
    setBusy(true); setError(""); setTest("");
    try {
      const { secret: newSecret, ...key } = await request("/developer/api-keys", { method: "POST", body: JSON.stringify({ name: name.trim(), environment, scopes: ["envelopes:read"] }) });
      setSecret(newSecret); setKeys((current) => [key, ...current]); setName(""); setFilter("ALL");
    } catch (cause) { setError(message(cause)); }
    finally { setBusy(false); }
  }

  async function revoke() {
    if (!revokeTarget || busy) return;
    setBusy(true); setError("");
    try {
      const key = await request("/developer/api-keys/" + revokeTarget.id, { method: "DELETE" });
      setKeys((current) => current.map((item) => item.id === key.id ? key : item));
      setRevokeTarget(null); setSecret(""); setTest("");
    } catch (cause) { setError(message(cause)); }
    finally { setBusy(false); }
  }

  async function loadLogs() {
    setTab("logs"); setLogsLoading(true); setError("");
    try { setLogs(await request("/developer/api-keys/logs")); }
    catch (cause) { setError(message(cause)); }
    finally { setLogsLoading(false); }
  }

  async function testKey() {
    setTesting(true); setTest("");
    try {
      const response = await fetch(API + "/v1/envelopes", { headers: { Authorization: "Bearer " + secret } });
      const data = await response.json().catch(() => null);
      setTest(response.ok ? `HTTP ${response.status} — Connexion réussie. ${data?.data?.length ?? 0} enveloppe(s) accessible(s). Retrouvez cet appel dans le journal.` : `HTTP ${response.status} — ${data?.message ?? "Vérifiez la clé et ses permissions."}`);
    } catch { setTest("Connexion impossible. Vérifiez que l’API est démarrée."); }
    finally { setTesting(false); }
  }

  const command = `curl.exe "${API}/v1/envelopes" -H "Authorization: Bearer VOTRE_CLE_API"`;
  const visible = keys.filter((key) => filter === "ALL" || key.environment === filter);
  return <DashboardLayout eyebrow="INTÉGRATIONS" title="Espace développeurs" description="Vos accès, vos appels et les ressources pour connecter Signeo.">
    <div className={styles.root}>
      <section className={styles.hero}><div><span className={styles.eyebrow}>SIGNEO API · V1</span><h3>Vos documents, dans vos outils.</h3><p>Connectez votre application et consultez les enveloppes de votre espace de travail.</p><button onClick={() => setTab("docs")}>Consulter le guide →</button></div><div className={styles.endpoint}><span>POINT D’ACCÈS</span><code>{API}/v1</code><small>Authentification par clé API</small></div></section>
      <nav className={styles.tabs} aria-label="Sections développeurs">{tabs.map(([id, label]) => <button key={id} aria-current={tab === id ? "page" : undefined} onClick={() => id === "logs" ? void loadLogs() : setTab(id)}>{label}</button>)}</nav>
      {error && <p className={styles.error} role="alert">{error}</p>}
      {tab === "keys" && <>
        {secret && <section className={styles.success} aria-label="Nouvelle clé"><span className={styles.eyebrow}>CLÉ CRÉÉE</span><h3>Votre intégration peut commencer.</h3><p>Enregistrez cette clé : elle ne sera plus consultable après fermeture ou rechargement.</p><Code key={secret} title="Clé privée" value={secret}/><div className={styles.actions}><button className={styles.primary} disabled={testing} onClick={testKey}>{testing ? "Test en cours…" : "Tester la connexion"}</button><button className={styles.secondary} onClick={() => { setSecret(""); setTest(""); }}>J’ai enregistré ma clé</button></div>{test && <p role="status">{test}</p>}</section>}
        <div className={styles.grid}><section className={styles.card}><span className={styles.eyebrow}>01 · CRÉER UN ACCÈS</span><h3>Nouvelle clé API</h3><p>Donnez un nom à chaque intégration pour la retrouver facilement.</p>
          {loading ? <p role="status">Chargement des droits…</p> : !admin ? <p className={styles.note}>Seul un administrateur de cet espace peut créer ou révoquer une clé.</p> : <form onSubmit={create}>
            <label className={styles.field}>Nom de l’intégration<input required maxLength={80} value={name} onChange={(event) => setName(event.target.value)} placeholder="Ex. CRM de mon agence"/></label>
            <fieldset className={styles.environments}><legend>Environnement</legend>{["SANDBOX", "PRODUCTION"].map((value) => <label key={value}><input type="radio" name="environment" value={value} checked={environment === value} onChange={() => setEnvironment(value)}/><span><b>{value === "SANDBOX" ? "Sandbox" : "Production"}</b><small>{value === "SANDBOX" ? "Identifier vos essais" : "Identifier votre intégration"}</small></span></label>)}</fieldset>
            <p className={styles.note}>Les deux types de clés accèdent actuellement aux mêmes données de cet espace.</p>
            <fieldset className={styles.permissions}><legend>Permissions</legend><label><input type="checkbox" checked disabled/><span><b>Consulter les enveloppes</b><small>envelopes:read · titres, statuts et nombre de destinataires.</small></span></label><p>L’écriture via l’API publique n’est pas encore disponible.</p></fieldset>
            <button className={styles.primary} disabled={busy || !name.trim() || !!secret}>{busy ? "Création…" : "Générer une clé →"}</button>{secret && <small>Enregistrez puis fermez la clé ci-dessus avant d’en créer une autre.</small>}
          </form>}
        </section><aside className={styles.card}><span className={styles.eyebrow}>02 · CONNECTER</span><h3>Votre premier appel</h3><ol className={styles.steps}><li>Créez et copiez une clé.</li><li>Remplacez VOTRE_CLE_API dans la commande.</li><li>Exécutez-la dans PowerShell.</li></ol><Code title="PowerShell · lecture seule" value={command}/><p>Une réponse avec <code>data</code> confirme l’accès. Une liste vide signifie simplement que l’espace ne contient aucune enveloppe.</p><button className={styles.secondary} onClick={() => setTab("docs")}>Comprendre la réponse →</button></aside></div>
        <section className={styles.card}><div className={styles.heading}><div><span className={styles.eyebrow}>ACCÈS DE L’ESPACE</span><h3>Vos clés <span className={styles.badge}>{keys.length}</span></h3></div><label className={styles.field}>Filtrer<select value={filter} onChange={(event) => setFilter(event.target.value)}><option value="ALL">Tous les environnements</option><option value="SANDBOX">Sandbox</option><option value="PRODUCTION">Production</option></select></label></div>
          {loading ? <p role="status">Chargement des clés…</p> : !visible.length ? <div className={styles.empty}>Aucune clé dans cette sélection. Créez votre premier accès avec le formulaire ci-dessus.</div> : <div className={styles.table}><table><thead><tr><th>Intégration</th><th>Environnement</th><th>Permissions</th><th>Statut</th><th>Action</th></tr></thead><tbody>{visible.map((key) => <tr key={key.id}><td><b>{key.name}</b><small>{key.prefix}…</small><small>Créée le {date(key.createdAt)}</small></td><td>{key.environment === "SANDBOX" ? "Sandbox" : "Production"}</td><td>{key.scopes?.join(", ") || "Aucune permission"}</td><td><span className={styles.badge}>{key.revokedAt ? "Révoquée" : "Active"}</span></td><td>{admin && !key.revokedAt && <button className={styles.danger} onClick={() => setRevokeTarget(key)}>Révoquer</button>}</td></tr>)}</tbody></table></div>}
          {revokeTarget && <div className={styles.confirm} role="group" aria-label="Confirmation de révocation"><p>Révoquer « {revokeTarget.name} » ? Les applications utilisant cette clé perdront immédiatement leur accès.</p><button className={styles.danger} disabled={busy} onClick={revoke}>Confirmer la révocation</button><button className={styles.secondary} disabled={busy} onClick={() => setRevokeTarget(null)}>Annuler</button></div>}
        </section>
      </>}
      {tab === "logs" && <section className={styles.card}><div className={styles.heading}><div><h3>Journal des appels</h3><p>Les 100 derniers appels associés à une clé reconnue. Leur présence ne garantit pas la réussite de la requête.</p></div><button className={styles.secondary} disabled={logsLoading} onClick={loadLogs}>Actualiser</button></div>{logsLoading ? <p role="status">Chargement…</p> : !logs.length ? <div className={styles.empty}>Aucun appel enregistré. Testez une clé pour voir votre première requête ici.</div> : <div className={styles.table}><table><thead><tr><th>Date</th><th>Méthode</th><th>Chemin</th><th>Clé</th></tr></thead><tbody>{logs.map((log) => <tr key={log.id}><td>{date(log.createdAt)}</td><td><span className={styles.badge}>{log.method}</span></td><td><code>{log.path}</code></td><td>{log.keyName}</td></tr>)}</tbody></table></div>}</section>}
      {tab === "docs" && <section className={styles.card}><span className={styles.eyebrow}>GUIDE D’INTÉGRATION</span><h3>De la clé au premier résultat</h3><p>Votre clé est liée à un espace de travail. Conservez-la dans les variables d’environnement de votre serveur, jamais dans le code public d’un site.</p><h4>1. Authentification</h4><p>Chaque appel protégé utilise l’en-tête <code>Authorization: Bearer VOTRE_CLE_API</code>.</p><h4>2. Consulter les enveloppes</h4><p><span className={styles.badge}>GET</span> <code>/v1/envelopes</code> · Permission requise : <code>envelopes:read</code>. Retourne les enveloppes de l’espace, des plus récentes aux plus anciennes, sans pagination.</p><Code title="PowerShell" value={command}/><Code title="JavaScript · côté serveur" value={`const response = await fetch("${API}/v1/envelopes", {
  headers: { Authorization: "Bearer " + process.env.SIGNEO_API_KEY }
});
if (!response.ok) throw new Error("HTTP " + response.status);
const { data } = await response.json();
console.log(data);`}/><h4>3. Lire le résultat</h4><Code title="Exemple du tableau data" value={'[\n  {\n    "id": "identifiant-de-l-enveloppe",\n    "title": "Contrat",\n    "status": "SENT",\n    "createdAt": "2026-09-30T12:00:00.000Z",\n    "recipientCount": 2,\n    "documentCount": 1\n  }\n]'}/><p><code>data</code> contient les enveloppes. <code>limit: 60</code> décrit la limite de débit, pas un nombre de résultats. Le champ <code>remaining</code> est actuellement un texte indicatif, pas un compteur.</p><h4>4. Résoudre une erreur</h4><div className={styles.table}><table><thead><tr><th>Code HTTP</th><th>Signification</th><th>Action</th></tr></thead><tbody>{[["200", "Appel réussi", "Lisez le tableau data, éventuellement vide."], ["401", "Clé absente, invalide ou révoquée", "Vérifiez la clé et le préfixe Bearer."], ["403", "Permission manquante", "Utilisez une clé avec envelopes:read."], ["429", "Trop de requêtes", "Attendez 60 secondes avant de réessayer."]].map((row) => <tr key={row[0]}>{row.map((cell) => <td key={cell}>{cell}</td>)}</tr>)}</tbody></table></div><h4>Spécification OpenAPI</h4><p>Importez cette URL dans Postman ou un outil compatible pour explorer l’endpoint disponible.</p><a className={styles.secondary} href={API + "/v1/openapi.json"} target="_blank" rel="noreferrer">Ouvrir le document OpenAPI ↗</a><p className={styles.note}>Les routes d’écriture, les webhooks et l’isolation des données Sandbox ne sont pas encore disponibles.</p></section>}
      {tab === "limits" && <section className={styles.card}><span className={styles.eyebrow}>DÉBIT PAR CLÉ</span><h3 className={styles.number}>60 <small>requêtes / minute</small></h3><p>Les appels autorisés sont comptés sur les 60 dernières secondes. Lorsque cette limite est atteinte, l’API répond avec le code HTTP 429.</p><p>Les compteurs sont actuellement conservés en mémoire par serveur et remis à zéro au redémarrage. Redis n’est pas encore raccordé au limiteur.</p></section>}
    </div>
  </DashboardLayout>;
}
