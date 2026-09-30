"use client";
import { ReactNode, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { DashboardSidebar } from "./dashboard-sidebar";
import { DashboardTopbar } from "./dashboard-topbar";
type DashboardLayoutProps = { children: ReactNode; title: string; description?: string; eyebrow?: string };
type User = { name?: string; activeWorkspace?: { id: string; name: string; role: string }; workspaces?: { id: string; name: string; role: string }[] };
export function DashboardLayout({ children, title, description, eyebrow = "ESPACE PERSONNEL" }: DashboardLayoutProps) {
  const router = useRouter(); const [user, setUser] = useState<User>({}); const [sidebarOpen, setSidebarOpen] = useState(false);
  useEffect(() => { const token = localStorage.getItem("signeo_access_token"); if (!token) { router.replace("/connexion"); return; } fetch(`${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001"}/auth/me`, { headers: { Authorization: `Bearer ${token}` } }).then(async (response) => { if (response.status === 401 || response.status === 403) throw new Error("AUTH_INVALID"); if (!response.ok) throw new Error("AUTH_NETWORK"); return response.json(); }).then((profile) => { setUser(profile); localStorage.setItem("signeo_user", JSON.stringify(profile)); }).catch((error: Error) => { if (error.message === "AUTH_INVALID") { localStorage.removeItem("signeo_access_token"); localStorage.removeItem("signeo_user"); router.replace("/connexion"); } }); }, [router]);
  function logout() { localStorage.removeItem("signeo_access_token"); localStorage.removeItem("signeo_user"); router.replace("/connexion"); }
  return <main className="dashboard-shell dashboard-layout"><button className="dashboard-menu-toggle" type="button" onClick={() => setSidebarOpen(!sidebarOpen)} aria-expanded={sidebarOpen}>☰ <span>Menu</span></button><DashboardSidebar userName={user.name} activeWorkspace={user.activeWorkspace} workspaces={user.workspaces} open={sidebarOpen} onClose={() => setSidebarOpen(false)} onLogout={logout} /><section className="dashboard-content"><DashboardTopbar userName={user.name} onProfileClick={() => router.push("/dashboard/parametres")} /><div className="dashboard-body dashboard-page-body"><div className="dashboard-title-row"><div><p className="eyebrow">{eyebrow}</p><h2>{title}</h2>{description && <p>{description}</p>}</div></div>{children}</div></section></main>;
}
