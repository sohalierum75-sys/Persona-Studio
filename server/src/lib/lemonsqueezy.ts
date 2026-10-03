// ============================================================
// Lemon Squeezy billing — webhook signature verification,
// checkout creation and entitlement grants.
//
// Paid access is granted ONLY here, from webhooks whose HMAC-SHA256
// signature (X-Signature over the raw body) verifies against
// LEMONSQUEEZY_WEBHOOK_SECRET. Client-visible data never
// includes prices, variant ids or secrets — the client gets a
// checkout URL from the authenticated POST /api/billing/checkout.
// ============================================================
import crypto from "node:crypto";
import { prisma } from "./prisma.js";
import { config } from "../config.js";
import { freeLimits, getUsage } from "./plans.js";

// ─── Webhook payload types (only the fields we consume) ──────────────────────

export interface LsWebhookBody {
  meta?: {
    event_name?: string;
    custom_data?: Record<string, unknown>;
    test_mode?: boolean;
  };
  data?: {
    type?: string;
    id?: string;
    attributes?: {
      user_email?: string;
      user_name?: string;
      status?: string;
      currency?: string;
      total?: number;
      variant_id?: number | string;
      renews_at?: string | null;
      ends_at?: string | null;
      updated_at?: string;
      first_order_item?: { variant_id?: number | string; price?: number };
      first_subscription_item?: { price?: number } | null;
    };
  };
}

export interface WebhookResult {
  eventName: string;
  note: string;
}

/** Subscription states that still carry access (LS dunning/grace included). */
const SUBSCRIPTION_ACCESS_STATUSES = ["active", "on_trial", "cancelled", "past_due", "unpaid"];

export class LsApiError extends Error {}

// ─── Signature ────────────────────────────────────────────────────────────────

