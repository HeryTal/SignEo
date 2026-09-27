"use client";

import { DashboardLayout } from "@/app/ui/dashboard/dashboard-layout";
import { ActivityPanel } from "@/app/ui/dashboard/activity-panel";
import { RecentDocuments } from "@/app/ui/dashboard/recent-documents";
import { StatCard } from "@/app/ui/dashboard/stat-card";
import { WelcomePanel } from "@/app/ui/dashboard/welcome-panel";
import Link from "next/link";
import { useEffect, useState } from "react";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";
type DashboardEnvelope = { status: string; createdAt: string };

export default function DashboardPage() {
  const [envelopes, setEnvelopes] = useState<DashboardEnvelope[]>([]);
  useEffect(() => { const token = localStorage.getItem("signeo_access_token"); fetch(`${API}/envelopes`, { headers: { Authorization: `Bearer ${token ?? ""}` } }).then((response) => response.ok ? response.json() : []).then(setEnvelopes).catch(() => setEnvelopes([])); }, []);
  const currentMonth = new Date().getMonth();
  const completedThisMonth = envelopes.filter((item) => item.status === "COMPLETED" && new Date(item.createdAt).getMonth() === currentMonth).length;
  return <DashboardLayout title="Vue d’ensemble" description="Tout ce qu’il vous faut pour faire avancer vos accords.">
    <div className="dashboard-title-actions"><Link className="button dashboard-create" href="/dashboard/enveloppes/nouvelle">+ Créer une enveloppe</Link></div>
    <div className="dashboard-stats"><StatCard icon="✎" color="stat-icon-green" label="À signer" value={envelopes.filter((item) => item.status === "SENT" || item.status === "PARTIALLY_SIGNED").length} description="Enveloppes actives" /><StatCard icon="◌" color="stat-icon-blue" label="En attente" value={envelopes.filter((item) => item.status === "SENT").length} description="Sans signature reçue" /><StatCard icon="✓" color="stat-icon-yellow" label="Terminées" value={completedThisMonth} description="Ce mois-ci" /></div>
    <div className="dashboard-panels"><WelcomePanel /><ActivityPanel /></div><RecentDocuments />
  </DashboardLayout>;
}
