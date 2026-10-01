// ============================================================
// Persona Studio API — Express app
// ============================================================
import express from "express";
import cors from "cors";
import path from "node:path";
import { config, validateConfig } from "./config.js";
import { authRouter } from "./routes/auth.js";
import { syncRouter, purgeOldTombstones } from "./routes/sync.js";
import { assetsRouter } from "./routes/assets.js";
import { eventsRouter } from "./routes/events.js";
import { requireAuth } from "./lib/sessions.js";
import { authRateLimit } from "./lib/rate-limit.js";

export function createApp(): express.Express {
  const app = express();
  app.set("trust proxy", 1);
  app.disable("x-powered-by");

  const corsOrigins = config.corsOrigins.map((o) => o.replace(/\/$/, ""));
  app.use(cors({
    origin(origin, cb) {
      // Allow same-origin/no-origin (curl, same-origin requests)
      if (!origin) return cb(null, true);
      const clean = origin.replace(/\/$/, "");
      if (corsOrigins.includes(clean)) return cb(null, true);
      // Allow any chrome-extension origin that matches configured prefixes
      for (const p of config.extensionRedirectPrefixes) {
        const m = /^https:\/\/([a-p]{32})\.chromiumapp\.org/.exec(p);
        if (m && clean === `chrome-extension://${m[1]}`) return cb(null, true);
      }
      return cb(new Error("Origin not allowed"));
    },
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  }));

  app.use((_req, res, next) => { res.setHeader("Cache-Control", "no-store"); res.setHeader("X-Content-Type-Options", "nosniff"); res.setHeader("Referrer-Policy", "no-referrer"); next(); });
  app.use(express.json({ limit: config.bodyLimit }));

  // ── Health ──────────────────────────────────────────────────────────
  app.get("/api/health", (_req, res) => {
    res.json({ ok: true, service: "persona-studio-api", time: new Date().toISOString() });
  });

  // ── Routes ──────────────────────────────────────────────────────────
  app.use("/api/auth", authRateLimit(), authRouter);
  app.use("/api/events", eventsRouter);
  app.use("/api/assets", requireAuth, assetsRouter);
  app.use("/api/sync", requireAuth, syncRouter);
  if (process.env.STATIC_DIR) {
    const staticDir = path.resolve(process.env.STATIC_DIR);
    app.use(express.static(staticDir));
    // History-API fallback: non-API, extension-less GETs belong to the SPA,
    // so deep links and refreshes (/characters, /episodes/:id, …) serve
    // index.html. Real files (hashed assets, /download/*.zip) and any path
    // with an extension still fall through to the normal 404.
    app.use((req, res, next) => {
      if (req.method !== "GET" && req.method !== "HEAD") return next();
      if (req.path.startsWith("/api/") || /\.[a-zA-Z0-9]+$/.test(req.path) || !req.accepts("html")) return next();
      res.sendFile(path.join(staticDir, "index.html"));
    });
  }

  // ── Errors ──────────────────────────────────────────────────────────
  app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    if (err.message === "Origin not allowed") {
      res.status(403).json({ error: "Origin not allowed" });
      return;
    }
    if ((err as { type?: string }).type === "entity.too.large") {
      res.status(413).json({ error: "Payload too large" });
      return;
    }
    console.error("[api] unhandled error:", err);
    res.status(500).json({ error: "Internal server error" });
  });

  return app;
}

// ─── Entrypoint ──────────────────────────────────────────────────────────────

export function start(): void {
  const problems = validateConfig();
  if (problems.length > 0) {
    console.error("\n✗ Configuration problems:");
    for (const p of problems) console.error(`  - ${p}`);
    console.error("\nFix server/.env and try again. See server/.env.example.\n");
    process.exit(1);
  }

  const app = createApp();
  app.listen(config.port, () => {
    console.log(`✓ Persona Studio API listening on http://localhost:${config.port}`);
    console.log(`  Environment: ${config.nodeEnv}`);
    console.log(`  Test login endpoint: ${config.allowTestLogin && !config.isProd ? "ENABLED (dev)" : "disabled"}`);
  });

  // Nightly tombstone purge
  const day = 24 * 3600 * 1000;
  setInterval(() => { purgeOldTombstones().catch(console.error); }, day).unref();
  purgeOldTombstones().catch(console.error);
}

// Run directly (tsx src/index.ts) — not when imported by tests
if (process.argv[1] && process.argv[1].replace(/\\/g, "/").match(/(?:src\/index\.ts|dist\/index\.js)$/)) {
  start();
}
