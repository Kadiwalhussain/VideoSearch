import type {
  NoteItem,
  PlaylistGroup,
  SearchHit,
  ShotItem,
  VaultRow,
  VaultStats,
} from "../types";
import { rowActivityMs } from "./format";

export function vaultStats(rows: VaultRow[]): VaultStats {
  let marks = 0;
  let shots = 0;
  let notes = 0;
  let watchLater = 0;
  let saved = 0;
  for (const r of rows) {
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
  return {
    videos: rows.length,
    marks,
    shots,
    notes,
    watchLater,
    saved,
  };
}

export function watchLaterRows(rows: VaultRow[]): VaultRow[] {
  return rows
    .filter((r) => r.payload?.watchLater)
    .sort(
      (a, b) =>
        (b.payload?.watchLaterAt || 0) - (a.payload?.watchLaterAt || 0)
    );
}

export function savedRows(rows: VaultRow[]): VaultRow[] {
  return rows
    .filter((r) => r.payload?.saved)
    .sort((a, b) => (b.payload?.savedAt || 0) - (a.payload?.savedAt || 0));
}

/** Sort playlist videos so the cover / “first” item is most recently active. */
function sortPlaylistRows(list: VaultRow[]): VaultRow[] {
  return [...list].sort((a, b) => {
    const ta = rowActivityMs(a) || 0;
    const tb = rowActivityMs(b) || 0;
    return tb - ta;
  });
}

export function playlistGroups(rows: VaultRow[]): PlaylistGroup[] {
  const map = new Map<string, { name: string; rows: VaultRow[] }>();
  for (const r of rows) {
    for (const name of r.payload?.playlists || []) {
      if (!name) continue;
      const key = name.toLowerCase();
      const g = map.get(key);
      if (g) {
        if (!g.rows.some((x) => x.video_id === r.video_id)) g.rows.push(r);
      } else {
        map.set(key, { name, rows: [r] });
      }
    }
  }
  return [...map.values()]
    .map((g) => ({ ...g, rows: sortPlaylistRows(g.rows) }))
    .sort((a, b) => {
      // Most recently touched playlists first, then alpha
      const aTop = gTopMs(a.rows);
      const bTop = gTopMs(b.rows);
      if (bTop !== aTop) return bTop - aTop;
      return a.name.localeCompare(b.name);
    });
}

function gTopMs(list: VaultRow[]): number {
  let max = 0;
  for (const r of list) {
    const t = rowActivityMs(r) || 0;
    if (t > max) max = t;
  }
  return max;
}

export function allPlaylistNames(rows: VaultRow[]): string[] {
  return playlistGroups(rows).map((g) => g.name);
}

export function allNotes(rows: VaultRow[]): NoteItem[] {
  const out: NoteItem[] = [];
  for (const r of rows) {
    const p = r.payload || {};
    for (const h of p.highlights || []) {
      out.push({
        highlight: h,
        videoId: r.video_id,
        title: p.videoTitle || r.video_id,
        videoUrl: p.videoUrl || `https://www.youtube.com/watch?v=${r.video_id}`,
      });
    }
  }
  return out.sort(
    (a, b) => (b.highlight.createdAt || 0) - (a.highlight.createdAt || 0)
  );
}

export function allShots(rows: VaultRow[]): ShotItem[] {
  const out: ShotItem[] = [];
  for (const r of rows) {
    const p = r.payload || {};
    for (const s of p.screenshots || []) {
      out.push({
        shot: s,
        videoId: r.video_id,
        title: p.videoTitle || r.video_id,
        videoUrl: p.videoUrl || `https://www.youtube.com/watch?v=${r.video_id}`,
      });
    }
  }
  return out.sort((a, b) => (b.shot.createdAt || 0) - (a.shot.createdAt || 0));
}

export function searchVault(rows: VaultRow[], q: string): SearchHit[] {
  const query = q.trim().toLowerCase();
  if (!query) return [];
  const hits: SearchHit[] = [];
  for (const r of rows) {
    const p = r.payload || {};
    const title = p.videoTitle || r.video_id;
    const channel = (p.channelTitle || "").toLowerCase();
    if (title.toLowerCase().includes(query) || channel.includes(query)) {
      hits.push({
        kind: "video",
        videoId: r.video_id,
        title,
        snippet: p.channelTitle
          ? `${title} · ${p.channelTitle}`
          : title,
        score: title.toLowerCase().includes(query) ? 3 : 2.5,
      });
    }
    for (const h of p.highlights || []) {
      const note = (h.note || "").trim();
      if (note.toLowerCase().includes(query)) {
        hits.push({
          kind: "mark",
          videoId: r.video_id,
          title,
          snippet: note,
          time: h.startTime,
          score: 2,
        });
      }
    }
    for (const s of p.screenshots || []) {
      const note = (s.note || "").trim();
      if (note.toLowerCase().includes(query)) {
        hits.push({
          kind: "shot",
          videoId: r.video_id,
          title,
          snippet: note || "Screenshot",
          time: s.videoTime,
          score: 2,
        });
      }
    }
    // Full bio text (description synced from YouTube)
    const bio = (p.bioText || p.bioMarkdown || "").toLowerCase();
    if (bio && bio.includes(query)) {
      const idx = bio.indexOf(query);
      const start = Math.max(0, idx - 40);
      const snip = (p.bioText || p.bioMarkdown || "")
        .slice(start, start + 120)
        .replace(/\s+/g, " ")
        .trim();
      hits.push({
        kind: "video",
        videoId: r.video_id,
        title,
        snippet: (start > 0 ? "…" : "") + snip + "…",
        score: 1.5,
      });
    }
    for (const l of p.sourceLinks || []) {
      const label = (l.label || "").toLowerCase();
      const url = (l.url || "").toLowerCase();
      if (label.includes(query) || url.includes(query)) {
        hits.push({
          kind: "video",
          videoId: r.video_id,
          title,
          snippet: l.label || l.url || "Source link",
          score: 1.8,
        });
      }
    }
  }
  return hits.sort((a, b) => b.score - a.score).slice(0, 80);
}

export function recentRows(rows: VaultRow[], n = 8): VaultRow[] {
  return [...rows]
    .sort((a, b) => (rowActivityMs(b) || 0) - (rowActivityMs(a) || 0))
    .slice(0, n);
}

export function findRow(rows: VaultRow[], videoId: string): VaultRow | undefined {
  return rows.find((r) => r.video_id === videoId);
}
