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
  Menu,
  Puzzle,
  RefreshCw,
  Search,
  Settings,
  Sparkles,
  X,
} from "lucide-react";
import { Ambient } from "../components/Ambient";
import { useSession } from "../store/SessionContext";
import { useTheme } from "../store/ThemeContext";
import { useVault } from "../store/VaultContext";
import { initials } from "../lib/format";
import { useEffect, useRef, useState } from "react";

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

/** Primary destinations for the mobile bottom bar */
const MOBILE_NAV: Array<{
  to: string;
  end?: boolean;
  label: string;
  icon: typeof LayoutDashboard;
}> = [
  { to: "/", end: true, label: "Home", icon: LayoutDashboard },
  { to: "/library", label: "Library", icon: Library },
  { to: "/playlists", label: "Lists", icon: ListVideo },
  { to: "/search", label: "Search", icon: Sparkles },
  { to: "/notes", label: "Notes", icon: Highlighter },
];

export function StudioLayout() {
  const { session, logout } = useSession();
  const { toggle, theme } = useTheme();
  const { stats, refresh, loading } = useVault();
  const nav = useNavigate();
  const [q, setQ] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  const pulse = Math.min(
    100,
    stats.videos * 8 + stats.marks * 2 + stats.shots * 3
  );

  // ⌘K / Ctrl+K focuses global search
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        searchRef.current?.focus();
        searchRef.current?.select();
      }
      if (e.key === "Escape") setMenuOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className={`page page-app${menuOpen ? " is-menu-open" : ""}`}>
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

      {/* Mobile slide-over menu (full nav when bottom bar isn’t enough) */}
      {menuOpen ? (
        <button
          type="button"
          className="mobile-menu-scrim"
          aria-label="Close menu"
          onClick={() => setMenuOpen(false)}
        />
      ) : null}
      <div className={`mobile-drawer glass-rail${menuOpen ? " is-open" : ""}`}>
        <div className="mobile-drawer-head">
          <div className="nav-brand">
            <div className="brand-mark sm brand-mark-logo" aria-hidden>
              <img src={`${import.meta.env.BASE_URL}logo.png`} alt="" />
            </div>
            <div>
              <div className="nav-name">VideoSearch</div>
              <div className="nav-tag">Studio</div>
            </div>
          </div>
          <button
            type="button"
            className="icon-btn"
            onClick={() => setMenuOpen(false)}
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>
        <nav className="nav-menu">
          {NAV.map(({ to, end, label, icon: Icon }) => (
            <NavLink
              key={`m-${to}`}
              to={to}
              end={end}
              onClick={() => setMenuOpen(false)}
              className={({ isActive }) =>
                `nav-item${isActive ? " is-on" : ""}`
              }
            >
              <Icon size={18} strokeWidth={1.75} />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>
        <div className="mobile-drawer-foot">
          <button type="button" className="btn-notes" onClick={toggle}>
            {theme === "dark" ? "☀ Light mode" : "☾ Dark mode"}
          </button>
          <button
            type="button"
            className="btn-notes is-danger"
            onClick={() => {
              setMenuOpen(false);
              logout();
            }}
          >
            Log out
          </button>
        </div>
      </div>

      <div className="app-main">
        <header className="topbar glass-top">
          <button
            type="button"
            className="icon-btn mobile-menu-btn"
            onClick={() => setMenuOpen(true)}
            aria-label="Open menu"
          >
            <Menu size={18} />
          </button>
          <div className="search-bar">
            <Search size={16} />
            <input
              ref={searchRef}
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
              className="btn-glow sm"
              disabled={loading}
              onClick={() => void refresh({ force: true })}
            >
              <RefreshCw size={14} className={loading ? "spin" : undefined} />
              <span className="hide-sm">Refresh</span>
            </button>
            <button
              type="button"
              className="icon-btn hide-sm"
              onClick={toggle}
              title="Theme"
            >
              {theme === "dark" ? "☀" : "☾"}
            </button>
            <div className="user-chip">
              <div className="user-av">
                {initials(session?.user.displayName, session?.user.email)}
              </div>
              <div className="user-meta hide-sm">
                <strong>
                  {session?.user.displayName || session?.user.email || "Account"}
                </strong>
                <span>{session?.user.email}</span>
              </div>
              <button
                type="button"
                className="btn-ghost sm hide-sm"
                onClick={logout}
              >
                Log out
              </button>
            </div>
          </div>
        </header>

        <main className="view-host" id="viewHost">
          <Outlet />
        </main>
      </div>

      {/* Mobile bottom navigation — always reachable */}
      <nav className="mobile-bottom-nav" aria-label="Primary">
        {MOBILE_NAV.map(({ to, end, label, icon: Icon }) => (
          <NavLink
            key={`b-${to}`}
            to={to}
            end={end}
            className={({ isActive }) =>
              `mobile-bottom-item${isActive ? " is-on" : ""}`
            }
          >
            <Icon size={20} strokeWidth={1.85} />
            <span>{label}</span>
          </NavLink>
        ))}
        <button
          type="button"
          className="mobile-bottom-item"
          onClick={() => setMenuOpen(true)}
        >
          <Menu size={20} strokeWidth={1.85} />
          <span>More</span>
        </button>
      </nav>
    </div>
  );
}
