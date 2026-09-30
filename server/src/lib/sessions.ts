// ============================================================
// Session lifecycle — refresh tokens and one-time auth codes
// ============================================================
import { Request, Response, NextFunction } from "express";
import { prisma } from "./prisma.js";
import { config } from "../config.js";
import { randomToken, sha256, verifyAccessToken } from "./tokens.js";
import type { User } from "@prisma/client";

// ─── Refresh tokens ──────────────────────────────────────────────────────────

export async function issueRefreshToken(userId: string, userAgent?: string): Promise<string> {
  const token = randomToken(32);
  await prisma.refreshToken.create({
    data: {
      tokenHash: sha256(token),
      userId,
      userAgent: userAgent?.slice(0, 200),
      expiresAt: new Date(Date.now() + config.refreshTokenTtlSec * 1000),
    },
  });
  return token;
}

/** Rotate: revoke the presented token and mint a fresh pair. */
export async function rotateRefreshToken(
  presented: string,
  userAgent?: string
): Promise<{ userId: string; refreshToken: string } | null> {
  return prisma.$transaction(async tx => {
    const existing = await tx.refreshToken.findUnique({where:{tokenHash:sha256(presented)}});
    if (!existing) return null;
    const claimed = await tx.refreshToken.updateMany({where:{id:existing.id,revokedAt:null,expiresAt:{gt:new Date()}},data:{revokedAt:new Date()}});
    if (claimed.count !== 1) return null;
    const refreshToken = randomToken(32);
    await tx.refreshToken.create({data:{userId:existing.userId,tokenHash:sha256(refreshToken),userAgent:userAgent?.slice(0,200),expiresAt:new Date(Date.now()+config.refreshTokenTtlSec*1000)}});
    return {userId:existing.userId,refreshToken};
  });
}

export async function revokeRefreshToken(presented: string): Promise<void> {
  await prisma.refreshToken.updateMany({
    where: { tokenHash: sha256(presented), revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

export async function revokeAllUserTokens(userId: string): Promise<void> {
  await prisma.refreshToken.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

// ─── One-time auth codes ─────────────────────────────────────────────────────

export async function issueAuthCode(userId: string, challenge: string): Promise<string> {
  const code = randomToken(32);
  await prisma.authCode.create({
    data: {
      codeHash: sha256(code), challenge,
      userId,
      expiresAt: new Date(Date.now() + 120_000), // 2 minutes
    },
  });
  return code;
}

export async function consumeAuthCode(code: string, verifier: string): Promise<string | null> {
  if (!/^[A-Za-z0-9_-]{43,128}$/.test(verifier)) return null;
  const challenge = Buffer.from(sha256(verifier), "hex").toString("base64url");
  return prisma.$transaction(async tx => {
    const row = await tx.authCode.findUnique({where:{codeHash:sha256(code)}});
    if (!row || row.challenge !== challenge) return null;
    const claimed = await tx.authCode.updateMany({where:{id:row.id,usedAt:null,expiresAt:{gt:new Date()}},data:{usedAt:new Date()}});
    return claimed.count === 1 ? row.userId : null;
  });
}

// ─── Google identity → internal user (same identity = same user, everywhere) ─

export async function upsertUserFromGoogle(profile: {
  sub: string;
  email: string;
  email_verified?: boolean;
  name?: string;
  picture?: string;
}): Promise<User> {
  if (!profile.sub || !profile.email || profile.email_verified !== true) throw new Error("Verified Google identity required");
  const email = profile.email.toLowerCase();
  const name = profile.name?.trim() || email.split("@")[0];
  return prisma.user.upsert({where:{googleId:profile.sub},create:{googleId:profile.sub,email,emailVerified:true,name,avatarUrl:profile.picture ?? null,lastLoginAt:new Date()},update:{email,name,avatarUrl:profile.picture ?? null,lastLoginAt:new Date()}});
}

// ─── Auth middleware ─────────────────────────────────────────────────────────

export interface AuthedRequest extends Request {
  authUser: { id: string; email: string; name: string };
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  const token = header?.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) {
    res.status(401).json({ error: "Missing access token" });
    return;
  }
  const claims = verifyAccessToken(token);
  if (!claims) {
    res.status(401).json({ error: "Invalid or expired access token" });
    return;
  }
  (req as AuthedRequest).authUser = { id: claims.sub, email: claims.email, name: claims.name };
  next();
}

/** Bearer token OR ?access_token= (for EventSource, which cannot set headers) */
export function requireAuthFlexible(req: Request, res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  const token = header?.startsWith("Bearer ")
    ? header.slice(7)
    : typeof req.query.access_token === "string"
      ? req.query.access_token
      : null;
  if (!token) {
    res.status(401).json({ error: "Missing access token" });
    return;
  }
  const claims = verifyAccessToken(token);
  if (!claims) {
    res.status(401).json({ error: "Invalid or expired access token" });
    return;
  }
  (req as AuthedRequest).authUser = { id: claims.sub, email: claims.email, name: claims.name };
  next();
}
