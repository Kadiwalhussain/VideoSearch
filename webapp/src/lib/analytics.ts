import type { ChannelStat, VaultRow, VaultStats } from "../types";
import { allNotes } from "./vaultSelectors";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

export type WeekSeries = {
  labels: string[];
  activity: number[];
  marks: number[];
  shots: number[];
  videos: number[];
};

export type AnalyticsModel = {
  stats: VaultStats;
  writtenNotes: number;
  noteDensity: number;
  avgMarks: number;
  avgShots: number;
  peakDay: string;
  totalPulse: number;
  week: WeekSeries;
  /** Last 14 days activity (marks+shots by createdAt when available) */
  last14: { labels: string[]; values: number[] };
  top: Array<{
    id: string;
    title: string;
    marks: number;
    shots: number;
    notes: number;
    score: number;
    channel?: string;
  }>;
  /** Where you spend engagement — channels ranked by activity */
  channels: ChannelStat[];
  topChannel: string;
  totalChannelMinutes: number;
  composition: {
    videos: number;
    marks: number;
    shots: number;
    written: number;
  };
  radar: number[];
  savedShare: number;
  watchLaterShare: number;
};

/** Estimate engaged minutes from mark/shot timeline span. Unwatched = 0. */
function engagedMinutes(row: VaultRow): number {
  const times: number[] = [];
  for (const h of row.payload?.highlights || []) {
    if (typeof h.startTime === "number") times.push(h.startTime);
  }
  for (const s of row.payload?.screenshots || []) {
    if (typeof s.videoTime === "number") times.push(s.videoTime);
  }
  if (times.length >= 2) {
    const span = Math.max(...times) - Math.min(...times);
    return Math.min(180, Math.max(2, Math.round(span / 60) + 1));
  }
  if (times.length === 1) return 4;
  // A real watch with no marks/shots still counts a little; vault-only does not
  if (row.payload?.lastViewedAt) return 2;
  return 0;
}

export function buildChannelStats(rows: VaultRow[]): ChannelStat[] {
  const map = new Map<
    string,
    {
      name: string;
      url?: string;
      videos: number;
      marks: number;
      shots: number;
      notes: number;
      minutes: number;
      sampleVideoId?: string;
    }
  >();

  for (const r of rows) {
    const raw = (r.payload?.channelTitle || "").trim();
    const name = raw || "Unknown channel";
    const key = name.toLowerCase();
    let g = map.get(key);
    if (!g) {
      g = {
        name,
        url: r.payload?.channelUrl || undefined,
        videos: 0,
        marks: 0,
        shots: 0,
        notes: 0,
        minutes: 0,
        sampleVideoId: r.video_id,
      };
      map.set(key, g);
    }
    const hl = r.payload?.highlights || [];
    const ss = r.payload?.screenshots || [];
    g.videos += 1;
    g.marks += hl.length;
    g.shots += ss.length;
    g.notes += hl.filter((h) => h.note?.trim()).length;
    g.minutes += engagedMinutes(r);
    if (!g.url && r.payload?.channelUrl) g.url = r.payload.channelUrl;
    if (!g.sampleVideoId) g.sampleVideoId = r.video_id;
  }

  return [...map.values()]
    .map((g) => ({
      ...g,
      // Score: minutes matter most, then marks/shots (where you actively engage)
      score: g.minutes * 3 + g.marks * 2 + g.shots * 3 + g.notes,
    }))
    .sort((a, b) => b.score - a.score || b.minutes - a.minutes);
}

function dayIndex(d: Date): number {
  const day = d.getDay(); // 0 Sun
  return day === 0 ? 6 : day - 1;
}

function eventDayIndex(ts?: number | string | null): number | null {
  if (ts == null || ts === "") return null;
  const n = typeof ts === "number" ? ts : new Date(ts).getTime();
  if (!Number.isFinite(n) || n <= 0) return null;
  // Heuristic: timestamps from extension are usually ms; if tiny, treat as sec
  const ms = n < 1e12 ? n * 1000 : n;
  const d = new Date(ms);
  if (!Number.isFinite(d.getTime())) return null;
  return dayIndex(d);
}

