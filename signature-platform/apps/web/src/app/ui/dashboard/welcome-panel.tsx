import Link from "next/link";

export function WelcomePanel() {
  return <article className="dashboard-panel dashboard-panel-primary dashboard-quick-start" id="documents"><div><p className="eyebrow">VOTRE PROCHAIN ACCORD</p><h3>Un document. Quelques clics. C’est signé.</h3><p>Importez votre document et invitez les bonnes personnes.</p></div><Link href="/dashboard/enveloppes/nouvelle" className="button light small">Préparer un document <span aria-hidden="true">↗</span></Link></article>;
}
