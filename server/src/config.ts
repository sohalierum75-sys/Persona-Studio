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
   * Paddle Billing. Billing is enabled only when apiKey, webhookSecret,
   * and both price ids are set; otherwise the pricing endpoints degrade
   * gracefully (config → configured:false, checkout → 503).
   * Secrets never leave the server: the client only receives checkout URLs.
   */
  paddle: {
    /** "sandbox" | "production" — controls which Paddle API base URL is used */
    environment: (process.env.PADDLE_ENVIRONMENT ?? "sandbox") as "sandbox" | "production",
    apiKey: process.env.PADDLE_API_KEY ?? "",
    webhookSecret: process.env.PADDLE_WEBHOOK_SECRET ?? "",
    /** Paddle Price ID for the one-time lifetime deal (pri_xxx) */
    lifetimePriceId: process.env.PADDLE_LIFETIME_PRICE_ID ?? "",
    /** Paddle Price ID for the monthly subscription (pri_xxx) */
    monthlyPriceId: process.env.PADDLE_MONTHLY_PRICE_ID ?? "",
    /** Max lifetime deals that can ever be granted (server-enforced) */
    lifetimeDealLimit: parseInt(optional("LIFETIME_DEAL_LIMIT", "50"), 10),
    /** Where Paddle sends the buyer after payment (defaults to PUBLIC_BASE_URL) */
    redirectUrl: optional("PADDLE_REDIRECT_URL", ""),
    get apiBaseUrl(): string {
      return this.environment === "production"
        ? "https://api.paddle.com"
        : "https://sandbox-api.paddle.com";
    },
  },
};

/** Only environment variable names are safe to return to the browser. */
export function billingMissingVariables(): string[] {
  const p = config.paddle;
  return Object.entries({
    PADDLE_API_KEY: p.apiKey,
    PADDLE_WEBHOOK_SECRET: p.webhookSecret,
    PADDLE_LIFETIME_PRICE_ID: p.lifetimePriceId,
    PADDLE_MONTHLY_PRICE_ID: p.monthlyPriceId,
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

  const p = config.paddle;
  const env = p.environment;
  if (env !== "sandbox" && env !== "production") {
    problems.push("PADDLE_ENVIRONMENT must be 'sandbox' or 'production'");
  }
  if (!Number.isFinite(p.lifetimeDealLimit) || p.lifetimeDealLimit < 1) {
    problems.push("LIFETIME_DEAL_LIMIT must be a positive integer");
  }
  const missing = billingMissingVariables();
  if (!missing.includes("PADDLE_WEBHOOK_SECRET") && p.webhookSecret.length < 16) {
    problems.push("PADDLE_WEBHOOK_SECRET should be a long random string (16+ characters)");
  }
  if (!missing.includes("PADDLE_LIFETIME_PRICE_ID") && !/^pri_/.test(p.lifetimePriceId)) {
    problems.push("PADDLE_LIFETIME_PRICE_ID must be a Paddle price ID starting with pri_");
  }
  if (!missing.includes("PADDLE_MONTHLY_PRICE_ID") && !/^pri_/.test(p.monthlyPriceId)) {
    problems.push("PADDLE_MONTHLY_PRICE_ID must be a Paddle price ID starting with pri_");
  }
  return problems;
}
