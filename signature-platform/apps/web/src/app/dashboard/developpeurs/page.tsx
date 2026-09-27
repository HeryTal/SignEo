"use client";

import { useState } from "react";
import { DashboardLayout } from "@/app/ui/dashboard/dashboard-layout";

export default function DevelopersPage() {
  const [environment, setEnvironment] = useState<"sandbox" | "production">("sandbox");
  const [apiKey, setApiKey] = useState("");

  function createKey() {
    setApiKey(`signeo_${environment}_${crypto.randomUUID().replaceAll("-", "").slice(0, 24)}`);
  }

  return <DashboardLayout eyebrow="DÉVELOPPEURS" title="Clés API" description="Connectez Signeo à vos outils et automatisez vos signatures.">
    <div className="developer-intro"><div><p>Pour intégrer Signeo, utilisez notre API REST et consultez la documentation.</p><a className="dashboard-outline-button" href="#documentation">Documentation ↗</a></div><button className="button" type="button" onClick={createKey}>Créer une nouvelle clé</button></div>
    <div className="developer-tabs" role="tablist"><button className={environment === "production" ? "" : "active"} type="button" onClick={() => setEnvironment("sandbox")}>Sandbox</button><button className={environment === "production" ? "active" : ""} type="button" onClick={() => setEnvironment("production")}>Production</button></div>
    <section className="developer-card"><p className="eyebrow">ENVIRONNEMENT {environment.toUpperCase()}</p>{apiKey ? <div className="developer-key-created"><h3>Votre clé est prête.</h3><code>{apiKey}</code><p>Copiez-la maintenant : elle ne sera plus affichée après cette session.</p><button className="dashboard-outline-button" type="button" onClick={() => navigator.clipboard?.writeText(apiKey)}>Copier la clé</button></div> : <div className="dashboard-empty-page developer-empty"><span aria-hidden="true">⌘</span><h3>Aucune clé API dans cet environnement</h3><p>Créez une clé pour connecter votre application Signeo.</p><button className="dashboard-outline-button" type="button" onClick={createKey}>Créer une clé {environment}</button></div>}</section>
    <section className="developer-docs" id="documentation"><div><p className="eyebrow">PREMIERS PAS</p><h3>Une intégration simple.</h3><p>Les clés Sandbox servent à tester sans créer de signature réelle. Utilisez Production uniquement lorsque votre intégration est prête.</p></div><pre><code>{`curl https://api.signeo.fr/v1/envelopes \\\n  -H "Authorization: Bearer VOTRE_CLE" \\\n  -H "Content-Type: application/json"`}</code></pre></section>
  </DashboardLayout>;
}
