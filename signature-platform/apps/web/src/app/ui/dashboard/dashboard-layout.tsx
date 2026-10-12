"use client";

import { apiRequest } from "../api-client";
import { ReactNode, useState } from "react";
import { useRouter } from "next/navigation";
import { DashboardSidebar } from "./dashboard-sidebar";
import { useDashboardUser } from "./dashboard-auth-guard";
import { DashboardTopbar } from "./dashboard-topbar";
import { SubscriptionModal } from "./subscription-modal";

type DashboardLayoutProps = { children: ReactNode; title: string; description?: string; eyebrow?: string; actions?: ReactNode };

export function DashboardLayout({ children, title, description, eyebrow = "ESPACE PERSONNEL", actions }: DashboardLayoutProps) {
  const router = useRouter();
  const user = useDashboardUser();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [subscriptionOpen, setSubscriptionOpen] = useState(false);
  async function logout() {
    try { await apiRequest('/auth/logout',{method:'POST'}); }
    catch { /* Always clear local credentials even when the network is unavailable. */ }
    localStorage.removeItem("signeo_access_token"); localStorage.removeItem("signeo_user"); router.replace("/connexion");
  }
  return <main className="dashboard-shell dashboard-layout">
    <button className="dashboard-menu-toggle" type="button" onClick={() => setSidebarOpen(!sidebarOpen)} aria-expanded={sidebarOpen}>☰ <span>Menu</span></button>
    <DashboardSidebar userName={user.name} activeWorkspace={user.activeWorkspace} workspaces={user.workspaces} open={sidebarOpen} onClose={() => setSidebarOpen(false)} onLogout={logout} onOpenSubscription={() => { setSidebarOpen(false); setSubscriptionOpen(true); }} />
    <section className="dashboard-content"><DashboardTopbar userName={user.name} onProfileClick={() => router.push("/dashboard/parametres")} /><div className="dashboard-body dashboard-page-body"><div className="dashboard-title-row"><div><p className="eyebrow">{eyebrow}</p><h2>{title}</h2>{description && <p>{description}</p>}</div>{actions && <div className="dashboard-heading-actions">{actions}</div>}</div>{children}</div></section>
    {subscriptionOpen && <SubscriptionModal onClose={() => setSubscriptionOpen(false)} />}
  </main>;
}
