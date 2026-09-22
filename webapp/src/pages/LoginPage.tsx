import { FormEvent, useEffect, useMemo, useState } from "react";
import { Navigate, useSearchParams } from "react-router-dom";
import { SessionLoader } from "../components/SessionLoader";
import { useSession } from "../store/SessionContext";
import {
  googleStartUrl,
  probeGoogleAuth,
  requestPasswordReset,
  type AuthMode,
} from "../api/auth";
import "./login-welcome.css";

type GateMode = AuthMode | "forgot";

const ASSET = import.meta.env.BASE_URL;

export function LoginPage() {
  const { session, loading, login, applyToken, apiUrl, setApiUrl } = useSession();
  const [searchParams, setSearchParams] = useSearchParams();
  const [mode, setMode] = useState<GateMode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");
  const [code, setCode] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [status, setStatus] = useState("");
  const [err, setErr] = useState(false);
  const [busy, setBusy] = useState(false);
  const [oauthBusy, setOauthBusy] = useState(false);
  const [googleOn, setGoogleOn] = useState(false);

  const mac = useMemo(
    () => /Mac|iPhone|iPad/i.test(navigator.platform || navigator.userAgent),
    []
  );

  useEffect(() => {
    document.documentElement.classList.add("is-welcome-login");
    document.body.classList.add("is-welcome-login");
    return () => {
      document.documentElement.classList.remove("is-welcome-login");
      document.body.classList.remove("is-welcome-login");
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    // Debounce: apiUrl updates on every keystroke in the Advanced field —
    // don't fire a probe request per character while the user is typing.
    const t = window.setTimeout(() => {
      void probeGoogleAuth(apiUrl).then((on) => {
        if (!cancelled) setGoogleOn(on);
      });
    }, 400);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [apiUrl]);

  useEffect(() => {
    const token = searchParams.get("token");
    if (!token || session) return;
    setOauthBusy(true);
    void applyToken({
      token,
      email: searchParams.get("email") || undefined,
      displayName: searchParams.get("name") || undefined,
    })
      .catch((ex) => {
        setErr(true);
        setStatus(ex instanceof Error ? ex.message : "Google sign-in failed");
      })
      .finally(() => {
        setOauthBusy(false);
        setSearchParams({}, { replace: true });
      });
  }, [searchParams, session, applyToken, setSearchParams]);

  if (loading || oauthBusy) {
    return (
      <SessionLoader
        title="Loading session"
        sub="Checking saved sign-in and connecting to your vault…"
      />
    );
  }
  if (session) return <Navigate to="/" replace />;

  const title =
    mode === "register"
      ? "Create account"
      : mode === "forgot" || mode === "reset"
        ? "Reset password"
        : "Welcome back";
  const sub =
    mode === "register"
      ? "Email and password. Same account as the Chrome extension."
      : mode === "forgot"
        ? "We’ll issue a reset code. On this computer it prints in the vault terminal."
        : mode === "reset"
          ? "Enter the code and a new password."
          : "Email and password. Same account as the Chrome extension.";
  const submitLabel =
    mode === "register"
      ? "Create account"
      : mode === "forgot"
        ? "Send reset code"
        : mode === "reset"
          ? "Set new password"
          : "Log in";

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr(false);
    try {
      if (!email.includes("@")) throw new Error("Enter a valid email address");
      if ((mode === "register" || mode === "reset") && password !== password2) {
        throw new Error("Passwords do not match");
      }
      if (mode === "forgot") {
        setStatus("Sending reset code…");
        const msg = await requestPasswordReset(email, apiUrl);
        setStatus(msg);
        setErr(false);
        setMode("reset");
        return;
      }
      setStatus(
        mode === "register"
          ? "Creating your account…"
          : mode === "reset"
            ? "Updating password…"
            : "Signing in…"
      );
      await login(mode, {
        email,
        password,
        displayName: email.split("@")[0],
        code,
      });
      setStatus("");
    } catch (ex) {
      setErr(true);
      setStatus(ex instanceof Error ? ex.message : "Could not sign in");
    } finally {
      setBusy(false);
    }
  };

  const switchMode = (next: GateMode) => {
    setMode(next);
    setStatus("");
    setErr(false);
    setCode("");
    setPassword2("");
  };

  const showGoogle = googleOn && mode !== "forgot" && mode !== "reset";

  return (
    <div className="wl">
      <div className="wl-grain" aria-hidden="true" />
      <div className="wl-orbs" aria-hidden="true">
        <span className="wl-orb wl-orb-a" />
        <span className="wl-orb wl-orb-b" />
      </div>

      <header className="wl-top">
        <div className="wl-brand">
          <img src={`${ASSET}logo.png`} alt="" width={36} height={36} />
          <span>
            VideoSearch<em>AI</em>
          </span>
        </div>
        <p className="wl-chip">Same account · Chrome, Studio, phone</p>
      </header>

      <main className="wl-shell">
        <section className="wl-story">
          <p className="wl-eyebrow">Studio. Same vault as YouTube.</p>
          <h1>
            Search what was <em>said</em>, not what was titled.
          </h1>
          <p className="wl-lead">
            Captions become a searchable library in your browser. Mark a moment.
            Shoot a slide. Jump back to the second — Chrome, Studio, phone.
          </p>

          <ul className="wl-glimpses">
            <li>
              <span className="wl-kicker">Find</span>
              <strong>Spoken search</strong>
              <p>Type a concept. Ranked timestamps from the transcript. On-device.</p>
            </li>
            <li>
              <span className="wl-kicker">Keep</span>
              <strong>Marks &amp; shots</strong>
              <p>You pin the second. You capture the frame. Nothing is invented.</p>
            </li>
            <li>
              <span className="wl-kicker">Source</span>
              <strong>Bio + captions</strong>
              <p>Links spoken in CC and written in the description land in Sources.</p>
            </li>
            <li>
              <span className="wl-kicker">Rewatch</span>
              <strong>One vault</strong>
              <p>Same account on Studio, Android, and iPhone. Search stays local.</p>
            </li>
          </ul>

          <figure className="wl-shot">
            <img
              src={`${ASSET}product-hero.jpg`}
              alt="VideoSearch on a YouTube lecture — search and jump to the second"
            />
            <figcaption>Lives on the watch page. No setup. No key for search.</figcaption>
          </figure>

          <div className="wl-keys">
            <div>
              <kbd>{mac ? "⌘M" : "Ctrl+M"}</kbd>
              <span>Mark this moment</span>
            </div>
            <div>
              <kbd>{mac ? "⌘C" : "Ctrl+C"}</kbd>
              <span>Capture the frame</span>
            </div>
          </div>
        </section>

        <aside className="wl-gate">
          <div className="wl-card">
            <div className="wl-card-kicker">Your account</div>
            <h2>{title}</h2>
            <p className="wl-card-sub">{sub}</p>

            <div className="wl-modes" role="tablist">
              <button
                type="button"
                className={`wl-mode${mode === "register" ? " is-on" : ""}`}
                onClick={() => switchMode("register")}
              >
                Create account
              </button>
              <button
                type="button"
                className={`wl-mode${
                  mode === "login" || mode === "forgot" || mode === "reset"
                    ? " is-on"
                    : ""
                }`}
                onClick={() => switchMode("login")}
              >
                Log in
              </button>
            </div>

            {showGoogle ? (
              <>
                <button
                  type="button"
                  className="wl-google"
                  onClick={() => {
                    const redirect = `${window.location.origin}${ASSET}login`;
                    window.location.href = googleStartUrl(apiUrl, redirect);
                  }}
                >
                  <span className="wl-google-g" aria-hidden="true">
                    G
                  </span>
                  Continue with Google
                </button>
                <div className="wl-or">or</div>
              </>
            ) : null}

            <form className="wl-form" onSubmit={onSubmit} autoComplete="on">
              <label className="wl-field">
                <span>Email</span>
                <input
                  type="email"
                  name="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="username"
                  placeholder="you@work.com"
                  required
                />
              </label>

              {mode !== "forgot" ? (
                <label className="wl-field">
                  <span>{mode === "reset" ? "New password" : "Password"}</span>
                  <div className="wl-pass-row">
                    <input
                      type={showPass ? "text" : "password"}
                      name="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      autoComplete={
                        mode === "register" || mode === "reset"
                          ? "new-password"
                          : "current-password"
                      }
                      placeholder={
                        mode === "register" || mode === "reset"
                          ? "At least 10 characters"
                          : "Password"
                      }
                      required
                    />
                    <button
                      type="button"
                      className="wl-pass-toggle"
                      onClick={() => setShowPass((v) => !v)}
                    >
                      {showPass ? "Hide" : "Show"}
                    </button>
                  </div>
                </label>
              ) : null}

              {mode === "register" || mode === "reset" ? (
                <label className="wl-field">
                  <span>Confirm password</span>
                  <input
                    type={showPass ? "text" : "password"}
                    name="password2"
                    value={password2}
                    onChange={(e) => setPassword2(e.target.value)}
                    autoComplete="new-password"
                    placeholder="Type it again"
                    required
                  />
                </label>
              ) : null}

              {mode === "reset" ? (
                <label className="wl-field">
                  <span>Reset code</span>
                  <input
                    type="text"
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    autoComplete="one-time-code"
                    placeholder="Code from vault"
                    required
                  />
                </label>
              ) : null}

              <details className="wl-advanced">
                <summary>Advanced · vault URL</summary>
                <label className="wl-field">
                  <span>API URL</span>
                  <input
                    type="url"
                    value={apiUrl}
                    onChange={(e) => setApiUrl(e.target.value)}
                    placeholder="http://127.0.0.1:8787"
                  />
                </label>
              </details>

              <button type="submit" className="wl-submit" disabled={busy}>
                {submitLabel}
              </button>
              {mode !== "register" ? (
                <button
                  type="button"
                  className="wl-text-link"
                  onClick={() =>
                    switchMode(
                      mode === "forgot" || mode === "reset" ? "login" : "forgot"
                    )
                  }
                >
                  {mode === "forgot" || mode === "reset"
                    ? "Back to log in"
                    : "Forgot password?"}
                </button>
              ) : null}
              <p className={`wl-msg${err ? " is-error" : status ? " is-ok" : ""}`} role="status">
                {status}
              </p>
            </form>

            <p className="wl-fine">
              No API key. One account for the extension and Studio. Search stays
              on this machine; the account only syncs notes, shots, bio, and
              sources.
            </p>
          </div>
        </aside>
      </main>

      <footer className="wl-foot">
        <span>Chrome · Studio · Android · iPhone</span>
        <a href="https://videosearchai.netlify.app/" target="_blank" rel="noopener">
          Product site
        </a>
      </footer>
    </div>
  );
}
