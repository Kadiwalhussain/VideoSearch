import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, FolderPlus, Plus, Tag } from "lucide-react";
import { useVault } from "../store/VaultContext";
import { useDialog } from "../store/DialogContext";

/** Offered before the user has made any sections of their own */
export const STARTER_SECTIONS = [
  "Education",
  "Entertainment",
  "Music",
  "Work",
  "Fitness",
];

/** Every section to offer: the user's own first, then unused starters. */
export function sectionChoices(names: string[]): string[] {
  const out = [...names];
  for (const s of STARTER_SECTIONS) {
    if (!out.some((n) => n.toLowerCase() === s.toLowerCase())) out.push(s);
  }
  return out;
}

/**
 * Chip that shows a playlist's section and opens a menu to change it:
 * pick an existing section, type a new one, or take it out.
 */
export function PlaylistSectionPicker({ playlist }: { playlist: string }) {
  const { sectionOf, sectionNames, setPlaylistSection } = useVault();
  const { toast } = useDialog();
  const current = sectionOf(playlist);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const choose = async (section: string) => {
    setOpen(false);
    setDraft("");
    if (section.toLowerCase() === current.toLowerCase()) return;
    setBusy(true);
    try {
      await setPlaylistSection(playlist, section);
      toast(
        section ? `Moved to ${section}` : "Removed from its section",
        "success"
      );
    } catch (e) {
      toast(e instanceof Error ? e.message : "Could not change section", "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="pl-section-picker" ref={rootRef}>
      <button
        type="button"
        className={`pl-section-chip ${current ? "is-set" : ""}`}
        disabled={busy}
        aria-haspopup="menu"
        aria-expanded={open}
        title="Choose which section this playlist belongs to"
        onClick={() => setOpen((o) => !o)}
      >
        {current ? <Tag size={12} /> : <FolderPlus size={12} />}
        <span>{current || "Add to section"}</span>
        <ChevronDown size={12} />
      </button>
      {open ? (
        <div className="pl-section-menu" role="menu">
          {sectionChoices(sectionNames).map((s) => {
            const on = s.toLowerCase() === current.toLowerCase();
            return (
              <button
                key={s}
                type="button"
                role="menuitemradio"
                aria-checked={on}
                className={on ? "is-on" : ""}
                onClick={() => void choose(s)}
              >
                <span>{s}</span>
                {on ? <Check size={13} /> : null}
              </button>
            );
          })}
          <form
            className="pl-section-new"
            onSubmit={(e) => {
              e.preventDefault();
              const name = draft.replace(/\s+/g, " ").trim().slice(0, 40);
              if (name) void choose(name);
            }}
          >
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="New section…"
              aria-label="New section name"
              maxLength={40}
            />
            <button type="submit" disabled={!draft.trim()} aria-label="Add section">
              <Plus size={13} />
            </button>
          </form>
          {current ? (
            <button
              type="button"
              role="menuitem"
              className="is-clear"
              onClick={() => void choose("")}
            >
              Remove from {current}
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
