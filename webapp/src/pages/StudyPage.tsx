import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  CheckCircle2,
  ExternalLink,
  GraduationCap,
  Lightbulb,
  RotateCcw,
} from "lucide-react";
import { useSession } from "../store/SessionContext";
import { useVault } from "../store/VaultContext";
import { SessionLoader } from "../components/SessionLoader";
import { EmptyState } from "../components/EmptyState";
import {
  fetchStudyQueue,
  previewInterval,
  reviewCard,
  type StudyCard,
  type StudyGrade,
  type StudyQueue,
} from "../api/study";
import { shotSrc } from "../api/client";
import { formatTime, ytThumb, ytWatchUrl } from "../lib/format";

const GRADES: Array<{ grade: StudyGrade; label: string; key: string }> = [
  { grade: "again", label: "Again", key: "1" },
  { grade: "hard", label: "Hard", key: "2" },
  { grade: "good", label: "Good", key: "3" },
  { grade: "easy", label: "Easy", key: "4" },
];

/** "in 10 minutes", "in 3 hours", "tomorrow", "in 4 days" */
function inTime(ms: number): string {
  const min = Math.max(1, Math.round((ms - Date.now()) / 60_000));
  if (min < 60) return `in ${min} minute${min === 1 ? "" : "s"}`;
  const h = Math.round(min / 60);
  if (h < 24) return `in ${h} hour${h === 1 ? "" : "s"}`;
  const d = Math.round(h / 24);
  return d === 1 ? "tomorrow" : `in ${d} days`;
}

export function StudyPage() {
  const { session } = useSession();
  const { rows } = useVault();
  const [queue, setQueue] = useState<StudyQueue | null>(null);
  const [cards, setCards] = useState<StudyCard[]>([]);
  const [revealed, setRevealed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [doneThisSession, setDone] = useState(0);

  const load = useCallback(async () => {
    if (!session) return;
    setError(null);
    try {
      const q = await fetchStudyQueue(session);
      setQueue(q);
      setCards(q.cards);
      setRevealed(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load study queue");
    }
  }, [session]);

  useEffect(() => {
    void load();
  }, [load]);

  const card = cards[0] || null;

  const image = useMemo(() => {
    if (!card) return "";
    const row = rows.find((r) => r.video_id === card.videoId);
    const shot = card.screenshotId
      ? row?.payload?.screenshots?.find((s) => s.id === card.screenshotId)
      : undefined;
    return shot ? shotSrc(card.videoId, shot, session?.token) : ytThumb(card.videoId);
  }, [card, rows, session?.token]);

  const grade = useCallback(
    async (g: StudyGrade) => {
      if (!session || !card || busy) return;
      setBusy(true);
      try {
        await reviewCard(session, card, g);
        setDone((n) => n + 1);
        setCards((list) => {
          const [head, ...rest] = list;
          // "Again" comes back at the end of this session, like a real deck
          return g === "again" ? [...rest, { ...head, reps: 0, intervalDays: 0 }] : rest;
        });
        setRevealed(false);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Review failed");
      } finally {
        setBusy(false);
      }
    },
    [session, card, busy]
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) return;
      if (!card) return;
      if (!revealed && (e.key === " " || e.key === "Enter")) {
        e.preventDefault();
        setRevealed(true);
        return;
      }
      if (revealed) {
        const hit = GRADES.find((x) => x.key === e.key);
        if (hit) {
          e.preventDefault();
          void grade(hit.grade);
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [card, revealed, grade]);

  const counts = queue?.counts;

  return (
    <div className="view view-study">
      <header className="view-head">
        <h1>
          <GraduationCap size={22} /> Study
        </h1>
        <p className="view-sub">
          Your notes become flashcards. Review a few each day and they stick.
        </p>
      </header>

      {counts ? (
        <div className="study-stats">
          <span>
            <strong>{cards.length}</strong> left today
          </span>
          <span>
            <strong>{counts.due}</strong> due
          </span>
          <span>
            <strong>{counts.new}</strong> new
          </span>
          <span>
            <strong>{counts.reviewedToday + doneThisSession}</strong> reviewed today
          </span>
          <span>
            <strong>{counts.learned}</strong> learned
          </span>
        </div>
      ) : null}

      {error ? (
        <div className="empty" style={{ borderColor: "rgba(248,113,113,0.4)" }}>
          {error}{" "}
          <button type="button" className="link-btn" onClick={() => void load()}>
            Retry
          </button>
        </div>
      ) : null}

      {!queue && !error ? (
        <SessionLoader variant="inline" title="Building your deck" sub="Collecting notes…" />
      ) : null}

      {queue && counts && counts.total === 0 ? (
        <EmptyState
          icon={GraduationCap}
          title="No cards yet"
          sub="Every mark with a note becomes a card. Mark a moment on YouTube and write what you learned."
        />
      ) : null}

      {queue && counts && counts.total > 0 && !card ? (
        <div className="study-done glass-card pad">
          <CheckCircle2 size={36} />
          <h2>All done for today</h2>
          <p>
            {doneThisSession
              ? `You reviewed ${doneThisSession} card${doneThisSession === 1 ? "" : "s"}. `
              : ""}
            {queue.nextDueAt
              ? `Next review ${inTime(queue.nextDueAt)}.`
              : counts.newRemaining
                ? `${counts.newRemaining} new cards are waiting for tomorrow.`
                : "Add more notes to grow your deck."}
          </p>
          <button type="button" className="btn-notes" onClick={() => void load()}>
            <RotateCcw size={14} /> Check again
          </button>
        </div>
      ) : null}

      {card ? (
        <article className="study-card glass-card" aria-live="polite">
          <div className="study-media">
            <img src={image} alt="" />
            <a
              className="study-time"
              href={ytWatchUrl(card.videoId, undefined, card.startTime)}
              target="_blank"
              rel="noreferrer"
              title="Watch this moment"
            >
              <ExternalLink size={12} /> {formatTime(card.startTime)}
            </a>
            {card.isNew ? <span className="study-new">New</span> : null}
          </div>
          <div className="study-body">
            <Link className="study-source" to={`/video/${card.videoId}`}>
              {card.videoTitle}
              {card.channelTitle ? ` · ${card.channelTitle}` : ""}
            </Link>
            <p className="study-front">
              {card.front ?? `What did you note at ${formatTime(card.startTime)}?`}
            </p>
            {revealed ? (
              <p className="study-back">{card.back}</p>
            ) : (
              <button
                type="button"
                className="btn-glow study-reveal"
                onClick={() => setRevealed(true)}
              >
                Show answer <kbd>Space</kbd>
              </button>
            )}
            {revealed ? (
              <div className="study-grades" role="group" aria-label="How well did you remember?">
                {GRADES.map((g) => (
                  <button
                    key={g.grade}
                    type="button"
                    className={`study-grade is-${g.grade}`}
                    disabled={busy}
                    onClick={() => void grade(g.grade)}
                  >
                    <span>{g.label}</span>
                    <small>
                      {previewInterval(card, g.grade)} · <kbd>{g.key}</kbd>
                    </small>
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        </article>
      ) : null}

      <aside className="study-tip">
        <Lightbulb size={16} />
        <span>
          Tip: write a note as <code>Question :: Answer</code> or{" "}
          <code>Q: … A: …</code> to get a real question on the front. Plain notes
          ask you to recall what you noted at that moment.
        </span>
      </aside>
    </div>
  );
}
