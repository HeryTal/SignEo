import Link from "next/link";

type EmptyPageProps = { icon: string; title: string; text: string; action?: string; actionHref?: string };

export function EmptyPage({ icon, title, text, action, actionHref }: EmptyPageProps) {
  return <section className="dashboard-empty-page"><span aria-hidden="true">{icon}</span><h3>{title}</h3><p>{text}</p>{action && (actionHref ? <Link className="dashboard-outline-button" href={actionHref}>{action}</Link> : <button className="dashboard-outline-button" type="button">{action}</button>)}</section>;
}
