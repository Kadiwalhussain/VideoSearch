import type {
  NoteItem,
  PlaylistGroup,
  SearchHit,
  ShotItem,
  VaultRow,
  VaultStats,
} from "../types";

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
  return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
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
    if (title.toLowerCase().includes(query)) {
      hits.push({
        kind: "video",
        videoId: r.video_id,
        title,
        snippet: title,
        score: 3,
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
  }
  return hits.sort((a, b) => b.score - a.score).slice(0, 80);
}

export function recentRows(rows: VaultRow[], n = 8): VaultRow[] {
  return [...rows]
    .sort(
      (a, b) =>
        new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
    )
    .slice(0, n);
}

export function findRow(rows: VaultRow[], videoId: string): VaultRow | undefined {
  return rows.find((r) => r.video_id === videoId);
}
