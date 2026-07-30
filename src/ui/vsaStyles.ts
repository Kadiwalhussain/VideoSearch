/**
 * VideoSearch AI — product design system (extension panel)
 * Direction: refined dark product UI (Linear / Raycast / Notion density)
 */

export const VSA_FONT_HREF =
  "https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@500;600&family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap";

export const VSA_STYLES = `
/* ══════════════════════════════════════════════════════════════
   Design tokens
   ══════════════════════════════════════════════════════════════ */
#videosearch-ai-root {
  --vsa-font: "Plus Jakarta Sans", ui-sans-serif, system-ui, -apple-system, sans-serif;
  --vsa-mono: "IBM Plex Mono", ui-monospace, SFMono-Regular, Menlo, monospace;

  --vsa-bg: #0a0b0f;
  --vsa-bg-elevated: #12141a;
  --vsa-bg-soft: #181b23;
  --vsa-surface: #1c1f28;
  --vsa-surface-2: #252933;
  --vsa-border: rgba(255,255,255,0.07);
  --vsa-border-strong: rgba(255,255,255,0.12);
  --vsa-text: #f4f5f7;
  --vsa-muted: #8b919c;
  --vsa-faint: #5c6370;
  --vsa-accent: #3ecf8e;
  --vsa-accent-hover: #4adb9a;
  --vsa-accent-dim: rgba(62,207,142,0.12);
  --vsa-accent-border: rgba(62,207,142,0.28);
  --vsa-danger: #f07178;
  --vsa-info: #6cb6ff;
  --vsa-warn: #e6b450;

  --vsa-radius: 16px;
  --vsa-radius-sm: 10px;
  --vsa-radius-xs: 7px;
  --vsa-ease: cubic-bezier(0.2, 0.8, 0.2, 1);
  --vsa-shadow:
    0 0 0 1px rgba(255,255,255,0.05),
    0 24px 48px rgba(0,0,0,0.55),
    0 2px 8px rgba(0,0,0,0.35);

  position: fixed !important;
  z-index: 2147483646;
  box-sizing: border-box;
  font-family: var(--vsa-font);
  -webkit-font-smoothing: antialiased;
  right: max(16px, env(safe-area-inset-right, 0px));
  bottom: max(88px, env(safe-area-inset-bottom, 0px));
  left: auto;
  top: auto;
  width: min(392px, calc(100vw - 24px));
  max-height: min(80vh, 640px);
  margin: 0;
  pointer-events: auto !important;
  color: var(--vsa-text);
}

#videosearch-ai-root *,
#videosearch-ai-root *::before,
#videosearch-ai-root *::after { box-sizing: border-box; }

/* ── Panel shell ── */
#videosearch-ai-panel {
  position: relative;
  border-radius: var(--vsa-radius);
  background: var(--vsa-bg-elevated);
  color: var(--vsa-text);
  border: 1px solid var(--vsa-border);
  box-shadow: var(--vsa-shadow);
  overflow: hidden;
  isolation: isolate;
  backdrop-filter: blur(24px) saturate(1.15);
  -webkit-backdrop-filter: blur(24px) saturate(1.15);
  max-height: inherit;
  display: flex;
  flex-direction: column;
}

#videosearch-ai-panel::before {
  content: "";
  pointer-events: none;
  position: absolute;
  inset: 0;
  background:
    radial-gradient(80% 50% at 0% 0%, rgba(62,207,142,0.07), transparent 55%),
    linear-gradient(180deg, rgba(255,255,255,0.02), transparent 40%);
  z-index: 0;
}
#videosearch-ai-panel > * { position: relative; z-index: 1; }

/* ── Collapsed pill ── */
#videosearch-ai-root.is-collapsed,
#videosearch-ai-panel.is-collapsed {
  width: auto;
  max-width: none;
}
#videosearch-ai-root.is-collapsed {
  bottom: max(96px, env(safe-area-inset-bottom, 0px));
}
#videosearch-ai-root.is-collapsed #videosearch-ai-panel {
  border-radius: 999px;
  background: #111318;
  border: 1px solid var(--vsa-border-strong);
  box-shadow:
    0 0 0 1px rgba(62,207,142,0.15),
    0 12px 32px rgba(0,0,0,0.5),
    0 0 24px rgba(62,207,142,0.08);
  animation: none;
}
#videosearch-ai-root.is-collapsed #videosearch-ai-panel::before { display: none; }
#videosearch-ai-root.is-collapsed .vsa-tabs,
#videosearch-ai-root.is-collapsed .vsa-panel-body,
#videosearch-ai-root.is-collapsed .vsa-status,
#videosearch-ai-root.is-collapsed .vsa-collapse-btn,
#videosearch-ai-root.is-collapsed .vsa-account-chip { display: none !important; }

#videosearch-ai-root.is-collapsed .vsa-bar { padding: 0; gap: 0; }
#videosearch-ai-root.is-collapsed .vsa-brand {
  background: transparent;
  box-shadow: none;
  color: var(--vsa-text);
  padding: 10px 16px 10px 12px;
  gap: 10px;
  border-radius: 999px;
}
#videosearch-ai-root.is-collapsed .vsa-logo {
  width: 28px; height: 28px;
  background: var(--vsa-accent-dim);
  color: var(--vsa-accent);
  border: 1px solid var(--vsa-accent-border);
}
#videosearch-ai-root.is-collapsed .vsa-title {
  font-size: 13px; font-weight: 700; color: var(--vsa-text); letter-spacing: -0.03em;
}
#videosearch-ai-root.is-collapsed .vsa-badge {
  background: var(--vsa-accent-dim);
  color: var(--vsa-accent);
  border: 1px solid var(--vsa-accent-border);
}

/* ── Header ── */
#videosearch-ai-panel .vsa-chrome {
  flex-shrink: 0;
  border-bottom: 1px solid var(--vsa-border);
  background: rgba(10,11,15,0.45);
}
#videosearch-ai-panel .vsa-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 10px 8px;
}
#videosearch-ai-panel .vsa-brand {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  border: none;
  cursor: pointer;
  padding: 4px 8px 4px 4px;
  border-radius: 999px;
  color: var(--vsa-text);
  background: transparent;
  transition: background 0.15s var(--vsa-ease);
}
#videosearch-ai-panel .vsa-brand:hover { background: rgba(255,255,255,0.04); }
#videosearch-ai-panel .vsa-brand[data-state="loading"] .vsa-logo { color: var(--vsa-info); border-color: rgba(108,182,255,0.35); background: rgba(108,182,255,0.12); }
#videosearch-ai-panel .vsa-brand[data-state="error"] .vsa-logo { color: var(--vsa-danger); border-color: rgba(240,113,120,0.35); background: rgba(240,113,120,0.12); }
#videosearch-ai-panel .vsa-brand[data-state="warn"] .vsa-logo { color: var(--vsa-warn); border-color: rgba(230,180,80,0.35); background: rgba(230,180,80,0.12); }

#videosearch-ai-panel .vsa-logo {
  display: inline-flex;
  width: 26px; height: 26px;
  border-radius: 8px;
  align-items: center; justify-content: center;
  background: var(--vsa-accent-dim);
  color: var(--vsa-accent);
  border: 1px solid var(--vsa-accent-border);
  flex-shrink: 0;
}
#videosearch-ai-panel .vsa-title-wrap {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  line-height: 1;
}
#videosearch-ai-panel .vsa-title {
  font-size: 12.5px;
  font-weight: 750;
  letter-spacing: -0.03em;
}
#videosearch-ai-panel .vsa-title-sub { display: none; }
#videosearch-ai-panel .vsa-badge {
  min-width: 18px;
  padding: 2px 6px;
  border-radius: 999px;
  background: rgba(255,255,255,0.06);
  border: 1px solid var(--vsa-border);
  font-family: var(--vsa-mono);
  font-size: 10px;
  font-weight: 600;
  color: var(--vsa-muted);
  text-align: center;
}
#videosearch-ai-panel .vsa-status {
  flex: 1;
  min-width: 0;
  font-size: 11px;
  font-weight: 500;
  color: var(--vsa-muted);
  text-align: right;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  padding-right: 4px;
}
#videosearch-ai-panel .vsa-collapse-btn {
  width: 28px; height: 28px;
  border-radius: 8px;
  border: 1px solid transparent;
  background: transparent;
  color: var(--vsa-muted);
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  transition: background 0.15s, color 0.15s, border-color 0.15s;
}
#videosearch-ai-panel .vsa-collapse-btn:hover {
  color: var(--vsa-text);
  background: rgba(255,255,255,0.05);
  border-color: var(--vsa-border);
}

/* Avatar */
#videosearch-ai-panel .vsa-account-chip {
  width: 28px !important;
  height: 28px !important;
  padding: 0 !important;
  max-width: none !important;
  border-radius: 50% !important;
  border: 1px solid var(--vsa-border-strong) !important;
  background: var(--vsa-surface) !important;
  display: inline-flex !important;
  align-items: center !important;
  justify-content: center !important;
  cursor: pointer;
  flex-shrink: 0;
  transition: border-color 0.15s, box-shadow 0.15s;
}
#videosearch-ai-panel .vsa-account-chip:hover {
  border-color: var(--vsa-accent-border) !important;
}
#videosearch-ai-panel .vsa-account-chip[data-state="in"] {
  border-color: var(--vsa-accent-border) !important;
  box-shadow: 0 0 0 2px var(--vsa-accent-dim);
}
#videosearch-ai-panel .vsa-account-chip-av {
  width: 100% !important;
  height: 100% !important;
  border-radius: 50% !important;
  display: grid !important;
  place-items: center !important;
  font-size: 10px !important;
  font-weight: 800 !important;
  background: linear-gradient(145deg, #3ecf8e, #2a9d6a) !important;
  color: #04140c !important;
}
#videosearch-ai-panel .vsa-account-chip[data-state="out"] .vsa-account-chip-av {
  background: var(--vsa-surface-2) !important;
  color: var(--vsa-muted) !important;
}

/* ── Primary nav ── */
#videosearch-ai-panel .vsa-tabs {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 2px;
  padding: 0 10px 10px;
  margin: 0;
}
#videosearch-ai-panel .vsa-tab {
  display: inline-flex;
  flex-direction: row !important;
  align-items: center;
  justify-content: center;
  gap: 5px !important;
  min-height: 36px !important;
  min-width: 0;
  padding: 6px 8px;
  border: 1px solid transparent;
  border-radius: 10px !important;
  background: transparent;
  color: var(--vsa-muted);
  font-family: var(--vsa-font);
  font-size: 12px !important;
  font-weight: 650;
  cursor: pointer;
  transition: background 0.15s, color 0.15s, border-color 0.15s;
  position: relative;
}
#videosearch-ai-panel .vsa-tab:hover {
  color: var(--vsa-text);
  background: rgba(255,255,255,0.04);
}
#videosearch-ai-panel .vsa-tab.is-active {
  color: var(--vsa-text) !important;
  background: var(--vsa-surface) !important;
  border-color: var(--vsa-border) !important;
  box-shadow: 0 1px 0 rgba(255,255,255,0.04) inset;
}
#videosearch-ai-panel .vsa-tab.is-active .vsa-tab-ico { color: var(--vsa-accent); }
#videosearch-ai-panel .vsa-tab-txt {
  font-size: 11.5px !important;
  font-weight: 650 !important;
  letter-spacing: -0.01em;
}
#videosearch-ai-panel .vsa-tab-count:not(:empty) {
  font-family: var(--vsa-mono);
  font-size: 9.5px;
  font-weight: 600;
  color: var(--vsa-accent);
  background: var(--vsa-accent-dim);
  border-radius: 999px;
  padding: 1px 5px;
  min-width: 16px;
  text-align: center;
}
#videosearch-ai-panel .vsa-tab-ico {
  display: inline-flex !important;
  width: 14px;
  height: 14px;
  align-items: center;
  justify-content: center;
  opacity: 0.9;
  flex-shrink: 0;
}
#videosearch-ai-panel .vsa-ico,
#videosearch-ai-panel .vsa-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  line-height: 0;
}
#videosearch-ai-panel .vsa-icon { width: 100%; height: 100%; }

/* ── Body ── */
#videosearch-ai-panel .vsa-panel-body {
  flex: 1;
  min-height: 0;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  padding: 0 10px 10px;
}
#videosearch-ai-panel .vsa-pane {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
  scrollbar-width: thin;
  scrollbar-color: rgba(255,255,255,0.12) transparent;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding-top: 2px;
}

/* ── Search ── */
#videosearch-ai-panel .vsa-mode-row {
  display: flex;
  gap: 2px;
  padding: 3px;
  border-radius: 10px;
  background: rgba(0,0,0,0.35);
  border: 1px solid var(--vsa-border);
}
#videosearch-ai-panel .vsa-mode {
  flex: 1;
  border: none;
  border-radius: 7px;
  padding: 7px 8px;
  font-family: var(--vsa-font);
  font-size: 11px;
  font-weight: 650;
  color: var(--vsa-muted);
  background: transparent;
  cursor: pointer;
  transition: background 0.15s, color 0.15s;
}
#videosearch-ai-panel .vsa-mode:hover { color: var(--vsa-text); }
#videosearch-ai-panel .vsa-mode.is-active {
  background: var(--vsa-surface-2);
  color: var(--vsa-text);
  box-shadow: 0 1px 2px rgba(0,0,0,0.25);
}
#videosearch-ai-panel .vsa-input-row {
  display: flex;
  gap: 6px;
  align-items: stretch;
  position: relative;
}
#videosearch-ai-panel .vsa-input-ico {
  position: absolute;
  left: 11px;
  top: 50%;
  transform: translateY(-50%);
  color: var(--vsa-faint);
  pointer-events: none;
  z-index: 1;
  display: inline-flex;
}
#videosearch-ai-panel .vsa-input {
  flex: 1;
  min-width: 0;
  border: 1px solid var(--vsa-border);
  border-radius: 10px;
  background: rgba(0,0,0,0.35);
  color: var(--vsa-text);
  font-family: var(--vsa-font);
  font-size: 13px;
  font-weight: 500;
  padding: 10px 12px 10px 34px;
  outline: none;
  transition: border-color 0.15s, box-shadow 0.15s;
}
#videosearch-ai-panel .vsa-input::placeholder { color: var(--vsa-faint); }
#videosearch-ai-panel .vsa-input:focus {
  border-color: var(--vsa-accent-border);
  box-shadow: 0 0 0 3px var(--vsa-accent-dim);
}
#videosearch-ai-panel .vsa-search-btn {
  border: none;
  border-radius: 10px;
  padding: 0 14px;
  font-family: var(--vsa-font);
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
  background: var(--vsa-accent);
  color: #04140c;
  transition: filter 0.15s, transform 0.15s;
}
#videosearch-ai-panel .vsa-search-btn:hover {
  filter: brightness(1.06);
  transform: translateY(-0.5px);
}
#videosearch-ai-panel .vsa-answer {
  padding: 12px;
  border-radius: 12px;
  background: rgba(0,0,0,0.28);
  border: 1px solid var(--vsa-border);
  font-size: 12.5px;
  line-height: 1.55;
  color: var(--vsa-text);
}
#videosearch-ai-panel .vsa-results {
  display: flex;
  flex-direction: column;
  gap: 6px;
  overflow-y: auto;
  max-height: min(280px, 40vh);
  scrollbar-width: thin;
}
#videosearch-ai-panel .vsa-result {
  text-align: left;
  width: 100%;
  border: 1px solid var(--vsa-border);
  border-radius: 11px;
  background: rgba(0,0,0,0.22);
  padding: 10px 11px;
  color: var(--vsa-text);
  cursor: pointer;
  font-family: var(--vsa-font);
  transition: border-color 0.15s, background 0.15s;
}
#videosearch-ai-panel .vsa-result:hover,
#videosearch-ai-panel .vsa-result-active {
  border-color: var(--vsa-accent-border);
  background: var(--vsa-accent-dim);
}
#videosearch-ai-panel .vsa-result-time {
  font-family: var(--vsa-mono);
  font-size: 11px;
  font-weight: 600;
  color: var(--vsa-accent);
}
#videosearch-ai-panel .vsa-result-text {
  margin-top: 4px;
  font-size: 12px;
  color: var(--vsa-muted);
  line-height: 1.4;
}
#videosearch-ai-panel .vsa-hint,
#videosearch-ai-panel .vsa-empty {
  padding: 14px 12px;
  border-radius: 12px;
  background: rgba(0,0,0,0.2);
  border: 1px dashed var(--vsa-border);
  font-size: 12px;
  color: var(--vsa-muted);
  line-height: 1.45;
}
#videosearch-ai-panel .vsa-time-link {
  display: inline;
  border: none;
  background: var(--vsa-accent-dim);
  color: var(--vsa-accent);
  font-family: var(--vsa-mono);
  font-size: 11px;
  font-weight: 600;
  padding: 1px 6px;
  border-radius: 5px;
  cursor: pointer;
  margin: 0 2px;
}
#videosearch-ai-panel .vsa-time-link:hover {
  background: rgba(62,207,142,0.22);
}

/* ── More menu ── */
#videosearch-ai-panel .vsa-back {
  display: inline-flex;
  align-items: center;
  border: none;
  background: transparent;
  color: var(--vsa-muted);
  font-family: var(--vsa-font);
  font-size: 11.5px;
  font-weight: 600;
  cursor: pointer;
  padding: 2px 0 8px;
  margin: 0;
  width: fit-content;
}
#videosearch-ai-panel .vsa-back:hover { color: var(--vsa-text); }
#videosearch-ai-panel .vsa-more-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
  padding: 2px 0 6px;
}
#videosearch-ai-panel .vsa-more-card {
  text-align: left;
  border: 1px solid var(--vsa-border);
  background: rgba(0,0,0,0.22);
  border-radius: 12px;
  padding: 12px;
  color: var(--vsa-text);
  cursor: pointer;
  font-family: var(--vsa-font);
  display: flex;
  flex-direction: column;
  gap: 3px;
  transition: border-color 0.15s, background 0.15s, transform 0.15s;
  position: relative;
}
#videosearch-ai-panel .vsa-more-card:hover {
  border-color: var(--vsa-accent-border);
  background: var(--vsa-accent-dim);
  transform: translateY(-1px);
}
#videosearch-ai-panel .vsa-more-card.vsa-more-vault {
  grid-column: 1 / -1;
  background: linear-gradient(135deg, rgba(62,207,142,0.1), rgba(108,182,255,0.05));
  border-color: var(--vsa-accent-border);
}
#videosearch-ai-panel .vsa-more-ico {
  display: inline-flex;
  width: 32px;
  height: 32px;
  border-radius: 9px;
  align-items: center;
  justify-content: center;
  margin-bottom: 4px;
  color: var(--vsa-accent);
  background: var(--vsa-accent-dim);
  border: 1px solid var(--vsa-accent-border);
}
#videosearch-ai-panel .vsa-more-card strong {
  font-size: 12.5px;
  font-weight: 700;
  letter-spacing: -0.02em;
}
#videosearch-ai-panel .vsa-more-card span {
  font-size: 10.5px;
  color: var(--vsa-muted);
  line-height: 1.35;
}
#videosearch-ai-panel .vsa-more-card em {
  position: absolute;
  top: 10px; right: 10px;
  font-style: normal;
  font-size: 10px;
  font-weight: 700;
  color: var(--vsa-accent);
  font-family: var(--vsa-mono);
}

/* ── Fields / settings ── */
#videosearch-ai-panel .vsa-settings-title {
  font-size: 13px;
  font-weight: 750;
  letter-spacing: -0.02em;
  margin-bottom: 4px;
}
#videosearch-ai-panel .vsa-settings-help {
  font-size: 11.5px;
  color: var(--vsa-muted);
  line-height: 1.4;
  margin: 0 0 10px;
}
#videosearch-ai-panel .vsa-field {
  display: flex;
  flex-direction: column;
  gap: 5px;
  margin-bottom: 10px;
}
#videosearch-ai-panel .vsa-field > span {
  font-size: 10.5px;
  font-weight: 650;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--vsa-faint);
}
#videosearch-ai-panel .vsa-field input,
#videosearch-ai-panel .vsa-field textarea {
  border: 1px solid var(--vsa-border);
  border-radius: 9px;
  background: rgba(0,0,0,0.35);
  color: var(--vsa-text);
  font-family: var(--vsa-font);
  font-size: 12.5px;
  padding: 9px 11px;
  outline: none;
}
#videosearch-ai-panel .vsa-field input:focus {
  border-color: var(--vsa-accent-border);
  box-shadow: 0 0 0 3px var(--vsa-accent-dim);
}
#videosearch-ai-panel .vsa-settings-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
#videosearch-ai-panel .vsa-save-settings {
  border: none;
  border-radius: 9px;
  padding: 9px 14px;
  font-family: var(--vsa-font);
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
  background: var(--vsa-accent);
  color: #04140c;
}
#videosearch-ai-panel .vsa-settings-msg {
  font-size: 11px;
  color: var(--vsa-muted);
}

/* ── Auth ── */
#videosearch-ai-panel .vsa-auth {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 4px 0 6px;
}
#videosearch-ai-panel .vsa-auth-hero { text-align: left; padding: 2px 0; }
#videosearch-ai-panel .vsa-auth-title {
  font-size: 16px;
  font-weight: 800;
  letter-spacing: -0.03em;
}
#videosearch-ai-panel .vsa-auth-sub {
  margin: 6px 0 0;
  font-size: 12px;
  line-height: 1.45;
  color: var(--vsa-muted);
}
#videosearch-ai-panel .vsa-auth-modes {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 4px;
  padding: 3px;
  border-radius: 10px;
  background: rgba(0,0,0,0.35);
  border: 1px solid var(--vsa-border);
}
#videosearch-ai-panel .vsa-auth-mode {
  border: none;
  border-radius: 7px;
  padding: 8px;
  font-family: var(--vsa-font);
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
  background: transparent;
  color: var(--vsa-muted);
}
#videosearch-ai-panel .vsa-auth-mode.is-on {
  background: var(--vsa-surface-2);
  color: var(--vsa-text);
}
#videosearch-ai-panel .vsa-auth-form {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
#videosearch-ai-panel .vsa-pass-row {
  display: flex;
  gap: 6px;
}
#videosearch-ai-panel .vsa-pass-row input { flex: 1; min-width: 0; }
#videosearch-ai-panel .vsa-pass-toggle {
  border: 1px solid var(--vsa-border);
  background: rgba(255,255,255,0.04);
  color: var(--vsa-muted);
  border-radius: 9px;
  padding: 0 10px;
  font-family: var(--vsa-font);
  font-size: 11px;
  font-weight: 650;
  cursor: pointer;
}
#videosearch-ai-panel .vsa-auth-submit {
  margin-top: 6px;
  border: none;
  border-radius: 10px;
  padding: 11px 14px;
  font-family: var(--vsa-font);
  font-size: 13px;
  font-weight: 750;
  cursor: pointer;
  background: var(--vsa-accent);
  color: #04140c;
  width: 100%;
}
#videosearch-ai-panel .vsa-auth-submit:disabled { opacity: 0.6; cursor: wait; }
#videosearch-ai-panel .vsa-auth-advanced {
  margin-top: 4px;
  border-radius: 10px;
  border: 1px solid var(--vsa-border);
  background: rgba(0,0,0,0.2);
  padding: 8px 10px;
}
#videosearch-ai-panel .vsa-auth-advanced summary {
  cursor: pointer;
  font-size: 11px;
  font-weight: 650;
  color: var(--vsa-muted);
  list-style: none;
}
#videosearch-ai-panel .vsa-auth-advanced summary::-webkit-details-marker { display: none; }
#videosearch-ai-panel .vsa-cloud-msg {
  display: block;
  margin: 6px 0 0;
  font-size: 11.5px;
  color: var(--vsa-muted);
  min-height: 1.2em;
}
#videosearch-ai-panel .vsa-cloud-msg.is-error { color: var(--vsa-danger); }
#videosearch-ai-panel .vsa-cloud-msg.is-ok { color: var(--vsa-accent); }

#videosearch-ai-panel .vsa-profile-card {
  display: flex;
  gap: 12px;
  align-items: center;
  padding: 14px;
  border-radius: 14px;
  border: 1px solid var(--vsa-border);
  background: rgba(0,0,0,0.25);
}
#videosearch-ai-panel .vsa-profile-av {
  width: 44px; height: 44px;
  border-radius: 12px;
  display: grid;
  place-items: center;
  font-size: 14px;
  font-weight: 800;
  background: linear-gradient(145deg, #3ecf8e, #2a9d6a);
  color: #04140c;
  flex-shrink: 0;
}
#videosearch-ai-panel .vsa-profile-name {
  font-size: 14px;
  font-weight: 750;
  letter-spacing: -0.02em;
}
#videosearch-ai-panel .vsa-profile-email {
  font-size: 11.5px;
  color: var(--vsa-muted);
  margin-top: 2px;
  word-break: break-all;
}
#videosearch-ai-panel .vsa-profile-stats {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 6px;
}
#videosearch-ai-panel .vsa-profile-stat {
  text-align: center;
  padding: 12px 6px;
  border-radius: 12px;
  border: 1px solid var(--vsa-border);
  background: rgba(0,0,0,0.22);
}
#videosearch-ai-panel .vsa-profile-stat b {
  display: block;
  font-size: 16px;
  letter-spacing: -0.03em;
  font-weight: 750;
}
#videosearch-ai-panel .vsa-profile-stat span {
  font-size: 9.5px;
  font-weight: 650;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--vsa-faint);
}
#videosearch-ai-panel .vsa-cloud-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
#videosearch-ai-panel .vsa-auth-sync-now {
  border: none;
  border-radius: 9px;
  padding: 9px 14px;
  font-family: var(--vsa-font);
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
  background: var(--vsa-accent);
  color: #04140c;
}
#videosearch-ai-panel .vsa-cloud-logout {
  border: 1px solid var(--vsa-border);
  border-radius: 9px;
  padding: 9px 14px;
  font-family: var(--vsa-font);
  font-size: 12px;
  font-weight: 650;
  cursor: pointer;
  background: transparent;
  color: var(--vsa-muted);
}
#videosearch-ai-panel .vsa-cloud-logout:hover {
  color: var(--vsa-danger);
  border-color: rgba(240,113,120,0.4);
}

/* ── Notes / highlights ── */
#videosearch-ai-panel .vsa-hl-pane {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
#videosearch-ai-panel .vsa-hl-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
}
#videosearch-ai-panel .vsa-hl-title {
  font-size: 13px;
  font-weight: 750;
  letter-spacing: -0.02em;
}
#videosearch-ai-panel .vsa-hl-sub {
  font-size: 11px;
  color: var(--vsa-muted);
  margin-top: 2px;
}
#videosearch-ai-panel .vsa-hl-actions {
  display: flex;
  gap: 6px;
  flex-shrink: 0;
}
#videosearch-ai-panel .vsa-hl-add,
#videosearch-ai-panel .vsa-ss-add {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  border: 1px solid var(--vsa-border);
  border-radius: 9px;
  padding: 7px 10px;
  font-family: var(--vsa-font);
  font-size: 11.5px;
  font-weight: 700;
  cursor: pointer;
  background: rgba(255,255,255,0.03);
  color: var(--vsa-text);
  transition: border-color 0.15s, background 0.15s;
}
#videosearch-ai-panel .vsa-hl-add:hover {
  border-color: rgba(240,113,120,0.4);
  background: rgba(240,113,120,0.1);
  color: #fca5a5;
}
#videosearch-ai-panel .vsa-ss-add:hover {
  border-color: rgba(108,182,255,0.4);
  background: rgba(108,182,255,0.1);
  color: #93c5fd;
}
#videosearch-ai-panel .vsa-hl-add-ico,
#videosearch-ai-panel .vsa-ss-add-ico {
  display: inline-flex;
  width: 14px; height: 14px;
}
#videosearch-ai-panel .vsa-hl-sync-row {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
#videosearch-ai-panel .vsa-hl-sync {
  border: none;
  border-radius: 9px;
  padding: 7px 12px;
  font-family: var(--vsa-font);
  font-size: 11.5px;
  font-weight: 700;
  cursor: pointer;
  background: var(--vsa-accent);
  color: #04140c;
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
#videosearch-ai-panel .vsa-hl-sync-ico {
  display: inline-flex;
  width: 13px;
  height: 13px;
}
#videosearch-ai-panel .vsa-hl-sync-msg {
  font-size: 11px;
  color: var(--vsa-muted);
  flex: 1;
  min-width: 0;
}
#videosearch-ai-panel .vsa-hl-sync-msg.is-error { color: var(--vsa-danger); }
#videosearch-ai-panel .vsa-ss-section-title,
#videosearch-ai-panel .vsa-hl-section-title {
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--vsa-faint);
  margin-top: 4px;
}
#videosearch-ai-panel .vsa-ss-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
  max-height: min(200px, 28vh);
  overflow-y: auto;
}
#videosearch-ai-panel .vsa-ss-empty,
#videosearch-ai-panel .vsa-hl-empty {
  font-size: 11.5px;
  color: var(--vsa-muted);
  padding: 8px 2px;
  line-height: 1.4;
}
#videosearch-ai-panel .vsa-ss-card {
  border-radius: 10px;
  border: 1px solid var(--vsa-border);
  background: rgba(0,0,0,0.28);
  overflow: hidden;
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding-bottom: 6px;
}
#videosearch-ai-panel .vsa-ss-card.is-new {
  box-shadow: 0 0 0 1px rgba(108,182,255,0.5);
}
#videosearch-ai-panel .vsa-ss-card img {
  width: 100%;
  aspect-ratio: 16/9;
  object-fit: cover;
  cursor: pointer;
  display: block;
}
#videosearch-ai-panel .vsa-ss-meta {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0 6px;
  font-family: var(--vsa-mono);
  font-size: 10px;
  color: var(--vsa-info);
  font-weight: 600;
}
#videosearch-ai-panel .vsa-ss-card .vsa-hl-note {
  margin: 0 6px;
  min-height: 36px;
}
#videosearch-ai-panel .vsa-ss-cloud {
  font-size: 9.5px;
  color: var(--vsa-info);
  padding: 0 8px;
}
#videosearch-ai-panel .vsa-hl-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  overflow-y: auto;
  max-height: min(260px, 36vh);
  scrollbar-width: thin;
}
#videosearch-ai-panel .vsa-hl-card {
  padding: 10px;
  border-radius: 11px;
  background: rgba(0,0,0,0.28);
  border: 1px solid var(--vsa-border);
  border-left: 3px solid var(--vsa-danger);
  transition: box-shadow 0.25s, border-color 0.25s;
}
#videosearch-ai-panel .vsa-hl-card.is-new {
  box-shadow: 0 0 0 1px rgba(240,113,120,0.45);
}
#videosearch-ai-panel .vsa-hl-card-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 6px;
}
#videosearch-ai-panel .vsa-hl-time {
  border: none;
  background: transparent;
  color: var(--vsa-danger);
  font-family: var(--vsa-mono);
  font-size: 11.5px;
  font-weight: 700;
  cursor: pointer;
  padding: 0;
}
#videosearch-ai-panel .vsa-hl-del {
  border: none;
  background: transparent;
  color: var(--vsa-faint);
  font-size: 16px;
  line-height: 1;
  cursor: pointer;
  padding: 0 4px;
}
#videosearch-ai-panel .vsa-hl-del:hover { color: var(--vsa-danger); }
#videosearch-ai-panel .vsa-hl-note {
  width: 100%;
  border: 1px solid var(--vsa-border);
  border-radius: 8px;
  background: rgba(0,0,0,0.25);
  color: var(--vsa-text);
  font-family: var(--vsa-font);
  font-size: 12px;
  padding: 7px 8px;
  resize: vertical;
  outline: none;
}
#videosearch-ai-panel .vsa-hl-note:focus {
  border-color: var(--vsa-accent-border);
}

/* Topics */
#videosearch-ai-panel .vsa-topics {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
#videosearch-ai-panel .vsa-topic {
  display: grid;
  grid-template-columns: 52px 1fr;
  gap: 10px;
  align-items: start;
  text-align: left;
  width: 100%;
  border: 1px solid var(--vsa-border);
  border-radius: 11px;
  background: rgba(0,0,0,0.22);
  padding: 10px;
  color: var(--vsa-text);
  cursor: pointer;
  font-family: var(--vsa-font);
  transition: border-color 0.15s, background 0.15s;
}
#videosearch-ai-panel .vsa-topic:hover {
  border-color: var(--vsa-accent-border);
  background: var(--vsa-accent-dim);
}
#videosearch-ai-panel .vsa-topic-time {
  font-family: var(--vsa-mono);
  font-size: 11px;
  font-weight: 600;
  color: var(--vsa-accent);
}
#videosearch-ai-panel .vsa-topic-label {
  font-size: 12.5px;
  font-weight: 650;
  letter-spacing: -0.01em;
  line-height: 1.35;
}

/* Chat host fill */
#videosearch-ai-panel .vsa-chat-host,
#videosearch-ai-panel .vsa-transcript-host {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

/* Mood */
#videosearch-ai-panel .vsa-comments { display: flex; flex-direction: column; gap: 10px; }
#videosearch-ai-panel .vsa-mood-head {
  padding: 12px;
  border-radius: 12px;
  border: 1px solid var(--vsa-border);
  background: rgba(0,0,0,0.22);
}
#videosearch-ai-panel .vsa-mood-label { font-weight: 750; font-size: 13px; }
#videosearch-ai-panel .vsa-mood-meta { font-size: 11px; color: var(--vsa-muted); margin-top: 2px; }
#videosearch-ai-panel .vsa-mood-bar {
  display: flex;
  height: 6px;
  border-radius: 999px;
  overflow: hidden;
  margin: 10px 0 6px;
  background: rgba(255,255,255,0.06);
}
#videosearch-ai-panel .vsa-mood-pos { background: var(--vsa-accent); }
#videosearch-ai-panel .vsa-mood-neu { background: var(--vsa-faint); }
#videosearch-ai-panel .vsa-mood-neg { background: var(--vsa-danger); }
#videosearch-ai-panel .vsa-mood-legend {
  display: flex;
  gap: 10px;
  font-size: 10.5px;
  color: var(--vsa-muted);
  flex-wrap: wrap;
}
#videosearch-ai-panel .vsa-mood-summary {
  margin: 10px 0 0;
  font-size: 12px;
  color: var(--vsa-muted);
  line-height: 1.45;
}
#videosearch-ai-panel .vsa-comments-load {
  border: none;
  border-radius: 9px;
  padding: 8px 12px;
  font-family: var(--vsa-font);
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
  background: var(--vsa-accent);
  color: #04140c;
  margin-top: 8px;
}
#videosearch-ai-panel .vsa-spinner {
  display: inline-block;
  width: 12px; height: 12px;
  border: 2px solid rgba(255,255,255,0.15);
  border-top-color: var(--vsa-accent);
  border-radius: 50%;
  animation: vsa-spin 0.7s linear infinite;
  margin-right: 6px;
  vertical-align: -2px;
}
@keyframes vsa-spin { to { transform: rotate(360deg); } }

/* Chat pane */
#videosearch-ai-panel .vsa-chat {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-height: 200px;
  flex: 1;
}
#videosearch-ai-panel .vsa-chat-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
#videosearch-ai-panel .vsa-chat-title {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  font-size: 12.5px;
  font-weight: 700;
  letter-spacing: -0.02em;
}
#videosearch-ai-panel .vsa-chat-title-ico {
  display: inline-flex;
  color: var(--vsa-accent);
}
#videosearch-ai-panel .vsa-chat-clear {
  border: 1px solid var(--vsa-border);
  background: transparent;
  color: var(--vsa-muted);
  border-radius: 8px;
  padding: 5px 10px;
  font-family: var(--vsa-font);
  font-size: 11px;
  font-weight: 650;
  cursor: pointer;
}
#videosearch-ai-panel .vsa-chat-list {
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-height: min(280px, 40vh);
}
#videosearch-ai-panel .vsa-chat-composer {
  display: flex;
  gap: 6px;
  align-items: flex-end;
}
#videosearch-ai-panel .vsa-chat-input {
  flex: 1;
  border: 1px solid var(--vsa-border);
  border-radius: 10px;
  background: rgba(0,0,0,0.35);
  color: var(--vsa-text);
  font-family: var(--vsa-font);
  font-size: 12.5px;
  padding: 9px 11px;
  outline: none;
  resize: none;
}
#videosearch-ai-panel .vsa-chat-send {
  border: none;
  border-radius: 10px;
  width: 40px;
  height: 40px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  background: var(--vsa-accent);
  color: #04140c;
  flex-shrink: 0;
}
#videosearch-ai-panel .vsa-chat-empty {
  padding: 16px 12px;
  border-radius: 12px;
  border: 1px dashed var(--vsa-border);
  color: var(--vsa-muted);
  font-size: 12px;
  line-height: 1.45;
}
#videosearch-ai-panel .vsa-chat-suggest {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
#videosearch-ai-panel .vsa-chat-chip {
  border: 1px solid var(--vsa-border);
  background: rgba(0,0,0,0.22);
  color: var(--vsa-muted);
  border-radius: 999px;
  padding: 5px 10px;
  font-family: var(--vsa-font);
  font-size: 10.5px;
  font-weight: 600;
  cursor: pointer;
}
#videosearch-ai-panel .vsa-chat-chip:hover {
  color: var(--vsa-text);
  border-color: var(--vsa-accent-border);
  background: var(--vsa-accent-dim);
}
#videosearch-ai-panel .vsa-auth-mark {
  width: 48px;
  height: 48px;
  border-radius: 14px;
  display: grid;
  place-items: center;
  margin: 0 auto 10px;
  color: var(--vsa-accent);
  background: var(--vsa-accent-dim);
  border: 1px solid var(--vsa-accent-border);
}
#videosearch-ai-panel .vsa-auth-hero { text-align: center; }
#videosearch-ai-panel .vsa-pass-toggle {
  display: inline-flex !important;
  align-items: center;
  justify-content: center;
  width: 40px;
  min-width: 40px;
  padding: 0 !important;
}
#videosearch-ai-panel .vsa-btn-vault,
#videosearch-ai-panel .vsa-auth-sync-now,
#videosearch-ai-panel .vsa-cloud-logout {
  display: inline-flex !important;
  align-items: center;
  justify-content: center;
  gap: 7px;
}
#videosearch-ai-panel .vsa-ss-cloud {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}
#videosearch-ai-panel .vsa-back {
  display: inline-flex !important;
  align-items: center;
  gap: 5px;
}
#videosearch-ai-panel .vsa-collapse-btn {
  display: inline-flex !important;
}

/* Responsive */
@media (max-width: 480px) {
  #videosearch-ai-root {
    right: 10px;
    left: 10px;
    width: auto;
    max-width: none;
    bottom: max(72px, env(safe-area-inset-bottom, 0px));
  }
  #videosearch-ai-root.is-collapsed {
    left: auto;
    right: 12px;
    width: auto;
  }
  #videosearch-ai-panel .vsa-status { display: none; }
  #videosearch-ai-panel .vsa-tabs {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }
  #videosearch-ai-panel .vsa-input { font-size: 16px; }
}

@media (prefers-reduced-motion: reduce) {
  #videosearch-ai-panel *,
  #videosearch-ai-root.is-collapsed #videosearch-ai-panel {
    animation: none !important;
    transition: none !important;
  }
}
`;
