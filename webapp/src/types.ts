export interface VaultUser {
  userId: string;
  email: string;
  displayName?: string;
  videoCount?: number;
  highlightCount?: number;
  screenshotCount?: number;
}

export interface Highlight {
  id: string;
  videoId?: string;
  startTime: number;
  endTime?: number;
  note?: string;
  color?: string;
  screenshotId?: string;
  createdAt?: number;
  updatedAt?: number;
}

export interface Screenshot {
  id: string;
  videoTime: number;
  note?: string;
  width?: number;
  height?: number;
  createdAt?: number;
  imageUrl?: string;
  dataUrl?: string;
  r2Key?: string;
  hasImage?: boolean;
}

export interface VaultPayload {
  videoId: string;
  videoTitle?: string;
  videoUrl?: string;
  highlights?: Highlight[];
  screenshots?: Screenshot[];
  saved?: boolean;
  savedAt?: number | null;
  watchLater?: boolean;
  watchLaterAt?: number | null;
  playlists?: string[];
  /** Server activity time (ms epoch) */
  updatedAt?: number | null;
}

export interface VaultRow {
  video_id: string;
  updated_at: string;
  payload: VaultPayload;
}

export interface LibraryState {
  saved: boolean;
  savedAt: number | null;
  watchLater: boolean;
  watchLaterAt: number | null;
  playlists: string[];
}

export type LibraryAction =
  | "save"
  | "unsave"
  | "toggle_save"
  | "watch_later"
  | "unwatch_later"
  | "toggle_watch_later"
  | "add_playlist"
  | "remove_playlist"
  | "toggle_playlist";

export interface Session {
  url: string;
  token: string;
  user: VaultUser;
}

export interface VaultStats {
  videos: number;
  marks: number;
  shots: number;
  notes: number;
  watchLater: number;
  saved: number;
}

export interface SearchHit {
  kind: "video" | "mark" | "shot";
  videoId: string;
  title: string;
  snippet: string;
  time?: number;
  score: number;
}

export interface NoteItem {
  highlight: Highlight;
  videoId: string;
  title: string;
  videoUrl: string;
}

export interface ShotItem {
  shot: Screenshot;
  videoId: string;
  title: string;
  videoUrl: string;
}

export interface PlaylistGroup {
  name: string;
  rows: VaultRow[];
}
