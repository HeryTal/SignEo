"use client";

import Link from "next/link";

type DashboardSidebarProps = { userName?: string; open: boolean; onClose: () => void; onLogout: () => void };

export function DashboardSidebar({ userName, open, onClose, onLogout }: DashboardSidebarProps) {
  const initial = (userName?.[0] ?? "S").toUpperCase();
  const mainLinks = [["⌂", "Vue d’ensemble", "/dashboard"], ["▣", "Documents", "/dashboard/documents"], ["✎", "Signatures", "/dashboard/enveloppes"], ["◌", "Modèles", "/dashboard/modeles"]];
  return <aside className={open ? "dashboard-sidebar open" : "dashboard-sidebar"}>
    <Link href="/" className="brand dashboard-brand" aria-label="Signeo, accueil"><span className="brand-mark" aria-hidden="true">s.</span>signeo</Link>
    <div className="sidebar-workspace"><span className="workspace-avatar">{initial}</span><span><b>{userName ?? "Mon espace"}</b><small>Espace personnel</small></span><span className="workspace-chevron">⌄</span></div>
    <nav className="dashboard-nav" aria-label="Navigation du tableau de bord"><p className="sidebar-label">ESPACE DE TRAVAIL</p>{mainLinks.map(([icon, label, href]) => <a href={href} key={label} onClick={onClose}><span aria-hidden="true">{icon}</span>{label}</a>)}<p className="sidebar-label sidebar-label-spaced">OUTILS</p><a href="/dashboard/contacts"><span aria-hidden="true">♧</span>Contacts</a><a href="/dashboard/activite"><span aria-hidden="true">◷</span>Activité</a></nav>
    <div className="sidebar-bottom"><a href="/dashboard/aide"><span aria-hidden="true">?</span>Aide</a><a href="/dashboard/parametres"><span aria-hidden="true">⚙</span>Paramètres</a><a href="/dashboard/developpeurs"><span aria-hidden="true">⌘</span>Développeurs</a><button type="button" onClick={onLogout}><span aria-hidden="true">↪</span>Se déconnecter</button></div>
  </aside>;
}
