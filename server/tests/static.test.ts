// Static serving + history-API fallback: frontend routes (clean URLs, no #)
// must serve the SPA shell while real files and API paths behave normally.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "test-only-signing-secret-which-is-long-enough";
process.env.DATABASE_URL = "postgresql://test:test@127.0.0.1:5432/test";
process.env.ALLOWED_ORIGINS = "http://localhost:5173";
process.env.EXTENSION_REDIRECT_PREFIXES = `https://${"a".repeat(32)}.chromiumapp.org/`;

const webRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ps-web-"));
fs.writeFileSync(
  path.join(webRoot, "index.html"),
  "<!doctype html><html><body><div id=\"root\"></div><script src=\"/assets/index-test.js\"></script></body></html>"
);
fs.mkdirSync(path.join(webRoot, "assets"));
fs.writeFileSync(path.join(webRoot, "assets", "index-test.js"), "console.log('spa')");

let server: any, base: string;

before(async () => {
  process.env.STATIC_DIR = webRoot;
  const { createApp } = await import("../src/index.js");
  server = createApp().listen(0, "127.0.0.1");
  await new Promise<void>((r) => server.once("listening", r));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  if (server) await new Promise<void>((r) => server.close(r));
  fs.rmSync(webRoot, { recursive: true, force: true });
});

async function get(p: string, method = "GET") {
  const r = await fetch(base + p, { method, redirect: "manual" });
  return { status: r.status, body: await r.text(), type: r.headers.get("content-type") ?? "" };
}

test("history-API fallback serves the SPA shell for every frontend route", async () => {
  for (const route of ["/", "/characters", "/characters/abc", "/episodes/e1", "/wardrobe", "/locations", "/history", "/settings"]) {
    const res = await get(route);
    assert.equal(res.status, 200, route);
    assert.ok(res.type.includes("text/html"), route);
    assert.ok(res.body.includes('id="root"'), route);
  }
});

test("real static files are served; missing files still 404", async () => {
  const asset = await get("/assets/index-test.js");
  assert.equal(asset.status, 200);
  assert.ok(asset.type.includes("javascript"));
  assert.equal((await get("/assets/nope-123.js")).status, 404);
  assert.equal((await get("/download/missing.json")).status, 404);
});

test("API routes never receive the SPA shell", async () => {
  const res = await get("/api/unknown");
  assert.equal(res.status, 404);
  assert.ok(!res.body.includes('id="root"'));
});

test("web OAuth redirect accepts any path on an allowed origin", async () => {
  const { validateClientRedirect } = await import("../src/routes/auth.js");
  const extPrefix = process.env.EXTENSION_REDIRECT_PREFIXES!;
  assert.equal(validateClientRedirect("http://localhost:5173/"), "http://localhost:5173/");
  assert.equal(validateClientRedirect("http://localhost:5173/characters"), "http://localhost:5173/characters");
  assert.equal(validateClientRedirect("http://localhost:5173/characters/abc"), "http://localhost:5173/characters/abc");
  // Query/hash rejected so OAuth result params stay the only ones appended.
  assert.equal(validateClientRedirect("http://localhost:5173/characters?x=1"), null);
  assert.equal(validateClientRedirect("http://localhost:5173/settings#y"), null);
  // Cross-origin paths stay rejected; extension prefixes still work.
  assert.equal(validateClientRedirect("https://evil.example/characters"), null);
  assert.equal(validateClientRedirect(extPrefix), extPrefix);
});
