"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

export function DashboardAuthGuard({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [authorised, setAuthorised] = useState(false);

  const checkSession = useCallback(async () => {
    setAuthorised(false);
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
      setAuthorised(true);
    } catch {
      localStorage.removeItem("signeo_access_token");
      localStorage.removeItem("signeo_user");
      router.replace("/connexion");
    }
  }, [router]);

  useEffect(() => {
    void checkSession();

    const onPageShow = (event: PageTransitionEvent) => {
      if (event.persisted) void checkSession();
    };
    window.addEventListener("pageshow", onPageShow);
    return () => window.removeEventListener("pageshow", onPageShow);
  }, [checkSession]);

  if (!authorised) {
    return <main className="dashboard-auth-check" aria-live="polite">Vérification de votre session…</main>;
  }

  return <>{children}</>;
}
