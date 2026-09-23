// One-time: copy every vault screenshot that has no R2 copy yet into R2.
// Reads bytes from the local disk backup, else the Mongo dataUrl. Additive only.
import "dotenv/config";
import mongoose from "mongoose";
import { VaultVideo } from "../src/models.js";
import { dataUrlToBuffer, isR2Configured, uploadJpeg } from "../src/r2.js";
import { readLocalShot } from "../src/shotBackup.js";

if (!isR2Configured()) throw new Error("R2 not configured");
await mongoose.connect(process.env.MONGODB_URI);

let uploaded = 0, already = 0, missing = 0, failed = 0;
const cursor = VaultVideo.find({ "screenshots.0": { $exists: true } })
  .select("userId videoId screenshots")
  .lean()
  .cursor();
for await (const doc of cursor) {
  for (const s of doc.screenshots || []) {
    if (!s?.id) continue;
    if (s.r2Key) { already++; continue; }
    let buf = await readLocalShot({ userId: doc.userId, videoId: doc.videoId, shotId: s.id });
    if ((!buf || buf.length <= 32) && String(s.dataUrl || "").startsWith("data:image")) {
      try { buf = dataUrlToBuffer(s.dataUrl); } catch { buf = null; }
    }
    if (!buf || buf.length <= 32) { missing++; continue; }
    try {
      const out = await uploadJpeg({ userId: doc.userId, videoId: doc.videoId, shotId: s.id, buffer: buf });
      await VaultVideo.updateOne(
        { userId: doc.userId, videoId: doc.videoId, "screenshots.id": s.id },
        { $set: { "screenshots.$.r2Key": out.key } }
      );
      uploaded++;
    } catch (err) {
      failed++;
      console.warn("failed", doc.videoId, s.id, err?.message);
    }
  }
}
console.log({ uploaded, already, missing, failed });
await mongoose.disconnect();
