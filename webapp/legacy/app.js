/**
 * VideoSearch SaaS dashboard — vault-powered UI.
 */

const LS = "vsa_vault_session_v3";
const THEME_LS = "vsa_theme";
const SEARCH_LS = "vsa_recent_searches";

function $(id) {
  return document.getElementById(id);
}

function loadSession() {
  try {
    return JSON.parse(localStorage.getItem(LS) || "{}");
  } catch {
    return {};
  }
}
function saveSession(s) {
  localStorage.setItem(LS, JSON.stringify(s));
}
function clearSession() {
  localStorage.removeItem(LS);
}

function applyTheme(theme) {
  const t = theme === "light" ? "light" : "dark";
  document.documentElement.dataset.theme = t;
  localStorage.setItem(THEME_LS, t);
  document.querySelectorAll("#themeBtnAuth, #themeBtnApp").forEach((btn) => {
    btn.textContent = t === "dark" ? "☀" : "☾";
  });
  // recolor charts if analytics is open
  if (currentView === "analytics" && document.getElementById("chartWeek")) {
    requestAnimationFrame(() => initAnalyticsCharts());
  }
}
function initTheme() {
  const saved = localStorage.getItem(THEME_LS);
  if (saved === "light" || saved === "dark") return applyTheme(saved);
  applyTheme(
    matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"
  );
}
function toggleTheme() {
  applyTheme(
    (document.documentElement.dataset.theme || "dark") === "dark"
      ? "light"
      : "dark"
  );
}

function formatTime(sec) {
  const s = Math.max(0, Math.floor(Number(sec) || 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  if (h > 0)
    return `${h}:${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}`;
  return `${m}:${String(r).padStart(2, "0")}`;
}
function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
function initials(name, email) {
  const src = (name || email || "?").trim();
  const parts = src.split(/[\s@._-]+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return src.slice(0, 2).toUpperCase();
}
function ytThumb(id) {
  return id
    ? `https://i.ytimg.com/vi/${encodeURIComponent(id)}/mqdefault.jpg`
    : "";
}
function relTime(ts) {
  if (!ts) return "—";
  const d = new Date(ts).getTime();
  const diff = Date.now() - d;
  const h = Math.floor(diff / 3600000);
  if (h < 1) return "just now";
  if (h < 24) return `${h}h ago`;
  const days = Math.floor(h / 24);
  if (days < 14) return `${days}d ago`;
  return new Date(ts).toLocaleDateString();
}

let authMode = "login"; // login | register | reset
let session = loadSession();
let vaultRows = [];
let currentView = "dashboard";
let selectedVideoId = null;
let lightboxShots = [];
let lightboxIndex = 0;
let detailTab = "shots";

function apiBase() {
  const fromSession = (session && session.url) || "";
  const fromInput = ($("cloudUrl")?.value || "").trim();
  const base = fromSession || fromInput || "http://localhost:8787";
  return base.replace(/\/$/, "");
}
function authHeaders() {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${session.token}`,
  };
}

function setStatus(msg, kind = "") {
  const el = $("statusMsg");
  if (!el) return;
  el.textContent = msg;
  el.className = "status" + (kind ? ` ${kind}` : "");
}

function showAuthPage() {
  const auth = $("pageAuth");
  const app = $("pageApp");
  if (auth) {
    auth.hidden = false;
    auth.removeAttribute("hidden");
  }
  if (app) {
    app.hidden = true;
    app.setAttribute("hidden", "");
  }
  document.title = "Log in · VideoSearch";
}
function showAppPage() {
  const auth = $("pageAuth");
  const app = $("pageApp");
  if (auth) {
    auth.hidden = true;
    auth.setAttribute("hidden", "");
  }
  if (app) {
    app.hidden = false;
    app.removeAttribute("hidden");
  }
  document.body.classList.add("is-app");
  document.title = "Studio · VideoSearch";
  requestAnimationFrame(() => refreshIcons());
}

function setAuthMode(mode) {
  authMode = mode || "login";
  document.querySelectorAll(".auth-mode").forEach((b) => {
    b.classList.toggle("is-on", b.dataset.auth === authMode);
  });
  const nameField = $("nameField");
  if (nameField) nameField.hidden = authMode !== "register";
  const btn = $("btnAuth");
  const passLabel = $("passwordLabel");
  const hint = $("authHint");
  const pass = $("password");
  if (authMode === "register") {
    if (btn) btn.textContent = "Create account";
    if (hint)
      hint.textContent =
        "Creates a private vault. Use this email in the extension.";
    if (passLabel) passLabel.textContent = "Password";
    if (pass) pass.autocomplete = "new-password";
  } else if (authMode === "reset") {
    if (btn) btn.textContent = "Set new password & log in";
    if (hint)
      hint.textContent =
        "Enter your email and a new password (min 6 characters).";
    if (passLabel) passLabel.textContent = "New password";
    if (pass) pass.autocomplete = "new-password";
  } else {
    if (btn) btn.textContent = "Log in";
    if (hint) hint.textContent = "Same account as the Chrome extension";
    if (passLabel) passLabel.textContent = "Password";
    if (pass) pass.autocomplete = "current-password";
  }
}

async function authRequest(mode) {
  const url = ($("cloudUrl")?.value || "http://localhost:8787").trim() || "http://localhost:8787";
  const email = $("email").value.trim();
  const password = $("password").value;
  const displayName = $("displayName").value.trim();
  if (!email?.includes("@")) throw new Error("Enter a valid email");
  if (!password || password.length < 6)
    throw new Error("Password must be at least 6 characters");

  const path =
    mode === "register"
      ? "/api/auth/register"
      : mode === "reset"
        ? "/api/auth/reset-password"
        : "/api/auth/login";

  let res;
  try {
    res = await fetch(`${url.replace(/\/$/, "")}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, displayName }),
    });
  } catch {
    throw new Error(
      "Cannot reach API. Start server: cd server && npm run dev  then open http://localhost:8787/app/"
    );
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.token || !data.user)
    throw new Error(data.message || `Auth failed (${res.status})`);
  return { url: url.replace(/\/$/, ""), token: data.token, user: data.user };
}

