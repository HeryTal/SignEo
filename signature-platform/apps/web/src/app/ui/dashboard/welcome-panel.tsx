import Link from "next/link";

export function WelcomePanel() {
  return <article className="dashboard-panel dashboard-panel-primary" id="documents"><div className="panel-heading"><div><p className="eyebrow">POUR COMMENCER</p><h3>Votre premier accord vous attend.</h3></div><span className="panel-star" aria-hidden="true">✳</span></div><p>Importez un document, invitez les bonnes personnes et faites avancer votre projet.</p><Link href="/dashboard/enveloppes/nouvelle" className="dashboard-panel-link">Préparer un document <span aria-hidden="true">↗</span></Link></article>;
}
