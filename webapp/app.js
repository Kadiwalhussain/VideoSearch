/**
 * VideoSearch Vault — separate auth page + full app dashboard + lightbox.
 */

const LS = "vsa_vault_session_v3";
const THEME_LS = "vsa_theme";

function $(id) {
  return document.getElementById(id);
}

function applyTheme(theme) {
  const t = theme === "light" ? "light" : "dark";
  document.documentElement.dataset.theme = t;
  localStorage.setItem(THEME_LS, t);
  document.querySelectorAll(".theme-btn").forEach((btn) => {
    btn.textContent = t === "dark" ? "☀" : "☾";
    btn.title = t === "dark" ? "Switch to light mode" : "Switch to dark mode";
  });
}

function initTheme() {
  const saved = localStorage.getItem(THEME_LS);
  if (saved === "light" || saved === "dark") {
    applyTheme(saved);
    return;
  }
  const prefersDark =
    typeof matchMedia === "function" &&
    matchMedia("(prefers-color-scheme: dark)").matches;
  applyTheme(prefersDark ? "dark" : "light");
}

function toggleTheme() {
  const cur = document.documentElement.dataset.theme || "dark";
  applyTheme(cur === "dark" ? "light" : "dark");
}

function ytThumb(videoId) {
  if (!videoId) return "";
  return `https://i.ytimg.com/vi/${encodeURIComponent(videoId)}/mqdefault.jpg`;
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

function setStatus(msg, kind = "") {
  const el = $("statusMsg");
  if (!el) return;
  el.textContent = msg;
  el.className = "status" + (kind ? ` ${kind}` : "");
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

let authMode = "login";
let session = loadSession();
let vaultRows = [];
let selectedId = null;
let lightboxShots = [];
let lightboxIndex = 0;

function apiBase() {
  return (session.url || $("cloudUrl")?.value || "http://localhost:8787").replace(
    /\/$/,
    ""
  );
}

function authHeaders() {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${session.token}`,
  };
}

function showAuthPage() {
  $("pageAuth").hidden = false;
  $("pageApp").hidden = true;
  document.title = "Log in · VideoSearch Vault";
}

function showAppPage() {
  $("pageAuth").hidden = true;
  $("pageApp").hidden = false;
  document.title = "Vault · VideoSearch";
}

function setAuthMode(mode) {
  authMode = mode;
  document.querySelectorAll(".auth-mode").forEach((b) => {
    b.classList.toggle("is-on", b.dataset.auth === mode);
  });
  $("nameField").hidden = mode !== "register";
  $("btnAuth").textContent = mode === "register" ? "Create account" : "Log in";
  $("authHint").textContent =
    mode === "register"
      ? "Creates a private vault. Use this email in the Chrome extension too."
      : "Use the same email as the Chrome extension";
  $("password").autocomplete =
    mode === "register" ? "new-password" : "current-password";
}

async function authRequest(mode) {
  const url = $("cloudUrl").value.trim() || "http://localhost:8787";
  const email = $("email").value.trim();
  const password = $("password").value;
  const displayName = $("displayName").value.trim();

  if (!email || !email.includes("@")) throw new Error("Enter a valid email");
  if (!password || password.length < 6)
    throw new Error("Password must be at least 6 characters");

  const path = mode === "register" ? "/api/auth/register" : "/api/auth/login";
  const res = await fetch(`${url.replace(/\/$/, "")}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, displayName }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.token || !data.user) {
    throw new Error(data.message || `Auth failed (HTTP ${res.status})`);
  }
  return {
    url: url.replace(/\/$/, ""),
    token: data.token,
    user: data.user,
  };
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
  if (!res.ok || data.ok === false) {
    throw new Error(data.message || `HTTP ${res.status}`);
  }
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

function updateStats() {
  let marks = 0;
  let shots = 0;
  for (const r of vaultRows) {
    marks += (r.payload?.highlights || []).length;
    shots += (r.payload?.screenshots || []).length;
  }
  $("statVideos").textContent = String(vaultRows.length);
  $("statMarks").textContent = String(marks);
  $("statShots").textContent = String(shots);
  $("libraryCount").textContent = String(vaultRows.length);
}

function renderList() {
  const host = $("videoItems");
  if (!vaultRows.length) {
    host.innerHTML = `<p class="empty-state">No videos yet.<br/>Open YouTube → extension <strong>Notes → Sync</strong>.</p>`;
    return;
  }
  host.innerHTML = "";
  for (const row of vaultRows) {
    const p = row.payload || {};
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className =
      "video-item" + (row.video_id === selectedId ? " is-on" : "");
    const marks = (p.highlights || []).length;
    const shots = (p.screenshots || []).length;
    const thumb = ytThumb(row.video_id);
    btn.innerHTML = `
      <img class="video-item-thumb" src="${thumb}" alt="" loading="lazy" />
      <div class="video-item-body">
        <strong>${escapeHtml(p.videoTitle || row.video_id)}</strong>
        <span>${marks} marks · ${shots} shots</span>
      </div>
    `;
    btn.addEventListener("click", () => {
      selectedId = row.video_id;
      renderList();
      renderDetail(row);
    });
    host.appendChild(btn);
  }
}

function buildShotCard(s, index, shots) {
  const card = document.createElement("article");
  card.className = "shot-card";
  card.tabIndex = 0;
  card.setAttribute("role", "button");
  card.setAttribute("aria-label", `Open screenshot at ${formatTime(s.videoTime)}`);

  const thumb = document.createElement("div");
  thumb.className = "shot-thumb";
  const img = document.createElement("img");
  const src = mediaSrc(s.imageUrl || s.dataUrl || "");
  img.src = src;
  img.alt = `Frame at ${formatTime(s.videoTime)}`;
  img.loading = "lazy";
  const zoom = document.createElement("span");
  zoom.className = "shot-zoom";
  zoom.textContent = "View full";
  thumb.append(img, zoom);

  const meta = document.createElement("div");
  meta.className = "meta";
  meta.innerHTML = `<time>${formatTime(s.videoTime)}</time><p>${escapeHtml(
    s.note || "No note"
  )}</p>`;

  card.append(thumb, meta);

  const open = () => openLightbox(shots, index);
  card.addEventListener("click", open);
  card.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      open();
    }
  });
  return card;
}

