import mongoose from "mongoose";
import { attachSupabaseMirrors } from "./supabaseMirror.js";

const highlightSchema = new mongoose.Schema(
  {
    id: String,
    videoId: String,
    startTime: Number,
    endTime: Number,
    note: { type: String, default: "" },
    color: { type: String, default: "#ef4444" },
    screenshotId: String,
    createdAt: Number,
    updatedAt: Number,
  },
  { _id: false }
);

const screenshotMetaSchema = new mongoose.Schema(
  {
    id: String,
    videoTime: Number,
    note: { type: String, default: "" },
    width: Number,
    height: Number,
    createdAt: Number,
    imageUrl: String,
    r2Key: String,
    dataUrl: String,
    backupPath: String,
    filKey: String,
    supabaseKey: String,
    cfImageId: String,
    cfImageUrl: String,
  },
  { _id: false }
);

/** Links from video description (Drive, PPT, docs, sources). */
const sourceLinkSchema = new mongoose.Schema(
  {
    id: String,
    url: String,
    label: { type: String, default: "" },
    kind: { type: String, default: "link" }, // drive|docs|slides|pdf|github|notion|link|coupon|app|promo
    source: { type: String, default: "description" }, // description|comment|cc
    startTime: Number,
    createdAt: Number,
  },
  { _id: false }
);

/** One document per user + video */
export const VaultVideo = mongoose.model(
  "VaultVideo",
  new mongoose.Schema(
    {
      userId: { type: String, required: true, index: true },
      videoId: { type: String, required: true, index: true },
      videoTitle: { type: String, default: "" },
      videoUrl: { type: String, default: "" },
      /** YouTube channel name (oEmbed author_name or page scrape) */
      channelTitle: { type: String, default: "" },
      /** Channel URL when known */
      channelUrl: { type: String, default: "" },
      highlights: { type: [highlightSchema], default: [] },
      screenshots: { type: [screenshotMetaSchema], default: [] },
      /** Description / bio links (Drive, PPT, sources…) */
      sourceLinks: { type: [sourceLinkSchema], default: [] },
      /** Full YouTube description/bio (plain text, as written) */
      bioText: { type: String, default: "" },
      /**
       * Full bio with hyperlinks as markdown: [label](url)
       * so Studio can render clickable links and users can edit.
       */
      bioMarkdown: { type: String, default: "" },
      /** When bio was last synced from YouTube / edited in Studio */
      bioSyncedAt: { type: Date, default: null },
      /** Saved to personal library (like “Save video”) */
      saved: { type: Boolean, default: false, index: true },
      savedAt: { type: Date, default: null },
      /** Watch later queue */
      watchLater: { type: Boolean, default: false, index: true },
      watchLaterAt: { type: Date, default: null },
      /** Named playlists this video belongs to */
      playlists: { type: [String], default: [] },
      /** User ticked this video as watched (shown on playlist rows) */
      completed: { type: Boolean, default: false },
      completedAt: { type: Date, default: null },
      /** Last time the user actually watched this video */
      lastViewedAt: { type: Date, default: null },
      /**
       * Ids of marks / shots the user deleted. Sync drops these so a device
       * that still holds an old copy cannot bring them back.
       */
      deletedHighlightIds: { type: [String], default: [] },
      deletedScreenshotIds: { type: [String], default: [] },
      /** Video length in seconds, reported by the player */
      durationSec: { type: Number, default: 0 },
      /**
       * Where to resume. kind "break" = the user pressed Take a break;
       * "auto" = last position saved while watching.
       */
      progress: {
        position: { type: Number, default: 0 },
        duration: { type: Number, default: 0 },
        kind: { type: String, default: "auto" },
        updatedAt: { type: Date, default: null },
      },
      /** Every Take a break: spot in the video, when it began and ended (ms) */
      breaks: {
        type: [
          new mongoose.Schema(
            {
              id: String,
              position: Number,
              startedAt: Number,
              endedAt: { type: Number, default: null },
            },
            { _id: false }
          ),
        ],
        default: [],
      },
      updatedAt: { type: Date, default: Date.now },
    },
    { timestamps: true }
  )
);

VaultVideo.schema.index({ userId: 1, videoId: 1 }, { unique: true });
VaultVideo.schema.index({ userId: 1, watchLater: 1, watchLaterAt: -1 });
VaultVideo.schema.index({ userId: 1, saved: 1, savedAt: -1 });

