import { FormEvent, useState } from "react";
import { Navigate } from "react-router-dom";
import { BarChart3, Camera, Highlighter } from "lucide-react";
import { Ambient } from "../components/Ambient";
import { useSession } from "../store/SessionContext";
import { useTheme } from "../store/ThemeContext";
import type { AuthMode } from "../api/auth";

export function LoginPage() {
  const { session, loading, login, apiUrl, setApiUrl } = useSession();
  const { toggle, theme } = useTheme();
  const [mode, setMode] = useState<AuthMode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [status, setStatus] = useState("");
  const [err, setErr] = useState(false);
  const [busy, setBusy] = useState(false);

  if (!loading && session) return <Navigate to="/" replace />;

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setStatus(
      mode === "register"
        ? "Creating account…"
        : mode === "reset"
          ? "Resetting…"
          : "Signing in…"
    );
    setErr(false);
    try {
      await login(mode, { email, password, displayName });
      setStatus("");
    } catch (ex) {
      setErr(true);
      setStatus(ex instanceof Error ? ex.message : "Auth failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="page page-auth">
      <Ambient />
      <div className="auth-shell">
        <aside className="auth-brand">
          <div className="auth-brand-inner reveal">
            <div className="brand-mark">
              <span>VS</span>
            </div>
            <p className="eyebrow">Video intelligence studio</p>
            <h1>
              Every lecture,
              <br />
              <em>searchable.</em>
            </h1>
            <p className="lede">
              Notes, board captures, and timeline marks — synced from the Chrome
              extension into a private cloud vault with live analytics.
            </p>
            <div className="auth-metrics">
              <div>
                <b>AI</b>
                <span>Semantic search</span>
              </div>
              <div>
                <b>R2</b>
                <span>Frame storage</span>
              </div>
              <div>
                <b>Live</b>
                <span>Auto-sync vault</span>
              </div>
            </div>
            <div className="auth-float-cards">
              <div className="float-card f1">
                <Camera size={16} />
                <span>Frame shots</span>
              </div>
              <div className="float-card f2">
                <Highlighter size={16} />
                <span>Timeline marks</span>
              </div>
              <div className="float-card f3">
                <BarChart3 size={16} />
                <span>Studio analytics</span>
              </div>
            </div>
          </div>
        </aside>
        <main className="auth-main">
          <form className="glass-card auth-card reveal" onSubmit={onSubmit}>
            <div className="auth-card-top">
              <div>
                <div className="auth-card-title">Welcome</div>
                <div className="auth-card-sub">
                  Same account as the Chrome extension
                </div>
              </div>
              <button
                type="button"
                className="icon-btn"
                onClick={toggle}
                aria-label="Toggle theme"
              >
                {theme === "dark" ? "☀" : "☾"}
              </button>
            </div>
            <div className="auth-modes" role="tablist">
              {(
                [
                  ["login", "Log in"],
                  ["register", "Sign up"],
                  ["reset", "Reset"],
                ] as const
              ).map(([m, label]) => (
                <button
                  key={m}
                  type="button"
                  className={`auth-mode${mode === m ? " is-on" : ""}`}
                  onClick={() => setMode(m)}
                >
                  {label}
                </button>
              ))}
            </div>
            <p className="auth-hint">
              {mode === "register"
                ? "Create your vault account"
                : mode === "reset"
                  ? "Set a new password for an existing email"
                  : "Enter your credentials to open the vault"}
            </p>
            {mode === "register" ? (
              <label className="field">
                <span>Display name</span>
                <input
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  autoComplete="nickname"
                />
              </label>
            ) : null}
            <label className="field">
              <span>Email</span>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                autoComplete="username"
                required
              />
            </label>
            <label className="field">
              <span>Password</span>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Min. 6 characters"
                autoComplete={
                  mode === "register" ? "new-password" : "current-password"
                }
                required
              />
            </label>
            <label className="field field-advanced">
              <span>API URL</span>
              <input
                type="url"
                value={apiUrl}
                onChange={(e) => setApiUrl(e.target.value)}
                placeholder="http://127.0.0.1:8787"
              />
            </label>
            <button type="submit" className="btn-glow" disabled={busy}>
              {mode === "register"
                ? "Create account"
                : mode === "reset"
                  ? "Reset password"
                  : "Log in"}
            </button>
            <p className={`status${err ? " err" : ""}`} role="status">
              {status}
            </p>
            <p className="auth-help">
              Open at <code>http://127.0.0.1:8787/app/</code> · vault API must be
              running
            </p>
          </form>
        </main>
      </div>
    </div>
  );
}
