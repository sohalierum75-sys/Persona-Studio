// ============================================================
// Billing routes — public plan availability, authenticated
// checkout creation, entitlements, and the Lemon Squeezy
// webhook (mounted with a raw-body parser for HMAC verification).
// ============================================================
import { Router, Request, Response } from "express";
import { config, billingConfigured, billingMissingVariables } from "../config.js";
import { requireAuth, type AuthedRequest } from "../lib/sessions.js";
import { prisma } from "../lib/prisma.js";
import {
  verifyWebhookSignature, processWebhook, createCheckout,
  lifetimeClaims, lifetimeRemaining, getEntitlements, hasActiveSubscription,
  type LsWebhookBody,
} from "../lib/lemonsqueezy.js";

export const billingRouter = Router();
export const billingWebhookRouter = Router();

// ─── GET /api/billing/config — public plan availability ──────────────────────

billingRouter.get("/config", async (_req, res) => {
  const configured = billingConfigured();
  const claimed = configured ? await lifetimeClaims() : null;
  res.json({
    configured,
    missingVariables: billingMissingVariables(),
    lifetime: {
      limit: config.lemonsqueezy.lifetimeDealLimit,
      claimed,
      remaining: claimed === null ? null : Math.max(0, config.lemonsqueezy.lifetimeDealLimit - claimed),
    },
  });
});

// ─── GET /api/billing/entitlements — what the signed-in user owns ────────────

billingRouter.get("/entitlements", requireAuth, async (req, res) => {
  const entitlements = await getEntitlements((req as AuthedRequest).authUser.id);
  if (!entitlements) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  res.json(entitlements);
});

// ─── POST /api/billing/checkout — signed-in users get a checkout URL ─────────

billingRouter.post("/checkout", requireAuth, async (req, res) => {
  const plan = (req.body as { plan?: unknown } | undefined)?.plan;
  if (plan !== "lifetime" && plan !== "monthly") {
    res.status(400).json({ error: "plan must be \"lifetime\" or \"monthly\"" });
    return;
  }
  if (!billingConfigured()) {
    const missingVariables = billingMissingVariables();
    res.status(503).json({
      error: `Checkout setup incomplete. Set these server environment variables: ${missingVariables.join(", ")}.`,
      missingVariables,
    });
    return;
  }

  const user = await prisma.user.findUnique({ where: { id: (req as AuthedRequest).authUser.id } });
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  if (user.lifetimeAt) {
    res.status(409).json({ error: "You already have lifetime access." });
    return;
  }
  if (plan === "lifetime") {
    if ((await lifetimeRemaining()) <= 0) {
      res.status(409).json({ error: "The first-50 lifetime deal is sold out — the monthly plan is still available." });
      return;
    }
  } else if (hasActiveSubscription(user)) {
    res.status(409).json({ error: "You already have an active subscription." });
    return;
  }

  try {
    const url = await createCheckout({ plan, user: { id: user.id, email: user.email, name: user.name } });
    res.json({ url });
  } catch (err) {
    console.error("[billing] checkout creation failed:", err);
    res.status(502).json({ error: "Checkout could not be created. Please try again in a moment." });
  }
});

// ─── POST /api/billing/webhook — Lemon Squeezy → server ──────────────────────
// Mounted BEFORE express.json with express.raw: the HMAC is computed over the
// exact bytes Lemon Squeezy sent. Invalid signatures get 401; processing
// failures get 500 so Lemon Squeezy retries (idempotency makes that safe).

billingWebhookRouter.post("/", (req: Request, res: Response) => {
  const raw = req.body as Buffer;
  if (!Buffer.isBuffer(raw) || !verifyWebhookSignature(raw, req.header("X-Signature"))) {
    res.status(401).json({ error: "Invalid webhook signature" });
    return;
  }

  let body: LsWebhookBody;
  try {
    body = JSON.parse(raw.toString("utf8")) as LsWebhookBody;
  } catch {
    res.status(400).json({ error: "Invalid JSON body" });
    return;
  }

  processWebhook(body)
    .then((result) => {
      if (result.note !== "duplicate-ignored") console.log(`[billing] webhook ${result.eventName}: ${result.note}`);
      res.status(200).json({ ok: true });
    })
    .catch((err) => {
      console.error("[billing] webhook processing failed:", err);
      res.status(500).json({ error: "Webhook processing failed" });
    });
});
