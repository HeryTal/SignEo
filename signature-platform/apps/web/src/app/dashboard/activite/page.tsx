"use client";

import { useEffect, useState } from "react";
import { DashboardLayout } from "../../ui/dashboard/dashboard-layout";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";
type Activity = { id: string; action: string; title: string; actorEmail: string; createdAt: string };
const labels: Record<string, string> = { ENVELOPE_CREATED: "Enveloppe créée", ENVELOPE_SENT: "Invitations préparées", DOCUMENT_SIGNED: "Document signé", ENVELOPE_APPROVED: "Enveloppe approuvée" };
export default function ActivityPage() {
  const [events, setEvents] = useState<Activity[]>([]); const [loading, setLoading] = useState(true);
  useEffect(() => { const token = localStorage.getItem("signeo_access_token"); fetch(`${API}/envelopes/activity`, { headers: { Authorization: `Bearer ${token ?? ""}` } }).then((response) => response.ok ? response.json() : []).then(setEvents).catch(() => setEvents([])).finally(() => setLoading(false)); }, []);
  return <DashboardLayout title="Activité" description="Gardez une trace de ce qui se passe dans votre espace."><section className="detail-card activity-page"><p className="eyebrow">JOURNAL DE L’ESPACE</p>{loading ? <p className="envelope-loading">Chargement de l’activité…</p> : events.length ? events.map((event) => <article className="history-event" key={event.id}><span className="history-dot"/><div><b>{labels[event.action] ?? event.action} · {event.title}</b><small>{event.actorEmail} · {new Date(event.createdAt).toLocaleString("fr-FR")}</small></div></article>) : <p className="envelope-loading">Aucune activité pour le moment. Les créations, envois et réponses apparaîtront ici.</p>}</section></DashboardLayout>;
}
