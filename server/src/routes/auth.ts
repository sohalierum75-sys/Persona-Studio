// ============================================================
// Auth routes — Google OAuth (web + Chrome extension), token
// exchange, refresh, session info, logout.
// ============================================================
import { Router, Request, Response } from "express";
import { config } from "../config.js";
import { prisma } from "../lib/prisma.js";
import {
  signOAuthState, verifyOAuthState, randomToken, sha256, signAccessToken,
} from "../lib/tokens.js";
import {
  issueAuthCode, consumeAuthCode, issueRefreshToken, rotateRefreshToken,
  revokeRefreshToken, revokeAllUserTokens, upsertUserFromGoogle,
} from "../lib/sessions.js";

export const authRouter = Router();

/** The callback URL Google must be configured with. Honours X-Forwarded-*. */
function googleCallbackUrl(req: Request): string {
  if (process.env.PUBLIC_BASE_URL) {
    return `${process.env.PUBLIC_BASE_URL.replace(/\/$/, "")}/api/auth/google/callback`;
  }
  return `http://localhost:${config.port}/api/auth/google/callback`;
}

// ─── Client redirect validation ──────────────────────────────────────────────

export function validateClientRedirect(raw: string): string | null {
  try {
    const url = new URL(raw);
    if (url.username || url.password || url.hash) return null;
    if (!url.search && config.extensionRedirectPrefixes.some(p => new URL(p).href === url.href)) return url.href;
    // Only application-owned checkout markers may survive OAuth. Never accept
    // injected codes/errors, duplicate markers or an arbitrary redirect target.
    for (const [key, value] of url.searchParams) {
      if (url.searchParams.getAll(key).length !== 1) return null;
      if (key === "checkout" && ["lifetime", "monthly", "success"].includes(value)) continue;
      if (key === "pricing" && value === "1") continue;
      return null;
    }
    // Any path on an allowed origin is safe (same-origin, no open redirect) —
    // sign-in can start from any frontend route (/characters, /settings, …).
    if (config.allowedOrigins.includes(url.origin)) return url.href;
  } catch { /* invalid URL */ }
  return null;
}

function publicUser(u: { id: string; email: string; name: string; avatarUrl: string | null }) {
  return { id: u.id, email: u.email, name: u.name, avatarUrl: u.avatarUrl };
}

// ─── GET /api/auth/google/start — begin OAuth ────────────────────────────────

authRouter.get("/google/start", (req: Request, res: Response) => {
  const client = req.query.client === "extension" ? "extension" : "web";
  const redirect = validateClientRedirect(String(req.query.redirect ?? ""));
  if (!redirect) {
    res.status(400).send("Invalid or unregistered redirect URL");
    return;
  }

  const challenge = String(req.query.challenge ?? "");
  if (!/^[A-Za-z0-9_-]{43}$/.test(challenge)) { res.status(400).send("PKCE challenge required"); return; }
  const nonce = randomToken(16);
  res.cookie("ps_oauth", nonce, {httpOnly:true,secure:config.isProd,sameSite:"lax",maxAge:600000,path:"/api/auth/google/callback"});
  const state = signOAuthState({
    p: challenge,
    n: nonce,
    c: client,
    r: redirect,
    exp: Date.now() + 10 * 60_000,
  });

  const url = new URL(config.google.authUrl);
  url.searchParams.set("client_id", config.google.clientId);
  url.searchParams.set("redirect_uri", googleCallbackUrl(req));
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", config.google.scopes);
  url.searchParams.set("state", state);
  url.searchParams.set("prompt", "select_account");
  res.redirect(url.toString());
});

// ─── GET /api/auth/google/callback — Google redirects here ───────────────────

authRouter.get("/google/callback", async (req: Request, res: Response) => {
  const oauthError = req.query.error as string | undefined;
  const stateRaw = req.query.state as string | undefined;
  const code = req.query.code as string | undefined;

  const state = stateRaw ? verifyOAuthState(stateRaw) : null;
  const cookie = req.headers.cookie?.split(";").map(v => v.trim()).find(v => v.startsWith("ps_oauth="))?.slice(9);
  res.clearCookie("ps_oauth", {path:"/api/auth/google/callback",httpOnly:true,secure:config.isProd,sameSite:"lax"});
  if (!state || cookie !== state.n || !validateClientRedirect(state.r)) {
    res.status(400).send("Invalid or expired OAuth state");
    return;
  }
  const clientRedirect = (extra: string) => {
    const sep = state.r.includes("?") ? "&" : "?";
    return `${state.r}${sep}${extra}`;
  };

  if (oauthError) {
    // User cancelled / denied — send the client a clean, non-fatal error
    res.redirect(clientRedirect(`auth_error=${encodeURIComponent(oauthError === "access_denied" ? "cancelled" : oauthError)}`));
    return;
  }
  if (!code) {
    res.redirect(clientRedirect(`auth_error=missing_code`));
    return;
  }

  try {
    // Exchange the authorization code for Google tokens
    const cbUrl = googleCallbackUrl(req);
    const tokenRes = await fetch(config.google.tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: config.google.clientId,
        client_secret: config.google.clientSecret,
        redirect_uri: cbUrl,
        grant_type: "authorization_code",
      }),
    });
    if (!tokenRes.ok) throw new Error(`Google token exchange failed (${tokenRes.status})`);
    const tokens = (await tokenRes.json()) as { access_token?: string };
    if (!tokens.access_token) throw new Error("No access token from Google");

    const profileRes = await fetch(config.google.userinfoUrl, {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
    if (!profileRes.ok) throw new Error("Could not fetch Google profile");
    const profile = (await profileRes.json()) as {
      sub: string; email: string; email_verified?: boolean; name?: string; picture?: string;
    };

    const user = await upsertUserFromGoogle(profile);
    const oneTimeCode = await issueAuthCode(user.id, state.p);

    res.redirect(clientRedirect(`code=${encodeURIComponent(oneTimeCode)}`));
  } catch (err) {
    console.error("[auth] google callback failed:", err);
    res.redirect(clientRedirect(`auth_error=${encodeURIComponent("oauth_failed")}`));
  }
});