async function fetchMe() {
  const res = await fetch(`${apiBase()}/api/auth/me`, {
    headers: authHeaders(),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || "Session expired");
  return data.user;
}

async function fetchVault() {
  const res = await fetch(`${apiBase()}/api/vault?images=1`, {
    headers: authHeaders(),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.ok === false)
    throw new Error(data.message || `HTTP ${res.status}`);
  return data.rows || [];
}

function mediaSrc(url) {
  if (!url) return "";
  if (url.startsWith("data:")) return url;
  if (url.includes("/api/media/") && session.token && !url.includes("token=")) {
    const sep = url.includes("?") ? "&" : "?";
    return `${url}${sep}token=${encodeURIComponent(session.token)}`;
  }
  return url;
}

function vaultStats() {
  let marks = 0;
  let shots = 0;
  let notes = 0;
  let watchLater = 0;
  let saved = 0;
  for (const r of vaultRows) {
    const p = r.payload || {};
    const hs = p.highlights || [];
    const ss = p.screenshots || [];
    marks += hs.length;
    shots += ss.length;
    notes += hs.filter((h) => h.note?.trim()).length;
    notes += ss.filter((s) => s.note?.trim()).length;
    if (p.watchLater) watchLater += 1;
    if (p.saved) saved += 1;
  }
  return { videos: vaultRows.length, marks, shots, notes, watchLater, saved };
}

async function libraryAction(videoId, action, playlist) {
  const row = vaultRows.find((r) => r.video_id === videoId);
  const p = row?.payload || {};
  const res = await fetch(`${apiBase()}/api/vault/library`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({
      videoId,
      videoTitle: p.videoTitle || videoId,
      videoUrl: p.videoUrl || `https://www.youtube.com/watch?v=${videoId}`,
      action,
      playlist,
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.ok === false) {
    throw new Error(data.message || `Library update failed (${res.status})`);
  }
  // Patch local row
  if (row && data.library) {
    row.payload = {
      ...p,
      saved: data.library.saved,
      savedAt: data.library.savedAt,
      watchLater: data.library.watchLater,
      watchLaterAt: data.library.watchLaterAt,
      playlists: data.library.playlists || [],
    };
  } else if (data.library) {
    vaultRows.unshift({
      video_id: videoId,
      updated_at: new Date().toISOString(),
      payload: {
        videoId,
        videoTitle: p.videoTitle || videoId,
        videoUrl: p.videoUrl || `https://www.youtube.com/watch?v=${videoId}`,
        highlights: [],
        screenshots: [],
        ...data.library,
      },
    });
  }
  return data;
}

function watchLaterRows() {
  return vaultRows
    .filter((r) => r.payload?.watchLater)
    .sort(
      (a, b) =>
        (b.payload?.watchLaterAt || 0) - (a.payload?.watchLaterAt || 0)
    );
}

function savedRows() {
  return vaultRows
    .filter((r) => r.payload?.saved)
    .sort((a, b) => (b.payload?.savedAt || 0) - (a.payload?.savedAt || 0));
}

function playlistGroups() {
  // Case-insensitive merge under first-seen casing
  const map = new Map(); // lower -> { name, rows }
  for (const r of vaultRows) {
    for (const name of r.payload?.playlists || []) {
      if (!name) continue;
      const key = String(name).toLowerCase();
      if (!map.has(key)) map.set(key, { name, rows: [] });
      map.get(key).rows.push(r);
    }
  }
  return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
}

function allPlaylistNames() {
  return playlistGroups().map((g) => g.name);
}

function videoInPlaylist(row, playlistName) {
  const key = String(playlistName || "").toLowerCase();
  return (row.payload?.playlists || []).some(
    (p) => String(p).toLowerCase() === key
  );
}

function playlistPickerHtml(videoId, currentPlaylists = []) {
  const names = allPlaylistNames();
  const cur = new Set(
    (currentPlaylists || []).map((p) => String(p).toLowerCase())
  );
  const items = names
    .map((n) => {
      const on = cur.has(n.toLowerCase());
      return `
        <button type="button" class="pl-dd-item${on ? " is-on" : ""}" data-pl-opt="${escapeHtml(n)}" data-video-id="${escapeHtml(videoId)}" ${on ? 'aria-current="true"' : ""}>
          <span class="pl-dd-check">${on ? "✓" : "+"}</span>
          <span class="pl-dd-label">${escapeHtml(n)}</span>
          <span class="pl-dd-meta">${on ? "In list · click to remove" : "Add"}</span>
        </button>`;
    })
    .join("");
  return `
    <div class="pl-dd" data-pl-dd data-video-id="${escapeHtml(videoId)}">
      <button type="button" class="pl-dd-trigger" data-pl-trigger title="Add to playlist" aria-haspopup="listbox" aria-expanded="false">
        <i data-lucide="list-plus"></i>
        <span class="pl-dd-trigger-txt">Playlist</span>
        <i data-lucide="chevron-down" class="pl-dd-caret"></i>
      </button>
      <div class="pl-dd-menu" data-pl-menu hidden role="listbox">
        <div class="pl-dd-head">Your playlists</div>
        ${
          items ||
          `<div class="pl-dd-empty">No playlists yet.<br/>Type a name below to create one.</div>`
        }
        <div class="pl-dd-new" data-pl-new>
          <input type="text" placeholder="New playlist name…" maxlength="80" data-pl-new-input data-video-id="${escapeHtml(videoId)}" />
          <button type="button" data-pl-new-go data-video-id="${escapeHtml(videoId)}">Add</button>
        </div>
      </div>
    </div>`;
}

function findPlaylistMenu(dd) {
  if (!dd) return null;
  const local = dd.querySelector("[data-pl-menu]");
  if (local) return local;
  const vid = dd.dataset.videoId || "";
  if (!vid) return null;
  return document.querySelector(
    `body > .pl-dd-menu.is-portal[data-owner="${CSS.escape(vid)}"]`
  );
}

function closeAllPlaylistMenus(except) {
  document.querySelectorAll("[data-pl-dd].is-open, [data-pl-dd]").forEach((dd) => {
    if (except && dd === except) return;
    if (!dd.classList.contains("is-open") && !findPlaylistMenu(dd)?.classList.contains("is-portal")) {
      return;
    }
    dd.classList.remove("is-open");
    const menu = findPlaylistMenu(dd);
    const trig = dd.querySelector("[data-pl-trigger]");
    if (menu) {
      menu.hidden = true;
      menu.classList.remove("is-portal");
      menu.style.top = "";
      menu.style.left = "";
      menu.style.right = "";
      menu.style.bottom = "";
      if (menu.parentElement === document.body) {
        dd.appendChild(menu);
      }
    }
    if (trig) trig.setAttribute("aria-expanded", "false");
  });
  document.querySelectorAll("body > .pl-dd-menu.is-portal").forEach((m) => {
    const owner = m.dataset.owner || "";
    if (except && except.dataset?.videoId === owner) return;
    m.hidden = true;
    m.classList.remove("is-portal");
    const dd = document.querySelector(`[data-pl-dd][data-video-id="${CSS.escape(owner)}"]`);
    if (dd && m.parentElement === document.body) dd.appendChild(m);
  });
}

function positionPlaylistMenu(dd, menu) {
  const trig = dd.querySelector("[data-pl-trigger]");
  if (!trig || !menu) return;
  // Move to body so no parent overflow can clip it
  if (menu.parentElement !== document.body) {
    document.body.appendChild(menu);
  }
  menu.classList.add("is-portal");
  menu.hidden = false;

  const r = trig.getBoundingClientRect();
  const mw = Math.min(280, window.innerWidth - 16);
  const mh = Math.min(320, window.innerHeight * 0.5);
  menu.style.minWidth = `${Math.max(220, Math.min(mw, 260))}px`;
  menu.style.maxHeight = `${mh}px`;

  // Prefer open below; flip above if not enough room
  let top = r.bottom + 6;
  let left = r.right - mw;
  if (left < 8) left = 8;
  if (left + mw > window.innerWidth - 8) {
    left = Math.max(8, window.innerWidth - mw - 8);
  }
  // Measure after show
  const h = Math.min(menu.scrollHeight || 200, mh);
  if (top + h > window.innerHeight - 8 && r.top > h + 12) {
    top = r.top - h - 6;
  }
  if (top < 8) top = 8;

  menu.style.top = `${Math.round(top)}px`;
  menu.style.left = `${Math.round(left)}px`;
  menu.style.right = "auto";
  menu.style.bottom = "auto";
}

function applyPlaylistChoice(videoId, playlist) {
  if (!videoId || !playlist?.trim()) return;
  const name = playlist.trim();
  const row = vaultRows.find((r) => r.video_id === videoId);
  const already = row && videoInPlaylist(row, name);
  const action = already ? "remove_playlist" : "add_playlist";
  closeAllPlaylistMenus();
  void libraryAction(videoId, action, name)
    .then(() => renderView())
    .catch((err) =>
      alert(err instanceof Error ? err.message : "Could not update playlist")
    );
}

function allBookmarks() {
  const out = [];
  for (const r of vaultRows) {
    const p = r.payload || {};
    for (const h of p.highlights || []) {
      out.push({
        type: "mark",
        videoId: r.video_id,
        title: p.videoTitle || r.video_id,
        time: h.startTime,
        note: h.note || "",
        updated: h.updatedAt || r.updated_at,
      });
    }
  }
  out.sort((a, b) => (b.updated || 0) - (a.updated || 0));
  return out;
}

function getAllShots() {
  const out = [];
  for (const r of vaultRows) {
    const p = r.payload || {};
    for (const s of p.screenshots || []) {
      out.push({
        ...s,
        videoId: r.video_id,
        videoTitle: p.videoTitle || r.video_id,
      });
    }
  }
  out.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  return out;
}

function searchVault(q) {
  const query = q.trim().toLowerCase();
  if (!query) return [];
  const hits = [];
  for (const r of vaultRows) {
    const p = r.payload || {};
    const title = (p.videoTitle || r.video_id || "").toLowerCase();
    if (title.includes(query)) {
      hits.push({
        kind: "video",
        videoId: r.video_id,
        title: p.videoTitle || r.video_id,
        snippet: "Video title match",
        time: 0,
      });
    }
    for (const h of p.highlights || []) {
      const note = (h.note || "").toLowerCase();
      if (note.includes(query)) {
        hits.push({
          kind: "note",
          videoId: r.video_id,
          title: p.videoTitle || r.video_id,
          snippet: h.note,
          time: h.startTime,
        });
      }
    }
    for (const s of p.screenshots || []) {
      const note = (s.note || "").toLowerCase();
      if (note.includes(query)) {
        hits.push({
          kind: "shot",
          videoId: r.video_id,
          title: p.videoTitle || r.video_id,
          snippet: s.note || "Screenshot",
          time: s.videoTime,
        });
      }
    }
  }
  return hits.slice(0, 40);
}

function loadRecentSearches() {
  try {
    return JSON.parse(localStorage.getItem(SEARCH_LS) || "[]");
  } catch {
    return [];
  }
}
function pushRecentSearch(q) {
  const list = loadRecentSearches().filter((x) => x.q !== q);
  list.unshift({ q, at: Date.now() });
  localStorage.setItem(SEARCH_LS, JSON.stringify(list.slice(0, 12)));
}

function ytWatchUrl(videoId, payload) {
  const fromPayload = payload?.videoUrl;
  if (fromPayload && /^https?:\/\//i.test(fromPayload)) return fromPayload;
  return `https://www.youtube.com/watch?v=${encodeURIComponent(videoId || "")}`;
}

function videoCard(row, opts = {}) {
  const p = row.payload || {};
  const marks = (p.highlights || []).length;
  const shots = (p.screenshots || []).length;
  const watch = ytWatchUrl(row.video_id, p);
  const title = p.videoTitle || row.video_id;
  const metaBits = [
    opts.footer || (row.updated_at ? `Updated ${relTime(row.updated_at)}` : null),
    marks ? `${marks} note${marks === 1 ? "" : "s"}` : null,
    shots ? `${shots} shot${shots === 1 ? "" : "s"}` : null,
  ].filter(Boolean);
  return `
    <article class="v-card">
      <a class="v-thumb" href="${escapeHtml(watch)}" target="_blank" rel="noopener noreferrer" title="Watch on YouTube">
        <img src="${ytThumb(row.video_id)}" alt="" loading="lazy" />
        <div class="v-play" aria-hidden="true"><span><i data-lucide="play"></i> Watch</span></div>
      </a>
      <div class="v-body">
        <strong title="${escapeHtml(title)}">${escapeHtml(title)}</strong>
        <span class="v-meta">${escapeHtml(metaBits.join(" · ") || "In your vault")}</span>
        <div class="v-actions">
          <a class="btn-watch" href="${escapeHtml(watch)}" target="_blank" rel="noopener noreferrer">
            <i data-lucide="external-link"></i> Watch
          </a>
          <button type="button" class="btn-notes" data-open-video="${escapeHtml(row.video_id)}">Notes</button>
          <button type="button" class="btn-notes ${p.watchLater ? "is-active" : ""}" data-lib-action="toggle_watch_later" data-video-id="${escapeHtml(row.video_id)}" title="Watch later">
            <i data-lucide="clock"></i>
          </button>
          <button type="button" class="btn-notes ${p.saved ? "is-active" : ""}" data-lib-action="toggle_save" data-video-id="${escapeHtml(row.video_id)}" title="Save">
            <i data-lucide="bookmark"></i>
          </button>
          ${playlistPickerHtml(row.video_id, p.playlists || [])}
          ${
            opts.removePlaylist
              ? `<button type="button" class="btn-notes" data-lib-action="remove_playlist" data-video-id="${escapeHtml(row.video_id)}" data-playlist="${escapeHtml(opts.removePlaylist)}" title="Remove from playlist">Remove</button>`
              : ""
          }
          ${
            opts.removeWatchLater
              ? `<button type="button" class="btn-notes" data-lib-action="unwatch_later" data-video-id="${escapeHtml(row.video_id)}">Remove</button>`
              : ""
          }
        </div>
        ${
          (p.playlists || []).length
            ? `<div class="v-pl-tags">${(p.playlists || [])
                .map(
                  (pl) =>
                    `<button type="button" class="v-pl-tag" data-lib-action="remove_playlist" data-video-id="${escapeHtml(row.video_id)}" data-playlist="${escapeHtml(pl)}" title="Remove from ${escapeHtml(pl)}">${escapeHtml(pl)} ×</button>`
                )
                .join("")}</div>`
            : ""
        }
      </div>
    </article>`;
}

function renderWatchLater() {
  const rows = watchLaterRows();
  return `
    <div class="view-head">
      <div>
        <h1 class="view-title">Watch later</h1>
        <p class="view-sub">Videos you saved from the extension or here. Open on YouTube when you’re ready.</p>
      </div>
      <span class="pill">${rows.length}</span>
    </div>
    ${
      rows.length
        ? `<div class="video-grid stagger">${rows
            .map((r) =>
              videoCard(r, {
                libraryActions: true,
                removeWatchLater: true,
                footer: r.payload?.watchLaterAt
                  ? `Saved ${relTime(r.payload.watchLaterAt)}`
                  : "Watch later",
              })
            )
            .join("")}</div>`
        : emptyState(
            "clock",
            "Nothing in Watch later",
            "On YouTube open Notes → Watch later, or use the clock on a video card here."
          )
    }
  `;
}

function renderPlaylists() {
  const groups = playlistGroups();
  const saved = savedRows();
  const all = [...vaultRows];
  return `
    <div class="view-head">
      <div>
        <h1 class="view-title">Playlists</h1>
        <p class="view-sub">Add any vault video into a list like Politics. Use <strong>+ Playlist</strong> on a card, or the extension Notes → Playlist picker.</p>
      </div>
      <span class="pill">${groups.length} lists</span>
    </div>

    <div class="card hover-lift" style="margin-bottom:16px">
      <div class="card-head">
        <h3><i data-lucide="folder-plus"></i> Quick add to a playlist</h3>
      </div>
      <p class="view-sub" style="margin:0 0 12px">Pick a video and an existing list (or create a new name).</p>
      <div class="pl-quick">
        <select id="plQuickVideo" class="pl-select lg">
          <option value="">Select video…</option>
          ${all
            .map((r) => {
              const t = r.payload?.videoTitle || r.video_id;
              return `<option value="${escapeHtml(r.video_id)}">${escapeHtml(t)}</option>`;
            })
            .join("")}
        </select>
        <select id="plQuickList" class="pl-select lg">
          <option value="">Select playlist…</option>
          ${groups
            .map(
              (g) =>
                `<option value="${escapeHtml(g.name)}">${escapeHtml(g.name)} (${g.rows.length})</option>`
            )
            .join("")}
          <option value="__new__">Create new…</option>
        </select>
        <button type="button" class="btn-watch" id="plQuickAdd"><i data-lucide="plus"></i> Add video</button>
      </div>
    </div>

    <div class="card hover-lift" style="margin-bottom:16px">
      <div class="card-head">
        <h3><i data-lucide="bookmark"></i> Saved library</h3>
        <span class="pill">${saved.length}</span>
      </div>
      ${
        saved.length
          ? `<div class="video-grid">${saved
              .slice(0, 9)
              .map((r) =>
                videoCard(r, {
                  libraryActions: true,
                  footer: "In library",
                })
              )
              .join("")}</div>`
          : emptyState(
              "bookmark",
              "No saved videos yet",
              "Tap Save in the extension Notes tab on any YouTube video."
            )
      }
    </div>

    ${
      groups.length
        ? groups
            .map(
              (g) => `
      <div class="card hover-lift" style="margin-bottom:14px" id="pl-${escapeHtml(g.name)}">
        <div class="card-head">
          <h3><i data-lucide="list-video"></i> ${escapeHtml(g.name)}</h3>
          <span class="pill">${g.rows.length}</span>
        </div>
        <div class="video-grid">${g.rows
          .map((r) =>
            videoCard(r, {
              libraryActions: true,
              removePlaylist: g.name,
              footer: `In “${g.name}”`,
            })
          )
          .join("")}</div>
      </div>`
            )
            .join("")
        : emptyState(
            "list-video",
            "No playlists yet",
            "Create one: Playlists → Quick add → Create new, or on YouTube: Notes → Playlist → type Politics → Add."
          )
    }
  `;
}

/* ── Views ── */
function emptyState(icon, title, sub) {
  return `<div class="empty">
    <div class="empty-ico"><i data-lucide="${icon || "inbox"}"></i></div>
    <strong style="display:block;color:var(--text);margin-bottom:6px;font-family:var(--display)">${escapeHtml(title)}</strong>
    ${escapeHtml(sub)}
  </div>`;
}

function sparkBars(values) {
  const max = Math.max(1, ...values);
  return `<div class="kpi-spark">${values
    .map((v) => {
      const h = Math.max(12, Math.round((v / max) * 100));
      return `<span style="height:${h}%"></span>`;
    })
    .join("")}</div>`;
}

function renderDashboard() {
  const st = vaultStats();
  const recent = vaultRows.slice(0, 8);
  const continueW = vaultRows.slice(0, 4);
  const searches = loadRecentSearches();
  const first =
    session.user?.displayName || session.user?.email?.split("@")[0] || "there";
  const noted = allBookmarks().filter((b) => b.note?.trim()).length;

  return `
    <section class="hero hero-compact">
      <div class="hero-main">
        <div class="hero-kicker"><span class="pulse-dot"></span> Live vault</div>
        <h1>Welcome back, ${escapeHtml(first)}</h1>
        <p>Your synced lectures, notes, and captures — watch on YouTube or open notes.</p>
      </div>
      <div class="stat-row stagger">
        <div class="stat-tile">
          <div>
            <b class="count-up" data-to="${st.videos}">0</b>
            <span>Videos</span>
          </div>
          <div class="stat-ico p"><i data-lucide="clapperboard"></i></div>
        </div>
        <div class="stat-tile">
          <div>
            <b class="count-up" data-to="${st.marks}">0</b>
            <span>Marks${noted ? ` · ${noted} notes` : ""}</span>
          </div>
          <div class="stat-ico g"><i data-lucide="highlighter"></i></div>
        </div>
        <div class="stat-tile">
          <div>
            <b class="count-up" data-to="${st.shots}">0</b>
            <span>Shots</span>
          </div>
          <div class="stat-ico o"><i data-lucide="camera"></i></div>
        </div>
        <div class="stat-tile">
          <div>
            <b class="count-up" data-to="${st.watchLater || 0}">0</b>
            <span>Watch later</span>
          </div>
          <div class="stat-ico b"><i data-lucide="clock"></i></div>
        </div>
      </div>
    </section>

    <section class="dash-section">
      <div class="section-head">
        <h2 class="section-title"><i data-lucide="cloud-download"></i> Recently synced</h2>
        <button type="button" class="link-btn" data-view="library">View all →</button>
      </div>
      ${
        recent.length
          ? `<div class="video-grid video-grid-md stagger">${recent.map((r) => videoCard(r)).join("")}</div>`
          : emptyState("library", "No videos yet", "Mark or capture on YouTube — auto-sync lands here.")
      }
    </section>

    <section class="dash-section">
      <div class="section-head">
        <h2 class="section-title"><i data-lucide="play-circle"></i> Continue</h2>
        <button type="button" class="link-btn" data-view="history">History →</button>
      </div>
      ${
        continueW.length
          ? `<div class="video-grid video-grid-md">${continueW
              .map((r) =>
                videoCard(r, {
                  footer: `Updated ${relTime(r.updated_at)}`,
                })
              )
              .join("")}</div>`
          : emptyState("history", "Nothing yet", "Your recently synced lectures appear here.")
      }
    </section>

    <section class="dash-bottom">
      <div class="card card-md hover-lift dash-ai">
        <div class="card-head">
          <h3><i data-lucide="sparkles"></i> AI Search</h3>
          <span class="pill">Smart</span>
        </div>
        <div class="ai-box">
          <div class="ai-input-row">
            <input id="dashSearch" type="search" placeholder="Search notes, titles, shot captions…" />
            <button type="button" id="dashSearchBtn" title="Search"><i data-lucide="search"></i></button>
          </div>
          <div class="chip-row">
            <button type="button" class="chip" data-q="formula">formula</button>
            <button type="button" class="chip" data-q="definition">definition</button>
            <button type="button" class="chip" data-q="important">important</button>
            <button type="button" class="chip" data-q="board">board</button>
          </div>
          <div id="dashSearchResults"></div>
        </div>
      </div>
      <div class="card card-md hover-lift">
        <div class="card-head">
          <h3><i data-lucide="clock"></i> Recent searches</h3>
          <button type="button" class="link-btn" id="clearSearches">Clear</button>
        </div>
        <div class="recent-list">
          ${
            searches.length
              ? searches
                  .slice(0, 6)
                  .map(
                    (s) => `
            <div class="recent-row">
              <strong><i data-lucide="search" style="width:12px;height:12px"></i> ${escapeHtml(s.q)}</strong>
              <span>${relTime(s.at)}</span>
            </div>`
                  )
                  .join("")
              : `<div class="empty" style="padding:14px">Your searches will show here.</div>`
          }
        </div>
      </div>
      <div class="card card-md hover-lift">
        <div class="card-head">
          <h3><i data-lucide="bar-chart-3"></i> Insights</h3>
          <button type="button" class="link-btn" data-view="analytics">Open →</button>
        </div>
        <div class="metric-list compact">
          <div class="metric"><span><i class="dot" style="background:#a78bfa"></i>Videos</span><b>${st.videos}</b></div>
          <div class="metric"><span><i class="dot" style="background:#34d399"></i>Marks</span><b>${st.marks}</b></div>
          <div class="metric"><span><i class="dot" style="background:#38bdf8"></i>Shots</span><b>${st.shots}</b></div>
        </div>
      </div>
    </section>
  `;
}

function renderLibrary() {
  return `
    <div class="view-head">
      <div>
        <h1 class="view-title">Library</h1>
        <p class="view-sub">${vaultRows.length} video${vaultRows.length === 1 ? "" : "s"} in your vault. Watch on YouTube or open notes and screenshots.</p>
      </div>
      <span class="pill">${vaultRows.length}</span>
    </div>
    <div class="lib-list stagger">
      ${
        vaultRows.length
          ? vaultRows
              .map((r) => {
                const p = r.payload || {};
                const marks = (p.highlights || []).length;
                const shots = (p.screenshots || []).length;
                const watch = ytWatchUrl(r.video_id, p);
                return `
                <div class="lib-row">
                  <a class="lib-thumb" href="${escapeHtml(watch)}" target="_blank" rel="noopener noreferrer" title="Watch on YouTube">
                    <img src="${ytThumb(r.video_id)}" alt="" loading="lazy" />
                  </a>
                  <div class="lib-main">
                    <strong>${escapeHtml(p.videoTitle || r.video_id)}</strong>
                    <span>${marks} notes · ${shots} shots · ${relTime(r.updated_at)}</span>
                  </div>
                  <div class="lib-actions">
                    <a class="btn-watch" href="${escapeHtml(watch)}" target="_blank" rel="noopener noreferrer">
                      <i data-lucide="external-link"></i> Watch
                    </a>
                    <button type="button" class="btn-notes" data-open-video="${escapeHtml(r.video_id)}">Notes</button>
                  </div>
                </div>`;
              })
              .join("")
          : emptyState("library", "Library is empty", "Capture marks or shots on YouTube — they sync here automatically.")
      }
    </div>
    <div id="libraryDetail" class="detail-panel"></div>
  `;
}

function renderSearchView(prefill = "") {
  return `
    <div class="view-head">
      <div>
        <h1 class="view-title">AI Search</h1>
        <p class="view-sub">Search across titles, highlight notes, and screenshot captions in your vault</p>
      </div>
      <span class="pill blue">Vault index</span>
    </div>
    <div class="ai-hero">
      <div class="ai-input-row" style="margin-bottom:14px">
        <i data-lucide="sparkles" style="width:18px;height:18px;color:var(--accent);flex-shrink:0"></i>
        <input id="aiSearchInput" type="search" placeholder="e.g. copper monopoly, heartbeats formula…" value="${escapeHtml(prefill)}" />
        <button type="button" id="aiSearchBtn" title="Search"><i data-lucide="search"></i></button>
      </div>
      <div class="chip-row" style="margin-bottom:4px">
        <button type="button" class="chip" data-q="formula">formula</button>
        <button type="button" class="chip" data-q="definition">definition</button>
        <button type="button" class="chip" data-q="summary">summary</button>
        <button type="button" class="chip" data-q="important">important</button>
        <button type="button" class="chip" data-q="board">board</button>
      </div>
    </div>
    <div class="card">
      <div class="card-head"><h3><i data-lucide="list-filter"></i> Results</h3></div>
      <div id="aiSearchResults">${emptyState("search", "Ready to search", "Type a query or pick a chip above.")}</div>
    </div>
  `;
}

function renderHistory() {
  const sorted = [...vaultRows].sort(
    (a, b) => new Date(b.updated_at || 0) - new Date(a.updated_at || 0)
  );
  return `
    <div class="view-head">
      <div>
        <h1 class="view-title">Watch History</h1>
        <p class="view-sub">Recently updated vault videos from extension activity</p>
      </div>
    </div>
    ${
      sorted.length
        ? `<div class="video-grid stagger">${sorted
            .map((r) =>
              videoCard(r, {
                footer: `Updated ${relTime(r.updated_at)}`,
              })
            )
            .join("")}</div>`
        : emptyState("history", "No history yet", "Sync videos from the Chrome extension.")
    }
  `;
}

function renderBookmarks() {
  const bms = allBookmarks();
  return `
    <div class="view-head">
      <div>
        <h1 class="view-title">Bookmarks</h1>
        <p class="view-sub">${bms.length} timeline marks &amp; notes from your lectures</p>
      </div>
      <span class="pill">${bms.length}</span>
    </div>
    <div class="mark-list stagger">
      ${
        bms.length
          ? bms
              .map(
                (b) => `
            <div class="mark-row">
              <time>${formatTime(b.time)}</time>
              <div>
                <p>${escapeHtml(b.note || "(empty note)")}</p>
                <div class="src">${escapeHtml(b.title)}</div>
              </div>
            </div>`
              )
              .join("")
          : emptyState("bookmark", "No bookmarks yet", "Mark moments in the extension — they appear here.")
      }
    </div>
  `;
}

function renderShotsView() {
  const shots = getAllShots();
  return `
    <div class="view-head">
      <div>
        <h1 class="view-title">Screenshots</h1>
        <p class="view-sub">${shots.length} frames captured from YouTube · click to enlarge</p>
      </div>
      <span class="pill gold">${shots.length} shots</span>
    </div>
    ${
      shots.length
        ? `<div class="shot-grid stagger" id="allShotsGrid">
      ${shots
        .map(
          (s, i) => `
            <button type="button" class="shot-card" data-shot-index="${i}">
              <div class="shot-thumb"><img src="${mediaSrc(s.imageUrl || s.dataUrl || "")}" alt="" loading="lazy" /></div>
              <div class="meta">
                <time>${formatTime(s.videoTime)}</time>
                <p>${escapeHtml(s.note || s.videoTitle || "No note")}</p>
              </div>
            </button>`
        )
        .join("")}
    </div>`
        : emptyState("camera", "No screenshots", "Use the camera button on YouTube to capture boards.")
    }
  `;
}

function activityHeatmap(byDay) {
  const max = Math.max(1, ...byDay);
  const cells = byDay
    .map((v) => {
      const h = (0.08 + (v / max) * 0.85).toFixed(2);
      return `<span style="--h:${h}" title="${v}"></span>`;
    })
    .join("");
  // pad visual with synthetic intensity for a richer grid feel (7 days × 4 rows)
  const extra = Array.from({ length: 21 }, (_, i) => {
    const base = byDay[i % 7] || 0;
    const noise = ((i * 7) % 5) * 0.06;
    const h = Math.min(0.95, 0.06 + (base / max) * 0.7 + noise).toFixed(2);
    return `<span style="--h:${h}"></span>`;
  }).join("");
  return `<div class="heatmap">${cells}${extra}</div>
    <div class="heatmap-legend"><span>Less</span><span>Activity · Mon–Sun</span><span>More</span></div>`;
}

function renderAnalytics() {
  const st = vaultStats();
  const byDay = [0, 0, 0, 0, 0, 0, 0];
  const marksByDay = [0, 0, 0, 0, 0, 0, 0];
  const shotsByDay = [0, 0, 0, 0, 0, 0, 0];
  for (const r of vaultRows) {
    const d = new Date(r.updated_at || Date.now()).getDay();
    const idx = d === 0 ? 6 : d - 1;
    const hl = r.payload?.highlights?.length || 0;
    const ss = r.payload?.screenshots?.length || 0;
    byDay[idx] += 1 + hl + ss;
    marksByDay[idx] += hl;
    shotsByDay[idx] += ss;
  }
  const noted = allBookmarks().filter((b) => b.note.trim()).length;
  const avgMarks = st.videos > 0 ? (st.marks / st.videos).toFixed(1) : "0";
  const avgShots = st.videos > 0 ? (st.shots / st.videos).toFixed(1) : "0";
  const topNoteShare =
    st.marks + st.shots > 0
      ? Math.round((noted / Math.max(1, st.marks + st.shots)) * 100)
      : 0;
  const totalAct = byDay.reduce((a, b) => a + b, 0);
  const peakDay = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"][
    byDay.indexOf(Math.max(...byDay, 0))
  ];

  window.__vsaCharts = {
    byDay,
    marksByDay,
    shotsByDay,
    composition: [st.videos, st.marks, st.shots, noted],
    radar: [
      st.videos,
      st.marks,
      st.shots,
      noted,
      Math.min(20, Math.round(Number(avgMarks) * 3)),
    ],
  };

  return `
    <div class="view-head">
      <div>
        <h1 class="view-title">Analytics</h1>
        <p class="view-sub">Live intelligence from your vault — marks, shots, and notes synced from the extension.</p>
      </div>
      <span class="pill">Chart.js · live</span>
    </div>

    <div class="ana-banner">
      <div>
        <strong>Studio pulse</strong>
        <p>${totalAct ? `Peak activity on <strong style="color:var(--accent)">${peakDay}</strong> · ${topNoteShare}% note density · ${st.videos} videos tracked` : "Capture on YouTube to light up these charts."}</p>
      </div>
      <span class="pill gold">R2 + Mongo</span>
    </div>

    <div class="kpi-strip stagger">
      <div class="kpi" style="--kpi-glow:rgba(167,139,250,0.45)">
        <div class="kpi-label"><i data-lucide="clapperboard"></i> Videos</div>
        <div class="kpi-val count-up" data-to="${st.videos}">0</div>
        <div class="kpi-meta"><span class="up">Library</span> synced titles</div>
        ${sparkBars(byDay)}
      </div>
      <div class="kpi" style="--kpi-glow:rgba(52,211,153,0.45)">
        <div class="kpi-label"><i data-lucide="highlighter"></i> Highlights</div>
        <div class="kpi-val count-up" data-to="${st.marks}">0</div>
        <div class="kpi-meta"><span class="up">${avgMarks}</span> avg / video</div>
        ${sparkBars(marksByDay.map((v) => v + 1))}
      </div>
      <div class="kpi" style="--kpi-glow:rgba(56,189,248,0.45)">
        <div class="kpi-label"><i data-lucide="camera"></i> Screenshots</div>
        <div class="kpi-val count-up" data-to="${st.shots}">0</div>
        <div class="kpi-meta"><span class="up">${avgShots}</span> avg / video</div>
        ${sparkBars(shotsByDay.map((v) => v + 1))}
      </div>
      <div class="kpi" style="--kpi-glow:rgba(251,191,36,0.4)">
        <div class="kpi-label"><i data-lucide="file-text"></i> Written notes</div>
        <div class="kpi-val count-up" data-to="${noted}">0</div>
        <div class="kpi-meta"><span class="up">${topNoteShare}%</span> note density</div>
        ${sparkBars([noted || 1, st.marks || 1, st.shots || 1, st.videos || 1, noted || 1, Math.max(1, st.marks - noted), 2])}
      </div>
    </div>

    <div class="grid-2" style="margin-bottom:16px">
      <div class="card hover-lift">
        <div class="card-head">
          <h3><i data-lucide="activity"></i> Weekly pulse</h3>
          <span class="pill">mixed</span>
        </div>
        <div class="chart-wrap lg"><canvas id="chartWeek"></canvas></div>
      </div>
      <div class="card hover-lift">
        <div class="card-head">
          <h3><i data-lucide="pie-chart"></i> Vault composition</h3>
          <span class="pill">mix</span>
        </div>
        <div class="chart-wrap"><canvas id="chartMix"></canvas></div>
      </div>
    </div>

    <div class="grid-3" style="margin-bottom:16px">
      <div class="card hover-lift">
        <div class="card-head"><h3><i data-lucide="target"></i> Note density</h3></div>
        <div class="chart-wrap sm"><canvas id="chartRing"></canvas></div>
        <div class="insight"><strong>${topNoteShare}%</strong> of annotations include written notes — denser notes = better AI search.</div>
      </div>
      <div class="card hover-lift">
        <div class="card-head"><h3><i data-lucide="radar"></i> Capability map</h3></div>
        <div class="chart-wrap"><canvas id="chartRadar"></canvas></div>
      </div>
      <div class="card hover-lift">
        <div class="card-head"><h3><i data-lucide="calendar-days"></i> Activity heat</h3></div>
        ${activityHeatmap(byDay)}
        <div class="insight" style="margin-top:14px">Heat map of vault updates by weekday — darker emerald = more marks + shots.</div>
      </div>
    </div>

    <div class="card hover-lift">
      <div class="card-head">
        <h3><i data-lucide="trophy"></i> Top annotated videos</h3>
        <button type="button" class="link-btn" data-view="library">Library →</button>
      </div>
      <div class="lib-list">
        ${
          vaultRows.length
            ? [...vaultRows]
                .sort((a, b) => {
                  const sa =
                    (a.payload?.highlights?.length || 0) +
                    (a.payload?.screenshots?.length || 0);
                  const sb =
                    (b.payload?.highlights?.length || 0) +
                    (b.payload?.screenshots?.length || 0);
                  return sb - sa;
                })
                .slice(0, 8)
                .map((r) => {
                  const p = r.payload || {};
                  const watch = ytWatchUrl(r.video_id, p);
                  return `
                  <div class="lib-row">
                    <a class="lib-thumb" href="${escapeHtml(watch)}" target="_blank" rel="noopener noreferrer">
                      <img src="${ytThumb(r.video_id)}" alt="" loading="lazy" />
                    </a>
                    <div class="lib-main">
                      <strong>${escapeHtml(p.videoTitle || r.video_id)}</strong>
                      <span>${p.highlights?.length || 0} notes · ${p.screenshots?.length || 0} shots · ${relTime(r.updated_at)}</span>
                    </div>
                    <div class="lib-actions">
                      <a class="btn-watch" href="${escapeHtml(watch)}" target="_blank" rel="noopener noreferrer">
                        <i data-lucide="external-link"></i> Watch
                      </a>
                      <button type="button" class="btn-notes" data-open-video="${escapeHtml(r.video_id)}">Notes</button>
                    </div>
                  </div>`;
                })
                .join("")
            : emptyState("bar-chart-3", "No data yet", "Sync videos to unlock analytics.")
        }
      </div>
    </div>
  `;
}

function destroyCharts() {
  if (window.__vsaChartInstances) {
    for (const c of window.__vsaChartInstances) {
      try {
        c.destroy();
      } catch {
        /* ignore */
      }
    }
  }
  window.__vsaChartInstances = [];
}

function chartColors() {
  const dark = (document.documentElement.dataset.theme || "dark") === "dark";
  return {
    grid: dark ? "rgba(255,255,255,0.06)" : "rgba(15,20,30,0.06)",
    tick: dark ? "#8b95a8" : "#5a6578",
    text: dark ? "#f4f7fb" : "#0a1020",
    muted: dark ? "rgba(255,255,255,0.06)" : "rgba(15,20,30,0.06)",
  };
}

function initAnalyticsCharts() {
  if (typeof Chart === "undefined" || !window.__vsaCharts) return;
  destroyCharts();
  const { byDay, marksByDay, shotsByDay, composition, radar } = window.__vsaCharts;
  const c = chartColors();
  const font = { family: "Inter", size: 11 };
  const labels = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

  const weekEl = document.getElementById("chartWeek");
  if (weekEl) {
    const ch = new Chart(weekEl, {
      type: "bar",
      data: {
        labels,
        datasets: [
          {
            type: "line",
            label: "Total pulse",
            data: byDay,
            borderColor: "rgba(167,139,250,0.95)",
            backgroundColor: "rgba(167,139,250,0.12)",
            fill: true,
            tension: 0.4,
            pointRadius: 4,
            pointBackgroundColor: "#c4b5fd",
            pointBorderColor: "transparent",
            borderWidth: 2.5,
            order: 0,
            yAxisID: "y",
          },
          {
            label: "Highlights",
            data: marksByDay || byDay,
            borderRadius: 8,
            borderSkipped: false,
            backgroundColor: "rgba(52,211,153,0.75)",
            order: 1,
          },
          {
            label: "Shots",
            data: shotsByDay || byDay.map((v) => Math.max(0, Math.round(v * 0.4))),
            borderRadius: 8,
            borderSkipped: false,
            backgroundColor: "rgba(56,189,248,0.7)",
            order: 2,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: "index", intersect: false },
        plugins: {
          legend: {
            position: "top",
            align: "end",
            labels: { color: c.tick, font, boxWidth: 10, usePointStyle: true, padding: 16 },
          },
        },
        scales: {
          x: {
            stacked: false,
            grid: { display: false },
            ticks: { color: c.tick, font },
          },
          y: {
            stacked: false,
            beginAtZero: true,
            grid: { color: c.grid },
            ticks: { color: c.tick, font, precision: 0 },
          },
        },
      },
    });
    window.__vsaChartInstances.push(ch);
  }

  const mixEl = document.getElementById("chartMix");
  if (mixEl) {
    const ch = new Chart(mixEl, {
      type: "doughnut",
      data: {
        labels: ["Videos", "Highlights", "Shots", "Notes"],
        datasets: [
          {
            data: composition.map((n) => Math.max(0, n)),
            backgroundColor: [
              "rgba(167,139,250,0.9)",
              "rgba(52,211,153,0.9)",
              "rgba(56,189,248,0.9)",
              "rgba(251,191,36,0.9)",
            ],
            borderWidth: 0,
            hoverOffset: 8,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: "70%",
        plugins: {
          legend: {
            position: "bottom",
            labels: { color: c.tick, font, boxWidth: 10, padding: 16, usePointStyle: true },
          },
        },
      },
    });
    window.__vsaChartInstances.push(ch);
  }

  const ringEl = document.getElementById("chartRing");
  if (ringEl) {
    const noted = composition[3] || 0;
    const rest = Math.max(0, (composition[1] || 0) + (composition[2] || 0) - noted);
    const ch = new Chart(ringEl, {
      type: "doughnut",
      data: {
        labels: ["With notes", "Empty"],
        datasets: [
          {
            data: [Math.max(0, noted), Math.max(0.001, rest || 0.001)],
            backgroundColor: ["rgba(52,211,153,0.95)", c.muted],
            borderWidth: 0,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: "80%",
        plugins: { legend: { display: false } },
      },
    });
    window.__vsaChartInstances.push(ch);
  }

  const radarEl = document.getElementById("chartRadar");
  if (radarEl) {
    const rData = (radar || composition).map((n) => Math.max(0, n));
    const ch = new Chart(radarEl, {
      type: "radar",
      data: {
        labels: ["Videos", "Marks", "Shots", "Notes", "Depth"],
        datasets: [
          {
            label: "Vault",
            data: rData,
            backgroundColor: "rgba(52,211,153,0.18)",
            borderColor: "rgba(52,211,153,0.9)",
            pointBackgroundColor: "#6ee7b7",
            pointBorderColor: "transparent",
            borderWidth: 2,
            pointRadius: 3,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          r: {
            beginAtZero: true,
            angleLines: { color: c.grid },
            grid: { color: c.grid },
            pointLabels: { color: c.tick, font },
            ticks: { display: false, backdropColor: "transparent" },
          },
        },
      },
    });
    window.__vsaChartInstances.push(ch);
  }
}

function refreshIcons() {
  try {
    if (typeof lucide !== "undefined" && lucide.createIcons) {
      lucide.createIcons({ attrs: { "stroke-width": 1.75 } });
    }
  } catch (e) {
    console.warn("lucide", e);
  }
}

function animateCountUps() {
  document.querySelectorAll(".count-up").forEach((el) => {
    const to = Number(el.dataset.to || el.textContent) || 0;
    if (to === 0) {
      el.textContent = "0";
      return;
    }
    const duration = 700;
    const start = performance.now();
    const from = 0;
    function tick(now) {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      el.textContent = String(Math.round(from + (to - from) * eased));
      if (t < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  });
}

function renderExtension() {
  const feats = [
    ["search", "Semantic search", "Search what was said, not just titles. Local embeddings on-device."],
    ["message-circle", "Chat with video", "RAG chat grounded in captions with clickable timestamps."],
    ["bookmark", "Save & playlists", "Watch later, Save, and named playlists — synced to this website."],
    ["highlighter", "Timeline marks", "Red pins + notes on the YouTube scrubber."],
    ["camera", "Frame screenshots", "Shutter flash + polaroid popup. Capture boards before they wipe."],
    ["cloud", "Auto cloud sync", "Notes, shots, and saves push to MongoDB automatically when signed in."],
    ["smile", "Comment mood", "On-device sentiment over YouTube comments for vibe checks."],
    ["map", "Topics & chapters", "Chapter map + AI topics across the full timeline."],
    ["zap", "Ask AI", "OpenAI-compatible providers (Groq, etc.) for answers + topics."],
  ];
  return `
    <div class="view-head">
      <div>
        <h1 class="view-title">Chrome extension</h1>
        <p class="view-sub">Everything you can do while watching YouTube — designed to auto-sync into this vault</p>
      </div>
    </div>
    <div class="feat-grid stagger" style="margin-bottom:16px">
      ${feats
        .map(
          ([icon, title, desc]) => `
        <div class="feat">
          <div class="feat-ico"><i data-lucide="${icon}"></i></div>
          <strong>${title}</strong>
          <p>${desc}</p>
        </div>`
        )
        .join("")}
    </div>
    <div class="grid-2">
      <div class="card hover-lift">
        <div class="card-head"><h3><i data-lucide="rocket"></i> Get started</h3></div>
        <div class="steps">
          <div class="step"><div><strong>Load the extension</strong><span>Chrome → Extensions → Load unpacked → <code>dist/</code></span></div></div>
          <div class="step"><div><strong>Sign in</strong><span>Avatar → create account (same as this site)</span></div></div>
          <div class="step"><div><strong>Watch &amp; capture</strong><span>Blue camera or red mark on the video frame</span></div></div>
          <div class="step"><div><strong>Auto-sync</strong><span>Vault updates here — hit Refresh if needed</span></div></div>
        </div>
      </div>
      <div class="card hover-lift">
        <div class="card-head"><h3><i data-lucide="terminal"></i> Run the stack</h3></div>
        <div class="steps">
          <div class="step"><div><strong>Vault API</strong><span><code>cd server && npm run dev</code> → :8787</span></div></div>
          <div class="step"><div><strong>This dashboard</strong><span><code>http://localhost:8787/app/</code></span></div></div>
          <div class="step"><div><strong>Env secrets</strong><span>Mongo URI + R2 keys in <code>server/.env</code> only</span></div></div>
          <div class="step"><div><strong>Sync status</strong><span>Extension Notes tab shows auto-sync messages</span></div></div>
        </div>
      </div>
    </div>
  `;
}

function renderSettings() {
  const u = session.user || {};
  const st = vaultStats();
  return `
    <div class="view-head">
      <div>
        <h1 class="view-title">Settings</h1>
        <p class="view-sub">Account &amp; studio preferences</p>
      </div>
    </div>
    <div class="set-grid">
      <div class="card hover-lift">
        <div class="card-head"><h3><i data-lucide="user"></i> Profile</h3></div>
        <div class="set-row"><div><strong>Name</strong><span>${escapeHtml(u.displayName || "—")}</span></div></div>
        <div class="set-row"><div><strong>Email</strong><span>${escapeHtml(u.email || "—")}</span></div></div>
        <div class="set-row"><div><strong>User ID</strong><span>${escapeHtml(u.userId || "—")}</span></div></div>
        <div class="set-row"><div><strong>API</strong><span>${escapeHtml(session.url || "—")}</span></div></div>
      </div>
      <div class="card hover-lift">
        <div class="card-head"><h3><i data-lucide="database"></i> Vault</h3></div>
        <div class="set-row"><div><strong>Videos</strong></div><b class="count-up" data-to="${st.videos}">${st.videos}</b></div>
        <div class="set-row"><div><strong>Highlights</strong></div><b>${st.marks}</b></div>
        <div class="set-row"><div><strong>Screenshots</strong></div><b>${st.shots}</b></div>
        <div class="set-row">
          <div><strong>Theme</strong><span>Dark / light cinematic mode</span></div>
          <button type="button" class="btn-ghost" id="settingsTheme">Toggle theme</button>
        </div>
      </div>
    </div>
  `;
}

function renderVideoDetail(videoId) {
  const row = vaultRows.find((r) => r.video_id === videoId);
  if (!row) return `<div class="empty">Video not found</div>`;
  const p = row.payload || {};
  const shots = p.screenshots || [];
  const marks = p.highlights || [];
  const watch = ytWatchUrl(videoId, p);
  return `
    <div class="card detail-panel">
      <div class="detail-head">
        <div>
          <h2>${escapeHtml(p.videoTitle || videoId)}</h2>
          <div class="detail-actions">
            <a class="btn-watch" href="${escapeHtml(watch)}" target="_blank" rel="noopener noreferrer">
              <i data-lucide="external-link"></i> Watch on YouTube
            </a>
            <span class="v-meta" style="margin:0">${shots.length} shots · ${marks.length} notes · ${relTime(row.updated_at)}</span>
          </div>
        </div>
      </div>
      <div class="tabs">
        <button type="button" class="tab ${detailTab === "shots" ? "is-on" : ""}" data-dtab="shots">Screenshots (${shots.length})</button>
        <button type="button" class="tab ${detailTab === "marks" ? "is-on" : ""}" data-dtab="marks">Highlights (${marks.length})</button>
      </div>
      <div id="detailBodyInner">
        ${
          detailTab === "marks"
            ? marks.length
              ? `<div class="mark-list">${marks
                  .map(
                    (h) => `
                  <div class="mark-row">
                    <time>${formatTime(h.startTime)}</time>
                    <p>${escapeHtml(h.note || "(empty note)")}</p>
                  </div>`
                  )
                  .join("")}</div>`
              : `<div class="empty">No highlights</div>`
            : shots.length
              ? `<div class="shot-grid">${shots
                  .map(
                    (s, i) => `
                  <button type="button" class="shot-card" data-detail-shot="${i}">
                    <div class="shot-thumb"><img src="${mediaSrc(s.imageUrl || s.dataUrl || "")}" alt="" loading="lazy" /></div>
                    <div class="meta"><time>${formatTime(s.videoTime)}</time><p>${escapeHtml(s.note || "No note")}</p></div>
                  </button>`
                  )
                  .join("")}</div>`
              : `<div class="empty">No screenshots</div>`
        }
      </div>
    </div>
  `;
}

function renderView() {
  const host = $("viewHost");
  if (!host) return;
  try {
    destroyCharts();
    // re-trigger enter animation
    host.style.animation = "none";
    void host.offsetWidth;
    host.style.animation = "";

    switch (currentView) {
      case "library":
        host.innerHTML = renderLibrary();
        break;
      case "watchlater":
        host.innerHTML = renderWatchLater();
        break;
      case "playlists":
        host.innerHTML = renderPlaylists();
        break;
      case "search":
        host.innerHTML = renderSearchView();
        break;
      case "history":
        host.innerHTML = renderHistory();
        break;
      case "bookmarks":
        host.innerHTML = renderBookmarks();
        break;
      case "shots":
        host.innerHTML = renderShotsView();
        break;
      case "analytics":
        host.innerHTML = renderAnalytics();
        break;
      case "extension":
        host.innerHTML = renderExtension();
        break;
      case "settings":
        host.innerHTML = renderSettings();
        break;
      default:
        host.innerHTML = renderDashboard();
    }
    bindViewEvents();
    updateStorageMeter();
    refreshIcons();
    animateCountUps();
    if (currentView === "analytics") {
      // charts need painted canvas sizes
      requestAnimationFrame(() => {
        initAnalyticsCharts();
        refreshIcons();
      });
    }
    // keep rail / topbar icons alive after innerHTML cycles elsewhere
    requestAnimationFrame(() => refreshIcons());
  } catch (err) {
    console.error("[vault] renderView failed", err);
    host.innerHTML = `<div class="empty">UI error: ${escapeHtml(
      err instanceof Error ? err.message : "render failed"
    )}. Try Refresh.</div>`;
  }
}

function updateStorageMeter() {
  const st = vaultStats();
  const score = Math.min(100, st.videos * 8 + st.marks * 2 + st.shots * 3);
  const bar = $("storageBar");
  const label = $("storageUsed");
  if (bar) bar.style.width = `${Math.max(8, score)}%`;
  if (label)
    label.textContent = `${st.videos} videos · ${st.marks} marks · ${st.shots} shots`;
}

function setView(view) {
  currentView = view;
  document.querySelectorAll(".nav-item").forEach((b) => {
    b.classList.toggle("is-on", b.dataset.view === view);
  });
  renderView();
}

function runSearchUI(inputId, resultsId) {
  const input = $(inputId);
  const results = $(resultsId);
  if (!input || !results) return;
  const q = input.value.trim();
  if (!q) {
    results.innerHTML = `<div class="empty">Type a query to search your vault.</div>`;
    return;
  }
  pushRecentSearch(q);
  const hits = searchVault(q);
  if (!hits.length) {
    results.innerHTML = `<div class="empty">No matches for “${escapeHtml(q)}”.</div>`;
    return;
  }
  results.innerHTML = hits
    .map(
      (h) => `
    <div class="search-result">
      <time>${h.kind === "video" ? "VIDEO" : formatTime(h.time)} · ${escapeHtml(h.kind)}</time>
      <p>${escapeHtml(h.snippet)}</p>
      <div class="src">${escapeHtml(h.title)}</div>
    </div>`
    )
    .join("");
  refreshIcons();
}

function openVideo(videoId) {
  selectedVideoId = videoId;
  detailTab = "shots";
  if (currentView !== "library") setView("library");
  const detail = $("libraryDetail");
  if (detail) {
    detail.innerHTML = renderVideoDetail(videoId);
    bindDetailEvents(videoId);
    detail.scrollIntoView({ behavior: "smooth", block: "start" });
  }
}

function bindDetailEvents(videoId) {
  const row = vaultRows.find((r) => r.video_id === videoId);
  const shots = row?.payload?.screenshots || [];
  document.querySelectorAll("[data-dtab]").forEach((btn) => {
    btn.addEventListener("click", () => {
      detailTab = btn.dataset.dtab;
      const detail = $("libraryDetail");
      if (detail) {
        detail.innerHTML = renderVideoDetail(videoId);
        bindDetailEvents(videoId);
        refreshIcons();
      }
    });
  });
  document.querySelectorAll("[data-detail-shot]").forEach((btn) => {
    btn.addEventListener("click", () => {
      openLightbox(shots, Number(btn.dataset.detailShot) || 0);
    });
  });
}

function bindViewEvents() {
  document.querySelectorAll("[data-open-video]").forEach((btn) => {
    btn.addEventListener("click", () => openVideo(btn.dataset.openVideo));
  });
  document.querySelectorAll("[data-view]").forEach((btn) => {
    if (btn.classList.contains("nav-item")) return;
    btn.addEventListener("click", () => setView(btn.dataset.view));
  });

  $("dashSearchBtn")?.addEventListener("click", () =>
    runSearchUI("dashSearch", "dashSearchResults")
  );
  $("dashSearch")?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") runSearchUI("dashSearch", "dashSearchResults");
  });
  $("aiSearchBtn")?.addEventListener("click", () =>
    runSearchUI("aiSearchInput", "aiSearchResults")
  );
  $("aiSearchInput")?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") runSearchUI("aiSearchInput", "aiSearchResults");
  });

  document.querySelectorAll("[data-q]").forEach((chip) => {
    chip.addEventListener("click", () => {
      const q = chip.dataset.q || "";
      const dash = $("dashSearch");
      const ai = $("aiSearchInput");
      if (dash) {
        dash.value = q;
        runSearchUI("dashSearch", "dashSearchResults");
      } else if (ai) {
        ai.value = q;
        runSearchUI("aiSearchInput", "aiSearchResults");
      } else {
        setView("search");
        requestAnimationFrame(() => {
          if ($("aiSearchInput")) {
            $("aiSearchInput").value = q;
            runSearchUI("aiSearchInput", "aiSearchResults");
          }
        });
      }
    });
  });

  $("clearSearches")?.addEventListener("click", () => {
    localStorage.removeItem(SEARCH_LS);
    renderView();
  });
  $("settingsTheme")?.addEventListener("click", toggleTheme);

  try {
    const shotList = getAllShots();
    document.querySelectorAll("[data-shot-index]").forEach((btn) => {
      btn.addEventListener("click", () => {
        openLightbox(shotList, Number(btn.dataset.shotIndex) || 0);
      });
    });
  } catch (err) {
    console.warn("[vault] shot click bind failed", err);
  }

  document.querySelectorAll("[data-lib-action]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const action = btn.dataset.libAction;
      const videoId = btn.dataset.videoId;
      const playlist = btn.dataset.playlist;
      if (!action || !videoId) return;
      void libraryAction(videoId, action, playlist)
        .then(() => renderView())
        .catch((e) =>
          alert(e instanceof Error ? e.message : "Library update failed")
        );
    });
  });

  // Custom playlist dropdowns — portal to body so nothing clips the menu
  document.querySelectorAll("[data-pl-trigger]").forEach((trig) => {
    trig.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      const dd = trig.closest("[data-pl-dd]");
      if (!dd) return;
      const vid = dd.dataset.videoId || "";
      const menu = findPlaylistMenu(dd);
      if (!menu) return;
      menu.dataset.owner = vid;

      const willOpen = !dd.classList.contains("is-open");
      closeAllPlaylistMenus(willOpen ? dd : null);
      if (!willOpen) return;

      dd.classList.add("is-open");
      trig.setAttribute("aria-expanded", "true");
      positionPlaylistMenu(dd, menu);
      refreshIcons();
      const input = menu.querySelector("[data-pl-new-input]");
      if (input) window.setTimeout(() => input.focus(), 40);
    });
  });

  // Clicks on portal menus (items live on body)
  document.querySelectorAll("[data-pl-opt]").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      applyPlaylistChoice(btn.dataset.videoId, btn.dataset.plOpt);
    });
  });

  document.querySelectorAll("[data-pl-new-go]").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      const videoId = btn.dataset.videoId;
      const wrap = btn.closest("[data-pl-new]");
      const input = wrap?.querySelector("[data-pl-new-input]");
      const name = (input?.value || "").trim();
      if (!name) {
        input?.focus();
        return;
      }
      applyPlaylistChoice(videoId, name);
    });
  });

  document.querySelectorAll("[data-pl-new-input]").forEach((input) => {
    input.addEventListener("keydown", (e) => {
      e.stopPropagation();
      if (e.key === "Enter") {
        e.preventDefault();
        const videoId = input.dataset.videoId;
        const name = input.value.trim();
        if (name) applyPlaylistChoice(videoId, name);
      }
    });
    input.addEventListener("click", (e) => e.stopPropagation());
  });

  if (!window.__vsaPlDdBound) {
    window.__vsaPlDdBound = true;
    document.addEventListener("click", (e) => {
      if (e.target.closest?.("[data-pl-dd]")) return;
      if (e.target.closest?.(".pl-dd-menu")) return;
      closeAllPlaylistMenus();
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") closeAllPlaylistMenus();
    });
    window.addEventListener(
      "resize",
      () => closeAllPlaylistMenus(),
      { passive: true }
    );
    window.addEventListener(
      "scroll",
      () => closeAllPlaylistMenus(),
      { passive: true, capture: true }
    );
  }

  // Playlists page quick-add
  $("plQuickAdd")?.addEventListener("click", () => {
    const videoId = $("plQuickVideo")?.value;
    let playlist = $("plQuickList")?.value;
    if (!videoId) {
      alert("Select a video first");
      return;
    }
    if (!playlist) {
      alert("Select a playlist (or Create new)");
      return;
    }
    if (playlist === "__new__") {
      playlist = window.prompt("New playlist name");
      if (!playlist?.trim()) return;
      playlist = playlist.trim();
    }
    // Skip if already in list
    const row = vaultRows.find((r) => r.video_id === videoId);
    if (row && videoInPlaylist(row, playlist)) {
      alert(`Already in “${playlist}”`);
      return;
    }
    void libraryAction(videoId, "add_playlist", playlist)
      .then(() => {
        renderView();
      })
      .catch((e) =>
        alert(e instanceof Error ? e.message : "Could not add to playlist")
      );
  });
}