/** Public share snapshot of a vault video card (read-only link). */
export const SharedCard = mongoose.model(
  "SharedCard",
  new mongoose.Schema(
    {
      token: { type: String, required: true, unique: true, index: true },
      userId: { type: String, required: true, index: true },
      /** "video" (one card) or "playlist" (a whole list, read-only) */
      kind: { type: String, default: "video" },
      /** Empty for playlist shares */
      videoId: { type: String, default: "", index: true },
      playlistName: { type: String, default: "" },
      /** Snapshot so share stays stable even if vault changes */
      snapshot: {
        videoId: String,
        videoTitle: String,
        videoUrl: String,
        channelTitle: String,
        channelUrl: String,
        sharedBy: String,
        highlights: [
          {
            id: String,
            startTime: Number,
            endTime: Number,
            note: String,
            color: String,
          },
        ],
        screenshots: [
          {
            id: String,
            videoTime: Number,
            note: String,
          },
        ],
        sourceLinks: [
          {
            id: String,
            url: String,
            label: String,
            kind: String,
          },
        ],
        markCount: Number,
        shotCount: Number,
        noteCount: Number,
        sourceCount: Number,
        /** Playlist shares only */
        playlistName: String,
        videos: [
          {
            videoId: String,
            videoTitle: String,
            videoUrl: String,
            channelTitle: String,
            durationSec: Number,
            highlights: [
              {
                id: String,
                startTime: Number,
                endTime: Number,
                note: String,
                color: String,
              },
            ],
            shotCount: Number,
          },
        ],
      },
      createdAt: { type: Date, default: Date.now },
      expiresAt: { type: Date, default: null },
      viewCount: { type: Number, default: 0 },
    },
    { timestamps: true }
  )
);

// Mongo drops expired share snapshots on its own — a revoked or lapsed link
// shouldn't keep a copy of someone's notes lying around.
SharedCard.schema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
SharedCard.schema.index({ userId: 1, createdAt: -1 });

/** Auth user account */
export const User = mongoose.model(
  "User",
  new mongoose.Schema(
    {
      userId: { type: String, required: true, unique: true },
      email: {
        type: String,
        required: true,
        unique: true,
        lowercase: true,
        trim: true,
      },
      passwordHash: { type: String, default: "" },
      googleId: { type: String, default: "", index: true },
      authProvider: { type: String, default: "password" },
      displayName: { type: String, default: "" },
      lastSeenAt: { type: Date, default: Date.now },
      /** Bump on password change / reset to invalidate older JWTs */
      tokenVersion: { type: Number, default: 0 },
      passwordReset: {
        hash: String,
        expiresAt: Date,
        attempts: { type: Number, default: 0 },
      },
      /**
       * Which section each playlist sits in ("Education", "Entertainment"…).
       * Keyed by playlist name; playlists without an entry are unsorted.
       */
      playlistSections: {
        type: [
          new mongoose.Schema(
            { playlist: String, section: String },
            { _id: false }
          ),
        ],
        default: [],
      },
      videoCount: { type: Number, default: 0 },
      highlightCount: { type: Number, default: 0 },
      screenshotCount: { type: Number, default: 0 },
    },
    { timestamps: true }
  )
);

attachSupabaseMirrors({ User, VaultVideo, SharedCard });

/**
 * Spaced-repetition state for one mark used as a flashcard.
 * Kept apart from VaultVideo.highlights because extension syncs replace
 * highlight objects wholesale and would wipe review history.
 */
export const StudyCard = mongoose.model(
  "StudyCard",
  new mongoose.Schema(
    {
      userId: { type: String, required: true, index: true },
      videoId: { type: String, required: true },
      highlightId: { type: String, required: true },
      ease: { type: Number, default: 2.5 },
      intervalDays: { type: Number, default: 0 },
      reps: { type: Number, default: 0 },
      lapses: { type: Number, default: 0 },
      dueAt: { type: Date, default: Date.now },
      lastGrade: { type: String, default: "" },
      lastReviewedAt: { type: Date, default: null },
    },
    { timestamps: true }
  )
);

StudyCard.schema.index(
  { userId: 1, videoId: 1, highlightId: 1 },
  { unique: true }
);
StudyCard.schema.index({ userId: 1, dueAt: 1 });
