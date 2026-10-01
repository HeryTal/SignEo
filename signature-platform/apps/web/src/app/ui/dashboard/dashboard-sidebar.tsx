"use client";

import Link from "next/link";
import { useState } from "react";
import { SigneoLogo } from "../signeo-logo";

type SidebarProps = {
  userName?: string;
  activeWorkspace?: { name: string; role: string };
  workspaces?: unknown[];
  open: boolean;
  onClose: () => void;
  onLogout: () => void;
};

const workspaceLinks = [
  { icon: "⌂", label: "Vue d’ensemble", href: "/dashboard" },
  { icon: "▤", label: "Documents", href: "/dashboard/documents" },
  { icon: "✎", label: "Signatures", href: "/dashboard/enveloppes" },
  { icon: "◌", label: "Modèles", href: "/dashboard/modeles" },
  { icon: "♧", label: "Équipe", href: "/dashboard/equipe" },
];

const toolLinks = [
  { icon: "♙", label: "Contacts", href: "/dashboard/contacts" },
  { icon: "◷", label: "Activité", href: "/dashboard/activite" },
  { icon: "⌘", label: "Développeurs", href: "/dashboard/developpeurs" },
];

export function DashboardSidebar({ userName, activeWorkspace, open, onClose, onLogout }: SidebarProps) {
  const workspaceName = activeWorkspace?.name ?? userName ?? "Mon espace";
  const [logoutConfirmationOpen, setLogoutConfirmationOpen] = useState(false);

  return (
    <aside className={open ? "dashboard-sidebar open" : "dashboard-sidebar"}>
      <Link href="/dashboard" className="brand dashboard-brand" aria-label="Signeo.it, vue d’ensemble"><SigneoLogo /></Link>
      <div className="sidebar-workspace">
        <span className="workspace-avatar">{workspaceName[0].toUpperCase()}</span>
        <span><b>{workspaceName}</b><small>{activeWorkspace?.role ?? "Espace personnel"}</small></span>
      </div>
      <nav className="dashboard-nav" aria-label="Navigation du tableau de bord">
        <p className="sidebar-label">ESPACE DE TRAVAIL</p>
        {workspaceLinks.map((link) => <Link href={link.href} key={link.href} onClick={onClose}><span aria-hidden="true">{link.icon}</span>{link.label}</Link>)}
        <p className="sidebar-label sidebar-label-spaced">OUTILS</p>
        {toolLinks.map((link) => <Link href={link.href} key={link.href} onClick={onClose}><span aria-hidden="true">{link.icon}</span>{link.label}</Link>)}
      </nav>
      <div className="sidebar-bottom">
        <Link href="/dashboard/aide" onClick={onClose}><span aria-hidden="true">?</span>Aide</Link>
        <Link href="/dashboard/parametres" onClick={onClose}><span aria-hidden="true">⚙</span>Paramètres</Link>
        <button type="button" onClick={() => setLogoutConfirmationOpen(true)}><span aria-hidden="true">↪</span>Se déconnecter</button>
      </div>
      {logoutConfirmationOpen && <div className="logout-dialog-backdrop" role="presentation" onMouseDown={() => setLogoutConfirmationOpen(false)}>
        <section className="logout-dialog" role="dialog" aria-modal="true" aria-labelledby="logout-dialog-title" onMouseDown={(event) => event.stopPropagation()}>
          <span className="logout-dialog-icon" aria-hidden="true">↪</span>
          <p className="eyebrow">VOTRE SESSION</p>
          <h2 id="logout-dialog-title">Se déconnecter ?</h2>
          <p>Vous devrez vous reconnecter pour accéder à votre espace et à vos documents.</p>
          <div className="logout-dialog-actions">
            <button type="button" onClick={() => setLogoutConfirmationOpen(false)}>Annuler</button>
            <button type="button" className="logout-confirm" onClick={onLogout}>Se déconnecter</button>
          </div>
        </section>
      </div>}
    </aside>
  );
}
