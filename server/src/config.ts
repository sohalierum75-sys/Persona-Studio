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
  publicBaseUrl: process.env.PUBLIC_BASE_URL ?? "",

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

  /** Server-only Dodo credentials. Test and live use separate products and keys. */
  dodo: {
    environment: (process.env.DODO_PAYMENTS_ENVIRONMENT ?? "test_mode") as "test_mode" | "live_mode",
    apiKey: process.env.DODO_PAYMENTS_API_KEY ?? "",
    webhookSecret: process.env.DODO_PAYMENTS_WEBHOOK_KEY ?? "",
    lifetimeProductId: process.env.DODO_LIFETIME_PRODUCT_ID ?? "",
    monthlyProductId: process.env.DODO_MONTHLY_PRODUCT_ID ?? "",
    lifetimeDealLimit: Number(optional("LIFETIME_DEAL_LIMIT", "50")),
    redirectUrl: optional("DODO_RETURN_BASE_URL", process.env.PUBLIC_BASE_URL ?? ""),
  },
};

/** Only environment variable names are safe to return to the browser. */
export function billingMissingVariables(): string[] {
  const p = config.dodo;
  return Object.entries({
    DODO_PAYMENTS_API_KEY: p.apiKey,
    DODO_PAYMENTS_WEBHOOK_KEY: p.webhookSecret,
    DODO_LIFETIME_PRODUCT_ID: p.lifetimeProductId,
    DODO_MONTHLY_PRODUCT_ID: p.monthlyProductId,
    DODO_RETURN_BASE_URL: p.redirectUrl,
    PUBLIC_BASE_URL: config.publicBaseUrl,
  }).filter(([, value]) => !value.trim() || /YOUR_|CHANGE_ME|REPLACE_WITH/.test(value))
    .map(([name]) => name);
}

export const billingConfigured = (): boolean => billingMissingVariables().length === 0;

export function billingReturnUrl(): string {
  const url = new URL(config.dodo.redirectUrl);
  const publicUrl = new URL(config.publicBaseUrl);
  if (url.origin !== publicUrl.origin || url.username || url.password || url.search || url.hash || url.pathname !== "/"
    || (url.protocol !== "https:" && (config.isProd || url.protocol !== "http:"))) {
    throw new Error("DODO_RETURN_BASE_URL must match the PUBLIC_BASE_URL origin");
  }
  return new URL("/?checkout=success", url.origin).href;
}

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

  const p = config.dodo;
  if (!["test_mode", "live_mode"].includes(p.environment)) problems.push("DODO_PAYMENTS_ENVIRONMENT must be test_mode or live_mode");
  if (!Number.isInteger(p.lifetimeDealLimit) || p.lifetimeDealLimit < 1 || p.lifetimeDealLimit > 50) problems.push("LIFETIME_DEAL_LIMIT must be an integer from 1 to 50");
  if (p.redirectUrl) {
    try {
      billingReturnUrl();
    } catch { problems.push("DODO_RETURN_BASE_URL must match the PUBLIC_BASE_URL origin (HTTPS in production)"); }
  }
  if (p.lifetimeProductId && p.lifetimeProductId === p.monthlyProductId) problems.push("Dodo lifetime and monthly products must differ");
  return problems;
}