/* Lightbox */
function openLightbox(shots, index) {
  lightboxShots = Array.isArray(shots) ? shots : [];
  lightboxIndex = Math.max(0, Number(index) || 0);
  const lb = $("lightbox");
  if (!lb) return;
  paintLightbox();
  lb.hidden = false;
  lb.removeAttribute("hidden");
  document.body.style.overflow = "hidden";
}
function closeLightbox() {
  const lb = $("lightbox");
  if (lb) {
    lb.hidden = true;
    lb.setAttribute("hidden", "");
  }
  document.body.style.overflow = "";
  const img = $("lightboxImg");
  if (img) img.src = "";
}
function paintLightbox() {
  const s = lightboxShots[lightboxIndex];
  if (!s) return;
  const img = $("lightboxImg");
  const t = $("lightboxTime");
  const n = $("lightboxNote");
  if (img) img.src = mediaSrc(s.imageUrl || s.dataUrl || "");
  if (t) t.textContent = formatTime(s.videoTime);
  if (n) n.textContent = s.note || "No note";
}
function lightboxStep(d) {
  if (!lightboxShots.length) return;
  lightboxIndex =
    (lightboxIndex + d + lightboxShots.length) % lightboxShots.length;
  paintLightbox();
}

async function loadVaultUI() {
  try {
    vaultRows = await fetchVault();
  } catch (err) {
    console.error("[vault] fetchVault failed", err);
    vaultRows = vaultRows || [];
    // Keep user in app; show empty + message on dashboard
    throw err;
  }
  renderView();
}

