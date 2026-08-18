import mongoose from "mongoose";

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
      /** Last time the user actually watched this video */
      lastViewedAt: { type: Date, default: null },
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
      videoId: { type: String, required: true, index: true },
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
      },
      createdAt: { type: Date, default: Date.now },
      expiresAt: { type: Date, default: null },
      viewCount: { type: Number, default: 0 },
    },
    { timestamps: true }
  )
);

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
      passwordHash: { type: String, required: true },
      displayName: { type: String, default: "" },
      lastSeenAt: { type: Date, default: Date.now },
      videoCount: { type: Number, default: 0 },
      highlightCount: { type: Number, default: 0 },
      screenshotCount: { type: Number, default: 0 },
    },
    { timestamps: true }
  )
);
