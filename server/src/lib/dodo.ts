import DodoPayments from "dodopayments";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { prisma } from "./prisma.js";
import { config, billingConfigured, billingReturnUrl } from "../config.js";
import { freeLimits, getUsage } from "./plans.js";

type Tx = Prisma.TransactionClient;
export class CheckoutError extends Error {
  constructor(message: string, public status = 502) { super(message); }
}
export function dodoClient() {
  return new DodoPayments({ bearerToken: config.dodo.apiKey, webhookKey: config.dodo.webhookSecret,
    environment: config.dodo.environment, maxRetries: 0, timeout: 15_000, logLevel: "off" });
}
// Every billing write shares this transaction lock. Receipts, capacity and access
// commit together; crashes roll everything back and Dodo can safely retry.
async function lock(tx: Tx) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('persona-studio-lifetime-deal-limit'))`;
}
export function hasActiveSubscription(u: { subscriptionStatus: string | null; subscriptionEndsAt: Date | null }): boolean {
  // Preserve historical access semantics. New Dodo states always carry an end date.
  return !!u.subscriptionStatus && ["active", "trialing", "past_due", "paused", "canceled"].includes(u.subscriptionStatus)
    && (!u.subscriptionEndsAt || u.subscriptionEndsAt.getTime() > Date.now());
}
export function lifetimeClaims() {
  // Refunded purchases still consumed a first-50 offer; do not resell that slot.
  return prisma.purchase.count({ where: { kind: "lifetime", status: { in: ["granted", "refunded", "disputed"] } } });
}
async function remaining(tx: Tx) {
  const claimed = await tx.purchase.count({ where: { kind: "lifetime", status: { in: ["granted", "refunded", "disputed"] } } });
  const held = await tx.billingCheckout.count({ where: { plan: "lifetime", status: "reserved" } });
  // Also count legacy entitlement-only accounts conservatively.
  const unledgered = await tx.user.count({ where: { lifetimeAt: { not: null }, purchases: { none: { kind: "lifetime", status: { in: ["granted", "refunded", "disputed"] } } } } });
  return Math.max(0, config.dodo.lifetimeDealLimit - claimed - held - unledgered);
}
export function lifetimeRemaining() { return remaining(prisma); }

export async function createCheckout(params: { plan: "lifetime" | "monthly"; user: { id: string; email: string; name: string } }): Promise<string> {
  if (!billingConfigured()) throw new CheckoutError("Checkout setup incomplete", 503);
  let returnUrl: string;
  try { returnUrl = billingReturnUrl(); }
  catch { throw new CheckoutError("Checkout setup incomplete: DODO_RETURN_BASE_URL must match PUBLIC_BASE_URL.", 503); }
  const { plan, user } = params;
  const p = config.dodo;
  const productId = plan === "lifetime" ? p.lifetimeProductId : p.monthlyProductId;
  const client = dodoClient();
  // Read the authoritative catalog. Never override amounts from the browser.
  const product = await client.products.retrieve(productId);
  const price = product.price;
  const valid = price.currency === "USD" && price.type !== "usage_based_price"
    && price.price === (plan === "lifetime" ? 3900 : 900)
    && !price.discount && !price.discount_bps && !price.purchasing_power_parity
    && (plan === "lifetime" ? price.type === "one_time_price" && !price.pay_what_you_want
      : price.type === "recurring_price" && price.payment_frequency_count === 1 && price.payment_frequency_interval === "Month" && !price.trial_period_days);
  if (!valid) throw new CheckoutError("Dodo product does not match the configured $39 lifetime or $9 monthly plan.", 503);
  const attempt = await prisma.$transaction(async tx => {
    await lock(tx);
    const account = await tx.user.findUniqueOrThrow({ where: { id: user.id } });
    if (account.lifetimeAt) throw new CheckoutError("You already have lifetime access.", 409);
    if (plan === "monthly" && hasActiveSubscription(account)) throw new CheckoutError("You already have an active subscription.", 409);
    const existing = await tx.billingCheckout.findFirst({ where: { userId: user.id, plan, environment: p.environment, status: "reserved" } });
    if (existing) {
      if (existing.productId !== productId) throw new CheckoutError("An earlier checkout needs support review.", 409);
      if (existing.url) return existing;
      // A timed-out create may have succeeded remotely. Never silently create a
      // second payable session; reconcile the durable attempt in the dashboard.
      throw new CheckoutError("Your checkout is being prepared or needs support review. Please try again shortly.", 409);
    }
    if (plan === "lifetime" && await remaining(tx) <= 0) throw new CheckoutError("The first-50 lifetime offer is sold out or reserved. The monthly plan is still available.", 409);
    return tx.billingCheckout.create({ data: { userId: user.id, plan, productId, environment: p.environment } });
  });
  if (attempt.url) return attempt.url;
  // Deliberately outside the DB transaction; the durable reservation survives
  // an ambiguous network failure. No secrets or SDK errors are logged.
  const session = await client.checkoutSessions.create({
    product_cart: [{ product_id: productId, quantity: 1 }],
    customer: { email: user.email, name: user.name },
    metadata: { user_id: user.id, plan, checkout_id: attempt.id },
    return_url: returnUrl,
    feature_flags: { allow_discount_code: false },
  });
  const url = session.checkout_url;
  if (!url || !isDodoCheckoutUrl(url)) throw new CheckoutError("Dodo did not return a valid hosted checkout URL.");
  await prisma.billingCheckout.update({ where: { id: attempt.id }, data: { sessionId: session.session_id, url } });
  return url;
}
export function isDodoCheckoutUrl(raw: string): boolean {
  try { const u = new URL(raw); return u.protocol === "https:" && !u.username && !u.password && (u.hostname === "checkout.dodopayments.com" || u.hostname === "test.checkout.dodopayments.com"); } catch { return false; }
}

const envelope = z.object({ type: z.string(), timestamp: z.string().datetime({ offset: true }), data: z.record(z.unknown()) });
const metadata = z.object({ user_id: z.string().min(1), checkout_id: z.string().min(1), plan: z.enum(["lifetime", "monthly"]) });
const date = z.string().datetime({ offset: true }).transform(v => new Date(v));
const payment = z.object({ payment_id: z.string().min(1), status: z.literal("succeeded"), metadata,
  product_cart: z.array(z.object({ product_id: z.string(), quantity: z.number().int() })).nullish(),
  total_amount: z.number().int().nonnegative(), currency: z.string(), created_at: date,
  subscription_id: z.string().nullish(), customer: z.object({ email: z.string() }) });
const subscription = z.object({ subscription_id: z.string().min(1), product_id: z.string(), status: z.string(), metadata,
  previous_billing_date: date, next_billing_date: date, customer: z.object({ email: z.string() }) });
const refund = z.object({ refund_id: z.string().min(1), payment_id: z.string().min(1), status: z.literal("succeeded"),
  amount: z.number().int().nonnegative().nullish(), is_partial: z.boolean() });
const dispute = z.object({ dispute_id: z.string().min(1), payment_id: z.string().min(1),
  dispute_status: z.enum(["dispute_opened", "dispute_challenged", "dispute_accepted", "dispute_lost", "dispute_expired", "dispute_won", "dispute_cancelled"]) });

async function disputed(tx: Tx, paymentId: string) {
  return await tx.dodoDispute.count({ where: { paymentId, status: { notIn: ["dispute_won", "dispute_cancelled"] } } }) > 0;
}

export function verifyWebhook(raw: Buffer, headers: Record<string, string>) {
  if (!config.dodo.webhookSecret || !headers["webhook-id"] || !headers["webhook-timestamp"] || !headers["webhook-signature"]) throw new Error("Missing signature");
  // unwrap WITHOUT headers skips verification in the SDK. Always supply all three.
  return dodoClient().webhooks.unwrap(raw.toString("utf8"), { headers });
}
async function attributed(tx: Tx, m: z.infer<typeof metadata>, kind: string, productId: string) {
  const attempt = await tx.billingCheckout.findUnique({ where: { id: m.checkout_id } });
  if (!attempt || attempt.userId !== m.user_id || attempt.plan !== kind || m.plan !== kind || attempt.productId !== productId || attempt.environment !== config.dodo.environment) return null;
  return await tx.user.findUnique({ where: { id: attempt.userId } }) ? attempt : null;
}
async function fullyRefunded(tx: Tx, id: string, amount: number) {
  const rows = await tx.dodoRefund.findMany({ where: { paymentId: id } });
  return rows.some(r => r.full) || (rows.length > 0 && rows.reduce((n, r) => n + r.amount, 0) >= amount);
}
async function refreshSubscription(tx: Tx, id: string) {
  const s = await tx.dodoSubscription.findUnique({ where: { id } });
  if (!s) return;
  const latest = await tx.dodoPayment.findFirst({ where: { subscriptionId: id }, orderBy: { paidAt: "desc" } });
  const refunded = latest && await fullyRefunded(tx, latest.id, latest.amount);
  const status = refunded ? "refunded" : latest && await disputed(tx, latest.id) ? "disputed" : s.status;
  const user = await tx.user.findUnique({ where: { id: s.userId } });
  if (!user) return;
  // Do not let an old subscription overwrite another paid subscription, including legacy ones.
  if (user.subscriptionId && user.subscriptionId !== id && hasActiveSubscription(user)) return;
  await tx.user.update({ where: { id: s.userId }, data: { subscriptionId: id, subscriptionStatus: status, subscriptionEndsAt: s.periodEnd } });
  await tx.purchase.updateMany({ where: { provider: "dodo", providerSubscriptionId: id }, data: { status: hasActiveSubscription({ subscriptionStatus: status, subscriptionEndsAt: s.periodEnd }) ? "granted" : "revoked" } });
}
async function reconcileRefund(tx: Tx, paymentId: string) {
  const p = await tx.dodoPayment.findUnique({ where: { id: paymentId } });
  if (!p || !await fullyRefunded(tx, p.id, p.amount)) return;
  await tx.purchase.updateMany({ where: { provider: "dodo", providerOrderId: p.id }, data: { status: "refunded" } });
  if (p.kind === "lifetime") {
    const other = await tx.purchase.count({ where: { userId: p.userId, kind: "lifetime", status: "granted" } });
    if (!other) await tx.user.update({ where: { id: p.userId }, data: { lifetimeAt: null } });
  } else if (p.subscriptionId) await refreshSubscription(tx, p.subscriptionId);
}
async function reconcileDispute(tx: Tx, paymentId: string) {
  const p = await tx.dodoPayment.findUnique({ where: { id: paymentId } });
  if (!p) return;
  if (await fullyRefunded(tx, p.id, p.amount)) { await reconcileRefund(tx, p.id); return; }
  const blocked = await disputed(tx, p.id);
  // Only restore purchases previously suspended by a dispute; never promote a
  // rejected extra lifetime payment or overwrite an unrelated entitlement.
  await tx.purchase.updateMany({ where: { provider: "dodo", providerOrderId: p.id, status: { in: ["granted", "disputed"] } }, data: { status: blocked ? "disputed" : "granted" } });
  if (p.kind === "lifetime") {
    const granted = await tx.purchase.findFirst({ where: { userId: p.userId, kind: "lifetime", status: "granted" } });
    if (blocked && !granted) await tx.user.update({ where: { id: p.userId }, data: { lifetimeAt: null } });
    if (!blocked && granted) await tx.user.update({ where: { id: p.userId }, data: { lifetimeAt: granted.createdAt } });
  } else if (p.subscriptionId) await refreshSubscription(tx, p.subscriptionId);
}
export async function processWebhook(verified: unknown, webhookId: string) {
  const body = envelope.parse(verified);
  const eventName = body.type;
  if (!webhookId) throw new Error("Missing webhook id");
  return prisma.$transaction(async tx => {
    await lock(tx);
    const key = `dodo:${config.dodo.environment}:${webhookId}`;
    if (await tx.billingEvent.findUnique({ where: { id: key } })) return { eventName, note: "duplicate-ignored" };
    let note = "ignored";
    if (eventName === "payment.succeeded") {
      // Unknown products and non-app payments cannot grant access, even by email.
      const parsed = payment.safeParse(body.data);
      if (!parsed.success) throw new Error("Invalid payment payload");
      const d = parsed.data;
      if ((d.product_cart?.length === 1 && d.product_cart[0].quantity === 1) || (!d.product_cart?.length && d.subscription_id && d.metadata.plan === "monthly")) {
        const productId = d.product_cart?.[0]?.product_id ?? config.dodo.monthlyProductId;
        const kind = d.metadata.plan;
        const attempt = await attributed(tx, d.metadata, kind, productId);
        if (attempt && !await tx.dodoPayment.findUnique({ where: { id: d.payment_id } })) {
          const refunded = await fullyRefunded(tx, d.payment_id, d.total_amount);
          await tx.dodoPayment.create({ data: { id: d.payment_id, userId: attempt.userId, kind, subscriptionId: d.subscription_id, amount: d.total_amount, currency: d.currency, paidAt: d.created_at } });
          // A reservation can grant at most one lifetime purchase, even if an
          // external checkout unexpectedly yields more than one successful payment.
          const status = refunded ? "refunded" : kind === "lifetime" && attempt.status !== "reserved" ? "limit_reached" : "granted";
          await tx.purchase.create({ data: { provider: "dodo", kind, status, userId: attempt.userId, email: d.customer.email,
            providerOrderId: d.payment_id, providerPriceId: productId, amountCents: d.total_amount, currency: d.currency } });
          if (kind === "lifetime") {
            if (status === "granted") await tx.user.update({ where: { id: attempt.userId }, data: { lifetimeAt: d.created_at } });
            await tx.billingCheckout.update({ where: { id: attempt.id }, data: { status: "consumed" } });
          } else if (d.subscription_id) await refreshSubscription(tx, d.subscription_id);
          await reconcileDispute(tx, d.payment_id);
          note = status;
        }
      }
    } else if (eventName.startsWith("subscription.")) {
      const d = subscription.parse(body.data);
      const existing = await tx.dodoSubscription.findUnique({ where: { id: d.subscription_id } });
      const attempt = await attributed(tx, d.metadata, "monthly", existing ? (await tx.billingCheckout.findUnique({ where: { id: d.metadata.checkout_id } }))?.productId ?? d.product_id : d.product_id);
      const at = new Date(body.timestamp);
      if (attempt && (!existing || at > existing.eventAt)) {
        const status = d.product_id !== config.dodo.monthlyProductId ? "unknown_product" : d.status === "cancelled" ? "canceled" : d.status === "paused" ? "on_hold" : d.status;
        const state = { userId: attempt.userId, productId: d.product_id, status, periodStart: d.previous_billing_date, periodEnd: d.next_billing_date, eventAt: at };
        await tx.dodoSubscription.upsert({ where: { id: d.subscription_id }, create: { id: d.subscription_id, ...state }, update: state });
        await tx.purchase.upsert({ where: { providerSubscriptionId: d.subscription_id }, create: { provider: "dodo", kind: "monthly", status: "revoked", userId: attempt.userId, email: d.customer.email, providerSubscriptionId: d.subscription_id, providerPriceId: d.product_id, amountCents: 0, currency: "USD" }, update: { providerPriceId: d.product_id } });
        await refreshSubscription(tx, d.subscription_id);
        await tx.billingCheckout.update({ where: { id: attempt.id }, data: { status: "consumed" } });
        note = status;
      }
    } else if (eventName.startsWith("dispute.")) {
      const d = dispute.parse(body.data);
      if (d.dispute_status !== eventName.replace(".", "_")) throw new Error("Inconsistent dispute event");
      const existing = await tx.dodoDispute.findUnique({ where: { id: d.dispute_id } });
      const at = new Date(body.timestamp);
      if (existing && existing.paymentId !== d.payment_id) throw new Error("Dispute payment changed");
      if (!existing || at > existing.eventAt) {
        const state = { paymentId: d.payment_id, status: d.dispute_status, eventAt: at };
        await tx.dodoDispute.upsert({ where: { id: d.dispute_id }, create: { id: d.dispute_id, ...state }, update: state });
        await reconcileDispute(tx, d.payment_id);
      }
      note = "dispute-recorded";
    } else if (eventName === "refund.succeeded") {
      const d = refund.parse(body.data);
      if (d.is_partial && d.amount == null) throw new Error("Partial refund is missing amount");
      await tx.dodoRefund.upsert({ where: { id: d.refund_id }, create: { id: d.refund_id, paymentId: d.payment_id, amount: d.amount ?? 0, full: !d.is_partial }, update: {} });
      await reconcileRefund(tx, d.payment_id);
      note = "refund-recorded";
    }
    await tx.billingEvent.create({ data: { id: key, eventName, payload: body as Prisma.InputJsonValue } });
    return { eventName, note };
  }, { timeout: 15_000, maxWait: 15_000 });
}

export async function getEntitlements(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return null;
  const plan = user.lifetimeAt ? "lifetime" : hasActiveSubscription(user) ? "monthly" : "free";
  return { plan, limits: plan === "free" ? freeLimits : { characters: null, episodes: null, prompts: null, bulkScenes: null },
    usage: await getUsage(prisma, userId), lifetime: { active: !!user.lifetimeAt, since: user.lifetimeAt?.toISOString() ?? null },
    subscription: user.subscriptionStatus ? { active: hasActiveSubscription(user), status: user.subscriptionStatus, renewsAt: user.subscriptionEndsAt?.toISOString() ?? null } : null };
}
