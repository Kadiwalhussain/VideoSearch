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
  /* Expanded panel: bottom-right, clear of player float tools */
  right: max(12px, env(safe-area-inset-right, 0px));
  bottom: max(64px, env(safe-area-inset-bottom, 0px));
  left: auto;
  top: auto;
  width: min(380px, calc(100vw - 20px));
  max-height: min(86vh, 720px);
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
/* Collapsed pill: bottom-LEFT so it never hits camera/mark stack on the right */
#videosearch-ai-root.is-collapsed {
  right: auto !important;
  left: max(16px, env(safe-area-inset-left, 0px)) !important;
  bottom: max(68px, env(safe-area-inset-bottom, 0px)) !important;
  top: auto !important;
  width: auto !important;
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
  padding: 7px 12px 7px 8px;
  gap: 8px;
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
  gap: 6px;
  padding: 5px 8px 4px;
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
  width: 20px; height: 20px;
  border-radius: 6px;
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
  font-size: 11.5px;
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
  font-size: 10px;
  font-weight: 500;
  color: var(--vsa-muted);
  text-align: right;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  padding-right: 2px;
  max-width: 96px;
}
#videosearch-ai-panel .vsa-collapse-btn {
  width: 24px; height: 24px;
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
  width: 22px !important;
  height: 22px !important;
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
  padding: 0 6px 6px;
  margin: 0;
}
#videosearch-ai-panel .vsa-tab {
  display: inline-flex;
  flex-direction: row !important;
  align-items: center;
  justify-content: center;
  gap: 3px !important;
  min-height: 26px !important;
  min-width: 0;
  padding: 3px 5px;
  border: 1px solid transparent;
  border-radius: 8px !important;
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
  font-size: 10.5px !important;
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
  padding: 0 8px 8px;
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
  padding: 4px 6px;
  font-family: var(--vsa-font);
  font-size: 10.5px;
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
#videosearch-ai-panel .vsa-empty-transcript strong {
  display: block;
  color: var(--vsa-text);
  font-size: 13px;
  font-weight: 750;
  margin-bottom: 8px;
}
#videosearch-ai-panel .vsa-empty-transcript p {
  margin: 0 0 8px;
}
#videosearch-ai-panel .vsa-empty-transcript .vsa-retry {
  margin-top: 4px;
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
  background: linear-gradient(165deg, rgba(255,255,255,0.04), rgba(0,0,0,0.28));
  border-radius: 14px;
  padding: 13px 12px 12px;
  color: var(--vsa-text);
  cursor: pointer;
  font-family: var(--vsa-font);
  display: flex;
  flex-direction: column;
  gap: 4px;
  transition: border-color 0.15s, background 0.15s, transform 0.15s, box-shadow 0.15s;
  position: relative;
}
#videosearch-ai-panel .vsa-more-card:hover {
  border-color: rgba(62, 207, 142, 0.4);
  background: linear-gradient(165deg, rgba(62, 207, 142, 0.12), rgba(0, 0, 0, 0.3));
  transform: translateY(-1px);
  box-shadow: 0 8px 20px rgba(0, 0, 0, 0.25);
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

/* ── Signed-in profile (premium) ── */
#videosearch-ai-panel .vsa-auth-profile {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
#videosearch-ai-panel .vsa-profile-hero {
  position: relative;
  overflow: hidden;
  border-radius: 18px;
  padding: 16px 16px 14px;
  border: 1px solid rgba(62, 207, 142, 0.28);
  background:
    radial-gradient(ellipse 80% 90% at 100% 0%, rgba(62,207,142,0.2), transparent 55%),
    radial-gradient(ellipse 50% 70% at 0% 100%, rgba(56,189,248,0.1), transparent 50%),
    linear-gradient(160deg, rgba(18,24,36,0.95), rgba(8,12,20,0.98));
  box-shadow: 0 12px 32px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.06);
}
#videosearch-ai-panel .vsa-profile-glow {
  position: absolute;
  right: -30%;
  top: -40%;
  width: 140px;
  height: 140px;
  border-radius: 50%;
  background: radial-gradient(circle, rgba(62,207,142,0.35), transparent 70%);
  pointer-events: none;
  filter: blur(8px);
}
#videosearch-ai-panel .vsa-profile-top {
  position: relative;
  display: flex;
  gap: 12px;
  align-items: center;
}
#videosearch-ai-panel .vsa-profile-av-wrap {
  position: relative;
  flex-shrink: 0;
}
#videosearch-ai-panel .vsa-profile-av {
  width: 52px;
  height: 52px;
  border-radius: 16px;
  display: grid;
  place-items: center;
  font-size: 15px;
  font-weight: 800;
  letter-spacing: -0.03em;
  background: linear-gradient(145deg, #6ee7b7, #34d399 55%, #2dd4bf);
  color: #04140c;
  box-shadow:
    0 0 0 2px rgba(16,20,30,0.9),
    0 0 0 3px rgba(62,207,142,0.45),
    0 8px 24px rgba(52,211,153,0.35);
}
#videosearch-ai-panel .vsa-profile-online {
  position: absolute;
  right: -1px;
  bottom: -1px;
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: #34d399;
  border: 2px solid #0c1018;
  box-shadow: 0 0 8px rgba(52,211,153,0.7);
}
#videosearch-ai-panel .vsa-profile-meta {
  min-width: 0;
  flex: 1;
}
#videosearch-ai-panel .vsa-profile-kicker {
  font-size: 10px;
  font-weight: 750;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--vsa-accent);
  margin-bottom: 3px;
}
#videosearch-ai-panel .vsa-profile-name {
  font-size: 16px;
  font-weight: 800;
  letter-spacing: -0.03em;
  line-height: 1.15;
  color: var(--vsa-text);
}
#videosearch-ai-panel .vsa-profile-email {
  font-size: 11.5px;
  color: var(--vsa-muted);
  margin-top: 3px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
#videosearch-ai-panel .vsa-profile-badges {
  position: relative;
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 12px;
}
#videosearch-ai-panel .vsa-profile-badge {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.02em;
  padding: 4px 9px;
  border-radius: 999px;
  border: 1px solid var(--vsa-border);
  background: rgba(0,0,0,0.28);
  color: var(--vsa-muted);
}
#videosearch-ai-panel .vsa-profile-badge.is-live {
  color: var(--vsa-accent);
  border-color: rgba(62,207,142,0.35);
  background: rgba(62,207,142,0.1);
}
#videosearch-ai-panel .vsa-pulse {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--vsa-accent);
  box-shadow: 0 0 0 0 rgba(62,207,142,0.5);
  animation: vsa-pulse-dot 1.8s ease infinite;
}
@keyframes vsa-pulse-dot {
  0% { box-shadow: 0 0 0 0 rgba(62,207,142,0.45); }
  70% { box-shadow: 0 0 0 7px rgba(62,207,142,0); }
  100% { box-shadow: 0 0 0 0 rgba(62,207,142,0); }
}

