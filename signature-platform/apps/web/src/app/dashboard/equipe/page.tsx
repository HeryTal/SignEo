"use client";
import { FormEvent, useEffect, useState } from "react";
import { DashboardLayout } from "@/app/ui/dashboard/dashboard-layout";
const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";
type Role = "ADMIN" | "MANAGER" | "SIGNER" | "APPROVER";
type Member = { id: string; name: string; email: string; role: Role; isCurrentUser: boolean };
type Workspace = { id: string; name: string; role: Role };
const roleLabels: Record<Role, string> = { ADMIN: "Administrateur", MANAGER: "Manager", SIGNER: "Signataire", APPROVER: "Approbateur" };
export default function TeamPage() {
  const [workspace, setWorkspace] = useState<Workspace | null>(null); const [members, setMembers] = useState<Member[]>([]); const [email, setEmail] = useState(""); const [role, setRole] = useState<Role>("SIGNER"); const [name, setName] = useState(""); const [notice, setNotice] = useState("");
  const token = () => localStorage.getItem("signeo_access_token") ?? "";
  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const response = await fetch(`${API}/workspaces/current`, { headers: { Authorization: `Bearer ${localStorage.getItem("signeo_access_token") ?? ""}` }, signal: controller.signal });
        const data = await response.json();
        if (!response.ok) throw new Error(data?.message ?? "Impossible de charger l’équipe.");
        if (!controller.signal.aborted) { setWorkspace(data.workspace); setMembers(data.members); }
      } catch (cause) {
        if (!controller.signal.aborted) setNotice(cause instanceof Error ? cause.message : "Impossible de charger l’équipe.");
      }
    }
    void load();
    return () => controller.abort();
  }, []);
  const headers = () => ({ "Content-Type": "application/json", Authorization: `Bearer ${token()}` });
  async function add(event: FormEvent) { event.preventDefault(); const response = await fetch(`${API}/workspaces/members`, { method: "POST", headers: headers(), body: JSON.stringify({ email, role }) }); const data = await response.json().catch(() => null); if (!response.ok) setNotice(data?.message ?? "Impossible d’ajouter ce membre."); else { setMembers(data.members); setEmail(""); setNotice("Membre ajouté."); } }
  async function update(member: Member, nextRole: Role) { const response = await fetch(`${API}/workspaces/members/${member.id}`, { method: "PATCH", headers: headers(), body: JSON.stringify({ role: nextRole }) }); const data = await response.json().catch(() => null); if (!response.ok) setNotice(data?.message ?? "Impossible de modifier le rôle."); else setMembers(data.members); }
  async function remove(member: Member) { if (!window.confirm(`Retirer ${member.name} de l’espace ?`)) return; const response = await fetch(`${API}/workspaces/members/${member.id}`, { method: "DELETE", headers: { Authorization: `Bearer ${token()}` } }); const data = await response.json().catch(() => null); if (!response.ok) setNotice(data?.message ?? "Impossible de retirer ce membre."); else setMembers(data.members); }
  async function create(event: FormEvent) { event.preventDefault(); const response = await fetch(`${API}/workspaces`, { method: "POST", headers: headers(), body: JSON.stringify({ name }) }); const data = await response.json().catch(() => null); if (!response.ok) setNotice(data?.message ?? "Impossible de créer cet espace."); else window.location.reload(); }
  const admin = workspace?.role === "ADMIN";
  return <DashboardLayout title="Équipe" description="Partagez vos enveloppes avec les personnes qui travaillent avec vous." eyebrow="ESPACE DE TRAVAIL"><div className="brand-settings-grid"><section className="settings-card"><p className="eyebrow">ESPACE ACTIF</p><h2>{workspace?.name ?? "Chargement…"}</h2><p>Les rôles limitent les actions : un manager gère les enveloppes, un signataire prépare des brouillons et un approbateur consulte.</p>{admin && <form onSubmit={add}><h3>Ajouter un membre</h3><label className="form-field">E-mail<input required type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="collegue@exemple.fr" /></label><label className="form-field">Rôle<select value={role} onChange={(event) => setRole(event.target.value as Role)}><option value="SIGNER">Signataire — prépare des brouillons</option><option value="APPROVER">Approbateur — consulte</option><option value="MANAGER">Manager — gère les enveloppes</option><option value="ADMIN">Administrateur — gère équipe et facturation</option></select></label><p className="workflow-hint">Cette personne doit d’abord avoir créé un compte avec cette adresse e-mail.</p><button className="envelope-next" type="submit">Ajouter</button></form>}</section><section className="settings-card"><p className="eyebrow">MEMBRES</p><h2>{members.length} membre{members.length > 1 ? "s" : ""}</h2>{members.map((member) => <article className="detail-recipient" key={member.id}><span className="workspace-avatar">{member.name.charAt(0).toUpperCase()}</span><span><b>{member.name}{member.isCurrentUser ? " (vous)" : ""}</b><small>{member.email}</small></span>{admin && !member.isCurrentUser ? <><select value={member.role} onChange={(event) => update(member, event.target.value as Role)}>{Object.entries(roleLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select><button type="button" onClick={() => remove(member)}>Retirer</button></> : <em>{roleLabels[member.role]}</em>}</article>)}</section><section className="settings-card"><p className="eyebrow">NOUVEL ESPACE</p><h2>Créer un autre espace</h2><p>Chaque espace sépare ses membres et ses enveloppes dans la même organisation.</p><form onSubmit={create}><label className="form-field">Nom<input required maxLength={120} value={name} onChange={(event) => setName(event.target.value)} placeholder="Ex. Agence Martin" /></label><button className="secondary-action" type="submit">Créer l’espace</button></form></section></div>{notice && <p className="workflow-hint" role="status">{notice}</p>}</DashboardLayout>;
}
