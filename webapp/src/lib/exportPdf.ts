import type { VaultRow } from "../types";
import { shotSrc } from "../api/client";
import { formatTime, ytWatchUrl, ytThumb } from "./format";
import { filterUsefulSources } from "./sourceFilter";

/**
 * Marks + shots → PDF, rendered in the browser.
 * jsPDF is loaded on demand so the export never costs anyone who doesn't use it.
 */

export type PdfProgress = (done: number, total: number, label: string) => void;

export type PdfOptions = {
  includeMarks?: boolean;
  includeShots?: boolean;
  includeSources?: boolean;
  onProgress?: PdfProgress;
};

export type PdfResult = { filename: string; pages: number; images: number };

const PAGE_W = 595.28;
const PAGE_H = 841.89;
const M = 46;
const CW = PAGE_W - M * 2;
const FOOT_H = 34;

const INK: [number, number, number] = [15, 23, 42];
const MUTED: [number, number, number] = [100, 116, 139];
const ACCENT: [number, number, number] = [5, 150, 105];
const HAIRLINE: [number, number, number] = [226, 232, 240];
const CHIP_BG: [number, number, number] = [236, 253, 245];

/** Largest pixel width we embed — keeps a 40-shot export from hitting 100MB. */
const MAX_IMAGE_W = 1000;
const JPEG_QUALITY = 0.82;
const FETCH_CONCURRENCY = 4;

type Img = { data: string; w: number; h: number };

/**
 * jsPDF's built-in fonts are WinAnsi (cp1252) only. Anything outside that set
 * renders as garbage bytes, so drop decoration (emoji) and mark real letters
 * we can't draw rather than silently deleting the user's text.
 */
const CP1252_EXTRA = new Set([
  0x20ac, 0x201a, 0x0192, 0x201e, 0x2026, 0x2020, 0x2021, 0x02c6, 0x2030,
  0x0160, 0x2039, 0x0152, 0x017d, 0x2018, 0x2019, 0x201c, 0x201d, 0x2022,
  0x2013, 0x2014, 0x02dc, 0x2122, 0x0161, 0x203a, 0x0153, 0x017e, 0x0178,
]);

export function pdfSafe(raw: string): string {
  let out = "";
  for (const ch of String(raw ?? "")) {
    const cp = ch.codePointAt(0) ?? 0;
    if (cp === 0x0a || cp === 0x09) {
      out += " ";
      continue;
    }
    if (cp < 0x20) continue;
    if (cp <= 0x7e || (cp >= 0xa0 && cp <= 0xff) || CP1252_EXTRA.has(cp)) {
      out += ch;
      continue;
    }
    // Letters/digits carry meaning — show that something was there.
    if (/\p{L}|\p{N}/u.test(ch)) out += "?";
  }
  return out.replace(/\s{3,}/g, "  ").trim();
}

function looksLikeVideoId(s: string): boolean {
  return /^[A-Za-z0-9_-]{10,12}$/.test(s.trim());
}

function titleOf(row: VaultRow): string {
  const t = String(row.payload?.videoTitle || "").trim();
    if (t && t !== row.video_id && !looksLikeVideoId(t)) return t;
  return t || row.video_id;
}

function safeFilename(base: string): string {
  const clean = base
    .replace(/[\\/:*?"<>|]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 70);
  return `${clean || "videosearch-notes"}.pdf`;
}

function absolute(url: string, apiBase?: string): string {
  if (!url || /^(data:|https?:)/i.test(url)) return url;
  if (url.startsWith("/") && apiBase) return `${apiBase.replace(/\/$/, "")}${url}`;
  return url;
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(String(fr.result || ""));
    fr.onerror = () => reject(new Error("read failed"));
    fr.readAsDataURL(blob);
  });
}

function decode(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("decode failed"));
    img.src = src;
  });
}

/**
 * Fetch → canvas → JPEG. Going through a blob URL keeps the canvas untainted,
 * normalizes webp/png to something jsPDF embeds, and downscales huge frames.
 */
