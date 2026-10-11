"use client";

import { createContext, useContext, useCallback, useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

type DashboardUser = { name?: string; activeWorkspace?: { id: string; name: string; role: string }; workspaces?: { id: string; name: string; role: string }[] };
const DashboardUserContext = createContext<DashboardUser | null>(null);
export function useDashboardUser() {
  const user = useContext(DashboardUserContext);
  if (!user) throw new Error("DashboardUserContext is required");
  return user;
}

export function DashboardAuthGuard({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [user, setUser] = useState<DashboardUser | null>(null);

  const checkSession = useCallback(async () => {
    const token = localStorage.getItem("signeo_access_token");

    if (!token) {
      router.replace("/connexion");
      return;
    }

    try {
      const response = await fetch(`${API}/auth/me`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });

      if (!response.ok) throw new Error("SESSION_INVALID");
      const profile: DashboardUser = await response.json();
      setUser(profile);
      localStorage.setItem("signeo_user", JSON.stringify(profile));
    } catch {
      localStorage.removeItem("signeo_access_token");
      localStorage.removeItem("signeo_user");
      router.replace("/connexion");
    }
  }, [router]);

  useEffect(() => {
    const timer = window.setTimeout(() => void checkSession(), 0);

    const onPageShow = (event: PageTransitionEvent) => {
      if (event.persisted) { setUser(null); void checkSession(); }
    };
    window.addEventListener("pageshow", onPageShow);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("pageshow", onPageShow);
    };
  }, [checkSession]);

  if (!user) {
    return <main className="dashboard-auth-check" aria-live="polite" aria-label="Vérification de votre session"><span className="dashboard-auth-spinner" aria-hidden="true" /></main>;
  }

  return <DashboardUserContext.Provider value={user}>{children}</DashboardUserContext.Provider>;
}