#videosearch-ai-panel .vsa-profile-stats {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
}
#videosearch-ai-panel .vsa-profile-stat {
  text-align: center;
  padding: 12px 8px 11px;
  border-radius: 14px;
  border: 1px solid var(--vsa-border);
  background:
    linear-gradient(180deg, rgba(255,255,255,0.04), transparent 40%),
    rgba(0,0,0,0.28);
  transition: border-color 0.15s, transform 0.15s;
}
#videosearch-ai-panel .vsa-profile-stat:hover {
  border-color: rgba(62,207,142,0.3);
  transform: translateY(-1px);
}
#videosearch-ai-panel .vsa-profile-stat-ico {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  margin: 0 auto 6px;
  border-radius: 7px;
  color: var(--vsa-accent);
  background: rgba(62,207,142,0.12);
  border: 1px solid rgba(62,207,142,0.2);
}
#videosearch-ai-panel .vsa-profile-stat-ico svg {
  width: 12px;
  height: 12px;
}
#videosearch-ai-panel .vsa-profile-stat b {
  display: block;
  font-size: 18px;
  letter-spacing: -0.04em;
  font-weight: 800;
  font-variant-numeric: tabular-nums;
  line-height: 1.1;
  color: var(--vsa-text);
}
#videosearch-ai-panel .vsa-profile-stat span {
  display: block;
  margin-top: 3px;
  font-size: 10px;
  font-weight: 650;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--vsa-faint);
}

#videosearch-ai-panel .vsa-profile-actions {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
#videosearch-ai-panel .vsa-btn-primary {
  display: flex !important;
  align-items: center;
  gap: 12px;
  width: 100%;
  border: none;
  border-radius: 14px;
  padding: 13px 14px;
  text-align: left;
  cursor: pointer;
  font-family: var(--vsa-font);
  color: #04140c;
  background: linear-gradient(135deg, #a7f3d0, #34d399 50%, #2dd4bf);
  box-shadow:
    0 10px 28px rgba(52,211,153,0.28),
    inset 0 1px 0 rgba(255,255,255,0.4);
  transition: transform 0.15s ease, filter 0.15s;
}
#videosearch-ai-panel .vsa-btn-primary:hover {
  transform: translateY(-1px);
  filter: brightness(1.04);
}
#videosearch-ai-panel .vsa-btn-primary > span:first-child {
  display: grid;
  place-items: center;
  width: 32px;
  height: 32px;
  border-radius: 10px;
  background: rgba(4,20,12,0.12);
  flex-shrink: 0;
}
#videosearch-ai-panel .vsa-btn-label {
  display: flex;
  flex-direction: column;
  gap: 1px;
  min-width: 0;
}
#videosearch-ai-panel .vsa-btn-label strong {
  font-size: 13.5px;
  font-weight: 800;
  letter-spacing: -0.02em;
}
#videosearch-ai-panel .vsa-btn-label em {
  font-style: normal;
  font-size: 11px;
  font-weight: 600;
  opacity: 0.72;
}
#videosearch-ai-panel .vsa-profile-row {
  display: grid;
  grid-template-columns: 1.2fr 0.8fr;
  gap: 8px;
}
#videosearch-ai-panel .vsa-btn-secondary {
  display: inline-flex !important;
  align-items: center;
  justify-content: center;
  gap: 7px;
  border: 1px solid rgba(62,207,142,0.3);
  border-radius: 12px;
  padding: 11px 12px;
  font-family: var(--vsa-font);
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
  background: rgba(62,207,142,0.1);
  color: var(--vsa-accent);
  transition: background 0.15s, border-color 0.15s;
}
#videosearch-ai-panel .vsa-btn-secondary:hover {
  background: rgba(62,207,142,0.16);
  border-color: rgba(62,207,142,0.45);
}
#videosearch-ai-panel .vsa-btn-ghost {
  display: inline-flex !important;
  align-items: center;
  justify-content: center;
  gap: 6px;
  border: 1px solid var(--vsa-border);
  border-radius: 12px;
  padding: 11px 12px;
  font-family: var(--vsa-font);
  font-size: 12px;
  font-weight: 650;
  cursor: pointer;
  background: rgba(255,255,255,0.02);
  color: var(--vsa-muted);
  transition: color 0.15s, border-color 0.15s, background 0.15s;
}
#videosearch-ai-panel .vsa-btn-ghost:hover {
  color: #fca5a5;
  border-color: rgba(248,113,113,0.35);
  background: rgba(248,113,113,0.08);
}

/* legacy aliases */
#videosearch-ai-panel .vsa-cloud-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
#videosearch-ai-panel .vsa-auth-sync-now.vsa-btn-secondary {
  background: rgba(62,207,142,0.1);
}
#videosearch-ai-panel .vsa-cloud-logout.vsa-btn-ghost {
  background: rgba(255,255,255,0.02);
}

/* ── Notes / highlights (premium) ── */
#videosearch-ai-panel .vsa-hl-pane {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
#videosearch-ai-panel .vsa-hl-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}
#videosearch-ai-panel .vsa-hl-title {
  font-size: 14px;
  font-weight: 800;
  letter-spacing: -0.03em;
}
#videosearch-ai-panel .vsa-hl-sub {
  font-size: 11px;
  color: var(--vsa-muted);
  margin-top: 2px;
}

/* Live cloud status pill */
#videosearch-ai-panel .vsa-cloud-pill {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 5px 10px 5px 8px;
  border-radius: 999px;
  border: 1px solid var(--vsa-border);
  background: rgba(0,0,0,0.28);
  font-size: 10.5px;
  font-weight: 700;
  color: var(--vsa-muted);
  flex-shrink: 0;
  max-width: 46%;
  transition: border-color 0.2s, background 0.2s, color 0.2s;
}
#videosearch-ai-panel .vsa-cloud-pill-ico {
  display: inline-flex;
  width: 14px;
  height: 14px;
  flex-shrink: 0;
}
#videosearch-ai-panel .vsa-cloud-pill-txt {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
#videosearch-ai-panel .vsa-cloud-pill[data-cloud-state="uploading"],
#videosearch-ai-panel .vsa-cloud-pill[data-cloud-state="pending"] {
  color: #7dd3fc;
  border-color: rgba(125,211,252,0.35);
  background: rgba(56,189,248,0.1);
}
#videosearch-ai-panel .vsa-cloud-pill[data-cloud-state="ok"] {
  color: var(--vsa-accent);
  border-color: var(--vsa-accent-border);
  background: var(--vsa-accent-dim);
}
#videosearch-ai-panel .vsa-cloud-pill[data-cloud-state="error"] {
  color: #fca5a5;
  border-color: rgba(248,113,113,0.35);
  background: rgba(248,113,113,0.1);
}
#videosearch-ai-panel .vsa-cloud-pill[data-cloud-state="offline"] {
  color: #fbbf24;
  border-color: rgba(251,191,36,0.3);
  background: rgba(251,191,36,0.08);
}
#videosearch-ai-panel .vsa-cloud-pill.is-spin .vsa-cloud-pill-ico {
  animation: vsa-cloud-spin 0.85s linear infinite;
}
@keyframes vsa-cloud-spin {
  to { transform: rotate(360deg); }
}

