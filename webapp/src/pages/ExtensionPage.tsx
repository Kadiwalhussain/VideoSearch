import { Chrome, Puzzle, Rocket, Terminal } from "lucide-react";

export function ExtensionPage() {
  return (
    <div className="view">
      <header className="view-head">
        <h1>
          <Puzzle size={22} /> Extension hub
        </h1>
        <p className="view-sub">
          Chrome extension is the capture surface — Studio is the brain.
        </p>
      </header>
      <div className="feat-grid">
        {[
          ["Mark", "Pin a moment + optional note on the player"],
          ["Camera", "Capture a frame to R2 with shutter UX"],
          ["Chat / Ask", "RAG over captions via vault AI or Settings key"],
          ["Auto-sync", "Notes & shots push to this Studio when signed in"],
        ].map(([t, d]) => (
          <div key={t} className="feat glass-card">
            <div className="feat-ico">
              <Chrome size={18} />
            </div>
            <strong>{t}</strong>
            <p>{d}</p>
          </div>
        ))}
      </div>
      <div className="dash-split" style={{ marginTop: 20 }}>
        <section className="glass-card pad">
          <div className="card-head">
            <h3>
              <Rocket size={16} /> Get started
            </h3>
          </div>
          <ol className="steps">
            <li>Load unpacked extension from <code>dist/</code></li>
            <li>Open YouTube · sign in under Account</li>
            <li>Server URL: <code>http://127.0.0.1:8787</code></li>
            <li>Mark / capture · watch Studio refresh</li>
          </ol>
        </section>
        <section className="glass-card pad">
          <div className="card-head">
            <h3>
              <Terminal size={16} /> Run the stack
            </h3>
          </div>
          <div className="step">
            <div>
              <strong>Vault API</strong>
              <span>
                <code>cd server && npm run start:always</code>
              </span>
            </div>
          </div>
          <div className="step">
            <div>
              <strong>This dashboard</strong>
              <span>
                <code>http://127.0.0.1:8787/app/</code>
              </span>
            </div>
          </div>
          <div className="step">
            <div>
              <strong>Health</strong>
              <span>
                <code>http://127.0.0.1:8787/health</code>
              </span>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
