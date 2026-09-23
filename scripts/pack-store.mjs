/**
 * Build Chrome Web Store zip + listing images.
 * Run via: npm run store:zip
 */
import { mkdir, rm, cp } from "node:fs/promises";
import { existsSync } from "node:fs";
import { execSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dist = path.join(root, "dist");
const listing = path.join(root, "store", "listing");
const version = "2.0.0";

if (!existsSync(path.join(dist, "manifest.json"))) {
  console.error("dist/manifest.json missing — run npm run build first");
  process.exit(1);
}

await mkdir(listing, { recursive: true });

const shots = [
  ["website/assets/product-hero.jpg", "screenshot-1.png"],
  ["website/assets/hero-product.jpg", "screenshot-2.png"],
  ["website/assets/features-grid.jpg", "screenshot-3.png"],
];

for (const [src, out] of shots) {
  const from = path.join(root, src);
  if (!existsSync(from)) continue;
  await sharp(from)
    .resize(1280, 800, { fit: "cover", position: "centre" })
    .png({ compressionLevel: 9 })
    .toFile(path.join(listing, out));
}

const logo = path.join(root, "public/icons/logo.png");
const icon128 = path.join(root, "public/icons/icon128.png");
if (existsSync(icon128)) {
  await cp(icon128, path.join(listing, "icon-128.png"));
}

const promoBg = await sharp({
  create: {
    width: 440,
    height: 280,
    channels: 3,
    background: { r: 10, g: 11, b: 15 },
  },
})
  .png()
  .toBuffer();

if (existsSync(logo)) {
  const mark = await sharp(logo).resize(96, 96).png().toBuffer();
  await sharp(promoBg)
    .composite([{ input: mark, gravity: "centre" }])
    .png()
    .toFile(path.join(listing, "promo-small.png"));
} else {
  await sharp(promoBg).toFile(path.join(listing, "promo-small.png"));
}

const zipName = `videosearch-ai-${version}.zip`;
const zipPath = path.join(root, "store", zipName);
if (existsSync(zipPath)) await rm(zipPath);

execSync(`zip -r -q ${JSON.stringify(zipPath)} . -x "*.DS_Store"`, {
  cwd: dist,
  stdio: "inherit",
});

console.log("Store package:");
console.log("  zip     ", zipPath);
console.log("  listing ", listing);
