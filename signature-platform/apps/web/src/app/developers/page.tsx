import type { Metadata } from "next";
import Link from "next/link";
import { CodeExample } from "./code-example";
import styles from "./developers.module.css";

export const metadata: Metadata = {
  title: "Documentation API | Signeo",
  description: "Connectez vos outils à Signeo : authentification, exemples d’appels API et guide des erreurs.",
};

const API = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001").replace(/\/$/, "");
const sections = [
  ["demarrage", "Premiers pas"],
  ["authentification", "Authentification"],
  ["enveloppes", "Lire les enveloppes"],
  ["erreurs", "Résoudre une erreur"],
  ["limites", "Limites et disponibilité"],
  ["openapi", "OpenAPI"],
];

export default function DevelopersDocumentation() {
  return <div className={styles.page}>
    <a className="skip" href="#documentation">Aller à la documentation</a>
    <header className={styles.header}>
      <Link className="brand" href="/" aria-label="Signeo, accueil"><span className="brand-mark" aria-hidden="true">s.</span>signeo</Link>
      <span className={styles.label}>DEVELOPERS · V1</span>
      <Link className={styles.manage} href="/dashboard/developpeurs">Gérer mes clés API ↗</Link>
    </header>
    <section className={styles.hero}>
      <p className="eyebrow">DOCUMENTATION PUBLIQUE</p>
      <h1>Vos outils.<br /><em>Vos accords, connectés.</em></h1>
      <p>Consultez les enveloppes de votre espace depuis votre application. Tout pour réussir votre premier appel à l’API Signeo, sans compte pour lire ce guide.</p>
      <a className="button" href="#demarrage">Commencer l’intégration ↓</a>
    </section>
    <div className={styles.layout}>
      <nav className={styles.navigation} aria-label="Sommaire de la documentation"><p className="eyebrow">DANS CE GUIDE</p>{sections.map(([id, label]) => <a href={"#" + id} key={id}>{label}</a>)}</nav>
      <main id="documentation" className={styles.content}>
        <section id="demarrage">
          <span className={styles.label}>01 · PREMIERS PAS</span><h2>Un premier résultat en trois étapes.</h2>
          <ol><li><Link href="/inscription">Créez un compte</Link> ou <Link href="/connexion">connectez-vous</Link>.</li><li>Dans <Link href="/dashboard/developpeurs">Développeurs → Clés API</Link>, un administrateur peut générer une clé de lecture pour l’espace de travail.</li><li>Copiez la clé affichée une seule fois, puis utilisez-la dans l’exemple ci-dessous.</li></ol>
          <p>Le bouton « Tester la connexion » de l’espace privé permet également de vérifier une nouvelle clé.</p>
          <div className={styles.note}><b>Adresse de l’API</b><code>{API}/v1</code><small>Les exemples utilisent l’adresse configurée pour ce site. En local, le serveur API doit être démarré sur le port 3001.</small></div>
        </section>
        <section id="authentification">
          <span className={styles.label}>02 · AUTHENTIFICATION</span><h2>Une clé pour votre intégration.</h2>
          <p>Ajoutez la clé à l’en-tête HTTP <code>Authorization</code>. Elle donne accès aux enveloppes de l’espace auquel elle appartient, avec les permissions attribuées à sa création.</p>
          <CodeExample title="En-tête HTTP" code="Authorization: Bearer VOTRE_CLE_API"/>
          <p>Conservez la clé dans une variable d’environnement de votre serveur. Ne l’intégrez pas au code public du navigateur. Une clé révoquée cesse de fonctionner ; créez une nouvelle clé pour remplacer un accès.</p>
        </section>
        <section id="enveloppes">
          <span className={styles.label}>03 · ENDPOINT DISPONIBLE</span><h2>Lire les enveloppes.</h2>
          <p><span className={styles.method}>GET</span> <code>/v1/envelopes</code></p>
          <p>Permission requise : <code>envelopes:read</code>. Cette route renvoie les enveloppes de l’espace, des plus récentes aux plus anciennes. Elle n’accepte pas de paramètres de pagination.</p>
          <CodeExample title="PowerShell" code={`curl.exe "${API}/v1/envelopes" -H "Authorization: Bearer VOTRE_CLE_API"`}/>
          <CodeExample title="JavaScript · côté serveur" code={`const response = await fetch("${API}/v1/envelopes", {
  headers: {
    Authorization: "Bearer " + process.env.SIGNEO_API_KEY
  }
});

if (!response.ok) {
  throw new Error("Erreur API : HTTP " + response.status);
}

const { data } = await response.json();
console.log(data);`}/>
          <h3>Comprendre la réponse</h3><p>Un code HTTP 200 confirme la réussite de l’appel. Le tableau <code>data</code> peut être vide si aucune enveloppe n’est présente.</p>
          <CodeExample title="Réponse illustrative · données fictives" code={JSON.stringify({ data: [{ id: "identifiant-de-l-enveloppe", title: "Accord de collaboration", status: "COMPLETED", createdAt: "2026-09-30T12:00:00.000Z", recipientCount: 2, documentCount: 1 }], limit: 60, remaining: "Voir l’en-tête X-RateLimit-Remaining dans une prochaine version." }, null, 2)}/>
          <div className={styles.table}><table><thead><tr><th>Champ</th><th>Description</th></tr></thead><tbody>{[
            ["id", "Identifiant de l’enveloppe."], ["title", "Titre du dossier."], ["status", "État : DRAFT, SENT, PARTIALLY_SIGNED, COMPLETED, VOIDED ou EXPIRED."], ["createdAt", "Date de création au format ISO 8601."], ["recipientCount", "Nombre de destinataires."], ["documentCount", "Nombre de documents."],
          ].map(([field, description]) => <tr key={field}><td><code>{field}</code></td><td>{description}</td></tr>)}</tbody></table></div>
          <p><code>limit</code> indique le débit maximal, pas le nombre de résultats. Le champ <code>remaining</code> est un texte indicatif ; aucun compteur restant ni en-tête de quota n’est actuellement fourni.</p>
        </section>
        <section id="erreurs">
          <span className={styles.label}>04 · DÉPANNAGE</span><h2>Comprendre les erreurs.</h2>
          <div className={styles.table}><table><thead><tr><th>HTTP</th><th>Cause</th><th>Que faire ?</th></tr></thead><tbody>{[
            ["401", "Clé absente, invalide ou révoquée.", "Vérifiez la clé et le préfixe Bearer."],
            ["403", "Permission insuffisante.", "Utilisez une clé avec envelopes:read."],
            ["429", "Limite de débit atteinte.", "Attendez 60 secondes avant de réessayer."],
          ].map(([status, cause, action]) => <tr key={status}><td><b>{status}</b></td><td>{cause}</td><td>{action}</td></tr>)}</tbody></table></div>
          <p>Une connexion refusée signifie que l’API n’est pas joignable : vérifiez son démarrage et l’adresse utilisée. Consultez aussi le journal dans votre espace Développeurs. Un appel enregistré n’est pas nécessairement un appel réussi.</p>
        </section>
        <section id="limites">
          <span className={styles.label}>05 · DISPONIBILITÉ</span><h2>Ce que vous pouvez utiliser aujourd’hui.</h2>
          <ul><li>Lecture des enveloppes : disponible, avec 60 requêtes par minute par clé.</li><li>Sandbox et Production : deux types de clés qui accèdent actuellement aux mêmes données de l’espace.</li><li>Création et envoi via l’API publique, webhooks : pas encore disponibles.</li><li>Limiteur : compteurs en mémoire par serveur, réinitialisés au redémarrage. Redis n’est pas encore raccordé.</li></ul>
        </section>
        <section id="openapi">
          <span className={styles.label}>06 · OUTILLAGE</span><h2>Explorez la spécification.</h2>
          <p>Le document OpenAPI décrit l’endpoint public et ses réponses. Importez son URL dans Postman ou un outil compatible. Le serveur API doit être accessible pour le consulter.</p>
          <CodeExample title="URL OpenAPI" code={API + "/v1/openapi.json"}/>
          <a className="button" href={API + "/v1/openapi.json"} target="_blank" rel="noreferrer">Ouvrir OpenAPI JSON ↗</a>
        </section>
      </main>
    </div>
    <footer className={styles.footer}><Link href="/">← Retour à Signeo</Link><span>Documentation API · v1</span><Link href="/dashboard/developpeurs">Gérer mes clés API ↗</Link></footer>
  </div>;
}
