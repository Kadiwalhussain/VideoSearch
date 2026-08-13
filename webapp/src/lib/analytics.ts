import type { VaultRow, VaultStats } from "../types";
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
  }>;
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

function dayIndex(d: Date): number {
  const day = d.getDay(); // 0 Sun
  return day === 0 ? 6 : day - 1;
}

export function buildAnalytics(
  rows: VaultRow[],
  stats: VaultStats
): AnalyticsModel {
  const activity = [0, 0, 0, 0, 0, 0, 0];
  const marks = [0, 0, 0, 0, 0, 0, 0];
  const shots = [0, 0, 0, 0, 0, 0, 0];
  const videos = [0, 0, 0, 0, 0, 0, 0];

  for (const r of rows) {
    const d = new Date(r.updated_at || Date.now());
    const idx = dayIndex(d);
    const hl = r.payload?.highlights?.length || 0;
    const ss = r.payload?.screenshots?.length || 0;
    videos[idx] += 1;
    marks[idx] += hl;
    shots[idx] += ss;
    activity[idx] += 1 + hl + ss;

    // Also attribute individual mark/shot createdAt when present
    for (const h of r.payload?.highlights || []) {
      if (h.createdAt) {
        const i = dayIndex(new Date(h.createdAt));
        // already counted in hl totals for updated_at day; skip double-count for weekly by video
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
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 10);

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

function buildLast14(rows: VaultRow[]): { labels: string[]; values: number[] } {
  const days: { key: string; label: string; value: number }[] = [];
  const now = new Date();
  for (let i = 13; i >= 0; i--) {
    const d = new Date(now);
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    days.push({
      key,
      label: `${d.getMonth() + 1}/${d.getDate()}`,
      value: 0,
    });
  }
  const map = new Map(days.map((d) => [d.key, d]));

  for (const r of rows) {
    for (const h of r.payload?.highlights || []) {
      const ts = h.createdAt || h.updatedAt;
      if (!ts) continue;
      const key = new Date(ts).toISOString().slice(0, 10);
      const bucket = map.get(key);
      if (bucket) bucket.value += 1;
    }
    for (const s of r.payload?.screenshots || []) {
      if (!s.createdAt) continue;
      const key = new Date(s.createdAt).toISOString().slice(0, 10);
      const bucket = map.get(key);
      if (bucket) bucket.value += 1;
    }
    // Video sync day
    if (r.updated_at) {
      const key = new Date(r.updated_at).toISOString().slice(0, 10);
      const bucket = map.get(key);
      if (bucket) bucket.value += 0.5;
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