/* Library: save / watch later / playlists */
#videosearch-ai-panel .vsa-lib-bar {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
#videosearch-ai-panel .vsa-lib-bar .vsa-lib-btn {
  flex: 1 1 calc(33.33% - 4px);
  min-width: 0;
}
#videosearch-ai-panel .vsa-lib-btn-links,
#videosearch-ai-panel .vsa-lib-btn-ytpl {
  flex: 1 1 100%;
}
#videosearch-ai-panel .vsa-lib-links-panel {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin: 2px 0 4px;
}
#videosearch-ai-panel .vsa-lib-link-chip {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  max-width: 100%;
  padding: 4px 8px;
  border-radius: 999px;
  border: 1px solid var(--vsa-border);
  background: rgba(255,255,255,0.03);
  color: var(--vsa-text);
  text-decoration: none;
  font-size: 10px;
  font-weight: 600;
  line-height: 1.2;
  overflow: hidden;
}
#videosearch-ai-panel .vsa-lib-link-chip:hover {
  border-color: var(--vsa-accent-border);
  background: var(--vsa-accent-dim);
}
#videosearch-ai-panel .vsa-lib-link-kind {
  flex-shrink: 0;
  color: var(--vsa-accent);
  text-transform: uppercase;
  font-size: 9px;
  letter-spacing: 0.04em;
}
#videosearch-ai-panel .vsa-lib-link-label {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 140px;
  color: var(--vsa-muted);
}
#videosearch-ai-panel .vsa-lib-link-more {
  font-size: 10px;
  color: var(--vsa-muted);
  align-self: center;
  padding: 0 4px;
}
#videosearch-ai-panel .vsa-lib-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  border: 1px solid var(--vsa-border);
  border-radius: 8px;
  padding: 5px 6px;
  font-family: var(--vsa-font);
  font-size: 10.5px;
  font-weight: 700;
  letter-spacing: -0.01em;
  cursor: pointer;
  background: rgba(255,255,255,0.03);
  color: var(--vsa-muted);
  transition: border-color 0.15s, background 0.15s, color 0.15s;
}
#videosearch-ai-panel .vsa-lib-btn:hover {
  color: var(--vsa-text);
  border-color: rgba(255,255,255,0.16);
}
#videosearch-ai-panel .vsa-lib-btn.is-on {
  color: var(--vsa-accent);
  border-color: var(--vsa-accent-border);
  background: var(--vsa-accent-dim);
}
#videosearch-ai-panel .vsa-lib-ico {
  display: inline-flex;
  width: 13px;
  height: 13px;
  flex-shrink: 0;
}
#videosearch-ai-panel .vsa-lib-pl-panel {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px;
  border-radius: 14px;
  border: 1px solid var(--vsa-border);
  background: rgba(0,0,0,0.28);
}
#videosearch-ai-panel .vsa-lib-pl-label {
  font-size: 10px;
  font-weight: 750;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--vsa-faint);
}
#videosearch-ai-panel .vsa-lib-pl-list {
  display: flex;
  flex-direction: column;
  gap: 5px;
  max-height: 160px;
  overflow-y: auto;
}
#videosearch-ai-panel .vsa-lib-pl-empty {
  font-size: 11.5px;
  color: var(--vsa-muted);
  padding: 8px 4px;
  text-align: center;
}
#videosearch-ai-panel .vsa-lib-pl-item {
  display: grid;
  grid-template-columns: 22px 1fr auto;
  gap: 8px;
  align-items: center;
  width: 100%;
  border: 1px solid var(--vsa-border);
  border-radius: 10px;
  padding: 9px 10px;
  background: rgba(255,255,255,0.03);
  color: var(--vsa-text);
  font-family: var(--vsa-font);
  cursor: pointer;
  text-align: left;
  transition: border-color 0.15s, background 0.15s;
}
#videosearch-ai-panel .vsa-lib-pl-item:hover {
  border-color: rgba(167,139,250,0.4);
  background: rgba(167,139,250,0.08);
}
#videosearch-ai-panel .vsa-lib-pl-item.is-on {
  border-color: rgba(62,207,142,0.4);
  background: rgba(62,207,142,0.1);
}
#videosearch-ai-panel .vsa-lib-pl-item-check {
  width: 22px;
  height: 22px;
  border-radius: 7px;
  display: grid;
  place-items: center;
  font-size: 12px;
  font-weight: 800;
  background: rgba(255,255,255,0.06);
  color: var(--vsa-muted);
}
#videosearch-ai-panel .vsa-lib-pl-item.is-on .vsa-lib-pl-item-check {
  background: rgba(62,207,142,0.2);
  color: var(--vsa-accent);
}
#videosearch-ai-panel .vsa-lib-pl-item-name {
  font-size: 12.5px;
  font-weight: 700;
  letter-spacing: -0.02em;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
#videosearch-ai-panel .vsa-lib-pl-item-meta {
  font-size: 10px;
  font-weight: 650;
  color: var(--vsa-faint);
  white-space: nowrap;
}
#videosearch-ai-panel .vsa-lib-pl-create {
  display: flex;
  gap: 6px;
  align-items: center;
}
#videosearch-ai-panel .vsa-lib-pl-input {
  flex: 1;
  min-width: 0;
  border: 1px solid var(--vsa-border);
  border-radius: 9px;
  padding: 8px 10px;
  background: rgba(0,0,0,0.28);
  color: var(--vsa-text);
  font-family: var(--vsa-font);
  font-size: 12px;
  outline: none;
}
#videosearch-ai-panel .vsa-lib-pl-input:focus {
  border-color: var(--vsa-accent-border);
}
#videosearch-ai-panel .vsa-lib-pl-go {
  border: none;
  border-radius: 9px;
  padding: 8px 12px;
  font-family: var(--vsa-font);
  font-size: 12px;
  font-weight: 750;
  cursor: pointer;
  background: var(--vsa-accent);
  color: #04140c;
}
#videosearch-ai-panel .vsa-lib-pl-hint {
  margin: 0;
  font-size: 10.5px;
  line-height: 1.4;
  color: var(--vsa-faint);
}
#videosearch-ai-panel .vsa-lib-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
}
#videosearch-ai-panel .vsa-lib-tag {
  font-size: 10px;
  font-weight: 700;
  padding: 4px 8px;
  border-radius: 999px;
  background: rgba(167,139,250,0.14);
  color: #c4b5fd;
  border: 1px solid rgba(167,139,250,0.28);
  font-family: var(--vsa-font);
  cursor: default;
}
#videosearch-ai-panel .vsa-lib-tag.is-removable {
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 4px;
}
#videosearch-ai-panel .vsa-lib-tag.is-removable:hover {
  background: rgba(248,113,113,0.12);
  border-color: rgba(248,113,113,0.35);
  color: #fca5a5;
}

#videosearch-ai-panel .vsa-hl-actions-bar {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 6px;
}
#videosearch-ai-panel .vsa-hl-add,
#videosearch-ai-panel .vsa-ss-add {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  border: 1px solid var(--vsa-border);
  border-radius: 9px;
  padding: 6px 8px;
  font-family: var(--vsa-font);
  font-size: 11px;
  font-weight: 750;
  cursor: pointer;
  background: rgba(255,255,255,0.03);
  color: var(--vsa-text);
  transition: border-color 0.15s, background 0.15s, transform 0.12s;
}
#videosearch-ai-panel .vsa-hl-add:hover {
  border-color: rgba(240,113,120,0.45);
  background: rgba(240,113,120,0.12);
  color: #fecaca;
  transform: translateY(-1px);
}
#videosearch-ai-panel .vsa-ss-add:hover {
  border-color: rgba(108,182,255,0.45);
  background: rgba(108,182,255,0.12);
  color: #bae6fd;
  transform: translateY(-1px);
}
#videosearch-ai-panel .vsa-hl-add-ico,
#videosearch-ai-panel .vsa-ss-add-ico {
  display: inline-flex;
  width: 14px; height: 14px;
}

