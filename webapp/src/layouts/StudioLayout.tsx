import { NavLink, Outlet, useNavigate } from "react-router-dom";
import {
  BarChart3,
  Camera,
  Chrome,
  Clock,
  Highlighter,
  History,
  LayoutDashboard,
  Library,
  ListVideo,
  Puzzle,
  RefreshCw,
  Search,
  Settings,
  Sparkles,
} from "lucide-react";
import { Ambient } from "../components/Ambient";
import { useSession } from "../store/SessionContext";
import { useTheme } from "../store/ThemeContext";
import { useVault } from "../store/VaultContext";
import { initials } from "../lib/format";
import { useState } from "react";

const NAV: Array<{
  to: string;
  end?: boolean;
  label: string;
  icon: typeof LayoutDashboard;
}> = [
  { to: "/", end: true, label: "Dashboard", icon: LayoutDashboard },
  { to: "/library", label: "Library", icon: Library },
  { to: "/watch-later", label: "Watch later", icon: Clock },
  { to: "/playlists", label: "Playlists", icon: ListVideo },
  { to: "/search", label: "AI Search", icon: Sparkles },
  { to: "/history", label: "History", icon: History },
  { to: "/notes", label: "Notes", icon: Highlighter },
  { to: "/shots", label: "Shots", icon: Camera },
  { to: "/analytics", label: "Analytics", icon: BarChart3 },
  { to: "/extension", label: "Extension", icon: Puzzle },
  { to: "/settings", label: "Settings", icon: Settings },
];

export function StudioLayout() {
  const { session, logout } = useSession();
  const { toggle, theme } = useTheme();
  const { stats, refresh, loading, repairTitles } = useVault();
  const nav = useNavigate();
  const [q, setQ] = useState("");
  const [repairing, setRepairing] = useState(false);

  const pulse = Math.min(
    100,
    stats.videos * 8 + stats.marks * 2 + stats.shots * 3
  );

  return (
    <div className="page page-app">
      <Ambient />
      <aside className="nav-rail glass-rail">
        <div className="nav-brand">
          <div className="brand-mark sm brand-mark-logo" aria-hidden>
            <img src={`${import.meta.env.BASE_URL}logo.png`} alt="" />
          </div>
          <div>
            <div className="nav-name">VideoSearch</div>
            <div className="nav-tag">Studio</div>
          </div>
        </div>

        <nav className="nav-menu">
          {NAV.map(({ to, end, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                `nav-item${isActive ? " is-on" : ""}`
              }
            >
              <Icon size={18} strokeWidth={1.75} />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="nav-foot">
          <div className="glass-card mini storage-card">
            <div className="storage-label">Vault pulse</div>
            <div className="storage-bar">
              <i style={{ width: `${Math.max(8, pulse)}%` }} />
            </div>
            <div className="storage-meta">
              {stats.videos} videos · {stats.marks} marks · {stats.shots} shots
            </div>
          </div>
          <div className="pro-card">
            <div className="pro-glow" />
            <Chrome size={18} />
            <strong>Extension live</strong>
            <p>Mark · shot · chat · auto-sync on YouTube</p>
            <button
              type="button"
              className="btn-pro"
              onClick={() => nav("/extension")}
            >
              Open guide
            </button>
          </div>
        </div>
      </aside>

      <div className="app-main">
        <header className="topbar glass-top">
          <div className="search-bar">
            <Search size={16} />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && q.trim()) {
                  nav(`/search?q=${encodeURIComponent(q.trim())}`);
                }
              }}
              placeholder="Search notes, shots, titles…"
              aria-label="Global search"
            />
            <kbd>⌘K</kbd>
          </div>
          <div className="top-actions">
            <button
              type="button"
              className="btn-ghost sm"
              disabled={loading || repairing}
              title="Fetch full YouTube titles for cards that only show video ids"
              onClick={() => {
                setRepairing(true);
                void repairTitles()
                  .then((r) => {
                    if (r.fixed > 0) {
                      /* titles reloaded via refresh inside repairTitles */
                    }
                  })
                  .catch((e) =>
                    alert(e instanceof Error ? e.message : "Title repair failed")
                  )
                  .finally(() => setRepairing(false));
              }}
            >
              {repairing ? "Fixing titles…" : "Fix titles"}
            </button>
            <button
              type="button"
              className="btn-glow sm"
              disabled={loading}
              onClick={() => void refresh({ force: true })}
            >
              <RefreshCw size={14} className={loading ? "spin" : undefined} />
              Refresh
            </button>
            <button
              type="button"
              className="icon-btn"
              onClick={toggle}
              title="Theme"
            >
              {theme === "dark" ? "☀" : "☾"}
            </button>
            <div className="user-chip">
              <div className="user-av">
                {initials(session?.user.displayName, session?.user.email)}
              </div>
              <div className="user-meta">
                <strong>
                  {session?.user.displayName || session?.user.email || "Account"}
                </strong>
                <span>{session?.user.email}</span>
              </div>
              <button type="button" className="btn-ghost sm" onClick={logout}>
                Log out
              </button>
            </div>
          </div>
        </header>

        <main className="view-host" id="viewHost">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