export function buildAnalytics(
  rows: VaultRow[],
  stats: VaultStats
): AnalyticsModel {
  const activity = [0, 0, 0, 0, 0, 0, 0];
  const marks = [0, 0, 0, 0, 0, 0, 0];
  const shots = [0, 0, 0, 0, 0, 0, 0];
  const videos = [0, 0, 0, 0, 0, 0, 0];
  const videosSeenDay = new Set<string>();

  // Only real capture / watch times — never vault updated_at (sync, bio, playlist)
  for (const r of rows) {
    const hl = r.payload?.highlights || [];
    const ss = r.payload?.screenshots || [];
    let videoAttributed = false;

    const touchVideo = (i: number) => {
      if (videoAttributed) return;
      const key = `${r.video_id}:${i}`;
      if (videosSeenDay.has(key)) return;
      videosSeenDay.add(key);
      videos[i] += 1;
      videoAttributed = true;
    };

    for (const h of hl) {
      const i = eventDayIndex(h.createdAt);
      if (i == null) continue;
      marks[i] += 1;
      activity[i] += 1;
      touchVideo(i);
    }

    for (const s of ss) {
      const i = eventDayIndex(s.createdAt);
      if (i == null) continue;
      shots[i] += 1;
      activity[i] += 1;
      touchVideo(i);
    }

    // Video-only: count a watch only when the user actually viewed it
    if (!videoAttributed) {
      const i = eventDayIndex(r.payload?.lastViewedAt);
      if (i != null) {
        videos[i] += 1;
        activity[i] += 1;
      }
    }
  }

  const writtenNotes = allNotes(rows).filter((n) =>
    n.highlight.note?.trim()
  ).length;
  const noteDensity =
    stats.marks + stats.shots > 0
      ? Math.round(
          (writtenNotes / Math.max(1, stats.marks + stats.shots)) * 100
        )
      : 0;
  const avgMarks =
    stats.videos > 0
      ? Math.round((stats.marks / stats.videos) * 10) / 10
      : 0;
  const avgShots =
    stats.videos > 0
      ? Math.round((stats.shots / stats.videos) * 10) / 10
      : 0;
  const totalPulse = activity.reduce((a, b) => a + b, 0);
  const peakIdx = activity.indexOf(Math.max(...activity, 0));
  const peakDay = DAYS[peakIdx] || "—";

  // Last 14 calendar days from mark/shot timestamps + video updates
  const last14 = buildLast14(rows);

  const top = [...rows]
    .map((r) => {
      const hl = r.payload?.highlights || [];
      const ss = r.payload?.screenshots || [];
      const notes = hl.filter((h) => h.note?.trim()).length;
      const marksN = hl.length;
      const shotsN = ss.length;
      return {
        id: r.video_id,
        title: r.payload?.videoTitle || r.video_id,
        marks: marksN,
        shots: shotsN,
        notes,
        score: marksN * 2 + shotsN * 3 + notes,
        channel: r.payload?.channelTitle || undefined,
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 10);

  const channels = buildChannelStats(rows);
  const totalChannelMinutes = channels.reduce((a, c) => a + c.minutes, 0);
  const topChannel = channels[0]?.name || "—";

  const radar = [
    Math.min(20, stats.videos),
    Math.min(40, stats.marks),
    Math.min(30, stats.shots),
    Math.min(30, writtenNotes),
    Math.min(20, Math.round(avgMarks * 4)),
    Math.min(20, stats.saved),
  ];

  return {
    stats,
    writtenNotes,
    noteDensity,
    avgMarks,
    avgShots,
    peakDay,
    totalPulse,
    week: {
      labels: [...DAYS],
      activity,
      marks,
      shots,
      videos,
    },
    last14,
    top,
    channels,
    topChannel,
    totalChannelMinutes,
    composition: {
      videos: stats.videos,
      marks: stats.marks,
      shots: stats.shots,
      written: writtenNotes,
    },
    radar,
    savedShare:
      stats.videos > 0
        ? Math.round((stats.saved / stats.videos) * 100)
        : 0,
    watchLaterShare:
      stats.videos > 0
        ? Math.round((stats.watchLater / stats.videos) * 100)
        : 0,
  };
}

function dayKeyFromTs(ts?: number | string | null): string | null {
  if (ts == null || ts === "") return null;
  const n = typeof ts === "number" ? ts : new Date(ts).getTime();
  if (!Number.isFinite(n) || n <= 0) return null;
  const ms = n < 1e12 ? n * 1000 : n;
  try {
    return new Date(ms).toISOString().slice(0, 10);
  } catch {
    return null;
  }
}

function buildLast14(rows: VaultRow[]): { labels: string[]; values: number[] } {
  const days: { key: string; label: string; value: number }[] = [];
  const now = new Date();
  for (let i = 13; i >= 0; i--) {
    const d = new Date(now);
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - i);
    // Local calendar day key (avoid UTC shift)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    days.push({
      key,
      label: `${d.getMonth() + 1}/${d.getDate()}`,
      value: 0,
    });
  }
  const map = new Map(days.map((d) => [d.key, d]));

  const bump = (ts?: number | string | null, weight = 1) => {
    if (ts == null) return;
    const n = typeof ts === "number" ? ts : new Date(ts).getTime();
    if (!Number.isFinite(n) || n <= 0) return;
    const ms = n < 1e12 ? n * 1000 : n;
    const d = new Date(ms);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const bucket = map.get(key);
    if (bucket) bucket.value += weight;
  };

  for (const r of rows) {
    for (const h of r.payload?.highlights || []) {
      bump(h.createdAt, 1);
    }
    for (const s of r.payload?.screenshots || []) {
      bump(s.createdAt, 1);
    }
    // Real watch without a mark/shot still counts as a day of activity
    if (
      !(r.payload?.highlights || []).some((h) => h.createdAt) &&
      !(r.payload?.screenshots || []).some((s) => s.createdAt)
    ) {
      bump(r.payload?.lastViewedAt, 1);
    }
  }

  return {
    labels: days.map((d) => d.label),
    values: days.map((d) => Math.round(d.value)),
  };
}

export function chartTheme(isDark: boolean) {
  return {
    text: isDark ? "#c5cdd9" : "#475569",
    grid: isDark ? "rgba(255,255,255,0.06)" : "rgba(15,23,42,0.08)",
    muted: isDark ? "#6b7280" : "#94a3b8",
    accent: isDark ? "#34d399" : "#047857",
    accent2: isDark ? "#38bdf8" : "#0369a1",
    accent3: isDark ? "#a78bfa" : "#6d28d9",
    accent4: isDark ? "#fbbf24" : "#b45309",
    danger: isDark ? "#fb7185" : "#dc2626",
    surface: isDark ? "rgba(12,16,26,0.9)" : "#ffffff",
  };
}
