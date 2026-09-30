import jwt from "jsonwebtoken";
import crypto from "node:crypto";
import { config } from "../config.js";
import type { User } from "@prisma/client";

// ─── Access tokens (short-lived JWTs) ────────────────────────────────────────

export interface AccessClaims {
  sub: string;
  email: string;
  name: string;
}

export function signAccessToken(user: Pick<User, "id" | "email" | "name">): string {
  const claims: AccessClaims = { sub: user.id, email: user.email, name: user.name };
  return jwt.sign(claims, config.jwtSecret, {
    algorithm: "HS256",
    expiresIn: config.accessTokenTtlSec,
    issuer: "persona-studio-api",
  });
}

export function verifyAccessToken(token: string): AccessClaims | null {
  try {
    const decoded = jwt.verify(token, config.jwtSecret, {
      algorithms: ["HS256"],
      issuer: "persona-studio-api",
    });
    if (typeof decoded === "string") return null;
    const { sub, email, name } = decoded as AccessClaims;
    if (!sub || !email) return null;
    return { sub, email, name: name ?? "" };
  } catch {
    return null;
  }
}

// ─── Opaque one-time codes & refresh tokens (random, stored hashed) ──────────

export function randomToken(bytes = 32): string {
  return crypto.randomBytes(bytes).toString("base64url");
}

export function sha256(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

// ─── Signed OAuth state (HMAC) — carries client + redirect, expires ─────────

export interface OAuthState {
  p: string; // client PKCE challenge
  n: string;  // nonce
  c: "web" | "extension";
  r: string;  // validated client redirect URL
  exp: number;
}

export function signOAuthState(payload: OAuthState): string {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = crypto
    .createHmac("sha256", config.jwtSecret)
    .update(body)
    .digest("base64url");
  return `${body}.${sig}`;
}

export function verifyOAuthState(state: string): OAuthState | null {
  const dot = state.lastIndexOf(".");
  if (dot <= 0) return null;
  const body = state.slice(0, dot);
  const sig = state.slice(dot + 1);
  const expected = crypto
    .createHmac("sha256", config.jwtSecret)
    .update(body)
    .digest("base64url");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString()) as OAuthState;
    if (!payload.n || !payload.c || !payload.r || typeof payload.exp !== "number") return null;
    if (payload.exp < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}
