/**
 * After login: keep local notes in the account, or delete them.
 */

import type { LocalUserCounts } from "../storage/guestSession";
import { formatElapsed } from "../storage/guestSession";

const ROOT_ID = "vsa-save-cloud-prompt";
const STYLE_ID = "vsa-save-cloud-prompt-style";

const CSS = `
#${ROOT_ID} {
  position: fixed;
  inset: 0;
  z-index: 2147483647;
  display: grid;
  place-items: center;
  padding: 20px;
  background: rgba(4, 6, 10, 0.72);
  font-family: "Plus Jakarta Sans", ui-sans-serif, system-ui, sans-serif;
  color: #f4f5f7;
}
#${ROOT_ID} .vsa-scp-card {
  width: min(420px, 100%);
  background: #12141a;
  border: 1px solid rgba(255,255,255,0.1);
  border-radius: 18px;
  padding: 22px 22px 18px;
  box-shadow: 0 24px 60px rgba(0,0,0,0.55);
}
#${ROOT_ID} h2 {
  margin: 0;
  font-size: 20px;
  letter-spacing: -0.03em;
}
#${ROOT_ID} p {
  margin: 10px 0 0;
  font-size: 13.5px;
  line-height: 1.5;
  color: #9aa19b;
}
#${ROOT_ID} .vsa-scp-clock {
  margin-top: 14px;
  font-family: ui-monospace, Menlo, monospace;
  font-size: 22px;
  font-weight: 650;
  color: #3ecf8e;
  letter-spacing: 0.04em;
}
#${ROOT_ID} .vsa-scp-meta {
  margin-top: 4px;
  font-size: 12px;
  color: #6b726c;
}
#${ROOT_ID} .vsa-scp-actions {
  display: grid;
  gap: 8px;
  margin-top: 18px;
}
#${ROOT_ID} button {
  font-family: inherit;
  font-weight: 750;
  font-size: 14px;
  border-radius: 12px;
  padding: 12px 14px;
  cursor: pointer;
}
#${ROOT_ID} .vsa-scp-yes {
  border: 0;
  background: #3ecf8e;
  color: #04140c;
}
#${ROOT_ID} .vsa-scp-no {
  border: 1px solid rgba(240,113,120,0.4);
  background: transparent;
  color: #f07178;
}
`;

function ensureStyles(): void {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = CSS;
  (document.head || document.documentElement).appendChild(style);
}

export function showSaveToCloudDialog(
  counts: LocalUserCounts,
  elapsedMs: number
): Promise<"yes" | "no"> {
  ensureStyles();
  document.getElementById(ROOT_ID)?.remove();

  const marks = `${counts.marks} mark${counts.marks === 1 ? "" : "s"}`;
  const shots = `${counts.shots} shot${counts.shots === 1 ? "" : "s"}`;
  const videos = `${counts.videos} video${counts.videos === 1 ? "" : "s"}`;

  const root = document.createElement("div");
  root.id = ROOT_ID;
  root.setAttribute("data-vsa", "save-cloud-prompt");
  root.innerHTML = `
    <div class="vsa-scp-card" role="dialog" aria-modal="true" aria-labelledby="vsa-scp-title">
      <h2 id="vsa-scp-title">Save this device to your account?</h2>
      <p>
        You were not signed in. Notes on this computer are only a local cache —
        they disappear if you clear Chrome data, use Incognito, or uninstall VideoSearch.
      </p>
      <div class="vsa-scp-clock">${formatElapsed(elapsedMs)}</div>
      <div class="vsa-scp-meta">Local for this long · ${marks} · ${shots} · ${videos}</div>
      <p>
        <strong style="color:#f4f5f7">Save</strong> copies everything to your account.
        Local notes are never deleted on sign-in.
      </p>
      <div class="vsa-scp-actions">
        <button type="button" class="vsa-scp-yes">Save to account</button>
        <button type="button" class="vsa-scp-no">Later — keep on this device</button>
      </div>
    </div>
  `;
  document.documentElement.appendChild(root);

  return new Promise((resolve) => {
    const done = (choice: "yes" | "no") => {
      root.remove();
      resolve(choice);
    };
    root.querySelector(".vsa-scp-yes")?.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      done("yes");
    });
    root.querySelector(".vsa-scp-no")?.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      done("no");
    });
  });
}
