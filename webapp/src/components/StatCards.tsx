import {
  Camera,
  Clapperboard,
  Clock,
  Highlighter,
} from "lucide-react";
import type { VaultStats } from "../types";

export function StatCards({ stats }: { stats: VaultStats }) {
  const items = [
    { label: "Videos", value: stats.videos, icon: Clapperboard, tone: "p" },
    {
      label: `Marks${stats.notes ? ` · ${stats.notes} notes` : ""}`,
      value: stats.marks,
      icon: Highlighter,
      tone: "g",
    },
    { label: "Shots", value: stats.shots, icon: Camera, tone: "o" },
    { label: "Watch later", value: stats.watchLater, icon: Clock, tone: "b" },
  ];
  return (
    <div className="stat-grid">
      {items.map((it) => (
        <div key={it.label} className="stat-card glass-card">
          <div className={`stat-ico ${it.tone}`}>
            <it.icon size={18} strokeWidth={1.75} />
          </div>
          <div>
            <b data-count={it.value}>{it.value}</b>
            <span>{it.label}</span>
          </div>
        </div>
      ))}
    </div>
  );
}