function renderShotsPane(shots) {
  const pane = $("paneShots");
  if (!shots.length) {
    pane.innerHTML = `<div class="pane-empty">No screenshots for this video yet.<br/>Capture frames from the extension camera button.</div>`;
    return;
  }
  const grid = document.createElement("div");
  grid.className = "shot-grid";
  shots.forEach((s, i) => grid.appendChild(buildShotCard(s, i, shots)));
  pane.innerHTML = "";
  pane.appendChild(grid);
}

function renderMarksPane(marks) {
  const pane = $("paneMarks");
  if (!marks.length) {
    pane.innerHTML = `<div class="pane-empty">No highlights yet.<br/>Mark moments on the timeline from the extension.</div>`;
    return;
  }
  const list = document.createElement("div");
  list.className = "mark-list";
  for (const h of marks) {
    const row = document.createElement("div");
    row.className = "mark-row";
    if (h.color) row.style.borderLeftColor = h.color;
    row.innerHTML = `
      <time>${formatTime(h.startTime)}</time>
      <p>${escapeHtml(h.note || "(empty note)")}</p>
    `;
    list.appendChild(row);
  }
  pane.innerHTML = "";
  pane.appendChild(list);
}

function renderOverview(shots, marks) {
  const pane = $("paneAll");
  pane.innerHTML = "";

  const secShots = document.createElement("div");
  secShots.className = "overview-section";
  secShots.innerHTML = `<h3>Screenshots (${shots.length})</h3>`;
  if (shots.length) {
    const grid = document.createElement("div");
    grid.className = "shot-grid";
    shots.forEach((s, i) => grid.appendChild(buildShotCard(s, i, shots)));
    secShots.appendChild(grid);
  } else {
    secShots.innerHTML += `<div class="pane-empty">No screenshots</div>`;
  }

  const secMarks = document.createElement("div");
  secMarks.className = "overview-section";
  secMarks.innerHTML = `<h3>Highlights & notes (${marks.length})</h3>`;
  if (marks.length) {
    const list = document.createElement("div");
    list.className = "mark-list";
    for (const h of marks) {
      const row = document.createElement("div");
      row.className = "mark-row";
      if (h.color) row.style.borderLeftColor = h.color;
      row.innerHTML = `
        <time>${formatTime(h.startTime)}</time>
        <p>${escapeHtml(h.note || "(empty note)")}</p>
      `;
      list.appendChild(row);
    }
    secMarks.appendChild(list);
  } else {
    secMarks.innerHTML += `<div class="pane-empty">No highlights</div>`;
  }

  pane.append(secShots, secMarks);
}

function renderDetail(row) {
  $("detailEmpty").hidden = true;
  $("detailBody").hidden = false;
  const p = row.payload || {};
  $("detailTitle").textContent = p.videoTitle || row.video_id;
  $("detailLink").href =
    p.videoUrl || `https://www.youtube.com/watch?v=${row.video_id}`;
  $("detailUpdated").textContent = row.updated_at
    ? `Updated ${new Date(row.updated_at).toLocaleString()}`
    : "";

  const thumbHost = $("detailThumb");
  if (thumbHost) {
    const src = ytThumb(row.video_id);
    if (src) {
      thumbHost.hidden = false;
      thumbHost.innerHTML = `<img src="${src}" alt="" loading="lazy" />`;
    } else {
      thumbHost.hidden = true;
      thumbHost.innerHTML = "";
    }
  }

  const shots = p.screenshots || [];
  const marks = p.highlights || [];
  renderShotsPane(shots);
  renderMarksPane(marks);
  renderOverview(shots, marks);

  setWorkspaceTab("shots");
}

function setWorkspaceTab(tab) {
  document.querySelectorAll(".ws-tab").forEach((b) => {
    b.classList.toggle("is-on", b.dataset.tab === tab);
  });
  $("paneShots").hidden = tab !== "shots";
  $("paneMarks").hidden = tab !== "marks";
  $("paneAll").hidden = tab !== "all";
}