/** HMAC-SHA256 hex digest of the raw request body, timing-safe compared. */
export function verifyWebhookSignature(rawBody: Buffer, signature: string | undefined): boolean {
  const secret = config.lemonsqueezy.webhookSecret;
  if (!secret || !signature) return false;
  const digest = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
  const a = Buffer.from(signature);
  const b = Buffer.from(digest);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// ─── Lifetime-deal ledger ─────────────────────────────────────────────────────

/** Granted lifetime deals. This count is what the deal limit enforces against. */
export function lifetimeClaims(): Promise<number> {
  return prisma.purchase.count({ where: { kind: "lifetime", status: "granted" } });
}

export async function lifetimeRemaining(): Promise<number> {
  const claimed = await lifetimeClaims();
  return Math.max(0, config.lemonsqueezy.lifetimeDealLimit - claimed);
}

/**
 * Record a lifetime order and — while slots remain — grant access.
 * The check-and-insert runs under a transaction advisory lock so two
 * concurrent webhooks can never push grants past the limit. Replays of an
 * already-recorded order are no-ops (webhook idempotency is the first line
 * of defence; this is the second).
 */
export async function grantLifetimePurchase(params: {
  userId: string | null;
  email: string;
  lsOrderId: string;
  lsVariantId: string;
  amountCents: number;
  currency: string;
}): Promise<"granted" | "limit_reached" | "unmatched"> {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('persona-studio-lifetime-deal-limit'))`;

    const existing = await tx.purchase.findUnique({ where: { lsOrderId: params.lsOrderId } });
    if (existing && existing.status !== "refunded") return existing.status as "granted" | "limit_reached" | "unmatched";

    // Unattributed orders (no custom user_id, unknown email) still occupy
    // their place in the ledger but never grant access — an operator
    // reconciles them by hand. Logging makes that loud.
    if (!params.userId) {
      console.error(`[billing] lifetime order ${params.lsOrderId} could not be attributed to a user (email ${params.email}) — reconcile manually`);
    }
    const claimed = await tx.purchase.count({ where: { kind: "lifetime", status: "granted" } });
    const status = params.userId
      ? claimed < config.lemonsqueezy.lifetimeDealLimit ? "granted" : "limit_reached"
      : "unmatched";

    const data = { ...params, status };
    if (existing) {
      await tx.purchase.update({ where: { id: existing.id }, data });
    } else {
      await tx.purchase.create({ data: { provider: "lemonsqueezy", kind: "lifetime", ...data } });
    }

    if (status === "granted" && params.userId) {
      await tx.user.update({ where: { id: params.userId }, data: { lifetimeAt: new Date() } });
    }
    return status as "granted" | "limit_reached" | "unmatched";
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

/** Mirror the LS subscription state onto the user + purchase ledger. */
export async function applySubscription(params: {
  userId: string | null;
  email: string;
  lsSubscriptionId: string;
  lsVariantId: string;
  status: string;
  endsAt: Date | null;
  amountCents: number;
  currency: string;
}): Promise<void> {
  const accessActive = hasActiveSubscription({ subscriptionStatus: params.status, subscriptionEndsAt: params.endsAt });
  await prisma.$transaction(async (tx) => {
    const existing = await tx.purchase.findUnique({ where: { lsSubscriptionId: params.lsSubscriptionId } });
    const purchaseData = {
      userId: params.userId,
      email: params.email,
      lsVariantId: params.lsVariantId,
      amountCents: params.amountCents,
      currency: params.currency,
      status: accessActive ? "granted" : "revoked",
    };
    if (existing) {
      await tx.purchase.update({ where: { id: existing.id }, data: purchaseData });
    } else {
      await tx.purchase.create({
        data: { provider: "lemonsqueezy", kind: "monthly", lsOrderId: null, lsSubscriptionId: params.lsSubscriptionId, ...purchaseData },
      });
    }
    if (params.userId) {
      await tx.user.update({
        where: { id: params.userId },
        data: {
          subscriptionStatus: params.status,
          subscriptionEndsAt: params.endsAt,
          subscriptionId: params.lsSubscriptionId,
        },
      });
    }
  });
}

// ─── Refunds ──────────────────────────────────────────────────────────────────

async function applyRefund(lsOrderId: string): Promise<string> {
  const purchase = await prisma.purchase.findUnique({ where: { lsOrderId } });
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

async function resolveUserId(body: LsWebhookBody): Promise<string | null> {
  const customId = body.meta?.custom_data?.user_id;
  if (typeof customId === "string" && customId) {
    const user = await prisma.user.findUnique({ where: { id: customId }, select: { id: true } });
    if (user) return user.id;
  }
  const email = body.data?.attributes?.user_email?.toLowerCase().trim();
  if (email) {
    const user = await prisma.user.findUnique({ where: { email }, select: { id: true } });
    if (user) return user.id;
  }
  return null;
}

/**
 * Process one verified webhook. Idempotent: every event is stored under a
 * natural key (event + object id + updated_at) and retries are dropped.
 * Unknown events are acknowledged with 200 so Lemon Squeezy stops retrying.
 */
export async function processWebhook(body: LsWebhookBody): Promise<WebhookResult> {
  const eventName = body.meta?.event_name ?? "";
  const data = body.data;
  if (!eventName || !data?.type || !data.id) return { eventName, note: "malformed-payload" };
  const attrs = data.attributes ?? {};

  const dedupeKey = `${eventName}:${data.type}:${data.id}:${attrs.updated_at ?? ""}`;
  try {
    await prisma.billingEvent.create({
      data: { id: dedupeKey, eventName, payload: body as unknown as import("@prisma/client").Prisma.InputJsonValue },
    });
  } catch (err) {
    if ((err as { code?: string }).code === "P2002") return { eventName, note: "duplicate-ignored" };
    throw err;
  }

  switch (eventName) {
    case "order_created": {
      const variantId = String(attrs.first_order_item?.variant_id ?? "");
      if (variantId !== config.lemonsqueezy.lifetimeVariantId) return { eventName, note: `ignored-variant:${variantId}` };
      if (attrs.status !== "paid") return { eventName, note: `order-status:${attrs.status ?? "unknown"}` };
      const userId = await resolveUserId(body);
      const status = await grantLifetimePurchase({
        userId,
        email: attrs.user_email?.toLowerCase() ?? "",
        lsOrderId: data.id,
        lsVariantId: variantId,
        amountCents: attrs.first_order_item?.price ?? attrs.total ?? 0,
        currency: attrs.currency ?? "USD",
      });
      return { eventName, note: `lifetime:${status}` };
    }

    case "order_refunded": {
      const note = await applyRefund(data.id);
      return { eventName, note: `refund:${note}` };
    }

    case "subscription_created":
    case "subscription_updated": {
      const variantId = String(attrs.variant_id ?? "");
      if (variantId !== config.lemonsqueezy.monthlyVariantId) return { eventName, note: `ignored-variant:${variantId}` };
      const userId = await resolveUserId(body);
      await applySubscription({
        userId,
        email: attrs.user_email?.toLowerCase() ?? "",
        lsSubscriptionId: data.id,
        lsVariantId: variantId,
        status: attrs.status ?? "active",
        endsAt: attrs.ends_at ? new Date(attrs.ends_at) : null,
        amountCents: attrs.first_subscription_item?.price ?? 0,
        currency: attrs.currency ?? "USD",
      });
      return { eventName, note: `subscription:${attrs.status ?? "unknown"}${userId ? "" : ":unattributed"}` };
    }

    default:
      return { eventName, note: `ignored-event:${eventName}` };
  }
}

// ─── Checkout creation (server → Lemon Squeezy API) ──────────────────────────

/**
 * Create a Lemon Squeezy checkout for a signed-in user. The user id rides
 * in checkout custom data and comes back on every webhook, so access can
 * only ever be granted to the account that started the checkout.
 */
export async function createCheckout(params: {
  plan: "lifetime" | "monthly";
  user: { id: string; email: string; name: string };
}): Promise<string> {
  const ls = config.lemonsqueezy;
  const variantId = params.plan === "lifetime" ? ls.lifetimeVariantId : ls.monthlyVariantId;
  const base = ls.redirectUrl || `${(process.env.PUBLIC_BASE_URL ?? `http://localhost:${config.port}`).replace(/\/$/, "")}`;
  const response = await fetch(`${ls.apiBaseUrl}/checkouts`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${ls.apiKey}`,
      Accept: "application/vnd.api+json",
      "Content-Type": "application/vnd.api+json",
    },
    body: JSON.stringify({
      data: {
        type: "checkouts",
        attributes: {
          product_options: { redirect_url: `${base.replace(/\/$/, "")}/?checkout=success`, enabled_variants: [Number(variantId)] },
          checkout_data: {
            email: params.user.email,
            name: params.user.name,
            custom: { user_id: params.user.id, plan: params.plan },
          },
          preview: false,
        },
        relationships: {
          store: { data: { type: "stores", id: ls.storeId } },
          variant: { data: { type: "variants", id: variantId } },
        },
      },
    }),
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new LsApiError(`Lemon Squeezy checkout creation failed (${response.status}): ${text.slice(0, 300)}`);
  }
  const json = (await response.json()) as { data?: { attributes?: { url?: string } } };
  const url = json.data?.attributes?.url;
  if (!url) throw new LsApiError("Lemon Squeezy checkout response did not include a url");
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