#videosearch-ai-panel .vsa-ss-section-title,
#videosearch-ai-panel .vsa-hl-section-title {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 10px;
  font-weight: 750;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--vsa-faint);
  margin-top: 2px;
}
#videosearch-ai-panel .vsa-sec-ico {
  display: inline-flex;
  opacity: 0.85;
}

/* Screenshots — compact list with small thumbs */
#videosearch-ai-panel .vsa-ss-grid {
  display: flex;
  flex-direction: column;
  gap: 6px;
  max-height: min(220px, 32vh);
  overflow-y: auto;
  padding-right: 2px;
}
#videosearch-ai-panel .vsa-ss-empty {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 11.5px;
  color: var(--vsa-muted);
  padding: 12px;
  line-height: 1.4;
  border-radius: 12px;
  border: 1px dashed var(--vsa-border);
  background: rgba(0,0,0,0.18);
}
#videosearch-ai-panel .vsa-ss-empty-ico { display: inline-flex; color: var(--vsa-info); flex-shrink: 0; }

#videosearch-ai-panel .vsa-ss-row {
  display: grid;
  grid-template-columns: 56px 1fr 28px;
  gap: 8px;
  align-items: center;
  padding: 6px;
  border-radius: 12px;
  border: 1px solid var(--vsa-border);
  background: rgba(0,0,0,0.28);
  transition: border-color 0.15s, background 0.15s, box-shadow 0.15s;
}
#videosearch-ai-panel .vsa-ss-row:hover {
  border-color: rgba(56,189,248,0.35);
  background: rgba(56,189,248,0.06);
}
#videosearch-ai-panel .vsa-ss-row.is-new {
  box-shadow: 0 0 0 1px rgba(108,182,255,0.5), 0 6px 18px rgba(56,189,248,0.12);
}
#videosearch-ai-panel .vsa-ss-thumb {
  width: 56px;
  height: 36px;
  padding: 0;
  border: 1px solid var(--vsa-border);
  border-radius: 8px;
  overflow: hidden;
  background: #000;
  cursor: pointer;
  flex-shrink: 0;
  line-height: 0;
}
#videosearch-ai-panel .vsa-ss-thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
  transition: transform 0.2s ease;
}
#videosearch-ai-panel .vsa-ss-row:hover .vsa-ss-thumb img {
  transform: scale(1.05);
}
#videosearch-ai-panel .vsa-ss-mid {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
#videosearch-ai-panel .vsa-ss-top {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}
#videosearch-ai-panel .vsa-ss-time {
  border: none;
  background: linear-gradient(135deg, rgba(56,189,248,0.25), rgba(52,211,153,0.15));
  color: #7dd3fc;
  border-radius: 6px;
  padding: 2px 7px;
  font-family: var(--vsa-mono, ui-monospace, monospace);
  font-size: 10.5px;
  font-weight: 750;
  cursor: pointer;
  letter-spacing: -0.02em;
  flex-shrink: 0;
}
#videosearch-ai-panel .vsa-ss-time:hover {
  filter: brightness(1.1);
}
#videosearch-ai-panel .vsa-ss-cloud-dot {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  font-size: 9.5px;
  font-weight: 650;
  color: var(--vsa-faint);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
#videosearch-ai-panel .vsa-ss-cloud-dot.is-synced {
  color: var(--vsa-accent);
}
#videosearch-ai-panel .vsa-ss-note {
  width: 100%;
  border: 1px solid transparent;
  border-radius: 7px;
  background: rgba(0,0,0,0.22);
  color: var(--vsa-text);
  font-family: var(--vsa-font);
  font-size: 11.5px;
  padding: 5px 8px;
  outline: none;
  min-width: 0;
}
#videosearch-ai-panel .vsa-ss-note:focus {
  border-color: rgba(56,189,248,0.4);
  background: rgba(0,0,0,0.35);
}
#videosearch-ai-panel .vsa-ss-note::placeholder {
  color: var(--vsa-faint);
}
#videosearch-ai-panel .vsa-ss-del {
  width: 28px;
  height: 28px;
  border: 1px solid transparent;
  border-radius: 8px;
  background: transparent;
  color: var(--vsa-faint);
  cursor: pointer;
  display: grid;
  place-items: center;
  flex-shrink: 0;
  padding: 0;
}
#videosearch-ai-panel .vsa-ss-del:hover {
  color: #fca5a5;
  border-color: rgba(248,113,113,0.3);
  background: rgba(248,113,113,0.08);
}

#videosearch-ai-panel .vsa-hl-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  gap: 4px;
  padding: 18px 12px;
  border-radius: 14px;
  border: 1px dashed var(--vsa-border);
  background: rgba(0,0,0,0.18);
  color: var(--vsa-muted);
}
#videosearch-ai-panel .vsa-hl-empty-ico {
  display: grid;
  place-items: center;
  width: 40px; height: 40px;
  border-radius: 12px;
  margin-bottom: 4px;
  color: var(--vsa-accent);
  background: var(--vsa-accent-dim);
  border: 1px solid var(--vsa-accent-border);
}
#videosearch-ai-panel .vsa-hl-empty strong {
  font-size: 12.5px;
  color: var(--vsa-text);
  font-weight: 750;
}
#videosearch-ai-panel .vsa-hl-empty p {
  margin: 0;
  font-size: 11px;
  line-height: 1.4;
  max-width: 28ch;
}

/* Marks list — simple stacked items, always readable */
#videosearch-ai-panel .vsa-hl-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  overflow-x: hidden;
  overflow-y: auto;
  max-height: min(340px, 44vh);
  scrollbar-width: thin;
  padding: 0 1px 4px;
  width: 100%;
  box-sizing: border-box;
}

#videosearch-ai-panel .vsa-hl-item {
  --hl-color: #ef4444;
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: 100%;
  max-width: 100%;
  box-sizing: border-box;
  margin: 0;
  padding: 10px 10px 10px 12px;
  border-radius: 12px;
  border: 1px solid var(--vsa-border);
  border-left: 3px solid var(--hl-color);
  background: rgba(0, 0, 0, 0.34);
  transition: border-color 0.15s, background 0.15s, box-shadow 0.15s;
}
#videosearch-ai-panel .vsa-hl-item:hover {
  background: rgba(0, 0, 0, 0.42);
  border-color: color-mix(in srgb, var(--hl-color) 35%, var(--vsa-border));
}
#videosearch-ai-panel .vsa-hl-item.has-note {
  border-left-width: 3px;
}
#videosearch-ai-panel .vsa-hl-item.is-focus {
  border-color: color-mix(in srgb, var(--hl-color) 50%, transparent);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--hl-color) 14%, transparent);
}
#videosearch-ai-panel .vsa-hl-item.is-new {
  border-color: color-mix(in srgb, var(--hl-color) 55%, transparent);
  box-shadow: 0 0 0 1px color-mix(in srgb, var(--hl-color) 30%, transparent),
    0 8px 22px rgba(0, 0, 0, 0.3);
  animation: vsa-card-pop 0.4s var(--vsa-ease);
}
@keyframes vsa-card-pop {
  0% { transform: translateY(4px); opacity: 0.55; }
  100% { transform: none; opacity: 1; }
}

#videosearch-ai-panel .vsa-hl-item-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  width: 100%;
  min-width: 0;
}
#videosearch-ai-panel .vsa-hl-item-left {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
  min-width: 0;
  flex: 1;
}