async function loadImage(url: string): Promise<Img | null> {
  if (!url) return null;
  let objectUrl = "";
  try {
    let src = url;
    if (!url.startsWith("data:")) {
      const res = await fetch(url, { credentials: "omit" });
      if (!res.ok) return null;
      const blob = await res.blob();
      if (blob.size === 0 || !/^image\//.test(blob.type)) return null;
      objectUrl = URL.createObjectURL(blob);
      src = objectUrl;
    }
    const img = await decode(src);
    const w = img.naturalWidth || img.width;
    const h = img.naturalHeight || img.height;
    if (!w || !h) return null;

    const scale = Math.min(1, MAX_IMAGE_W / w);
    const cw = Math.max(1, Math.round(w * scale));
    const ch = Math.max(1, Math.round(h * scale));
    const canvas = document.createElement("canvas");
    canvas.width = cw;
    canvas.height = ch;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, cw, ch);
    ctx.drawImage(img, 0, 0, cw, ch);
    return { data: canvas.toDataURL("image/jpeg", JPEG_QUALITY), w: cw, h: ch };
  } catch {
    return null;
  } finally {
    if (objectUrl) URL.revokeObjectURL(objectUrl);
  }
}

async function mapLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const out = new Array<R>(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    for (;;) {
      const i = cursor++;
      if (i >= items.length) return;
      out[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return out;
}

type JsPdf = import("jspdf").jsPDF;

/** Cursor-based layout over jsPDF. */
class Layout {
  doc: JsPdf;
  y = M;

  constructor(doc: JsPdf) {
    this.doc = doc;
  }

  get room(): number {
    return PAGE_H - FOOT_H - this.y;
  }

  need(h: number): void {
    if (h <= this.room) return;
    this.doc.addPage();
    this.y = M;
  }

  gap(h: number): void {
    this.y += h;
  }

  ink(c: [number, number, number]): void {
    this.doc.setTextColor(c[0], c[1], c[2]);
  }

  font(size: number, weight: "normal" | "bold" = "normal"): void {
    this.doc.setFont("helvetica", weight);
    this.doc.setFontSize(size);
  }

  /** Wrapped paragraph. Returns height consumed. */
  paragraph(
    text: string,
    opts: {
      size?: number;
      weight?: "normal" | "bold";
      color?: [number, number, number];
      width?: number;
      x?: number;
      lead?: number;
      maxLines?: number;
    } = {}
  ): number {
    const size = opts.size ?? 10.5;
    const lead = opts.lead ?? size * 1.38;
    const width = opts.width ?? CW;
    const x = opts.x ?? M;
    this.font(size, opts.weight ?? "normal");
    this.ink(opts.color ?? INK);
    let lines: string[] = this.doc.splitTextToSize(pdfSafe(text), width);
    if (opts.maxLines && lines.length > opts.maxLines) {
      lines = lines.slice(0, opts.maxLines);
      lines[lines.length - 1] = `${lines[lines.length - 1]}…`;
    }
    for (const line of lines) {
      this.need(lead);
      this.doc.text(line, x, this.y + size * 0.86);
      this.y += lead;
    }
    return lines.length * lead;
  }

  rule(color: [number, number, number] = HAIRLINE): void {
    this.need(8);
    this.doc.setDrawColor(color[0], color[1], color[2]);
    this.doc.setLineWidth(0.6);
    this.doc.line(M, this.y, M + CW, this.y);
    this.y += 1;
  }

  sectionTitle(label: string, count?: number): void {
    this.need(46);
    this.gap(10);
    this.font(12.5, "bold");
    this.ink(INK);
    const text = pdfSafe(label);
    // Measure while the heading font is still active — measuring after the
    // switch below reports a narrower label and overlaps the two.
    const labelW = this.doc.getTextWidth(text);
    this.doc.text(text, M, this.y + 10);
    if (count != null) {
      this.font(9.5, "normal");
      this.ink(MUTED);
      this.doc.text(String(count), M + labelW + 8, this.y + 10);
    }
    this.y += 17;
    this.doc.setDrawColor(ACCENT[0], ACCENT[1], ACCENT[2]);
    this.doc.setLineWidth(1.6);
    this.doc.line(M, this.y, M + 26, this.y);
    this.y += 12;
  }

  /** Accent time chip, optionally a link. Returns its width. */
  timeChip(seconds: number, x: number, y: number, url?: string): number {
    const label = pdfSafe(formatTime(seconds || 0));
    this.font(8.8, "bold");
    const w = this.doc.getTextWidth(label) + 14;
    const h = 15;
    this.doc.setFillColor(CHIP_BG[0], CHIP_BG[1], CHIP_BG[2]);
    this.doc.roundedRect(x, y, w, h, 4, 4, "F");
    this.ink(ACCENT);
    this.doc.text(label, x + 7, y + 10.4);
    if (url) this.doc.link(x, y, w, h, { url });
    return w;
  }
}

function footers(doc: JsPdf, label: string): void {
  const total = doc.getNumberOfPages();
  const clean = pdfSafe(label);
  for (let p = 1; p <= total; p++) {
    doc.setPage(p);
    doc.setDrawColor(HAIRLINE[0], HAIRLINE[1], HAIRLINE[2]);
    doc.setLineWidth(0.6);
    doc.line(M, PAGE_H - 30, M + CW, PAGE_H - 30);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(MUTED[0], MUTED[1], MUTED[2]);
    let left: string = clean;
    while (left && doc.getTextWidth(left) > CW - 90) left = left.slice(0, -1);
    doc.text(left, M, PAGE_H - 18);
    const right = `${p} / ${total}`;
    doc.text(right, M + CW - doc.getTextWidth(right), PAGE_H - 18);
  }
}

function coverPage(L: Layout, meta: CoverMeta, thumb: Img | null): void {
  const doc = L.doc;
  doc.setFillColor(ACCENT[0], ACCENT[1], ACCENT[2]);
  doc.rect(0, 0, PAGE_W, 5, "F");

  L.y = 92;
  L.font(8.6, "bold");
  L.ink(ACCENT);
  doc.text("VIDEOSEARCH  ·  STUDIO EXPORT", M, L.y);
  L.y += 22;

  L.paragraph(meta.title, { size: 23, weight: "bold", lead: 28, maxLines: 4 });
  if (meta.subtitle) {
    L.gap(4);
    L.paragraph(meta.subtitle, { size: 11.5, color: MUTED, maxLines: 2 });
  }

  L.gap(18);
  if (thumb) {
    const w = Math.min(CW, 330);
    const h = (thumb.h / thumb.w) * w;
    doc.addImage(thumb.data, "JPEG", M, L.y, w, h);
    doc.setDrawColor(HAIRLINE[0], HAIRLINE[1], HAIRLINE[2]);
    doc.setLineWidth(0.6);
    doc.rect(M, L.y, w, h);
    L.y += h + 22;
  }

  const stats: string[] = [];
  if (meta.videos > 1) stats.push(`${meta.videos} videos`);
  if (meta.marks) stats.push(`${meta.marks} mark${meta.marks === 1 ? "" : "s"}`);
  if (meta.shots) stats.push(`${meta.shots} shot${meta.shots === 1 ? "" : "s"}`);
  if (meta.notes) stats.push(`${meta.notes} written note${meta.notes === 1 ? "" : "s"}`);
  if (stats.length) {
    L.paragraph(stats.join("   ·   "), { size: 10.5, weight: "bold", color: INK });
    L.gap(6);
  }

  if (meta.watchUrl) {
    L.font(10, "normal");
    L.ink(ACCENT);
    doc.textWithLink(pdfSafe(meta.watchUrl.slice(0, 92)), M, L.y + 9, {
      url: meta.watchUrl,
    });
    L.y += 20;
  }

  L.gap(6);
  L.paragraph(
    `Exported ${new Date().toLocaleString(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    })}`,
    { size: 9, color: MUTED }
  );
}

type CoverMeta = {
  title: string;
  subtitle?: string;
  watchUrl?: string;
  videos: number;
  marks: number;
  shots: number;
  notes: number;
};

function videoHeader(L: Layout, row: VaultRow, thumb: Img | null): void {
  const doc = L.doc;
  L.need(90);
  const th = 52;
  const tw = 92;
  let textX = M;
  if (thumb) {
    doc.addImage(thumb.data, "JPEG", M, L.y, tw, th);
    doc.setDrawColor(HAIRLINE[0], HAIRLINE[1], HAIRLINE[2]);
    doc.setLineWidth(0.6);
    doc.rect(M, L.y, tw, th);
    textX = M + tw + 14;
  }
  const textW = CW - (textX - M);
  const startY = L.y;

  L.font(13, "bold");
  L.ink(INK);
  const titleLines: string[] = doc
    .splitTextToSize(pdfSafe(titleOf(row)), textW)
    .slice(0, 2);
  let ty = L.y + 11;
  for (const line of titleLines) {
    doc.text(line, textX, ty);
    ty += 15.5;
  }

  const p = row.payload || {};
  const bits: string[] = [];
  if (p.channelTitle) bits.push(p.channelTitle);
  bits.push(`${(p.highlights || []).length} marks`);
  bits.push(`${(p.screenshots || []).length} shots`);
  L.font(9.2, "normal");
  L.ink(MUTED);
  doc.text(pdfSafe(bits.join("  ·  ")), textX, ty + 2);

  const watch = ytWatchUrl(row.video_id, p.videoUrl);
  L.font(9.2, "normal");
  L.ink(ACCENT);
  doc.textWithLink("Watch on YouTube", textX, ty + 16, { url: watch });

  L.y = Math.max(startY + th, ty + 22) + 8;
  L.rule();
  L.gap(4);
}

export type PdfImages = {
  thumbs: Map<string, Img | null>;
  shots: Map<string, Img | null>;
};

/**
 * Pure layout: fixture images in, finished document out. Kept free of fetch,
 * canvas and downloads so the page-break and wrapping maths can be tested.
 */
export async function renderPdfDoc(
  rows: VaultRow[],
  meta: { title: string; subtitle?: string },
  images: PdfImages,
  opts: PdfOptions = {}
): Promise<{ doc: JsPdf; images: number }> {
  const includeMarks = opts.includeMarks !== false;
  const includeShots = opts.includeShots !== false;
  const includeSources = opts.includeSources !== false;
  const report = opts.onProgress;
  const usable = rows.filter(Boolean);
  if (!usable.length) throw new Error("Nothing to export");
  const thumbs = images.thumbs;
  const shotImages = images.shots;
  const tick = (label: string) => report?.(0, 0, label);

  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "pt", format: "a4", compress: true });
  doc.setProperties({
    title: meta.title,
    subject: "Marks and screenshots exported from VideoSearch Studio",
    creator: "VideoSearch Studio",
  });
  const L = new Layout(doc);

  let marks = 0;
  let shots = 0;
  let notes = 0;
  for (const row of usable) {
    const hl = row.payload?.highlights || [];
    const ss = row.payload?.screenshots || [];
    marks += hl.length;
    shots += ss.length;
    notes +=
      hl.filter((h) => h.note?.trim()).length +
      ss.filter((s) => s.note?.trim()).length;
  }

  const single = usable.length === 1;
  coverPage(
    L,
    {
      title: meta.title,
      subtitle: meta.subtitle,
      watchUrl: single
        ? ytWatchUrl(usable[0].video_id, usable[0].payload?.videoUrl)
        : undefined,
      videos: usable.length,
      marks: includeMarks ? marks : 0,
      shots: includeShots ? shots : 0,
      notes,
    },
    thumbs.get(usable[0].video_id) || null
  );

  let imagesEmbedded = thumbs.get(usable[0].video_id) ? 1 : 0;

  for (const row of usable) {
    doc.addPage();
    L.y = M;
    videoHeader(L, row, thumbs.get(row.video_id) || null);

    const p = row.payload || {};
    const hl = [...(p.highlights || [])].sort(
      (a, b) => (a.startTime || 0) - (b.startTime || 0)
    );
    const ss = [...(p.screenshots || [])].sort(
      (a, b) => (a.videoTime || 0) - (b.videoTime || 0)
    );

    if (includeMarks && hl.length) {
      L.sectionTitle("Marks & notes", hl.length);
      for (const h of hl) {
        const text = (h.note || "").trim() || "Mark (no text)";
        L.font(10.3, "normal");
        const lines: string[] = doc.splitTextToSize(pdfSafe(text), CW - 66);
        const blockH = Math.max(19, lines.length * 14.2) + 9;
        L.need(blockH);
        const top = L.y;
        L.timeChip(
          h.startTime || 0,
          M,
          top,
          ytWatchUrl(row.video_id, p.videoUrl, h.startTime)
        );
        L.font(10.3, "normal");
        L.ink(h.note?.trim() ? INK : MUTED);
        let ty = top + 10.6;
        for (const line of lines) {
          doc.text(line, M + 66, ty);
          ty += 14.2;
        }
        L.y = top + blockH;
      }
      L.gap(4);
    }

    if (includeShots && ss.length) {
      L.sectionTitle("Screenshots", ss.length);
      for (const s of ss) {
        const img = shotImages.get(`${row.video_id}:${s.id}`) || null;
        const caption = (s.note || "").trim();
        L.font(9.6, "normal");
        const capLines: string[] = caption
          ? doc.splitTextToSize(pdfSafe(caption), CW - 66)
          : [];
        const capH = capLines.length * 13 + 6;

        if (img) {
          const w = Math.min(CW, 430);
          const h = Math.min((img.h / img.w) * w, 330);
          const drawW = (img.w / img.h) * h < w ? (img.w / img.h) * h : w;
          const drawH = (img.h / img.w) * drawW;
          L.need(drawH + capH + 30);
          doc.addImage(img.data, "JPEG", M, L.y, drawW, drawH);
          doc.setDrawColor(HAIRLINE[0], HAIRLINE[1], HAIRLINE[2]);
          doc.setLineWidth(0.6);
          doc.rect(M, L.y, drawW, drawH);
          L.y += drawH + 8;
          imagesEmbedded += 1;
        } else {
          L.need(capH + 30);
        }

        const capTop = L.y;
        L.timeChip(
          s.videoTime || 0,
          M,
          capTop,
          ytWatchUrl(row.video_id, p.videoUrl, s.videoTime)
        );
        if (capLines.length) {
          L.font(9.6, "normal");
          L.ink(INK);
          let ty = capTop + 10.2;
          for (const line of capLines) {
            doc.text(line, M + 66, ty);
            ty += 13;
          }
          L.y = capTop + Math.max(17, capLines.length * 13) + 12;
        } else {
          L.y = capTop + 17 + 12;
        }
      }
    }

    if (includeSources) {
      const sources = filterUsefulSources(p.sourceLinks);
      if (sources.length) {
        L.sectionTitle("Sources from the description", sources.length);
        for (const link of sources) {
          L.need(26);
          const label = (link.label || link.kind || "Link").trim();
          L.paragraph(label, { size: 9.8, weight: "bold", maxLines: 1 });
          L.font(9, "normal");
          L.ink(ACCENT);
          const shown = pdfSafe(link.url.slice(0, 100));
          doc.textWithLink(shown, M, L.y + 8, { url: link.url });
          L.y += 18;
        }
      }
    }

    tick("Laying out pages…");
  }

  footers(doc, `${meta.title}  ·  VideoSearch Studio`);
  return { doc, images: imagesEmbedded };
}

