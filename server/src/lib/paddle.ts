// ============================================================
// Paddle Billing — webhook signature verification,
// checkout creation and entitlement grants.
//
// Paid access is granted ONLY here, from webhooks whose HMAC-SHA256
// signature (Paddle-Signature header, format: ts=<epoch>;h1=<hex>)
// verifies against PADDLE_WEBHOOK_SECRET. The HMAC input is the
// string "<ts>:<raw_body_utf8>". The client never sees secrets —
// it only receives a hosted Paddle checkout URL from the
// authenticated POST /api/billing/checkout endpoint.
//
// Paddle docs:
//   Webhooks:  https://developer.paddle.com/webhooks/overview
//   Signature: https://developer.paddle.com/webhooks/signature-verification
//   Checkout:  https://developer.paddle.com/api-reference/transactions/create-transaction
// ============================================================

import crypto from "node:crypto";
import { prisma } from "./prisma.js";
import { config } from "../config.js";
import { freeLimits, getUsage } from "./plans.js";

// ─── Webhook payload types (fields we consume) ───────────────────────────────

/** Top-level Paddle notification envelope. */
export interface PaddleWebhookBody {
  /** Unique per notification; Paddle uses the same event_id on retries. */
  event_id?: string;
  /** e.g. "transaction.completed", "subscription.created" */
  event_type?: string;
  occurred_at?: string;
  data?: PaddleEventData;
}

export interface PaddleEventData {
  /** txn_xxx, sub_xxx, … */
  id?: string;
  /** "completed" | "refunded" | "active" | "canceled" | "past_due" | "paused" | "trialing" */
  status?: string;
  customer_id?: string;
  /** Custom data attached when the checkout was created. */
  custom_data?: Record<string, unknown> | null;
  /** Transaction items — carries price_id. */
  items?: Array<{
    price?: { id?: string; product_id?: string };
    quantity?: number;
  }>;
  /** Transaction totals. */
  details?: {
    totals?: { grand_total?: string; currency_code?: string };
  };
  currency_code?: string;
  /** Customer object — embedded in transaction notifications. */
  customer?: { id?: string; email?: string };
  /** Subscription billing period. */
  current_billing_period?: { starts_at?: string | null; ends_at?: string | null } | null;
  /** Scheduled change (e.g. pending cancellation). */
  scheduled_change?: { action?: string; effective_at?: string } | null;
}

export interface WebhookResult {
  eventName: string;
  note: string;
}

/**
 * Subscription states that still carry access.
 * "canceled" is included so the paid period is honoured after a cancel request;
 * access actually expires when subscriptionEndsAt passes.
 */
const SUBSCRIPTION_ACCESS_STATUSES = ["active", "trialing", "past_due", "paused", "canceled"];

export class PaddleApiError extends Error {}

// ─── Signature ────────────────────────────────────────────────────────────────

/**
 * Verify a Paddle webhook signature.
 *
 * Paddle sends: `Paddle-Signature: ts=<epoch_secs>;h1=<hmac_hex>`
 * The HMAC is SHA-256 of the string `"<ts>:<raw_body_utf8>"`.
 * Timestamps more than 5 minutes old are rejected to prevent replay attacks.
 */
