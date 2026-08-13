import type { LucideIcon } from "lucide-react";

export function EmptyState({
  icon: Icon,
  title,
  sub,
}: {
  icon: LucideIcon;
  title: string;
  sub?: string;
}) {
  return (
    <div className="empty">
      <div className="empty-ico">
        <Icon size={22} strokeWidth={1.75} />
      </div>
      <strong>{title}</strong>
      {sub ? <p>{sub}</p> : null}
    </div>
  );
}
