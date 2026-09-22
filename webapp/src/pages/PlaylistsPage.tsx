import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { ListVideo, Inbox, Search, Tag } from "lucide-react";
import { EmptyState } from "../components/EmptyState";
import { SessionLoader } from "../components/SessionLoader";
import { useVault } from "../store/VaultContext";
import { PlaylistCoverCard } from "../components/PlaylistCoverCard";
import type { PlaylistGroup } from "../types";

/** Tab value for playlists not in any section */
const UNSORTED = "__unsorted";

export function PlaylistsPage() {
  const { playlists, loading, sectionOf } = useVault();
  const [q, setQ] = useState("");
  const [params, setParams] = useSearchParams();
  const tab = params.get("section") || "";

  const setTab = (next: string) => {
    const p = new URLSearchParams(params);
    if (next) p.set("section", next);
    else p.delete("section");
    setParams(p, { replace: true });
  };

  // Sections that hold at least one playlist, A–Z, with counts
  const sectionTabs = useMemo(() => {
    const counts = new Map<string, number>();
    let unsorted = 0;
    for (const g of playlists) {
      const s = sectionOf(g.name);
      if (s) counts.set(s, (counts.get(s) || 0) + 1);
      else unsorted += 1;
    }
    return {
      list: [...counts.entries()].sort((a, b) => a[0].localeCompare(b[0])),
      unsorted,
    };
  }, [playlists, sectionOf]);
  const hasSections = sectionTabs.list.length > 0;
  // A section emptied elsewhere falls back to All
  const activeTab =
    tab === UNSORTED
      ? sectionTabs.unsorted && hasSections
        ? UNSORTED
        : ""
      : sectionTabs.list.some(([s]) => s === tab)
        ? tab
        : "";

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const inTab = playlists.filter((g) => {
      if (!activeTab) return true;
      const s = sectionOf(g.name);
      return activeTab === UNSORTED ? !s : s === activeTab;
    });
    if (!needle) return inTab;
    return inTab.filter((g) => {
      if (g.name.toLowerCase().includes(needle)) return true;
      return g.rows.some((r) => {
        const t = (r.payload?.videoTitle || "").toLowerCase();
        const c = (r.payload?.channelTitle || "").toLowerCase();
        return t.includes(needle) || c.includes(needle);
      });
    });
  }, [playlists, q, activeTab, sectionOf]);

  // "All" with sections in use: one block per section, unsorted last
  const blocks = useMemo(() => {
    if (activeTab || !hasSections) return null;
    const by = new Map<string, PlaylistGroup[]>();
    for (const g of filtered) {
      const s = sectionOf(g.name);
      by.set(s, [...(by.get(s) || []), g]);
    }
    return [...by.entries()].sort(([a], [b]) => {
      if (!a) return 1;
      if (!b) return -1;
      return a.localeCompare(b);
    });
  }, [filtered, activeTab, hasSections, sectionOf]);

  const totalVideos = playlists.reduce((n, g) => n + g.rows.length, 0);

  return (
    <div className="view">
      <header className="view-head pl-index-head">
        <div>
          <h1>
            <ListVideo size={22} /> Playlists
          </h1>
          <p className="view-sub">
            {playlists.length} playlist{playlists.length === 1 ? "" : "s"}
            {totalVideos > 0
              ? ` · ${totalVideos} video${totalVideos === 1 ? "" : "s"} total`
              : ""}
            {" · "}open one to watch the lead video, then the full list
          </p>
        </div>
        {playlists.length > 0 ? (
          <label className="pl-search">
            <Search size={14} aria-hidden />
            <input
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search playlists or videos…"
              aria-label="Search playlists"
            />
          </label>
        ) : null}
      </header>

      {hasSections ? (
        <nav className="pl-section-tabs" aria-label="Playlist sections">
          <button
            type="button"
            className={!activeTab ? "is-on" : ""}
            aria-pressed={!activeTab}
            onClick={() => setTab("")}
          >
            All <span>{playlists.length}</span>
          </button>
          {sectionTabs.list.map(([s, n]) => (
            <button
              key={s}
              type="button"
              className={activeTab === s ? "is-on" : ""}
              aria-pressed={activeTab === s}
              onClick={() => setTab(s)}
            >
              {s} <span>{n}</span>
            </button>
          ))}
          {sectionTabs.unsorted ? (
            <button
              type="button"
              className={activeTab === UNSORTED ? "is-on" : ""}
              aria-pressed={activeTab === UNSORTED}
              onClick={() => setTab(UNSORTED)}
            >
              Unsorted <span>{sectionTabs.unsorted}</span>
            </button>
          ) : null}
        </nav>
      ) : playlists.length > 1 ? (
        <p className="pl-section-hint">
          <Tag size={13} /> Sort playlists into sections like Education or
          Entertainment with “Add to section” on any card.
        </p>
      ) : null}

      {loading && !playlists.length ? (
        <SessionLoader
          variant="inline"
          title="Loading playlists"
          sub="Organizing your lists from the vault…"
        />
      ) : !playlists.length ? (
        <EmptyState
          icon={Inbox}
          title="No playlists yet"
          sub="Add videos to a playlist from any card (＋ playlist) or from the extension. Each list will show here as its own cover."
        />
      ) : !filtered.length ? (
        <EmptyState
          icon={Search}
          title="No matching playlists"
          sub={`Nothing matches “${q.trim()}”. Try another name or video title.`}
        />
      ) : blocks ? (
        blocks.map(([section, groups]) => (
          <section key={section || UNSORTED} className="pl-section-block">
            <h2 className="pl-section-title">
              {section || "Unsorted"}
              <span>
                {groups.length} playlist{groups.length === 1 ? "" : "s"}
              </span>
            </h2>
            <div className="pl-cover-grid">
              {groups.map((g) => (
                <PlaylistCoverCard key={g.name.toLowerCase()} group={g} />
              ))}
            </div>
          </section>
        ))
      ) : (
        <div className="pl-cover-grid">
          {filtered.map((g) => (
            <PlaylistCoverCard key={g.name.toLowerCase()} group={g} />
          ))}
        </div>
      )}
    </div>
  );
}