/** Gather every image, lay the document out, hand the user a file. */
export async function exportRowsToPdf(
  rows: VaultRow[],
  meta: { title: string; subtitle?: string; fileBase?: string },
  ctx: { token?: string; apiBase?: string } = {},
  opts: PdfOptions = {}
): Promise<PdfResult> {
  const usable = rows.filter(Boolean);
  if (!usable.length) throw new Error("Nothing to export");

  type ShotJob = { videoId: string; shotId: string; url: string };
  const shotJobs: ShotJob[] = [];
  if (opts.includeShots !== false) {
    for (const row of usable) {
      for (const s of row.payload?.screenshots || []) {
        const url = absolute(shotSrc(row.video_id, s, ctx.token), ctx.apiBase);
        if (url) shotJobs.push({ videoId: row.video_id, shotId: s.id, url });
      }
    }
  }

  const totalSteps = shotJobs.length + usable.length + 2;
  let done = 0;
  const report = opts.onProgress;
  const tick = (label: string) => {
    done += 1;
    report?.(done, totalSteps, label);
  };
  report?.(0, totalSteps, "Preparing…");

  // Fetched up front and in parallel so layout never awaits mid-page.
  const thumbs = new Map<string, Img | null>();
  await mapLimit(usable, FETCH_CONCURRENCY, async (row) => {
    thumbs.set(row.video_id, await loadImage(ytThumb(row.video_id)));
    tick("Loading thumbnails…");
  });

  const shots = new Map<string, Img | null>();
  if (shotJobs.length) {
    await mapLimit(shotJobs, FETCH_CONCURRENCY, async (job) => {
      shots.set(`${job.videoId}:${job.shotId}`, await loadImage(job.url));
      tick("Rendering screenshots…");
    });
  }

  const { doc, images } = await renderPdfDoc(
    usable,
    { title: meta.title, subtitle: meta.subtitle },
    { thumbs, shots },
    opts
  );
  tick("Laying out pages…");

  const filename = safeFilename(meta.fileBase || meta.title);
  doc.save(filename);
  tick("Done");

  return { filename, pages: doc.getNumberOfPages(), images };
}

/** One video → one PDF. */
export function exportVideoToPdf(
  row: VaultRow,
  ctx: { token?: string; apiBase?: string } = {},
  opts: PdfOptions = {}
): Promise<PdfResult> {
  const title = titleOf(row);
  return exportRowsToPdf(
    [row],
    {
      title,
      subtitle: row.payload?.channelTitle || undefined,
      fileBase: title,
    },
    ctx,
    opts
  );
}
