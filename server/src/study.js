/**
 * Study mode: marks with notes become flashcards, scheduled SM-2 style.
 * Pure helpers here; routes are mounted by mountStudy().
 */

import { StudyCard, VaultVideo } from "./models.js";

const MIN_EASE = 1.3;
const MAX_INTERVAL_DAYS = 365;
const DAY_MS = 86400_000;
export const GRADES = ["again", "hard", "good", "easy"];

/**
 * Next review state after grading a card.
 * again → back in 10 minutes; hard ≤ good ≤ easy in days.
 */
export function schedule(state, grade, now = Date.now()) {
  if (!GRADES.includes(grade)) throw new Error(`Unknown grade: ${grade}`);
  let ease = Number(state?.ease) || 2.5;
  let interval = Number(state?.intervalDays) || 0;
  let reps = Number(state?.reps) || 0;
  let lapses = Number(state?.lapses) || 0;

  if (grade === "again") {
    if (reps > 0) lapses += 1;
    return {
      ease: Math.max(MIN_EASE, ease - 0.2),
      intervalDays: 0,
      reps: 0,
      lapses,
      dueAt: new Date(now + 10 * 60_000),
      lastGrade: grade,
      lastReviewedAt: new Date(now),
    };
  }

  const good = reps === 0 ? 1 : reps === 1 ? 3 : Math.round(interval * ease);
  if (grade === "hard") {
    ease = Math.max(MIN_EASE, ease - 0.15);
    interval = reps === 0 ? 1 : Math.max(1, Math.round(interval * 1.2));
  } else if (grade === "good") {
    interval = good;
  } else {
    ease += 0.15;
    interval = reps === 0 ? 4 : Math.max(good + 1, Math.round(interval * ease * 1.3));
  }
  interval = Math.min(MAX_INTERVAL_DAYS, Math.max(1, interval));
  return {
    ease,
    intervalDays: interval,
    reps: reps + 1,
    lapses,
    dueAt: new Date(now + interval * DAY_MS),
    lastGrade: grade,
    lastReviewedAt: new Date(now),
  };
}

/**
 * Split a note into question / answer.
 * Supports "front :: back", "Q: … A: …", and "Question?\nanswer".
 * front is null when the note is a plain note — the card then asks
 * "what did you note at 12:34?" and the note is the answer.
 */
export function cardFaces(note) {
  const text = String(note || "").trim();
  if (!text) return null;
  const arrow = text.split(/\s*::\s*/);
  if (arrow.length >= 2 && arrow[0] && arrow.slice(1).join(" :: ")) {
    return { front: arrow[0], back: arrow.slice(1).join(" :: ") };
  }
  const qa = text.match(/^\s*Q[:.)-]\s*([\s\S]+?)\s*\n?\s*A[:.)-]\s*([\s\S]+)$/i);
  if (qa) return { front: qa[1].trim(), back: qa[2].trim() };
  const lines = text.split("\n");
  if (lines.length > 1 && lines[0].trim().endsWith("?")) {
    return { front: lines[0].trim(), back: lines.slice(1).join("\n").trim() };
  }
  return { front: null, back: text };
}

function startOfDay(now, tzOffsetMin) {
  // tzOffsetMin follows Date#getTimezoneOffset (minutes behind UTC)
  const local = now - tzOffsetMin * 60_000;
  return local - (local % DAY_MS) + tzOffsetMin * 60_000;
}