function fillUserChrome(user) {
  const name = user?.displayName || user?.email || "Account";
  const email = user?.email || "";
  const av = initials(user?.displayName, user?.email);
  const label = $("userLabel");
  const meta = $("userMeta");
  const avEl = $("userAv");
  if (label) label.textContent = name;
  if (meta) meta.textContent = email;
  if (avEl) avEl.textContent = av;
}

async function enterSession(next) {
  if (!next?.token) {
    throw new Error("Login succeeded but no token was returned");
  }
  session = {
    url: (next.url || "http://localhost:8787").replace(/\/$/, ""),
    token: next.token,
    user: next.user || {},
  };
  saveSession(session);

  // Always enter the app shell first — never bounce back on vault load errors
  showAppPage();
  fillUserChrome(session.user);
  currentView = "dashboard";
  const host = $("viewHost");
  if (host) {
    host.innerHTML = `<div class="empty">Loading your vault…</div>`;
  }

  try {
    const me = await fetchMe();
    session.user = { ...session.user, ...me };
    saveSession(session);
    fillUserChrome(session.user);
  } catch (err) {
    // Eject if JWT is bad OR user no longer exists in the connected DB
    // (common after Atlas ↔ local Mongo fallback switches)
    const msg = err instanceof Error ? err.message : "Session invalid";
    if (
      /expired|invalid|login required|401|404|not found|user not found/i.test(
        msg
      )
    ) {
      clearSession();
      session = {};
      showAuthPage();
      setStatus(
        /not found/i.test(msg)
          ? "Account not found on this server — sign in or create an account"
          : "Session expired — please log in again",
        "err"
      );
      return;
    }
    console.warn("[vault] /me failed, continuing with login user", err);
  }

  try {
    await loadVaultUI();
  } catch (err) {
    console.error("[vault] vault load failed", err);
    vaultRows = [];
    renderView();
    const host2 = $("viewHost");
    if (host2 && !vaultRows.length) {
      host2.insertAdjacentHTML(
        "afterbegin",
        `<div class="empty" style="margin-bottom:12px;border-color:rgba(248,113,113,0.4)">
          Signed in, but vault failed to load: ${escapeHtml(
            err instanceof Error ? err.message : "error"
          )}. Click <strong>Refresh vault</strong>.
        </div>`
      );
    }
  }
}

