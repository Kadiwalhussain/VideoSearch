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
      highlights: { type: [highlightSchema], default: [] },
      screenshots: { type: [screenshotMetaSchema], default: [] },
      /** Saved to personal library (like “Save video”) */
      saved: { type: Boolean, default: false, index: true },
      savedAt: { type: Date, default: null },
      /** Watch later queue */
      watchLater: { type: Boolean, default: false, index: true },
      watchLaterAt: { type: Date, default: null },
      /** Named playlists this video belongs to */
      playlists: { type: [String], default: [] },
      updatedAt: { type: Date, default: Date.now },
    },
    { timestamps: true }
  )
);

VaultVideo.schema.index({ userId: 1, videoId: 1 }, { unique: true });
VaultVideo.schema.index({ userId: 1, watchLater: 1, watchLaterAt: -1 });
VaultVideo.schema.index({ userId: 1, saved: 1, savedAt: -1 });

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