#videosearch-ai-panel .vsa-hl-time {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  border: 1px solid color-mix(in srgb, var(--hl-color) 42%, transparent);
  background: color-mix(in srgb, var(--hl-color) 16%, transparent);
  color: #fecaca;
  font-family: var(--vsa-mono, ui-monospace, monospace);
  font-size: 11.5px;
  font-weight: 750;
  cursor: pointer;
  padding: 4px 10px;
  border-radius: 999px;
  letter-spacing: -0.02em;
  transition: background 0.12s;
  flex-shrink: 0;
  line-height: 1.2;
}
#videosearch-ai-panel .vsa-hl-time:hover {
  background: color-mix(in srgb, var(--hl-color) 26%, transparent);
}
#videosearch-ai-panel .vsa-hl-link-badge {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  font-size: 10px;
  font-weight: 650;
  color: #7dd3fc;
  background: rgba(56, 189, 248, 0.12);
  border: 1px solid rgba(56, 189, 248, 0.28);
  border-radius: 999px;
  padding: 3px 8px;
  flex-shrink: 0;
}

#videosearch-ai-panel .vsa-hl-note-input {
  display: block;
  width: 100%;
  max-width: 100%;
  box-sizing: border-box;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 10px;
  background: rgba(0, 0, 0, 0.4);
  color: #f3f6fa;
  font-family: var(--vsa-font);
  font-size: 13px;
  font-weight: 500;
  line-height: 1.45;
  padding: 9px 11px;
  margin: 0;
  outline: none;
  min-height: 42px;
  max-height: 110px;
  resize: none;
  overflow-x: hidden;
  overflow-y: auto;
  word-break: break-word;
  white-space: pre-wrap;
  transition: border-color 0.15s, background 0.15s, box-shadow 0.15s;
}
#videosearch-ai-panel .vsa-hl-note-input::placeholder {
  color: #6b7280;
  opacity: 1;
}
#videosearch-ai-panel .vsa-hl-note-input:hover {
  border-color: rgba(255, 255, 255, 0.14);
  background: rgba(0, 0, 0, 0.48);
}
#videosearch-ai-panel .vsa-hl-note-input:focus {
  border-color: color-mix(in srgb, var(--hl-color) 50%, transparent);
  background: rgba(0, 0, 0, 0.52);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--hl-color) 14%, transparent);
  color: #fff;
}

#videosearch-ai-panel .vsa-hl-del {
  width: 30px;
  height: 30px;
  border: 1px solid transparent;
  background: transparent;
  color: var(--vsa-faint);
  cursor: pointer;
  padding: 0;
  border-radius: 8px;
  display: inline-grid;
  place-items: center;
  flex-shrink: 0;
  transition: color 0.15s, background 0.15s, border-color 0.15s;
}
#videosearch-ai-panel .vsa-hl-del:hover {
  color: #fca5a5;
  border-color: rgba(248, 113, 113, 0.3);
  background: rgba(248, 113, 113, 0.08);
}
#videosearch-ai-panel .vsa-hl-item.vsa-note-saved-flash {
  border-color: var(--vsa-accent-border);
  box-shadow: 0 0 0 1px var(--vsa-accent-dim);
}

/* Narrow panel safety */
@media (max-width: 420px) {
  #videosearch-ai-panel .vsa-hl-item {
    padding: 8px 8px 8px 10px;
  }
  #videosearch-ai-panel .vsa-hl-note-input {
    font-size: 12.5px;
    padding: 8px 10px;
  }
}

/* Topics / chapters — premium list (not default white buttons) */
#videosearch-ai-panel .vsa-pane-topics {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-height: 0;
}
#videosearch-ai-panel .vsa-topics {
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-height: 0;
  flex: 1;
}
#videosearch-ai-panel .vsa-topics-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 10px;
  padding: 0 2px;
}
#videosearch-ai-panel .vsa-topics-title {
  font-size: 13px;
  font-weight: 750;
  letter-spacing: -0.02em;
  color: var(--vsa-text);
}
#videosearch-ai-panel .vsa-topics-meta {
  font-size: 10.5px;
  font-weight: 650;
  color: var(--vsa-faint);
  white-space: nowrap;
}
#videosearch-ai-panel .vsa-topics-list {
  display: flex;
  flex-direction: column;
  gap: 5px;
  overflow-y: auto;
  max-height: min(360px, 48vh);
  padding: 2px 1px 6px;
  scrollbar-width: thin;
}
#videosearch-ai-panel .vsa-topic-item {
  display: grid;
  grid-template-columns: 28px 1fr auto;
  gap: 10px;
  align-items: center;
  width: 100%;
  text-align: left;
  border: 1px solid var(--vsa-border);
  border-radius: 12px;
  background: rgba(0, 0, 0, 0.32);
  padding: 10px 11px;
  color: var(--vsa-text);
  cursor: pointer;
  font-family: var(--vsa-font);
  transition: border-color 0.15s, background 0.15s, transform 0.12s;
}
#videosearch-ai-panel .vsa-topic-item:hover {
  border-color: rgba(62, 207, 142, 0.4);
  background: linear-gradient(
    135deg,
    rgba(62, 207, 142, 0.1),
    rgba(0, 0, 0, 0.35)
  );
  transform: translateX(2px);
}
#videosearch-ai-panel .vsa-topic-item:active {
  transform: translateX(1px) scale(0.995);
}
#videosearch-ai-panel .vsa-topic-idx {
  font-family: var(--vsa-mono);
  font-size: 10px;
  font-weight: 750;
  color: var(--vsa-faint);
  letter-spacing: 0.02em;
}
#videosearch-ai-panel .vsa-topic-item:hover .vsa-topic-idx {
  color: var(--vsa-accent);
}
#videosearch-ai-panel .vsa-topic-body {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
#videosearch-ai-panel .vsa-topic-label {
  font-size: 12.5px;
  font-weight: 650;
  letter-spacing: -0.015em;
  line-height: 1.35;
  color: var(--vsa-text);
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
#videosearch-ai-panel .vsa-topic-time {
  flex-shrink: 0;
  font-family: var(--vsa-mono);
  font-size: 11px;
  font-weight: 750;
  letter-spacing: -0.02em;
  color: #04140c;
  background: linear-gradient(135deg, #6ee7b7, #34d399);
  border-radius: 999px;
  padding: 4px 9px;
  box-shadow: 0 4px 12px rgba(52, 211, 153, 0.22);
}
/* legacy class names (if any leftover) */
#videosearch-ai-panel .vsa-topic-chip {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 8px;
  align-items: center;
  width: 100%;
  text-align: left;
  border: 1px solid var(--vsa-border);
  border-radius: 12px;
  background: rgba(0, 0, 0, 0.32);
  padding: 10px 11px;
  color: var(--vsa-text);
  cursor: pointer;
  font-family: var(--vsa-font);
}
#videosearch-ai-panel .vsa-topics-row {
  display: flex;
  flex-direction: column;
  gap: 5px;
}
#videosearch-ai-panel .vsa-topics-label {
  font-size: 11px;
  font-weight: 650;
  color: var(--vsa-muted);
}

/* Chat host fill */
#videosearch-ai-panel .vsa-chat-host,
#videosearch-ai-panel .vsa-transcript-host {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