/* ── Lightbox ── */
function openLightbox(shots, index) {
  lightboxShots = shots;
  lightboxIndex = index;
  paintLightbox();
  $("lightbox").hidden = false;
  document.body.style.overflow = "hidden";
}

function closeLightbox() {
  $("lightbox").hidden = true;
  document.body.style.overflow = "";
  $("lightboxImg").src = "";
}

function paintLightbox() {
  const s = lightboxShots[lightboxIndex];
  if (!s) return;
  $("lightboxImg").src = mediaSrc(s.imageUrl || s.dataUrl || "");
  $("lightboxTime").textContent = formatTime(s.videoTime);
  $("lightboxNote").textContent = s.note || "No note";
  $("lightboxPrev").style.visibility =
    lightboxShots.length > 1 ? "visible" : "hidden";
  $("lightboxNext").style.visibility =
    lightboxShots.length > 1 ? "visible" : "hidden";
}

function lightboxStep(delta) {
  if (!lightboxShots.length) return;
  lightboxIndex =
    (lightboxIndex + delta + lightboxShots.length) % lightboxShots.length;
  paintLightbox();
}

async function loadVaultUI() {
  vaultRows = await fetchVault();
  updateStats();
  renderList();
  if (vaultRows[0]) {
    selectedId = vaultRows[0].video_id;
    renderList();
    renderDetail(vaultRows[0]);
  } else {
    $("detailEmpty").hidden = false;
    $("detailBody").hidden = true;
  }
}

async function enterSession(next) {
  session = next;
  saveSession(session);
  showAppPage();

  const name = session.user?.displayName || session.user?.email || "Account";
  $("userLabel").textContent = name;
  $("userMeta").textContent = session.user?.email || "";
  $("userAv").textContent = initials(
    session.user?.displayName,
    session.user?.email
  );

  try {
    const me = await fetchMe();
    session.user = { ...session.user, ...me };
    saveSession(session);
    $("userLabel").textContent = me.displayName || me.email || "Account";
    $("userMeta").textContent = me.email || "";
    $("userAv").textContent = initials(me.displayName, me.email);
    await loadVaultUI();
  } catch (err) {
    clearSession();
    session = {};
    showAuthPage();
    setStatus(
      err instanceof Error ? err.message : "Could not load vault",
      "err"
    );
  }
}

async function onAuthClick() {
  setStatus(authMode === "register" ? "Creating account…" : "Signing in…");
  $("btnAuth").disabled = true;
  try {
    const next = await authRequest(authMode);
    $("password").value = "";
    await enterSession(next);
    setStatus("");
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Auth failed";
    if (/Failed to fetch|NetworkError/i.test(msg)) {
      setStatus("API offline. Run: cd server && npm run dev", "err");
    } else {
      setStatus(msg, "err");
    }
  } finally {
    $("btnAuth").disabled = false;
  }
}

function logout() {
  clearSession();
  session = {};
  vaultRows = [];
  selectedId = null;
  closeLightbox();
  showAuthPage();
  setAuthMode("login");
  setStatus("Signed out", "ok");
}

/* ── Theme ── */
initTheme();
$("themeBtnAuth")?.addEventListener("click", toggleTheme);
$("themeBtnApp")?.addEventListener("click", toggleTheme);

/* ── Bindings ── */
document.querySelectorAll(".auth-mode").forEach((btn) => {
  btn.addEventListener("click", () => setAuthMode(btn.dataset.auth));
});

document.querySelectorAll(".ws-tab").forEach((btn) => {
  btn.addEventListener("click", () => setWorkspaceTab(btn.dataset.tab));
});

$("btnAuth").addEventListener("click", () => void onAuthClick());
$("btnLogout").addEventListener("click", logout);
$("btnRefresh").addEventListener("click", () => {
  void loadVaultUI().catch((err) => {
    setStatus(err instanceof Error ? err.message : "Refresh failed", "err");
  });
});

["email", "password", "displayName"].forEach((id) => {
  $(id)?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") void onAuthClick();
  });
});

$("lightboxClose").addEventListener("click", closeLightbox);
$("lightboxPrev").addEventListener("click", (e) => {
  e.stopPropagation();
  lightboxStep(-1);
});
$("lightboxNext").addEventListener("click", (e) => {
  e.stopPropagation();
  lightboxStep(1);
});
$("lightbox").addEventListener("click", (e) => {
  if (e.target === $("lightbox") || e.target === $("lightbox").querySelector(".lightbox-stage")) {
    // only close on backdrop, not on image
    if (e.target === $("lightbox")) closeLightbox();
  }
});
document.addEventListener("keydown", (e) => {
  if ($("lightbox").hidden) return;
  if (e.key === "Escape") closeLightbox();
  if (e.key === "ArrowLeft") lightboxStep(-1);
  if (e.key === "ArrowRight") lightboxStep(1);
});

/* Token handoff from extension */
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
$("cloudUrl").value = c.url || defaultUrl;
if (c.user?.email) $("email").value = c.user.email;

if (handed) {
  session = {
    url: $("cloudUrl").value.replace(/\/$/, ""),
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
