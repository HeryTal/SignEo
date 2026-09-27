"use client";

import { useEffect, useState } from "react";
import { DashboardLayout } from "../../ui/dashboard/dashboard-layout";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";
type Envelope = { recipients: { id: string; name: string; email: string; role: string }[] };
export default function ContactsPage() {
  const [items, setItems] = useState<Envelope[]>([]); const [loading, setLoading] = useState(true);
  useEffect(() => { const token = localStorage.getItem("signeo_access_token"); fetch(`${API}/envelopes`, { headers: { Authorization: `Bearer ${token ?? ""}` } }).then((response) => response.ok ? response.json() : []).then(setItems).catch(() => setItems([])).finally(() => setLoading(false)); }, []);
  const contacts = Array.from(new Map(items.flatMap((item) => item.recipients).map((person) => [person.email, person])).values());
  return <DashboardLayout title="Contacts" description="Retrouvez les personnes avec qui vous signez régulièrement."><section className="detail-card activity-page"><p className="eyebrow">CARNET D’ADRESSES</p>{loading ? <p className="envelope-loading">Chargement des contacts…</p> : contacts.length ? contacts.map((contact) => <article className="detail-recipient" key={contact.email}><span className="workspace-avatar">{contact.name.charAt(0).toUpperCase()}</span><span><b>{contact.name}</b><small>{contact.email}</small></span><em className="envelope-status">{contact.role === "APPROVER" ? "Approbateur" : "Signataire"}</em></article>) : <p className="envelope-loading">Les destinataires de vos enveloppes seront ajoutés automatiquement ici.</p>}</section></DashboardLayout>;
}