async function onAuthClick() {
  const busy =
    authMode === "register"
      ? "Creating account…"
      : authMode === "reset"
        ? "Resetting password…"
        : "Signing in…";
  setStatus(busy);
  const btn = $("btnAuth");
  if (btn) btn.disabled = true;
  try {
    clearSession();
    session = {};
    const next = await authRequest(authMode);
    const pass = $("password");
    if (pass) pass.value = "";
    await enterSession(next);
    setStatus("");
  } catch (err) {
    console.error("[vault] login failed", err);
    showAuthPage();
    const msg = err instanceof Error ? err.message : "Auth failed";
    setStatus(msg, "err");
  } finally {
    if (btn) btn.disabled = false;
  }
}

function logout() {
  clearSession();
  session = {};
  vaultRows = [];
  closeLightbox();
  showAuthPage();
  setAuthMode("login");
  setStatus("Signed out", "ok");
}

/* Bindings */
initTheme();
refreshIcons();
$("themeBtnAuth")?.addEventListener("click", toggleTheme);
$("themeBtnApp")?.addEventListener("click", toggleTheme);

document.querySelectorAll(".auth-mode").forEach((btn) => {
  btn.addEventListener("click", () => setAuthMode(btn.dataset.auth));
});
document.querySelectorAll(".nav-item").forEach((btn) => {
  btn.addEventListener("click", () => setView(btn.dataset.view));
});

