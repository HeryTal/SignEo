"use client";

type DashboardTopbarProps = { userName?: string; onProfileClick: () => void };

export function DashboardTopbar({ userName, onProfileClick }: DashboardTopbarProps) {
  const initial = (userName?.[0] ?? "S").toUpperCase();
  return <header className="dashboard-topbar"><div><p className="eyebrow">ESPACE PERSONNEL</p><h1>Bonjour {userName?.split(" ")[0] ?? "et bienvenue"}.</h1></div><button className="dashboard-profile" type="button" onClick={onProfileClick}><span>{initial}</span><b>{userName ?? "Mon profil"}</b><small>⌄</small></button></header>;
}
