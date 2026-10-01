"use client";

import Image from "next/image";
import { useState } from "react";
import apiStyles from "./landing-api.module.css";

const Arrow = () => <span aria-hidden="true">↗</span>;
const steps = [
  { title: "Un document. Et c’est parti.", text: "Contrat, devis ou proposition : tout commence par un document. Découvrez le parcours avec notre exemple.", label: "Préparez", detail: "Votre document est prêt à être partagé." },
  { title: "Les bonnes personnes, au bon endroit.", text: "Un parcours clair pour retrouver les personnes concernées et savoir quelle est la prochaine étape.", label: "Invitez", detail: "Camille Martin · Signataire de démonstration" },
  { title: "Place au prochain chapitre.", text: "Essayez une signature de démonstration. Rien n’est envoyé et aucun engagement n’est créé.", label: "Signez", detail: "À vous de jouer : essayez ci-dessous." },
];

export default function Home() {
  const [menu, setMenu] = useState(false);
  const [step, setStep] = useState(0);
  const [name, setName] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [signed, setSigned] = useState(false);

  return (
    <>
      <a className="skip" href="#contenu">Aller au contenu</a>
      <header className="header wrap">
        <a href="#" className="brand" aria-label="Signeo, accueil"><span className="brand-mark" aria-hidden="true">s.</span>signeo</a>
        <button className="menu-toggle" aria-expanded={menu} aria-controls="navigation" onClick={() => setMenu(!menu)} onKeyDown={e => { if (e.key === "Escape") setMenu(false); }}>{menu ? "Fermer −" : "Menu +"}</button>
        <nav id="navigation" className={menu ? "nav open" : "nav"} aria-label="Navigation principale" onClick={() => setMenu(false)}>
          <a className="mobile-auth-link" href="/connexion">Se connecter</a><a className="mobile-auth-link" href="/inscription">Créer un espace</a>
          <a href="#plateforme">La plateforme</a><a href="#fonctionnement">Comment ça marche</a><a href="#usages">Pour qui ?</a><a href="#api">API</a><a href="#questions">Vos questions</a>
        </nav>
        <a className="button small header-cta" href="#fonctionnement">Découvrir Signeo <Arrow /></a>
      </header>

      <main id="contenu">
        <section className="hero wrap">
          <div className="hero-copy">
            <p className="eyebrow"><span className="status-dot" /> LA SIGNATURE, TOUT SIMPLEMENT.</p>
            <h1>Vos accords.<br />De nouveaux<br /><em>départs.</em><svg className="underline" viewBox="0 0 350 20" aria-hidden="true"><path d="M4 13 Q155 -3 341 8 M70 18 Q214 8 319 15" /></svg></h1>
            <p className="intro">Derrière chaque signature, une histoire commence.<br className="desktop-break" /> Signeo imagine une façon plus simple de signer vos documents et de faire avancer vos projets.</p>
            <a className="button" href="#fonctionnement">Essayez l’expérience <Arrow /></a>
            <p className="micro">Une démo à explorer. Aucun compte à créer.</p>
            <div className="hero-note"><span className="scribble" aria-hidden="true">↳</span> Moins de paperasse.<br />Plus de place pour vos idées.</div>
          </div>
          <div className="hero-visual">
            <div className="photo-arch"><Image src="/images/signing.jpg" alt="Une personne signe un document à son bureau" fill priority sizes="(max-width: 760px) 90vw, 45vw" /></div>
            <div className="round-seal"><span>LE DÉBUT D’UNE</span><b aria-hidden="true">✳</b><span>BELLE HISTOIRE</span></div>
            <div className="floating-doc"><span className="file-icon" aria-hidden="true">↗</span><div><b>Un nouveau projet.pdf</b><span>Le prochain chapitre vous attend</span></div><span className="doc-check" aria-hidden="true">✓</span></div>
            <div className="signature-card"><span>LE PLAISIR D’AVANCER</span><strong>Ensemble.</strong><i aria-hidden="true">✓</i></div>
            <p className="photo-caption">Un petit geste. De grandes perspectives.</p>
          </div>
        </section>

        <div className="ribbon" role="region" aria-label="Simple, fluide, humain">
          <div className="ribbon-track">
            <div className="ribbon-group"><span>Moins de papier</span><b>✳</b><span>Plus de simplicité</span><b>✳</b><span>À votre rythme</span><b>✳</b><span>Place à la suite</span><b>✳</b></div>
            <div className="ribbon-group" aria-hidden="true"><span>Moins de papier</span><b>✳</b><span>Plus de simplicité</span><b>✳</b><span>À votre rythme</span><b>✳</b><span>Place à la suite</span><b>✳</b></div>
          </div>
        </div>

        <section className="section wrap" id="plateforme">
          <div className="section-heading"><p className="eyebrow">LE BON GESTE, AU BON MOMENT</p><h2>La paperasse s’arrête.<br /><em>Votre projet continue.</em></h2><p>Notre ambition : rendre la signature aussi naturelle<br className="desktop-break" /> qu’une poignée de main.</p></div>
          <div className="benefits">
            <article><span className="benefit-icon" aria-hidden="true">↗</span><h3>Gardez votre élan.</h3><p>Un parcours pensé pour passer du document à la signature, sans se perdre dans les étapes.</p></article>
            <article><span className="benefit-icon" aria-hidden="true">⌁</span><h3>Restez sur la même page.</h3><p>Une expérience claire, pour vous comme pour les personnes avec qui vous travaillez.</p></article>
            <article><span className="benefit-icon" aria-hidden="true">✳</span><h3>Faites place à l’essentiel.</h3><p>Moins de tâches administratives dans votre journée. Plus de temps pour ce que vous construisez.</p></article>
          </div>
        </section>

        <section className="demo-section" id="fonctionnement"><div className="wrap demo-grid">
          <div className="demo-copy"><p className="eyebrow">DU PREMIER CLIC AU DERNIER TRAIT</p><h2>Trois étapes.<br /><em>Et la vie reprend.</em></h2><p className="section-lead">Prenez une minute pour découvrir l’expérience.</p>
            <div className="steps" aria-label="Étapes de la démonstration">{steps.map((item, index) => <button key={item.label} className={step === index ? "step active" : "step"} aria-pressed={step === index} onClick={() => setStep(index)}><span>0{index + 1}</span><b>{item.label}</b><span aria-hidden="true">↗</span></button>)}</div>
            <div className="step-explanation"><h3>{steps[step].title}</h3><p>{steps[step].text}</p></div>
          </div>
          <div className="demo-window"><div className="window-bar"><span><i /><i /><i /></span><span>signeo / votre espace</span><span aria-hidden="true">↗</span></div><div className="document-area">
            <div className="document-top"><span className="mini-brand">signeo.</span><span className="pill">DÉMONSTRATION</span></div>
            <p className="document-overline">LES BELLES COLLABORATIONS COMMENCENT ICI</p><h3>Un projet qui<br />nous ressemble.</h3><div className="document-lines"><i /><i /><i /></div>
            <div className="document-details"><span>DOCUMENT<b>Accord de collaboration</b></span><span>RÉFÉRENCE<b>DEMO — 001</b></span></div>
            <div className="sign-box"><span>VOTRE SIGNATURE</span><strong className={signed ? "signed-name" : "placeholder-signature"}>{signed ? name.trim() : "À vous d’écrire la suite…"}</strong>{signed && <span className="signed-check">✓ Démonstration terminée</span>}</div>
            <p className="demo-status" role="status">{signed ? "Votre essai est terminé. Aucune signature réelle n’a été créée." : steps[step].detail}</p>
            {step < 2 ? <button className="button demo-button" onClick={() => setStep(step + 1)}>Passer à l’étape suivante <Arrow /></button> : signed ? <button className="button demo-button" onClick={() => { setSigned(false); setName(""); setAgreed(false); setStep(0); }}>Recommencer la démo ↻</button> : <form onSubmit={e => { e.preventDefault(); if (name.trim() && agreed) setSigned(true); }}>
              <label className="name-label" htmlFor="signature-name">Votre prénom et nom</label><input id="signature-name" autoComplete="name" maxLength={60} value={name} onChange={e => setName(e.target.value)} placeholder="Ex. Camille Martin" required />
              <label className="checkbox-label"><input type="checkbox" checked={agreed} onChange={e => setAgreed(e.target.checked)} required /> Je comprends qu’il s’agit d’une simulation.</label><button className="button demo-button" type="submit" disabled={!name.trim() || !agreed}>Essayer ma signature <Arrow /></button>
            </form>}
          </div><p className="demo-disclaimer">Exemple fictif · Aucun envoi · Sans valeur juridique</p></div>
        </div></section>

        <section className="section wrap" id="usages"><div className="uses-heading"><div><p className="eyebrow">POUR CEUX QUI FONT BOUGER LES CHOSES</p><h2>À chaque métier,<br /><em>son prochain chapitre.</em></h2></div><p>Vous créez, accompagnez, recrutez.<br />Nous pensons à vos accords du quotidien.</p></div>
          <div className="use-cards">{[
            { image: "freelance.jpg", alt: "Une indépendante travaille sur son ordinateur", tag: "INDÉPENDANTS", title: "Vos idées prennent vie.", text: "Devis, missions et nouveaux clients. Posez les bases d’une belle collaboration." },
            { image: "team.jpg", alt: "Une équipe collabore autour d’une table", tag: "ÉQUIPES & AGENCES", title: "Le collectif avance.", text: "Propositions et accords de partenariat. Donnez le feu vert aux projets d’équipe." },
            { image: "signing.jpg", alt: "Signature d’un accord professionnel", tag: "PETITES ENTREPRISES", title: "Chaque accord compte.", text: "Prestations et contrats commerciaux. Une expérience pensée à votre échelle." },
          ].map(item => <a href="#fonctionnement" className="use-card" key={item.tag}><div className="card-image"><Image src={`/images/${item.image}`} alt={item.alt} fill sizes="(max-width: 760px) 90vw, 30vw" /><span className="card-arrow"><Arrow /></span></div><span className="eyebrow">{item.tag}</span><h3>{item.title}</h3><p>{item.text}</p></a>)}</div>
        </section>

        <section className={apiStyles.section} id="api" aria-labelledby="api-title">
          <div className={"wrap " + apiStyles.grid}>
            <div>
              <p className="eyebrow">POUR LES ÉQUIPES QUI CONNECTENT LEURS OUTILS</p>
              <h2 id="api-title">Vos accords.<br /><em>Dans votre écosystème.</em></h2>
              <p className={apiStyles.intro}>Retrouvez le statut de vos enveloppes depuis votre application, votre CRM ou un outil interne grâce à l’API REST Signeo.</p>
              <ul className={apiStyles.features}>
                <li><span aria-hidden="true">⌘</span><div><b>Un accès pour chaque intégration</b><p>Créez une clé liée à votre espace de travail et révoquez-la lorsque vous n’en avez plus besoin.</p></div></li>
                <li><span aria-hidden="true">↗</span><div><b>Vos enveloppes, à portée d’appel</b><p>Consultez leurs titres, leurs statuts et le nombre de documents et de destinataires.</p></div></li>
                <li><span aria-hidden="true">✓</span><div><b>Un démarrage accompagné</b><p>Exemples copiables, test de connexion, journal des appels et documentation OpenAPI dans votre espace Développeurs.</p></div></li>
              </ul>
              <a href="/developers" className="button">Consulter la documentation API <Arrow /></a>
              <p className={apiStyles.note}>Documentation accessible sans compte · Clés API dans votre espace privé</p>
            </div>
            <div className={apiStyles.example}>
              <div className={apiStyles.bar}><span>VOTRE PREMIER APPEL</span><span>REST · JSON</span></div>
              <div className={apiStyles.code}>
                <p><span className={apiStyles.method}>GET</span> /v1/envelopes</p>
                <pre><code>{"Authorization: Bearer VOTRE_CLE_API"}</code></pre>
                <div className={apiStyles.response}><span>EXEMPLE DE RÉPONSE</span><span>200 OK</span></div>
                <pre><code>{'{\n  "data": [\n    {\n      "title": "Accord de collaboration",\n      "status": "COMPLETED",\n      "recipientCount": 2,\n      "documentCount": 1\n    }\n  ]\n}'}</code></pre>
                <small>Extrait illustratif · Données fictives</small>
              </div>
              <div className={apiStyles.caption}>Lecture des enveloppes disponible · 60 requêtes par minute et par clé</div>
            </div>
          </div>
        </section>

        <section className="closing wrap"><span className="closing-star" aria-hidden="true">✳</span><p className="eyebrow">LES BELLES HISTOIRES COMMENCENT PAR UN OUI.</p><h2>On signe pour<br /><em>la suite ?</em></h2><p>Découvrez aujourd’hui les premiers traits de Signeo.</p><a href="#fonctionnement" className="button light">Explorer la démo <Arrow /></a><span className="closing-note">Simplement. Humainement.</span></section>

        <section className="section wrap faq" id="questions"><div><p className="eyebrow">TOUT SIMPLEMENT</p><h2>Quelques questions.<br /><em>Des réponses claires.</em></h2></div><div className="faq-list">{[
          ["Est-ce que je peux déjà signer mes contrats ?", "Pas encore. Signeo est en cours de développement. Cette page présente une démonstration interactive avec un document fictif ; elle ne crée aucune signature électronique réelle."],
          ["Dois-je créer un compte pour essayer ?", "Non. Vous pouvez explorer les trois étapes et essayer la simulation de signature directement sur cette page, sans inscription."],
          ["Que deviennent les informations saisies dans la démo ?", "Le nom que vous saisissez reste dans l’état de cette page, dans votre navigateur. Le formulaire ne l’envoie à aucun serveur. Il disparaît lorsque vous rechargez la page."],
          ["Est-ce utilisable sur mobile ?", "Oui, cette démonstration est conçue pour être explorée sur téléphone, tablette et ordinateur, depuis votre navigateur."],
          ["Quels seront les tarifs de Signeo ?", "Les offres et les tarifs ne sont pas encore définis. Cette démonstration est accessible gratuitement et sans engagement."],
          ["Puis-je connecter mon logiciel à Signeo ?", "Oui. L’API permet actuellement de consulter les enveloppes de votre espace avec une clé API. La documentation est accessible sans compte depuis le bouton Documentation API. Connectez-vous à l’espace Développeurs pour créer une clé et tester un appel. La création et l’envoi d’enveloppes par l’API publique ainsi que les webhooks ne sont pas encore disponibles."],
        ].map(([q, a]) => <details key={q}><summary>{q}<span aria-hidden="true">+</span></summary><p>{a}</p></details>)}</div></section>
      </main>
      <footer className="footer wrap"><div className="footer-top"><a className="brand" href="#"><span className="brand-mark" aria-hidden="true">s.</span>signeo</a><p>Un petit geste.<br />De nouveaux possibles.</p><a href="#fonctionnement">Découvrir l’expérience <Arrow /></a></div><div className="footer-bottom"><span>© {new Date().getFullYear()} Signeo · Plateforme en développement</span><a href="#questions">Une question ?</a><span>Imaginé pour vous faire avancer.</span></div></footer>
    </>
  );
}