export function verifyWebhookSignature(
  rawBody: Buffer,
  signatureHeader: string | undefined,
): boolean {
  const secret = config.paddle.webhookSecret;
  if (!secret || !signatureHeader) return false;

  // Parse ts=...;h1=...
  let ts = "";
  let h1 = "";
  for (const part of signatureHeader.split(";")) {
    const [k, v] = part.split("=");
    if (k === "ts") ts = v ?? "";
    if (k === "h1") h1 = v ?? "";
  }
  if (!ts || !h1) return false;

  // Replay-attack guard: reject events older than 5 minutes
  const tsMs = parseInt(ts, 10) * 1000;
  if (Math.abs(Date.now() - tsMs) > 5 * 60 * 1000) return false;

  // HMAC over "<ts>:<raw_body>"
  const payload = `${ts}:${rawBody.toString("utf8")}`;
  const digest = crypto.createHmac("sha256", secret).update(payload).digest("hex");

  const a = Buffer.from(h1);
  const b = Buffer.from(digest);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// ─── Lifetime-deal ledger ─────────────────────────────────────────────────────

/** Granted lifetime deals. This count is what the deal limit enforces. */
export function lifetimeClaims(): Promise<number> {
  return prisma.purchase.count({ where: { kind: "lifetime", status: "granted" } });
}

export async function lifetimeRemaining(): Promise<number> {
  const claimed = await lifetimeClaims();
  return Math.max(0, config.paddle.lifetimeDealLimit - claimed);
}

/**
 * Record a lifetime transaction and — while slots remain — grant access.
 * Runs under a Postgres advisory lock so two concurrent webhooks can never
 * push grants past the limit. Replays (same providerOrderId, non-refunded)
 * are no-ops, making this fully idempotent.
 */
export async function grantLifetimePurchase(params: {
  userId: string | null;
  email: string;
  providerOrderId: string;
  providerPriceId: string;
  amountCents: number;
  currency: string;
}): Promise<"granted" | "limit_reached" | "unmatched"> {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('persona-studio-lifetime-deal-limit'))`;

    const existing = await tx.purchase.findUnique({ where: { providerOrderId: params.providerOrderId } });
    if (existing && existing.status !== "refunded") return existing.status as "granted" | "limit_reached" | "unmatched";

    // Unattributed transactions (no custom user_id, unknown email) still occupy
    // their place in the ledger but never grant access — operator must reconcile.
    if (!params.userId) {
      console.error(
        `[billing] lifetime transaction ${params.providerOrderId} could not be attributed to a user (email: ${params.email}) — reconcile manually`,
      );
    }

    const claimed = await tx.purchase.count({ where: { kind: "lifetime", status: "granted" } });
    const status: "granted" | "limit_reached" | "unmatched" = params.userId
      ? claimed < config.paddle.lifetimeDealLimit ? "granted" : "limit_reached"
      : "unmatched";

    const data = { ...params, status };
    if (existing) {
      await tx.purchase.update({ where: { id: existing.id }, data });
    } else {
      await tx.purchase.create({
        data: { provider: "paddle", kind: "lifetime", providerSubscriptionId: null, ...data },
      });
    }

    if (status === "granted" && params.userId) {
      await tx.user.update({ where: { id: params.userId }, data: { lifetimeAt: new Date() } });
    }
    return status;
  });
}

// ─── Subscriptions ────────────────────────────────────────────────────────────

export function hasActiveSubscription(u: {
  subscriptionStatus: string | null;
  subscriptionEndsAt: Date | null;
}): boolean {
  if (!u.subscriptionStatus || !SUBSCRIPTION_ACCESS_STATUSES.includes(u.subscriptionStatus)) return false;
  return !u.subscriptionEndsAt || u.subscriptionEndsAt.getTime() > Date.now();
}

/** Mirror Paddle subscription state onto the user + purchase ledger. */
export async function applySubscription(params: {
  userId: string | null;
  email: string;
  providerSubscriptionId: string;
  providerPriceId: string;
  status: string;
  endsAt: Date | null;
  amountCents: number;
  currency: string;
}): Promise<void> {
  const accessActive = hasActiveSubscription({
    subscriptionStatus: params.status,
    subscriptionEndsAt: params.endsAt,
  });

  await prisma.$transaction(async (tx) => {
    const existing = await tx.purchase.findUnique({ where: { providerSubscriptionId: params.providerSubscriptionId } });
    const purchaseData = {
      userId: params.userId,
      email: params.email,
      providerPriceId: params.providerPriceId,
      amountCents: params.amountCents,
      currency: params.currency,
      status: accessActive ? "granted" : "revoked",
    };
    if (existing) {
      await tx.purchase.update({ where: { id: existing.id }, data: purchaseData });
    } else {
      await tx.purchase.create({
        data: {
          provider: "paddle",
          kind: "monthly",
          providerOrderId: null,
          providerSubscriptionId: params.providerSubscriptionId,
          ...purchaseData,
        },
      });
    }
    if (params.userId) {
      await tx.user.update({
        where: { id: params.userId },
        data: {
          subscriptionStatus: params.status,
          subscriptionEndsAt: params.endsAt,
          subscriptionId: params.providerSubscriptionId,
        },
      });
    }
  });
}

// ─── Refunds ──────────────────────────────────────────────────────────────────

async function applyRefund(providerOrderId: string): Promise<string> {
  const purchase = await prisma.purchase.findUnique({ where: { providerOrderId } });
  if (!purchase) return "unknown-order";
  if (purchase.status !== "granted") {
    await prisma.purchase.update({ where: { id: purchase.id }, data: { status: "refunded" } });
    return `was-${purchase.status}`;
  }
  await prisma.purchase.update({ where: { id: purchase.id }, data: { status: "refunded" } });
  if (purchase.kind === "lifetime" && purchase.userId) {
    await prisma.user.update({ where: { id: purchase.userId }, data: { lifetimeAt: null } });
  }
  return "revoked";
}

// ─── Event routing ────────────────────────────────────────────────────────────

/** Resolve a user id from custom_data.user_id, then fall back to email lookup. */
async function resolveUserId(data: PaddleEventData): Promise<string | null> {
  const customId = data.custom_data?.user_id;
  if (typeof customId === "string" && customId) {
    const user = await prisma.user.findUnique({ where: { id: customId }, select: { id: true } });
    if (user) return user.id;
  }
  const email = data.customer?.email?.toLowerCase().trim();
  if (email) {
    const user = await prisma.user.findUnique({ where: { email }, select: { id: true } });
    if (user) return user.id;
  }
  return null;
}

/**
 * Process one verified Paddle webhook notification. Idempotent: the event
 * is stored under event_id (Paddle reuses the same id on retries) and
 * duplicates are silently dropped. Unknown events return 200 so Paddle
 * stops retrying them.
 */
export async function processWebhook(body: PaddleWebhookBody): Promise<WebhookResult> {
  const eventName = body.event_type ?? "";
  const data = body.data;
  if (!eventName || !data?.id) return { eventName, note: "malformed-payload" };

  // Deduplicate by Paddle event_id (guaranteed unique per notification).
  const dedupeKey = body.event_id ?? `${eventName}:${data.id}:${body.occurred_at ?? ""}`;
  try {
    await prisma.billingEvent.create({
      data: {
        id: dedupeKey,
        eventName,
        payload: body as unknown as import("@prisma/client").Prisma.InputJsonValue,
      },
    });
  } catch (err) {
    if ((err as { code?: string }).code === "P2002") return { eventName, note: "duplicate-ignored" };
    throw err;
  }

  switch (eventName) {
    // ── One-time purchase (lifetime deal) ────────────────────────────────────
    case "transaction.completed": {
      if (data.status !== "completed") return { eventName, note: `tx-status:${data.status ?? "unknown"}` };
      const priceId = data.items?.[0]?.price?.id ?? "";
      if (priceId !== config.paddle.lifetimePriceId) {
        return { eventName, note: `ignored-price:${priceId}` };
      }
      const userId = await resolveUserId(data);
      const email = data.customer?.email?.toLowerCase() ?? "";
      // Parse amount: Paddle sends totals as string cents e.g. "3900"
      const totalStr = data.details?.totals?.grand_total ?? "0";
      const amountCents = parseInt(totalStr, 10);
      const currency = data.currency_code ?? "USD";
      const status = await grantLifetimePurchase({
        userId,
        email,
        providerOrderId: data.id,
        providerPriceId: priceId,
        amountCents: isNaN(amountCents) ? 0 : amountCents,
        currency,
      });
      return { eventName, note: `lifetime:${status}` };
    }

    // ── Refund on a transaction ───────────────────────────────────────────────
    case "transaction.updated": {
      if (data.status !== "refunded") return { eventName, note: `tx-status-unchanged:${data.status ?? "unknown"}` };
      const note = await applyRefund(data.id);
      return { eventName, note: `refund:${note}` };
    }

    // ── Subscription lifecycle ────────────────────────────────────────────────
    case "subscription.created":
    case "subscription.updated":
    case "subscription.past_due":
    case "subscription.canceled": {
      const priceId = data.items?.[0]?.price?.id ?? "";
      if (priceId !== config.paddle.monthlyPriceId) {
        return { eventName, note: `ignored-price:${priceId}` };
      }
      const userId = await resolveUserId(data);
      const email = data.customer?.email?.toLowerCase() ?? "";
      const status = data.status ?? "active";
      // endsAt: end of current billing period (access continues until then)
      const endsAtStr = data.current_billing_period?.ends_at ?? null;
      const endsAt = endsAtStr ? new Date(endsAtStr) : null;
      // For canceled subscriptions Paddle may set ends_at to the period end;
      // use that so access is preserved until the last paid day.
      await applySubscription({
        userId,
        email,
        providerSubscriptionId: data.id,
        providerPriceId: priceId,
        status,
        endsAt,
        amountCents: 0, // subscription amount isn't critical; payment is via txn
        currency: "USD",
      });
      return {
        eventName,
        note: `subscription:${status}${userId ? "" : ":unattributed"}`,
      };
    }

    default:
      return { eventName, note: `ignored-event:${eventName}` };
  }
}

// ─── Checkout creation (server → Paddle Transactions API) ─────────────────────

/**
 * Create a Paddle-hosted checkout transaction for a signed-in user. The user id
 * rides in custom_data and comes back in every webhook, so access can only ever
 * be granted to the account that started the checkout.
 *
 * Returns the Paddle-hosted checkout page URL to redirect the buyer to.
 *
 * Paddle API reference:
 *   POST /transactions — https://developer.paddle.com/api-reference/transactions/create-transaction
 */
export async function createCheckout(params: {
  plan: "lifetime" | "monthly";
  user: { id: string; email: string; name: string };
}): Promise<string> {
  const p = config.paddle;
  const priceId = params.plan === "lifetime" ? p.lifetimePriceId : p.monthlyPriceId;
  const base = (p.redirectUrl || process.env.PUBLIC_BASE_URL || `http://localhost:${config.port}`).replace(/\/$/, "");

  const requestBody = {
    items: [{ price_id: priceId, quantity: 1 }],
    customer: { email: params.user.email },
    custom_data: { user_id: params.user.id, plan: params.plan },
    settings: {
      success_url: `${base}/?checkout=success`,
    },
  };

  const response = await fetch(`${p.apiBaseUrl}/transactions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${p.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(requestBody),
    signal: AbortSignal.timeout(20_000),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new PaddleApiError(`Paddle checkout creation failed (${response.status}): ${text.slice(0, 300)}`);
  }

  const json = (await response.json()) as {
    data?: { checkout?: { url?: string } };
  };
  const url = json.data?.checkout?.url;
  if (!url) throw new PaddleApiError("Paddle transaction response did not include checkout.url");
  return url;
}

// ─── Entitlements ─────────────────────────────────────────────────────────────

export async function getEntitlements(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { lifetimeAt: true, subscriptionStatus: true, subscriptionEndsAt: true },
  });
  if (!user) return null;
  const plan = user.lifetimeAt ? "lifetime" : hasActiveSubscription(user) ? "monthly" : "free";
  return {
    plan,
    limits: plan === "free" ? freeLimits : { characters: null, episodes: null, prompts: null, bulkScenes: null },
    usage: await getUsage(prisma, userId),
    lifetime: { active: user.lifetimeAt != null, since: user.lifetimeAt?.toISOString() ?? null },
    subscription: user.subscriptionStatus
      ? {
          active: hasActiveSubscription(user),
          status: user.subscriptionStatus,
          renewsAt: user.subscriptionEndsAt?.toISOString() ?? null,
        }
      : null,
  };
}