$("btnAuth")?.addEventListener("click", () => void onAuthClick());
$("btnLogout")?.addEventListener("click", logout);
$("btnRefresh")?.addEventListener("click", () => {
  void loadVaultUI().catch((e) =>
    alert(e instanceof Error ? e.message : "Refresh failed")
  );
});
$("btnExtGuide")?.addEventListener("click", () => setView("extension"));

["email", "password", "displayName"].forEach((id) => {
  $(id)?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") void onAuthClick();
  });
});

$("globalSearch")?.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    const q = $("globalSearch").value.trim();
    setView("search");
    requestAnimationFrame(() => {
      if ($("aiSearchInput")) {
        $("aiSearchInput").value = q;
        runSearchUI("aiSearchInput", "aiSearchResults");
      }
    });
  }
});
document.addEventListener("keydown", (e) => {
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
    e.preventDefault();
    $("globalSearch")?.focus();
  }
  if ($("lightbox")?.hidden) return;
  if (e.key === "Escape") closeLightbox();
  if (e.key === "ArrowLeft") lightboxStep(-1);
  if (e.key === "ArrowRight") lightboxStep(1);
});

$("lightboxClose")?.addEventListener("click", closeLightbox);
$("lightboxPrev")?.addEventListener("click", () => lightboxStep(-1));
$("lightboxNext")?.addEventListener("click", () => lightboxStep(1));
$("lightbox")?.addEventListener("click", (e) => {
  if (e.target === $("lightbox")) closeLightbox();
});

/* Session boot */
function consumeTokenFromUrl() {
  try {
    const u = new URL(location.href);
    const token = u.searchParams.get("token");
    if (!token || token.length < 20) return null;
    u.searchParams.delete("token");
    history.replaceState({}, "", u.pathname + u.search + u.hash);
    return token;
  } catch {
    return null;
  }
}

const handed = consumeTokenFromUrl();
const c = loadSession();
const defaultUrl = location.origin.includes("8787")
  ? location.origin
  : "http://localhost:8787";
if ($("cloudUrl")) $("cloudUrl").value = c.url || defaultUrl;
if (c.user?.email && $("email")) $("email").value = c.user.email;

if (handed) {
  session = {
    url: ($("cloudUrl")?.value || defaultUrl).replace(/\/$/, ""),
    token: handed,
    user: c.user || { email: "", displayName: "Account" },
  };
  saveSession(session);
  void enterSession(session).catch(() => logout());
} else if (c.token && c.url) {
  session = c;
  void enterSession(c).catch(() => logout());
} else {
  showAuthPage();
  setAuthMode("login");
}