/* ── Live transcript (karaoke-style) ───────────────────────── */
#videosearch-ai-panel .vsa-pane-transcript {
  display: flex;
  flex-direction: column;
  min-height: 0;
  gap: 8px;
}
#videosearch-ai-panel .vsa-transcript {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}
#videosearch-ai-panel .vsa-tx-card {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  border-radius: 16px;
  border: 1px solid var(--vsa-border);
  background:
    linear-gradient(165deg, rgba(255,255,255,0.04) 0%, transparent 42%),
    rgba(0, 0, 0, 0.32);
  overflow: hidden;
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.22);
}
#videosearch-ai-panel .vsa-tx-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
  padding: 12px 12px 10px;
  border-bottom: 1px solid rgba(255,255,255,0.06);
}
#videosearch-ai-panel .vsa-tx-title {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  min-width: 0;
}
#videosearch-ai-panel .vsa-tx-ico {
  width: 32px;
  height: 32px;
  border-radius: 10px;
  display: grid;
  place-items: center;
  flex-shrink: 0;
  color: var(--vsa-accent);
  background: rgba(62, 207, 142, 0.12);
  border: 1px solid rgba(62, 207, 142, 0.22);
}
#videosearch-ai-panel .vsa-tx-title strong {
  display: block;
  font-size: 13px;
  font-weight: 800;
  letter-spacing: -0.02em;
  color: var(--vsa-text);
}
#videosearch-ai-panel .vsa-tx-sub {
  display: block;
  font-size: 10.5px;
  color: var(--vsa-faint);
  margin-top: 2px;
  line-height: 1.35;
}
#videosearch-ai-panel .vsa-tx-actions {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}
#videosearch-ai-panel .vsa-tx-copy {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  border: 1px solid var(--vsa-border);
  background: rgba(255,255,255,0.03);
  color: var(--vsa-muted);
  border-radius: 999px;
  padding: 6px 10px;
  font: inherit;
  font-size: 11px;
  font-weight: 700;
  cursor: pointer;
}
#videosearch-ai-panel .vsa-tx-copy:hover:not(:disabled) {
  color: var(--vsa-accent);
  border-color: rgba(62, 207, 142, 0.35);
}
#videosearch-ai-panel .vsa-tx-copy:disabled {
  opacity: 0.4;
  cursor: default;
}
#videosearch-ai-panel .vsa-tx-copy.is-ok {
  color: var(--vsa-accent);
  border-color: rgba(62, 207, 142, 0.4);
}
#videosearch-ai-panel .vsa-tx-copy .vsa-icon {
  display: block;
}
#videosearch-ai-panel .vsa-tx-follow {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
  font-size: 11px;
  font-weight: 700;
  color: var(--vsa-muted);
  cursor: pointer;
  user-select: none;
  padding: 6px 10px;
  border-radius: 999px;
  border: 1px solid var(--vsa-border);
  background: rgba(255,255,255,0.03);
}
#videosearch-ai-panel .vsa-tx-follow input {
  accent-color: var(--vsa-accent);
  margin: 0;
}
#videosearch-ai-panel .vsa-tx-progress {
  height: 3px;
  background: rgba(255,255,255,0.06);
  position: relative;
}
#videosearch-ai-panel .vsa-tx-progress-fill {
  display: block;
  height: 100%;
  width: 0%;
  background: linear-gradient(90deg, var(--vsa-accent), #6ee7b7);
  box-shadow: 0 0 10px rgba(62, 207, 142, 0.45);
  transition: width 0.2s linear;
}
#videosearch-ai-panel .vsa-tx-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 8px 12px;
  border-bottom: 1px solid rgba(255,255,255,0.05);
}
#videosearch-ai-panel .vsa-tx-meta {
  font-size: 11px;
  color: var(--vsa-muted);
  min-width: 0;
  flex: 1;
}
#videosearch-ai-panel .vsa-tx-meta b {
  color: var(--vsa-text);
  font-weight: 750;
}
#videosearch-ai-panel .vsa-tx-now {
  color: var(--vsa-accent);
  font-weight: 750;
  font-variant-numeric: tabular-nums;
}
#videosearch-ai-panel .vsa-tx-search {
  display: flex;
  align-items: center;
  gap: 6px;
  max-width: 46%;
  padding: 5px 9px;
  border-radius: 999px;
  border: 1px solid var(--vsa-border);
  background: rgba(0,0,0,0.28);
}
#videosearch-ai-panel .vsa-tx-search-ico {
  color: var(--vsa-faint);
  display: grid;
  place-items: center;
  flex-shrink: 0;
}
#videosearch-ai-panel .vsa-tx-filter {
  border: none;
  background: transparent;
  color: var(--vsa-text);
  font-size: 11.5px;
  outline: none;
  width: 100%;
  min-width: 0;
  font-family: inherit;
  padding: 0;
}
#videosearch-ai-panel .vsa-tx-filter::placeholder {
  color: var(--vsa-faint);
}
#videosearch-ai-panel .vsa-transcript-list {
  flex: 1;
  min-height: 180px;
  max-height: min(420px, 52vh);
  overflow-y: auto;
  overflow-x: hidden;
  padding: 8px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  scroll-behavior: smooth;
  scrollbar-width: thin;
  scrollbar-color: rgba(62, 207, 142, 0.35) transparent;
}
#videosearch-ai-panel .vsa-transcript-list::-webkit-scrollbar {
  width: 6px;
}
#videosearch-ai-panel .vsa-transcript-list::-webkit-scrollbar-thumb {
  background: rgba(62, 207, 142, 0.28);
  border-radius: 99px;
}
#videosearch-ai-panel .vsa-transcript-line {
  display: grid;
  grid-template-columns: 48px 1fr 22px;
  align-items: start;
  gap: 8px;
  width: 100%;
  text-align: left;
  margin: 0;
  padding: 9px 10px;
  border: 1px solid transparent;
  border-radius: 12px;
  background: transparent;
  color: var(--vsa-text);
  font-family: inherit;
  font-size: 12.5px;
  line-height: 1.45;
  cursor: pointer;
  transition:
    background 0.18s ease,
    border-color 0.18s ease,
    opacity 0.18s ease,
    transform 0.15s ease;
}
#videosearch-ai-panel .vsa-transcript-line:hover {
  background: rgba(255,255,255,0.04);
  border-color: rgba(255,255,255,0.06);
}
#videosearch-ai-panel .vsa-transcript-line.is-past {
  opacity: 0.48;
}
#videosearch-ai-panel .vsa-transcript-line.is-past .vsa-transcript-text {
  color: var(--vsa-muted);
}
#videosearch-ai-panel .vsa-transcript-line.is-active {
  opacity: 1;
  background:
    linear-gradient(105deg, rgba(62, 207, 142, 0.16), rgba(62, 207, 142, 0.05) 70%),
    rgba(0, 0, 0, 0.25);
  border-color: rgba(62, 207, 142, 0.35);
  box-shadow:
    0 0 0 1px rgba(62, 207, 142, 0.08),
    0 8px 20px rgba(0, 0, 0, 0.2);
  transform: translateX(1px);
}
#videosearch-ai-panel .vsa-transcript-line.is-active .vsa-transcript-text {
  color: var(--vsa-text);
  font-weight: 650;
}
#videosearch-ai-panel .vsa-transcript-line.is-active .vsa-transcript-time {
  color: #04140c;
  background: var(--vsa-accent);
  border-color: transparent;
}
#videosearch-ai-panel .vsa-transcript-line.is-active .vsa-transcript-jump {
  opacity: 1;
  color: var(--vsa-accent);
}
#videosearch-ai-panel .vsa-transcript-time {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 10.5px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  letter-spacing: -0.02em;
  color: var(--vsa-accent);
  background: rgba(62, 207, 142, 0.1);
  border: 1px solid rgba(62, 207, 142, 0.18);
  border-radius: 7px;
  padding: 3px 5px;
  text-align: center;
  line-height: 1.2;
  margin-top: 1px;
}
#videosearch-ai-panel .vsa-transcript-text {
  color: var(--vsa-text);
  opacity: 0.92;
  word-break: break-word;
}
#videosearch-ai-panel .vsa-transcript-jump {
  opacity: 0;
  color: var(--vsa-faint);
  display: grid;
  place-items: center;
  margin-top: 3px;
  transition: opacity 0.15s ease;
}
#videosearch-ai-panel .vsa-transcript-line:hover .vsa-transcript-jump {
  opacity: 0.7;
}


