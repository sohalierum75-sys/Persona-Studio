import { Router } from "express";
import { config, billingConfigured, billingMissingVariables } from "../config.js";
import { requireAuth, type AuthedRequest } from "../lib/sessions.js";
import { prisma } from "../lib/prisma.js";
import { verifyWebhook, processWebhook, createCheckout, lifetimeClaims, lifetimeRemaining, getEntitlements, CheckoutError } from "../lib/dodo.js";

export const billingRouter = Router();
export const billingWebhookRouter = Router();
billingRouter.get("/config", async (_req, res) => {
  const configured = billingConfigured();
  res.json({ provider: "dodo", configured, environment: config.dodo.environment, missingVariables: billingMissingVariables(),
    lifetime: { limit: config.dodo.lifetimeDealLimit, claimed: configured ? await lifetimeClaims() : null, remaining: configured ? await lifetimeRemaining() : null } });
});
billingRouter.get("/entitlements", requireAuth, async (req, res) => {
  const ent = await getEntitlements((req as AuthedRequest).authUser.id);
  res.status(ent ? 200 : 404).json(ent ?? { error: "User not found" });
});
billingRouter.post("/checkout", requireAuth, async (req, res) => {
  const plan = req.body?.plan;
  if (plan !== "lifetime" && plan !== "monthly") { res.status(400).json({ error: 'plan must be "lifetime" or "monthly"' }); return; }
  if (!billingConfigured()) { res.status(503).json({ error: "Checkout setup incomplete.", missingVariables: billingMissingVariables() }); return; }
  const user = await prisma.user.findUnique({ where: { id: (req as AuthedRequest).authUser.id } });
  if (!user) { res.status(404).json({ error: "User not found" }); return; }
  try { res.json({ url: await createCheckout({ plan, user }) }); }
  catch (err) {
    // SDK exceptions can contain request headers/bodies. Never serialize or log them.
    res.status(err instanceof CheckoutError ? err.status : 502).json({ error: err instanceof CheckoutError ? err.message : "Checkout could not be created. Please try again shortly or contact support." });
  }
});
// index.ts mounts express.raw BEFORE express.json. Return URLs never grant access.
billingWebhookRouter.post("/", async (req, res) => {
  if (!Buffer.isBuffer(req.body)) { res.status(400).json({ error: "Raw body required" }); return; }
  const headers = Object.fromEntries(["webhook-id", "webhook-signature", "webhook-timestamp"].map(key => [key, req.header(key) ?? ""]));
  let event: unknown;
  try { event = verifyWebhook(req.body, headers); }
  catch { res.status(401).json({ error: "Invalid webhook signature" }); return; }
  try { await processWebhook(event, headers["webhook-id"]); res.json({ ok: true }); }
  catch { res.status(500).json({ error: "Webhook processing failed" }); }
});
