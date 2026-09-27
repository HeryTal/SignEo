"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";
type EventItem = { id: string; action: string; actorEmail: string; createdAt: string; title: string };
const labels: Record<string, string> = { ENVELOPE_CREATED: "Enveloppe créée", ENVELOPE_SENT: "Invitations préparées", DOCUMENT_SIGNED: "Document signé", ENVELOPE_APPROVED: "Enveloppe approuvée" };
export function ActivityPanel() {
  const [events, setEvents] = useState<EventItem[]>([]); const [loading, setLoading] = useState(true);
  useEffect(() => { const token = localStorage.getItem("signeo_access_token"); fetch(`${API}/envelopes/activity`, { headers: { Authorization: `Bearer ${token ?? ""}` } }).then((response) => response.ok ? response.json() : []).then(setEvents).catch(() => setEvents([])).finally(() => setLoading(false)); }, []);
  return <article className="dashboard-panel" id="activity"><div className="panel-heading"><div><p className="eyebrow">ACTIVITÉ RÉCENTE</p><h3>Votre activité</h3></div><Link href="/dashboard/activite">Voir tout</Link></div>{loading ? <div className="dashboard-empty"><p>Chargement…</p></div> : events.length ? <div className="activity-list">{events.slice(0, 4).map((event) => <div className="activity-item" key={event.id}><span className="history-dot"/><div><b>{labels[event.action] ?? event.action}</b><small>{event.title} · {new Date(event.createdAt).toLocaleDateString("fr-FR")}</small></div></div>)}</div> : <div className="dashboard-empty"><span aria-hidden="true">◷</span><p>Votre activité apparaîtra ici.</p></div>}</article>;
}
