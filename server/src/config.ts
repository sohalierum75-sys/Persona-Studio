// ============================================================
// Persona Studio API — environment configuration
// ============================================================

import fs from "node:fs";
import path from "node:path";

// Minimal .env loader (KEY=VALUE lines; quotes trimmed; existing env wins)
(function loadDotEnv() {
  for (const candidate of [".env", ".env.local"]) {
    const p = path.join(process.cwd(), candidate);
    try {
      const text = fs.readFileSync(p, "utf8");
      for (const line of text.split(/\r?\n/)) {
        const m = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/.exec(line);
        if (!m || line.trim().startsWith("#")) continue;
        let value = m[2].trim();
        if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
          value = value.slice(1, -1);
        }
        if (process.env[m[1]] === undefined) process.env[m[1]] = value;
      }
    } catch { /* no file — fine */ }
  }
})();

function required(name: string): string {
  const v = process.env[name];
  if (!v || v.includes("CHANGE_ME") || v.startsWith("YOUR_")) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return v;
}

function optional(name: string, fallback: string): string {
  const v = process.env[name];
  return v && v.length > 0 ? v : fallback;
}

function list(name: string): string[] {
  return optional(name, "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

const rawPort = optional("PORT", "3210");

export const config = {
  port: parseInt(rawPort, 10),
  nodeEnv: optional("NODE_ENV", "development"),
  isProd: optional("NODE_ENV", "development") === "production",

  databaseUrl: process.env.DATABASE_URL ?? "",

  jwtSecret: optional("JWT_SECRET", ""),
  accessTokenTtlSec: parseInt(optional("ACCESS_TOKEN_TTL_SEC", "3600"), 10),
  refreshTokenTtlSec: parseInt(optional("REFRESH_TOKEN_TTL_SEC", `${30 * 24 * 3600}`), 10),

  google: {
    clientId: process.env.GOOGLE_CLIENT_ID ?? "",
    clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
    authUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenUrl: "https://oauth2.googleapis.com/token",
    userinfoUrl: "https://openidconnect.googleapis.com/v1/userinfo",
    scopes: "openid email profile",
  },

  /** Exact allowed web redirect origins, e.g. http://localhost:5173 */
  allowedOrigins: list("ALLOWED_ORIGINS"),
  /**
   * Allowed extension redirect URL prefixes (from chrome.identity.getRedirectURL()),
   * e.g. https://<extension-id>.chromiumapp.org/
   */
  extensionRedirectPrefixes: list("EXTENSION_REDIRECT_PREFIXES"),

  /** CORS origins — origins plus chrome-extension://<id> entries */
  corsOrigins: list("ALLOWED_ORIGINS"),

  /** Max JSON body size (base64 images ride along in sync ops) */
  bodyLimit: optional("BODY_LIMIT", "16mb"),

  /** Max size of a single record payload, bytes */
  maxRecordBytes: parseInt(optional("MAX_RECORD_KB", "12288"), 10) * 1024,

  /** Dev/test login endpoint (never enable in production) */
  allowTestLogin: optional("ALLOW_TEST_LOGIN", "false") === "true",

  /** Days to keep version history per record */
  historyKeepVersions: parseInt(optional("HISTORY_KEEP_VERSIONS", "20"), 10),

  /** Days to keep soft-deleted tombstones before hard purge */
  tombstoneDays: parseInt(optional("TOMBSTONE_DAYS", "30"), 10),

  /**
   * Lemon Squeezy billing. Billing is enabled only when ALL of api key, store id,
   * webhook secret and both variant ids are set; otherwise the pricing
   * endpoints degrade gracefully (config → configured:false, checkout → 503).
   * Secrets never leave the server: the client only receives checkout URLs.
   */
  lemonsqueezy: {
    storeId: process.env.LEMONSQUEEZY_STORE_ID ?? "",
    apiKey: process.env.LEMONSQUEEZY_API_KEY ?? "",
    webhookSecret: process.env.LEMONSQUEEZY_WEBHOOK_SECRET ?? "",
    lifetimeVariantId: process.env.LEMONSQUEEZY_LIFETIME_VARIANT_ID ?? "",
    monthlyVariantId: process.env.LEMONSQUEEZY_MONTHLY_VARIANT_ID ?? "",
    /** Max lifetime deals that can ever be granted (server-enforced) */
    lifetimeDealLimit: parseInt(optional("LIFETIME_DEAL_LIMIT", "50"), 10),
    /** Where Lemon Squeezy sends the buyer after payment (defaults to PUBLIC_BASE_URL) */
    redirectUrl: optional("LEMONSQUEEZY_REDIRECT_URL", ""),
    apiBaseUrl: "https://api.lemonsqueezy.com/v1",
  },
};

/** Only environment variable names are safe to return to the browser. */
export function billingMissingVariables(): string[] {
  const ls = config.lemonsqueezy;
  return Object.entries({
    LEMONSQUEEZY_API_KEY: ls.apiKey,
    LEMONSQUEEZY_STORE_ID: ls.storeId,
    LEMONSQUEEZY_WEBHOOK_SECRET: ls.webhookSecret,
    LEMONSQUEEZY_LIFETIME_VARIANT_ID: ls.lifetimeVariantId,
    LEMONSQUEEZY_MONTHLY_VARIANT_ID: ls.monthlyVariantId,
  }).filter(([, value]) => !value.trim() || /YOUR_|CHANGE_ME|REPLACE_WITH/.test(value))
    .map(([name]) => name);
}

export const billingConfigured = (): boolean => billingMissingVariables().length === 0;

export function validateConfig(): string[] {
  const problems: string[] = [];
  if (config.isProd && (!process.env.PUBLIC_BASE_URL?.startsWith("https://") || config.allowTestLogin)) problems.push("Production requires HTTPS PUBLIC_BASE_URL and ALLOW_TEST_LOGIN=false");
  if (!config.databaseUrl) problems.push("DATABASE_URL is required");
  if (!config.jwtSecret || config.jwtSecret.length < 32 || /CHANGE_ME|REPLACE_WITH/.test(config.jwtSecret)) {
    problems.push("JWT_SECRET must be set to at least 32 random characters");
  }
  if (!config.google.clientId || !config.google.clientSecret) {
    if (!config.allowTestLogin) {
      problems.push("GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET are required (or set ALLOW_TEST_LOGIN=true for dev)");
    }
  }
  if (config.google.clientId && config.allowedOrigins.length === 0 && config.extensionRedirectPrefixes.length === 0) {
    problems.push("Set ALLOWED_ORIGINS and/or EXTENSION_REDIRECT_PREFIXES so OAuth callbacks can be validated");
  }
  // Checkout stays disabled until billing setup is complete.
  const ls = config.lemonsqueezy;
  const missing = billingMissingVariables();
  // Missing billing setup is reported by the billing endpoints; keep the free app available.
  if (!missing.includes("LEMONSQUEEZY_STORE_ID") && !/^\d+$/.test(ls.storeId)) {
    problems.push("LEMONSQUEEZY_STORE_ID must be the numeric Lemon Squeezy store id");
  }
  if (!Number.isFinite(ls.lifetimeDealLimit) || ls.lifetimeDealLimit < 1) {
    problems.push("LIFETIME_DEAL_LIMIT must be a positive integer");
  }
  if (!missing.includes("LEMONSQUEEZY_WEBHOOK_SECRET") && ls.webhookSecret.length < 16) {
    problems.push("LEMONSQUEEZY_WEBHOOK_SECRET should be a long random string (16+ characters)");
  }
  if (!missing.includes("LEMONSQUEEZY_LIFETIME_VARIANT_ID") && !/^\d+$/.test(ls.lifetimeVariantId)) {
    problems.push("LEMONSQUEEZY_LIFETIME_VARIANT_ID must be the numeric Lemon Squeezy variant id");
  }
  if (!missing.includes("LEMONSQUEEZY_MONTHLY_VARIANT_ID") && !/^\d+$/.test(ls.monthlyVariantId)) {
    problems.push("LEMONSQUEEZY_MONTHLY_VARIANT_ID must be the numeric Lemon Squeezy variant id");
  }
  return problems;
}