// ─── POST /api/auth/token — exchange one-time code for session tokens ────────

authRouter.post("/token", async (req: Request, res: Response) => {
  const code = typeof req.body?.code === "string" ? req.body.code : "";
  if (!code) {
    res.status(400).json({ error: "code required" });
    return;
  }
  const userId = await consumeAuthCode(code, String(req.body?.verifier ?? ""));
  if (!userId) {
    // Repeated rejects from one client usually mean an auth redirect loop:
    // stale single-use code, PKCE verifier mismatch, or expiry after a slow
    // Google round trip. Logged without the code itself.
    console.warn("[auth] one-time code exchange rejected (unknown, already used, expired, or verifier mismatch)");
    res.status(401).json({ error: "Invalid or expired code. Please sign in again." });
    return;
  }
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    res.status(401).json({ error: "User not found" });
    return;
  }
  const refreshToken = await issueRefreshToken(user.id, req.headers["user-agent"]);
  const accessToken = signAccessToken(user);
  res.json({
    user: publicUser(user),
    accessToken,
    refreshToken,
    expiresIn: config.accessTokenTtlSec,
    expiresAt: Date.now() + config.accessTokenTtlSec * 1000,
  });
});

// ─── POST /api/auth/test-login — dev only ────────────────────────────────────
// Issues a real session for an arbitrary identity so the app and its
// sync engine can be exercised without live Google credentials.
// Guarded by ALLOW_TEST_LOGIN=true and never available in production.

authRouter.post("/test-login", async (req: Request, res: Response) => {
  if (config.isProd || !config.allowTestLogin) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  const email = String(req.body?.email ?? "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    res.status(400).json({ error: "Valid email required" });
    return;
  }
  const name = String(req.body?.name ?? email.split("@")[0]);
  const user = await upsertUserFromGoogle({
    sub: `test:${email}`,
    email,
    email_verified: true,
    name,
  });
  const refreshToken = await issueRefreshToken(user.id, req.headers["user-agent"]);
  res.json({
    user: publicUser(user),
    accessToken: signAccessToken(user),
    refreshToken,
    expiresIn: config.accessTokenTtlSec,
    expiresAt: Date.now() + config.accessTokenTtlSec * 1000,
  });
});

// ─── POST /api/auth/refresh — rotate refresh token ───────────────────────────

authRouter.post("/refresh", async (req: Request, res: Response) => {
  const presented = typeof req.body?.refreshToken === "string" ? req.body.refreshToken : "";
  if (!presented) {
    res.status(400).json({ error: "refreshToken required" });
    return;
  }
  const rotated = await rotateRefreshToken(presented, req.headers["user-agent"]);
  if (!rotated) {
    res.status(401).json({ error: "Session expired. Please sign in again." });
    return;
  }
  const user = await prisma.user.findUnique({ where: { id: rotated.userId } });
  if (!user) {
    res.status(401).json({ error: "User not found" });
    return;
  }
  res.json({
    user: publicUser(user),
    accessToken: signAccessToken(user),
    refreshToken: rotated.refreshToken,
    expiresIn: config.accessTokenTtlSec,
    expiresAt: Date.now() + config.accessTokenTtlSec * 1000,
  });
});

// ─── GET /api/auth/me ────────────────────────────────────────────────────────

authRouter.get("/me", async (req: Request, res: Response) => {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!token) {
    res.status(401).json({ error: "Missing access token" });
    return;
  }
  const { verifyAccessToken } = await import("../lib/tokens.js");
  const claims = verifyAccessToken(token);
  if (!claims) {
    res.status(401).json({ error: "Invalid or expired access token" });
    return;
  }
  const user = await prisma.user.findUnique({ where: { id: claims.sub } });
  if (!user) {
    res.status(401).json({ error: "User not found" });
    return;
  }
  res.json({ user: publicUser(user) });
});

// ─── POST /api/auth/logout ───────────────────────────────────────────────────

authRouter.post("/logout", async (req: Request, res: Response) => {
  const refreshToken = typeof req.body?.refreshToken === "string" ? req.body.refreshToken : "";
  const all = req.body?.all === true;
  if (refreshToken) await revokeRefreshToken(refreshToken);
  if (all) {
    const authHeader = req.headers.authorization;
    const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (token) {
      const { verifyAccessToken } = await import("../lib/tokens.js");
      const claims = verifyAccessToken(token);
      if (claims) await revokeAllUserTokens(claims.sub);
    }
  }
  res.json({ ok: true });
});
