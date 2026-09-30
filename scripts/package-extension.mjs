// ============================================================
// Package the built Chrome extension into a downloadable ZIP.
//
// Prerequisite: `npm run build` has produced dist/ (manifest.json
// at dist root + all runtime assets). Run via:
//   npm run package:extension
//
// Output:
//   dist/download/persona-studio-extension-v{version}.zip
//   dist/download/latest.json   (version + filename, read by the homepage)
//
// The ZIP is written inside dist/ so the API's static dir serves it
// at /download/... in production (Dockerfile copies dist → web).
// ============================================================

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import JSZip from "jszip";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const distDir = path.join(root, "dist");
const outDir = path.join(distDir, "download");

// ── Sanity checks on the build output ────────────────────────────────────────
const manifestPath = path.join(distDir, "manifest.json");
if (!fs.existsSync(manifestPath)) {
  console.error("✗ dist/manifest.json not found. Run `npm run build` first (or use `npm run package:extension`).");
  process.exit(1);
}
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
const requiredFiles = ["background.js", "sidepanel.html", "index.html"];
for (const f of requiredFiles) {
  if (!fs.existsSync(path.join(distDir, f))) {
    console.error(`✗ dist/${f} missing — build output incomplete. Re-run \`npm run build\`.`);
    process.exit(1);
  }
}

// Verify the manifest key pins the expected extension ID (auth depends on it:
// the API only accepts redirect URLs from IDs listed in EXTENSION_REDIRECT_PREFIXES).
const extId = (() => {
  const der = Buffer.from(manifest.key, "base64");
  const hash = crypto.createHash("sha256").update(der).digest();
  let id = "";
  for (let i = 0; i < 16; i++) id += String.fromCharCode(97 + (hash[i] >> 4), 97 + (hash[i] & 0xf));
  return id;
})();
console.log(`  extension id (pinned via manifest key): ${extId}`);

// ── Report the API URL baked into the client bundle ──────────────────────────
// Same precedence as vite.config.ts / Dockerfile: env var wins, else .env.local,
// else localhost. Warn loudly when still pointing at localhost, since a ZIP
// built that way can only sign in against a locally running API.
function readEnvFile(name) {
  try {
    const out = {};
    for (const line of fs.readFileSync(path.join(root, name), "utf8").split(/\r?\n/)) {
      const m = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/.exec(line);
      if (m && !line.trim().startsWith("#")) out[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
    }
    return out;
  } catch { return {}; }
}
const apiUrl = process.env.VITE_API_URL ?? readEnvFile(".env.local").VITE_API_URL ?? "http://localhost:3210";
console.log(`  baked API URL: ${apiUrl}`);
if (/localhost|127\.0\.0\.1/.test(new URL(apiUrl).host)) {
  console.warn("  ⚠ API URL points at localhost — set VITE_API_URL (or PUBLIC_BASE_URL in Docker) to the production URL before shipping this ZIP.");
}

// ── Collect dist files (before writing the ZIP into dist/download) ───────────
const files = [];
(function walk(dir, rel = "") {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (rel === "" && entry.name === "download") continue;
    const abs = path.join(dir, entry.name);
    const relPath = rel ? `${rel}/${entry.name}` : entry.name;
    if (entry.isDirectory()) walk(abs, relPath);
    else files.push({ abs, relPath });
  }
})(distDir);

// ── Zip: manifest.json at the archive root ───────────────────────────────────
const zip = new JSZip();
for (const f of files) zip.file(f.relPath, fs.readFileSync(f.abs));
const zipName = `persona-studio-extension-v${manifest.version}.zip`;
fs.mkdirSync(outDir, { recursive: true });
const content = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
fs.writeFileSync(path.join(outDir, zipName), content);

// Remove stale versioned ZIPs + refresh latest.json
for (const f of fs.readdirSync(outDir)) {
  if (f.endsWith(".zip") && f !== zipName) fs.unlinkSync(path.join(outDir, f));
}
fs.writeFileSync(
  path.join(outDir, "latest.json"),
  JSON.stringify({ version: manifest.version, file: zipName, apiUrl }, null, 2) + "\n",
);

console.log(`✓ Packaged ${files.length} files → dist/download/${zipName} (${(content.length / 1024).toFixed(0)} KB)`);