/* Mood / comments — structured cards, not a text wall */
#videosearch-ai-panel .vsa-pane-comments {
  display: flex;
  flex-direction: column;
  min-height: 0;
}
#videosearch-ai-panel .vsa-comments {
  display: flex;
  flex-direction: column;
  gap: 12px;
  overflow-y: auto;
  max-height: min(420px, 55vh);
  padding-bottom: 6px;
  scrollbar-width: thin;
}
#videosearch-ai-panel .vsa-mood-head {
  padding: 14px;
  border-radius: 14px;
  border: 1px solid var(--vsa-border);
  background:
    linear-gradient(145deg, rgba(255,255,255,0.04), transparent 50%),
    rgba(0,0,0,0.28);
}
#videosearch-ai-panel .vsa-mood-head.is-pos {
  border-color: rgba(62, 207, 142, 0.28);
}
#videosearch-ai-panel .vsa-mood-head.is-neg {
  border-color: rgba(248, 113, 113, 0.28);
}
#videosearch-ai-panel .vsa-mood-title {
  display: flex;
  align-items: flex-start;
  gap: 10px;
}
#videosearch-ai-panel .vsa-mood-emoji {
  font-size: 22px;
  line-height: 1;
}
#videosearch-ai-panel .vsa-mood-label {
  font-weight: 800;
  font-size: 14px;
  letter-spacing: -0.02em;
  color: var(--vsa-text);
}
#videosearch-ai-panel .vsa-mood-meta {
  font-size: 11px;
  color: var(--vsa-muted);
  margin-top: 3px;
  line-height: 1.35;
}
#videosearch-ai-panel .vsa-mood-bar {
  display: flex;
  height: 7px;
  border-radius: 999px;
  overflow: hidden;
  margin: 12px 0 7px;
  background: rgba(255,255,255,0.06);
  gap: 2px;
}
#videosearch-ai-panel .vsa-mood-seg { min-width: 2px; border-radius: 999px; }
#videosearch-ai-panel .vsa-mood-pos { background: var(--vsa-accent); }
#videosearch-ai-panel .vsa-mood-neu { background: #64748b; }
#videosearch-ai-panel .vsa-mood-neg { background: var(--vsa-danger); }
#videosearch-ai-panel .vsa-mood-legend {
  display: flex;
  gap: 12px;
  font-size: 11px;
  font-weight: 650;
  color: var(--vsa-muted);
  flex-wrap: wrap;
}
#videosearch-ai-panel .vsa-leg-pos { color: var(--vsa-accent); }
#videosearch-ai-panel .vsa-leg-neg { color: #fca5a5; }
#videosearch-ai-panel .vsa-mood-summary {
  margin: 12px 0 0;
  font-size: 12.5px;
  color: var(--vsa-text);
  line-height: 1.5;
  opacity: 0.9;
}
#videosearch-ai-panel .vsa-mood-engine {
  margin-top: 8px;
  font-size: 10px;
  font-weight: 650;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--vsa-faint);
}
#videosearch-ai-panel .vsa-mood-section {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
#videosearch-ai-panel .vsa-mood-section-title {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  font-size: 11px;
  font-weight: 750;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--vsa-faint);
  padding: 0 2px;
}
#videosearch-ai-panel .vsa-mood-section-title em {
  font-style: normal;
  font-family: var(--vsa-mono);
  font-size: 10px;
  color: var(--vsa-muted);
  background: rgba(255,255,255,0.05);
  border: 1px solid var(--vsa-border);
  border-radius: 999px;
  padding: 2px 7px;
}
#videosearch-ai-panel .vsa-theme-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
#videosearch-ai-panel .vsa-theme-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  border: 1px solid var(--vsa-border);
  border-radius: 999px;
  padding: 5px 10px;
  font-size: 11.5px;
  font-weight: 650;
  color: var(--vsa-text);
  background: rgba(0,0,0,0.28);
}
#videosearch-ai-panel .vsa-theme-chip em {
  font-style: normal;
  font-family: var(--vsa-mono);
  font-size: 10px;
  color: var(--vsa-faint);
}
#videosearch-ai-panel .vsa-theme-chip.lean-positive {
  border-color: rgba(62, 207, 142, 0.3);
  background: rgba(62, 207, 142, 0.08);
}
#videosearch-ai-panel .vsa-theme-chip.lean-negative {
  border-color: rgba(248, 113, 113, 0.3);
  background: rgba(248, 113, 113, 0.08);
}
#videosearch-ai-panel .vsa-comment-list {
  display: flex;
  flex-direction: column;
  gap: 7px;
}
#videosearch-ai-panel .vsa-comment-card {
  display: grid;
  grid-template-columns: 34px 1fr;
  gap: 10px;
  align-items: start;
  padding: 11px 12px;
  border-radius: 13px;
  border: 1px solid var(--vsa-border);
  background: rgba(0, 0, 0, 0.32);
  transition: border-color 0.15s, background 0.15s;
}
#videosearch-ai-panel .vsa-comment-card:hover {
  background: rgba(0, 0, 0, 0.4);
}
#videosearch-ai-panel .vsa-comment-card.tone-pos {
  border-left: 3px solid rgba(62, 207, 142, 0.75);
}
#videosearch-ai-panel .vsa-comment-card.tone-neg {
  border-left: 3px solid rgba(248, 113, 113, 0.75);
}
#videosearch-ai-panel .vsa-comment-card.tone-neu {
  border-left: 3px solid rgba(148, 163, 184, 0.55);
}
#videosearch-ai-panel .vsa-comment-av {
  width: 34px;
  height: 34px;
  border-radius: 10px;
  display: grid;
  place-items: center;
  font-size: 11px;
  font-weight: 800;
  letter-spacing: -0.02em;
  color: #04140c;
  background: linear-gradient(145deg, #6ee7b7, #34d399);
  flex-shrink: 0;
}
#videosearch-ai-panel .vsa-comment-card.tone-neg .vsa-comment-av {
  background: linear-gradient(145deg, #fda4af, #fb7185);
  color: #1a0508;
}
#videosearch-ai-panel .vsa-comment-card.tone-neu .vsa-comment-av {
  background: linear-gradient(145deg, #94a3b8, #64748b);
  color: #0f172a;
}
#videosearch-ai-panel .vsa-comment-main {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
#videosearch-ai-panel .vsa-comment-meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px 8px;
  min-width: 0;
}
#videosearch-ai-panel .vsa-comment-author {
  font-size: 12px;
  font-weight: 750;
  color: var(--vsa-text);
  letter-spacing: -0.01em;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
