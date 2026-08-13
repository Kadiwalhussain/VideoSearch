import { Database, Settings, User } from "lucide-react";
import { useSession } from "../store/SessionContext";
import { useVault } from "../store/VaultContext";

export function SettingsPage() {
  const { session, apiUrl } = useSession();
  const { stats } = useVault();
  return (
    <div className="view">
      <header className="view-head">
        <h1>
          <Settings size={22} /> Settings
        </h1>
        <p className="view-sub">Account and vault connection</p>
      </header>
      <div className="dash-split">
        <section className="glass-card pad">
          <div className="card-head">
            <h3>
              <User size={16} /> Profile
            </h3>
          </div>
          <p>
            <strong>{session?.user.displayName || "—"}</strong>
          </p>
          <p className="view-sub">{session?.user.email}</p>
          <p className="view-sub">User ID: {session?.user.userId}</p>
        </section>
        <section className="glass-card pad">
          <div className="card-head">
            <h3>
              <Database size={16} /> Vault
            </h3>
          </div>
          <p className="view-sub">API: {apiUrl || session?.url}</p>
          <p className="view-sub">
            {stats.videos} videos · {stats.marks} marks · {stats.shots} shots
          </p>
          <p className="view-sub">
            Session is shared with the Chrome extension when both use the same
            account + URL.
          </p>
        </section>
      </div>
    </div>
  );
}
