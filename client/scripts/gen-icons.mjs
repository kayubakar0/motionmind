import sharp from "sharp";
import { mkdir, copyFile } from "node:fs/promises";
import path from "node:path";

const SRC = path.resolve("image/logo.png");
const ICO = path.resolve("image/logo.ico");
const OUT = path.resolve("public/icons");
const BG = "#090b0a";

async function make(size, scale, name) {
  const inner = Math.round(size * scale);
  const logo = await sharp(SRC).resize(inner, inner).png().toBuffer();
  await sharp({
    create: { width: size, height: size, channels: 4, background: BG },
  })
    .composite([{ input: logo, gravity: "center" }])
    .png()
    .toFile(path.join(OUT, name));
}

await mkdir(OUT, { recursive: true });
await make(192, 0.86, "pwa-192.png");
await make(512, 0.86, "pwa-512.png");
await make(512, 0.62, "pwa-maskable-512.png");
await make(180, 0.86, "apple-touch-icon.png");
await copyFile(ICO, path.join(OUT, "favicon.ico"));
console.log("Ikon PWA dibuat di public/icons");
