type StatCardProps = { icon: string; color: string; label: string; value: number; description: string };

export function StatCard({ icon, color, label, value, description }: StatCardProps) {
  return <article><span className={`stat-icon ${color}`} aria-hidden="true">{icon}</span><div><small>{label}</small><strong>{value}</strong><p>{description}</p></div></article>;
}
