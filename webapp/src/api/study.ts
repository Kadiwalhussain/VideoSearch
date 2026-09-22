import { apiFetch } from "./client";
import type { Session } from "../types";

export type StudyGrade = "again" | "hard" | "good" | "easy";

export interface StudyCard {
  cardId: string;
  videoId: string;
  highlightId: string;
  videoTitle: string;
  channelTitle: string;
  startTime: number;
  screenshotId: string | null;
  /** null = plain note: ask "what did you note here?" */
  front: string | null;
  back: string;
  isNew: boolean;
  dueAt: number | null;
  reps: number;
  intervalDays: number;
  ease: number;
}

export interface StudyQueue {
  cards: StudyCard[];
  counts: {
    total: number;
    due: number;
    new: number;
    newRemaining: number;
    reviewedToday: number;
    learned: number;
  };
  nextDueAt: number | null;
}

export async function fetchStudyQueue(
  session: Session,
  newLimit = 20
): Promise<StudyQueue> {
  const tz = new Date().getTimezoneOffset();
  const res = await apiFetch(
    session.url,
    `/api/study/queue?newLimit=${newLimit}&tz=${tz}`,
    { token: session.token }
  );
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.ok === false) {
    throw new Error(data.message || `Study queue failed (${res.status})`);
  }
  return data as StudyQueue;
}

export async function reviewCard(
  session: Session,
  card: Pick<StudyCard, "videoId" | "highlightId">,
  grade: StudyGrade
): Promise<{ dueAt: number; intervalDays: number }> {
  const res = await apiFetch(session.url, "/api/study/review", {
    method: "POST",
    token: session.token,
    body: JSON.stringify({ ...card, grade }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.ok === false) {
    throw new Error(data.message || `Review failed (${res.status})`);
  }
  return data;
}

/**
 * Interval preview for the grade buttons. Mirrors schedule() in
 * server/src/study.js — keep the two in step.
 */
export function previewInterval(
  card: Pick<StudyCard, "reps" | "intervalDays" | "ease">,
  grade: StudyGrade
): string {
  if (grade === "again") return "10m";
  const { reps, intervalDays: iv } = card;
  const ease = card.ease || 2.5;
  const good = reps === 0 ? 1 : reps === 1 ? 3 : Math.round(iv * ease);
  let days: number;
  if (grade === "hard") days = reps === 0 ? 1 : Math.max(1, Math.round(iv * 1.2));
  else if (grade === "good") days = good;
  else days = reps === 0 ? 4 : Math.max(good + 1, Math.round(iv * (ease + 0.15) * 1.3));
  days = Math.min(365, Math.max(1, days));
  if (days >= 60) return `${Math.round(days / 30)}mo`;
  return `${days}d`;
}
