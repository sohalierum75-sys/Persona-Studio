// Renders public/persona-mark.svg into the PNG logo/icon set and a size-check preview.
// Small sizes (<=32) get an optical variant with a larger counter so the P survives at 16px.
// Usage: node scripts/render-logo.mjs   (requires Playwright chromium: npx playwright install chromium)
import { chromium } from "@playwright/test";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const master = await readFile(resolve(root, "public/persona-mark.svg"), "utf8");

// Optical small-size cut: taller, thinner stem, counter opened up (r 3.7), simpler gradient.
const small = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" fill="none">
  <defs><linearGradient id="ps-tile" x1="6" y1="2" x2="26" y2="30" gradientUnits="userSpaceOnUse">
    <stop offset="0" stop-color="#1FA5FF"/><stop offset="1" stop-color="#7A48FF"/>
  </linearGradient></defs>
  <rect width="32" height="32" rx="8.5" fill="url(#ps-tile)"/>
  <path fill="#fff" d="M11.4 6h5.35a6.25 6.25 0 0 1 0 12.5h-3.25v5.25a2.25 2.25 0 0 1-4.5 0V8.25A2.25 2.25 0 0 1 11.4 6Z"/>
  <path fill="url(#ps-tile)" d="M16.75 8.55a3.7 3.7 0 0 1 0 7.4h-3.25v-7.4h3.25Z"/>
</svg>`;

const targets = [
  { size: 16, file: "public/icons/icon16.png" },
  { size: 32, file: "public/icons/icon32.png" },
  { size: 48, file: "public/icons/icon48.png" },
  { size: 128, file: "public/icons/icon128.png" },
  { size: 180, file: "public/logo-180.png" },
  { size: 512, file: "public/logo.png" },
];

const browser = await chromium.launch({ channel: "chromium" });
const page = await browser.newPage();

async function render(svgText, size) {
  const html = `<!doctype html><meta charset="utf8"><style>*{margin:0;padding:0}html,body{width:${size}px;height:${size}px;overflow:hidden}svg{display:block;width:${size}px;height:${size}px}</style>${svgText}`;
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(html);
  return page.screenshot({ type: "png" });
}

for (const { size, file } of targets) {
  const png = await render(size <= 32 ? small : master, size);
  await mkdir(dirname(resolve(root, file)), { recursive: true });
  await writeFile(resolve(root, file), png);
  console.log(`wrote ${file} (${size}x${size}, ${size <= 32 ? "small cut" : "master"})`);
}

// Size-check preview: both cuts at real favicon/toolbar sizes on light and dark chrome.
const strip = `<!doctype html><meta charset="utf8"><body style="margin:0;font-family:Segoe UI,Arial">
<style>.row{display:flex;align-items:center;gap:18px;padding:16px 20px}.dark{background:#111113}.light{background:#f5f5f5}.cell{display:flex;flex-direction:column;align-items:center;gap:6px;color:#888;font-size:10px}svg{display:block}</style>
<div class="row light">${[16, 24, 32, 48, 64, 128].map((s) => `<div class="cell"><div style="width:${s}px;height:${s}px">${s <= 32 ? small : master}</div>${s}px</div>`).join("")}</div>
<div class="row dark">${[16, 24, 32, 48, 64, 128].map((s) => `<div class="cell"><div style="width:${s}px;height:${s}px">${s <= 32 ? small : master}</div>${s}px</div>`).join("")}</div>
</body>`;
await page.setViewportSize({ width: 760, height: 260 });
await page.setContent(strip);
await page.screenshot({ path: resolve(root, "test-results/logo-preview.png"), fullPage: true });
console.log("wrote test-results/logo-preview.png");

await browser.close();
