import test from "node:test";
import assert from "node:assert/strict";
import { pdfSafe, renderPdfDoc, type PdfImages } from "./exportPdf";
import type { VaultRow } from "../types";

/** 1x1 JPEG — enough for jsPDF to parse a real SOF header. */
const JPEG_1PX =
  "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0a" +
  "HBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAA" +
  "AAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==";

const img = { data: JPEG_1PX, w: 640, h: 360 };

function row(id: string, marks: number, shots: number, noteText = "Note"): VaultRow {
  return {
    video_id: id,
    updated_at: new Date().toISOString(),
    payload: {
      videoId: id,
      videoTitle: `Lecture ${id}`,
      channelTitle: "Test Channel",
      highlights: Array.from({ length: marks }, (_, i) => ({
        id: `${id}-h${i}`,
        startTime: i * 61,
        note: `${noteText} ${i}`,
      })),
      screenshots: Array.from({ length: shots }, (_, i) => ({
        id: `${id}-s${i}`,
        videoTime: i * 90,
        note: `Slide ${i}`,
      })),
    },
  };
}

function imagesFor(rows: VaultRow[], withImages = true): PdfImages {
  const thumbs = new Map<string, typeof img | null>();
  const shots = new Map<string, typeof img | null>();
  for (const r of rows) {
    thumbs.set(r.video_id, withImages ? img : null);
    for (const s of r.payload.screenshots || []) {
      shots.set(`${r.video_id}:${s.id}`, withImages ? img : null);
    }
  }
  return { thumbs, shots };
}

async function bytes(rows: VaultRow[], images: PdfImages, opts = {}) {
  const { doc, images: embedded } = await renderPdfDoc(
    rows,
    { title: "Test export", subtitle: "fixtures" },
    images,
    opts
  );
  const buf = Buffer.from(doc.output("arraybuffer") as ArrayBuffer);
  return { buf, pages: doc.getNumberOfPages(), embedded };
}

test("produces a valid PDF with a cover plus a page per video", async () => {
  const rows = [row("aaaaaaaaaaa", 3, 2), row("bbbbbbbbbbb", 2, 1)];
  const { buf, pages } = await bytes(rows, imagesFor(rows));
  assert.equal(buf.subarray(0, 5).toString(), "%PDF-");
  assert.ok(buf.length > 2000, `PDF too small: ${buf.length}`);
  // cover + at least one page per video
  assert.ok(pages >= 3, `expected >= 3 pages, got ${pages}`);
});

test("embeds every screenshot it is given", async () => {
  const rows = [row("ccccccccccc", 1, 5)];
  const { embedded } = await bytes(rows, imagesFor(rows));
  // 5 shots + 1 cover thumbnail
  assert.equal(embedded, 6);
});

test("overflows onto new pages instead of running off the last one", async () => {
  const long = "a ".repeat(400);
  const few = await bytes([row("ddddddddddd", 2, 0)], imagesFor([row("ddddddddddd", 2, 0)]));
  const rows = [row("ddddddddddd", 40, 0, long)];
  const many = await bytes(rows, imagesFor(rows));
  assert.ok(
    many.pages > few.pages + 3,
    `40 long marks should span many pages, got ${many.pages} vs ${few.pages}`
  );
});

test("renders without images when every fetch failed", async () => {
  const rows = [row("eeeeeeeeeee", 2, 2)];
  const { buf, embedded } = await bytes(rows, imagesFor(rows, false));
  assert.equal(embedded, 0);
  assert.equal(buf.subarray(0, 5).toString(), "%PDF-");
});

test("honours includeMarks / includeShots", async () => {
  const rows = [row("fffffffffff", 3, 3)];
  const noShots = await bytes(rows, imagesFor(rows), { includeShots: false });
  assert.equal(noShots.embedded, 1, "only the cover thumbnail should remain");
});

test("pdfSafe keeps cp1252 text and drops what the font cannot draw", () => {
  assert.equal(pdfSafe("Plain ASCII"), "Plain ASCII");
  // middle dot, em dash, curly quotes and accents all survive
  assert.equal(pdfSafe("a · b — “c” café"), "a · b — “c” café");
  // emoji are decoration: dropped, not turned into noise
  assert.equal(pdfSafe("done 📺 ok"), "done  ok".replace(/\s{3,}/g, "  "));
  // real letters we cannot draw stay visible as placeholders
  assert.ok(pdfSafe("नमस्ते").includes("?"));
  assert.equal(pdfSafe("line\nbreak"), "line break");
});
