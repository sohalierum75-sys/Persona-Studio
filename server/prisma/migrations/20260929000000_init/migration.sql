-- ============================================================
-- Persona Studio API — initial schema
-- ============================================================

-- ── Users ────────────────────────────────────────────────────
CREATE TABLE "User" (
    "id"            TEXT NOT NULL,
    "email"         TEXT NOT NULL,
    "emailVerified" BOOLEAN NOT NULL DEFAULT false,
    "name"          TEXT NOT NULL,
    "avatarUrl"     TEXT,
    "googleId"      TEXT NOT NULL,
    "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"     TIMESTAMP(3) NOT NULL,
    "lastLoginAt"   TIMESTAMP(3),

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "User_email_key"    ON "User"("email");
CREATE UNIQUE INDEX "User_googleId_key" ON "User"("googleId");

-- ── Refresh tokens (hashed, rotated) ─────────────────────────
CREATE TABLE "RefreshToken" (
    "id"           TEXT NOT NULL,
    "tokenHash"    TEXT NOT NULL,
    "userId"       TEXT NOT NULL,
    "userAgent"    TEXT,
    "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt"    TIMESTAMP(3) NOT NULL,
    "revokedAt"    TIMESTAMP(3),
    "replacedById" TEXT,

    CONSTRAINT "RefreshToken_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "RefreshToken_tokenHash_key" ON "RefreshToken"("tokenHash");
CREATE INDEX "RefreshToken_userId_idx" ON "RefreshToken"("userId");

-- ── Single-use OAuth handshake codes ─────────────────────────
CREATE TABLE "AuthCode" (
    "id"        TEXT NOT NULL,
    "codeHash"  TEXT NOT NULL,
    "userId"    TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt"    TIMESTAMP(3),

    CONSTRAINT "AuthCode_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "AuthCode_codeHash_key" ON "AuthCode"("codeHash");
CREATE INDEX "AuthCode_userId_idx" ON "AuthCode"("userId");

-- ── User-owned records (versioned JSON documents) ────────────
CREATE TABLE "Entity" (
    "id"        TEXT NOT NULL,
    "userId"    TEXT NOT NULL,
    "kind"      TEXT NOT NULL,
    "data"      JSONB NOT NULL,
    "version"   INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Entity_pkey" PRIMARY KEY ("userId", "id")
);
CREATE INDEX "Entity_userId_kind_idx"      ON "Entity"("userId", "kind");
CREATE INDEX "Entity_userId_updatedAt_idx" ON "Entity"("userId", "updatedAt");

-- ── Per-record version history ───────────────────────────────
CREATE TABLE "EntityVersion" (
    "id"       TEXT NOT NULL,
    "userId"   TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "kind"     TEXT NOT NULL,
    "version"  INTEGER NOT NULL,
    "data"     JSONB NOT NULL,
    "savedAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EntityVersion_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "EntityVersion_userId_entityId_version_key"
    ON "EntityVersion"("userId", "entityId", "version");
CREATE INDEX "EntityVersion_userId_entityId_idx" ON "EntityVersion"("userId", "entityId");

-- ── Foreign keys ─────────────────────────────────────────────
ALTER TABLE "RefreshToken" ADD CONSTRAINT "RefreshToken_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AuthCode" ADD CONSTRAINT "AuthCode_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Entity" ADD CONSTRAINT "Entity_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EntityVersion" ADD CONSTRAINT "EntityVersion_entity_fkey"
    FOREIGN KEY ("userId", "entityId") REFERENCES "Entity"("userId", "id")
    ON DELETE CASCADE ON UPDATE CASCADE;