#videosearch-ai-panel .vsa-comment-likes {
  font-size: 10.5px;
  font-weight: 700;
  color: #fbbf24;
  background: rgba(251, 191, 36, 0.1);
  border: 1px solid rgba(251, 191, 36, 0.22);
  border-radius: 999px;
  padding: 2px 7px;
}
#videosearch-ai-panel .vsa-comment-when {
  font-size: 10px;
  font-weight: 600;
  color: var(--vsa-faint);
}
#videosearch-ai-panel .vsa-comment-tone {
  font-size: 9.5px;
  font-weight: 750;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  border-radius: 999px;
  padding: 2px 7px;
  margin-left: auto;
}
#videosearch-ai-panel .vsa-comment-tone.tone-pos {
  color: var(--vsa-accent);
  background: rgba(62, 207, 142, 0.12);
  border: 1px solid rgba(62, 207, 142, 0.25);
}
#videosearch-ai-panel .vsa-comment-tone.tone-neg {
  color: #fca5a5;
  background: rgba(248, 113, 113, 0.12);
  border: 1px solid rgba(248, 113, 113, 0.25);
}
#videosearch-ai-panel .vsa-comment-tone.tone-neu {
  color: #94a3b8;
  background: rgba(148, 163, 184, 0.1);
  border: 1px solid rgba(148, 163, 184, 0.2);
}
#videosearch-ai-panel .vsa-comment-text {
  margin: 0;
  font-size: 12.5px;
  font-weight: 500;
  line-height: 1.5;
  color: #e2e8f0;
  white-space: pre-wrap;
  word-break: break-word;
}
#videosearch-ai-panel .vsa-mood-actions {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  padding-top: 2px;
}
#videosearch-ai-panel .vsa-mood-note {
  font-size: 10.5px;
}
#videosearch-ai-panel .vsa-comments-load {
  border: none;
  border-radius: 10px;
  padding: 9px 14px;
  font-family: var(--vsa-font);
  font-size: 12px;
  font-weight: 750;
  cursor: pointer;
  background: linear-gradient(135deg, #6ee7b7, #34d399);
  color: #04140c;
  margin-top: 4px;
}
#videosearch-ai-panel .vsa-comments-refresh {
  margin-top: 0;
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

/* Chat messages */
#videosearch-ai-panel .vsa-chat-msg {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
#videosearch-ai-panel .vsa-chat-msg.role-user {
  align-items: flex-end;
}
#videosearch-ai-panel .vsa-chat-msg.role-assistant {
  align-items: stretch;
}
#videosearch-ai-panel .vsa-chat-bubble {
  max-width: 100%;
  border-radius: 14px;
  padding: 10px 12px;
  border: 1px solid var(--vsa-border);
  font-size: 12.5px;
  line-height: 1.5;
}
#videosearch-ai-panel .vsa-chat-bubble.user {
  background: linear-gradient(135deg, rgba(62,207,142,0.2), rgba(56,189,248,0.1));
  border-color: rgba(62,207,142,0.3);
  color: var(--vsa-text);
  max-width: 92%;
  border-bottom-right-radius: 6px;
}
#videosearch-ai-panel .vsa-chat-bubble.assistant {
  background: rgba(0,0,0,0.28);
  border-bottom-left-radius: 6px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
#videosearch-ai-panel .vsa-chat-meta {
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--vsa-faint);
}
#videosearch-ai-panel .vsa-chat-bubble-text {
  color: var(--vsa-text);
  white-space: pre-wrap;
  word-break: break-word;
  line-height: 1.55;
}
#videosearch-ai-panel .vsa-chat-intro {
  font-size: 12px;
  color: var(--vsa-muted);
  line-height: 1.45;
  white-space: normal;
}
#videosearch-ai-panel .vsa-time-pill {
  display: inline-flex;
  align-items: center;
  border: 1px solid rgba(62,207,142,0.4);
  background: rgba(62,207,142,0.14);
  color: var(--vsa-accent);
  border-radius: 999px;
  padding: 1px 7px;
  margin: 0 2px;
  font-family: var(--vsa-font);
  font-size: 11px;
  font-weight: 750;
  cursor: pointer;
  vertical-align: baseline;
  line-height: 1.4;
}
#videosearch-ai-panel .vsa-time-pill:hover {
  background: rgba(62,207,142,0.25);
}
#videosearch-ai-panel .vsa-chat-sources {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-top: 2px;
}
#videosearch-ai-panel .vsa-chat-sources-label {
  font-size: 10px;
  font-weight: 750;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--vsa-faint);
  margin-bottom: 2px;
}
#videosearch-ai-panel .vsa-chat-source {
  display: grid;
  grid-template-columns: 48px 1fr;
  gap: 10px;
  align-items: start;
  width: 100%;
  text-align: left;
  border: 1px solid var(--vsa-border);
  border-radius: 12px;
  padding: 9px 10px;
  background: rgba(255,255,255,0.03);
  color: var(--vsa-text);
  font-family: var(--vsa-font);
  cursor: pointer;
  transition: border-color 0.15s, background 0.15s, transform 0.12s;
}
#videosearch-ai-panel .vsa-chat-source:hover {
  border-color: rgba(62,207,142,0.4);
  background: rgba(62,207,142,0.08);
  transform: translateX(2px);
}
#videosearch-ai-panel .vsa-chat-source-time {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 24px;
  padding: 3px 6px;
  border-radius: 8px;
  font-size: 11px;
  font-weight: 800;
  letter-spacing: -0.02em;
  color: #04140c;
  background: linear-gradient(135deg, #6ee7b7, #34d399);
  box-shadow: 0 4px 12px rgba(52,211,153,0.25);
}
#videosearch-ai-panel .vsa-chat-source-body {
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
}
#videosearch-ai-panel .vsa-chat-source-snippet {
  font-size: 12px;
  line-height: 1.4;
  color: var(--vsa-text);
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
#videosearch-ai-panel .vsa-chat-source-hint {
  font-size: 10px;
  font-weight: 650;
  color: var(--vsa-accent);
  opacity: 0.85;
}
#videosearch-ai-panel .vsa-chat-status {
  font-size: 11.5px;
  color: var(--vsa-muted);
  display: flex;
  align-items: center;
  gap: 8px;
}
#videosearch-ai-panel .vsa-chat-status.is-error {
  color: #fca5a5;
}
#videosearch-ai-panel .vsa-chat-list {
  max-height: min(340px, 46vh);
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
  gap: 7px;
}

/* Login gate polish */
#videosearch-ai-panel .vsa-auth-gate {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
#videosearch-ai-panel .vsa-auth-hero {
  text-align: center;
  padding: 14px 12px 12px;
  border-radius: 16px;
  border: 1px solid var(--vsa-border);
  background:
    radial-gradient(ellipse 70% 80% at 50% 0%, rgba(62,207,142,0.14), transparent 60%),
    rgba(0,0,0,0.22);
}
#videosearch-ai-panel .vsa-auth-submit {
  background: linear-gradient(135deg, #a7f3d0, #34d399 50%, #2dd4bf) !important;
  box-shadow: 0 8px 22px rgba(52,211,153,0.25);
  border-radius: 12px !important;
  font-weight: 800 !important;
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
    bottom: max(56px, env(safe-area-inset-bottom, 0px));
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
