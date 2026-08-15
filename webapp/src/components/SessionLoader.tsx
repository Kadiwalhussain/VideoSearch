import { Ambient } from "./Ambient";

type Props = {
  /** Main line under the logo */
  title?: string;
  /** Smaller helper text */
  sub?: string;
  /** compact = inline vault loading; full = full-page session boot */
  variant?: "full" | "inline";
};

/**
 * Cinematic loading state while restoring the vault session
 * or fetching the library.
 */
export function SessionLoader({
  title = "Loading session",
  sub = "Restoring your vault secure connection…",
  variant = "full",
}: Props) {
  if (variant === "inline") {
    return (
      <div className="session-loader session-loader--inline" role="status" aria-live="polite">
        <div className="session-loader-card">
          <div className="session-loader-mark">
            <img src={`${import.meta.env.BASE_URL}logo.png`} alt="" />
            <span className="session-loader-ring" />
            <span className="session-loader-ring session-loader-ring--delay" />
          </div>
          <div className="session-loader-copy">
            <strong>{title}</strong>
            <span>{sub}</span>
          </div>
          <div className="session-loader-bar" aria-hidden>
            <i />
          </div>
        </div>
        <div className="session-loader-skeletons" aria-hidden>
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="session-skel-card" style={{ animationDelay: `${i * 80}ms` }}>
              <div className="session-skel-thumb" />
              <div className="session-skel-lines">
                <span className="session-skel-line w80" />
                <span className="session-skel-line w55" />
                <span className="session-skel-line w40" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="page page-auth session-loader-page" role="status" aria-live="polite" aria-busy="true">
      <Ambient />
      <div className="session-loader session-loader--full">
        <div className="session-loader-card session-loader-card--hero">
          <div className="session-loader-mark session-loader-mark--lg">
            <img src={`${import.meta.env.BASE_URL}logo.png`} alt="" />
            <span className="session-loader-ring" />
            <span className="session-loader-ring session-loader-ring--delay" />
            <span className="session-loader-glow" />
          </div>

          <div className="session-loader-brand">
            <span className="session-loader-name">VideoSearch</span>
            <span className="session-loader-tag">Studio</span>
          </div>

          <h1 className="session-loader-title">{title}</h1>
          <p className="session-loader-sub">{sub}</p>

          <div className="session-loader-bar session-loader-bar--wide" aria-hidden>
            <i />
          </div>

          <div className="session-loader-dots" aria-hidden>
            <span />
            <span />
            <span />
          </div>
        </div>
      </div>
    </div>
  );
}