/** Cards for this user: every mark with a note, joined with review state. */
async function loadCards(userId) {
  const [videos, states] = await Promise.all([
    VaultVideo.find({ userId, "highlights.0": { $exists: true } })
      .select("videoId videoTitle channelTitle highlights screenshots")
      .lean(),
    StudyCard.find({ userId }).lean(),
  ]);
  const byKey = new Map(states.map((s) => [`${s.videoId}:${s.highlightId}`, s]));
  const cards = [];
  for (const v of videos) {
    for (const h of v.highlights || []) {
      const faces = cardFaces(h.note);
      if (!faces || !h.id) continue;
      const state = byKey.get(`${v.videoId}:${h.id}`) || null;
      cards.push({
        cardId: `${v.videoId}:${h.id}`,
        videoId: v.videoId,
        highlightId: h.id,
        videoTitle: v.videoTitle || v.videoId,
        channelTitle: v.channelTitle || "",
        startTime: Number(h.startTime) || 0,
        screenshotId: h.screenshotId || null,
        front: faces.front,
        back: faces.back,
        isNew: !state,
        dueAt: state ? new Date(state.dueAt).getTime() : null,
        reps: state?.reps || 0,
        intervalDays: state?.intervalDays || 0,
        ease: state?.ease || 2.5,
        lastReviewedAt: state?.lastReviewedAt
          ? new Date(state.lastReviewedAt).getTime()
          : null,
      });
    }
  }
  return cards;
}

export function mountStudy(app, { authMiddleware }) {
  /**
   * Today's queue: due reviews (oldest first) then new cards up to newLimit
   * per day. GET /api/study/queue?newLimit=20&tz=<getTimezoneOffset()>
   */
  app.get("/api/study/queue", authMiddleware, async (req, res) => {
    try {
      const userId = req.user.userId;
      const now = Date.now();
      const tz = Number(req.query.tz) || 0;
      const newLimit = Math.min(200, Math.max(0, Number(req.query.newLimit ?? 20)));
      const dayStart = startOfDay(now, Math.max(-840, Math.min(840, tz)));

      const cards = await loadCards(userId);
      const due = cards
        .filter((c) => !c.isNew && c.dueAt <= now)
        .sort((a, b) => a.dueAt - b.dueAt);
      // New cards already started today count against the daily limit
      const startedToday = await StudyCard.countDocuments({
        userId,
        createdAt: { $gte: new Date(dayStart) },
      });
      const fresh = cards
        .filter((c) => c.isNew)
        .slice(0, Math.max(0, newLimit - startedToday));
      const reviewedToday = cards.filter(
        (c) => c.lastReviewedAt && c.lastReviewedAt >= dayStart
      ).length;
      const next = cards
        .filter((c) => !c.isNew && c.dueAt > now)
        .reduce((m, c) => Math.min(m, c.dueAt), Infinity);

      res.json({
        ok: true,
        cards: [...due, ...fresh],
        counts: {
          total: cards.length,
          due: due.length,
          new: fresh.length,
          newRemaining: cards.filter((c) => c.isNew).length,
          reviewedToday,
          learned: cards.filter((c) => c.intervalDays >= 21).length,
        },
        nextDueAt: Number.isFinite(next) ? next : null,
      });
    } catch (err) {
      res.status(500).json({
        ok: false,
        message: err instanceof Error ? err.message : "Study queue failed",
        cards: [],
      });
    }
  });

  /** Grade one card. POST /api/study/review { videoId, highlightId, grade } */
  app.post("/api/study/review", authMiddleware, async (req, res) => {
    try {
      const userId = req.user.userId;
      const videoId = String(req.body?.videoId || "");
      const highlightId = String(req.body?.highlightId || "");
      const grade = String(req.body?.grade || "");
      if (!videoId || !highlightId || !GRADES.includes(grade)) {
        return res.status(400).json({
          ok: false,
          message: "videoId, highlightId and grade (again|hard|good|easy) required",
        });
      }
      const owns = await VaultVideo.exists({ userId, videoId, "highlights.id": highlightId });
      if (!owns) {
        return res.status(404).json({ ok: false, message: "Card not found" });
      }
      const prev = await StudyCard.findOne({ userId, videoId, highlightId }).lean();
      const next = schedule(prev, grade);
      await StudyCard.updateOne(
        { userId, videoId, highlightId },
        { $set: next },
        { upsert: true }
      );
      res.json({
        ok: true,
        dueAt: next.dueAt.getTime(),
        intervalDays: next.intervalDays,
      });
    } catch (err) {
      res.status(500).json({
        ok: false,
        message: err instanceof Error ? err.message : "Review failed",
      });
    }
  });
}
