// ============================================================
// Billing integration tests — webhook signature verification,
// lifetime grants with the deal limit, idempotent retries,
// subscription lifecycle and checkout guards.
// Runs against the local Postgres (DATABASE_URL in server/.env),
// same as integration.test.ts.
// ============================================================
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createHmac, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import fs from "node:fs";

if (fs.existsSync(".env")) process.loadEnvFile(".env");
const schema = `billing_${Date.now()}`;
const url = new URL(process.env.DATABASE_URL!);
url.searchParams.set("schema", schema);
process.env.DATABASE_URL = url.href;
process.env.JWT_SECRET = "test-only-signing-secret-which-is-long-enough";
process.env.ALLOW_TEST_LOGIN = "true";
process.env.NODE_ENV = "test";
process.env.ALLOWED_ORIGINS = "http://localhost:5173";
process.env.LEMONSQUEEZY_API_KEY = "test-api-key";
process.env.LEMONSQUEEZY_STORE_ID = "333";
process.env.LEMONSQUEEZY_WEBHOOK_SECRET = "test-webhook-signing-secret";
process.env.LEMONSQUEEZY_LIFETIME_VARIANT_ID = "111";
process.env.LEMONSQUEEZY_MONTHLY_VARIANT_ID = "222";
process.env.LIFETIME_DEAL_LIMIT = "2";
process.env.PUBLIC_BASE_URL = "http://localhost:3210";

const WEBHOOK_SECRET = process.env.LEMONSQUEEZY_WEBHOOK_SECRET;
let server: any, base: string, prisma: any;
const nativeFetch = globalThis.fetch;
const signedPost = async (path: string, payload: unknown, secret = WEBHOOK_SECRET) => {
  const raw = JSON.stringify(payload);
  const signature = createHmac("sha256", secret).update(raw).digest("hex");
  return nativeFetch(base + path, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Signature": signature },
    body: raw,
  });
};
let _seq = 0;
const uniqueStamp = () => new Date(Date.now() + (_seq++) * 1000).toISOString();
const orderCreated = (orderId: string, email: string, variantId = "111", userId?: string) => ({
  meta: { event_name: "order_created", ...(userId ? { custom_data: { user_id: userId } } : {}) },
  data: {
    type: "orders", id: orderId,
    attributes: {
      user_email: email, status: "paid", currency: "USD", total: 3900,
      first_order_item: { variant_id: variantId, price: 3900 },
      updated_at: uniqueStamp(),
    },
  },
});
const subscriptionEvent = (eventName: string, subId: string, status: string, email: string, userId?: string, extra: object = {}) => ({
  meta: { event_name: eventName, ...(userId ? { custom_data: { user_id: userId } } : {}) },
  data: {
    type: "subscriptions", id: subId,
    attributes: {
      user_email: email, status, currency: "USD", variant_id: "222",
      first_subscription_item: { price: 900 }, updated_at: uniqueStamp(), ...extra,
    },
  },
});

before(async () => {
  execFileSync(process.execPath, ["node_modules/prisma/build/index.js", "migrate", "deploy"], { env: process.env, stdio: "pipe" });
  ({ prisma } = await import("../src/lib/prisma.js"));
  const { createApp } = await import("../src/index.js");
  server = createApp().listen(0, "127.0.0.1");
  await new Promise<void>((r) => server.once("listening", r));
  base = `http://127.0.0.1:${server.address().port}`;
}, { timeout: 60000 });

after(async () => {
  globalThis.fetch = nativeFetch;
  if (server) await new Promise<void>((r) => server.close(r));
  if (prisma) { await prisma.$executeRawUnsafe(`DROP SCHEMA "${schema}" CASCADE`); await prisma.$disconnect(); }
});

test("billing config reports unconfigured → configured", async () => {
  const res = await nativeFetch(base + "/api/billing/config");
  assert.equal(res.status, 200);
  const json = await res.json();
  assert.equal(json.configured, true);
  assert.equal(json.lifetime.limit, 2);
  assert.equal(json.lifetime.remaining, 2);
});

test("webhook rejects invalid signatures", async () => {
  const bad = await nativeFetch(base + "/api/billing/webhook", {
    method: "POST", headers: { "Content-Type": "application/json", "X-Signature": "deadbeef" },
    body: JSON.stringify(orderCreated("o1", "x@example.test")),
  });
  assert.equal(bad.status, 401);
  const missing = await nativeFetch(base + "/api/billing/webhook", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
  assert.equal(missing.status, 401);
  const wrongSecret = await signedPost("/api/billing/webhook", orderCreated("o1", "x@example.test"), "not-the-secret");
  assert.equal(wrongSecret.status, 401);
});

test("signed order_created grants lifetime; retries are idempotent", async () => {
  const login = (await (await nativeFetch(base + "/api/auth/test-login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: "life@example.test" }) })).json());
  const payload = orderCreated("order-1", "life@example.test", "111", login.user.id);
  const grant = await signedPost("/api/billing/webhook", payload);
  assert.equal(grant.status, 200);

  const who = await nativeFetch(base + "/api/billing/entitlements", { headers: { Authorization: `Bearer ${login.accessToken}` } });
  assert.equal((await who.json()).lifetime.active, true);

  // Replay of the exact same payload must not double-count or double-grant
  await signedPost("/api/billing/webhook", payload);
  const purchases = await prisma.purchase.findMany({ where: { lsOrderId: "order-1" } });
  assert.equal(purchases.length, 1);
  const config = await (await nativeFetch(base + "/api/billing/config")).json();
  assert.equal(config.lifetime.claimed, 1);
  assert.equal(config.lifetime.remaining, 1);
});

test("lifetime deal limit is enforced server-side", async () => {
  const b = await (await nativeFetch(base + "/api/auth/test-login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: "b@example.test" }) })).json();
  const c = await (await nativeFetch(base + "/api/auth/test-login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: "c@example.test" }) })).json();
  await signedPost("/api/billing/webhook", orderCreated("order-2", "b@example.test", "111", b.user.id));
  // limit is 2 — this order takes the last slot
  assert.equal((await (await nativeFetch(base + "/api/billing/config")).json()).lifetime.remaining, 0);
  // third order arrives (paid before sold-out): recorded, but NOT granted
  await signedPost("/api/billing/webhook", orderCreated("order-3", "c@example.test", "111", c.user.id));
  const cEnt = await (await nativeFetch(base + "/api/billing/entitlements", { headers: { Authorization: `Bearer ${c.accessToken}` } })).json();
  assert.equal(cEnt.lifetime.active, false);
  const over = await prisma.purchase.findUnique({ where: { lsOrderId: "order-3" } });
  assert.equal(over.status, "limit_reached");
  // checkout endpoint also refuses once sold out
  const checkout = await nativeFetch(base + "/api/billing/checkout", {
    method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${c.accessToken}` },
    body: JSON.stringify({ plan: "lifetime" }),
  });
  assert.equal(checkout.status, 409);
});

test("refund revokes lifetime access and frees a slot", async () => {
  const b = await (await nativeFetch(base + "/api/auth/test-login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: "b@example.test" }) })).json();
  const refund = {
    meta: { event_name: "order_refunded" },
    data: {
      type: "orders", id: "order-2",
      attributes: { user_email: "b@example.test", status: "refunded", refunded: true, updated_at: new Date().toISOString() },
    },
  };
  await signedPost("/api/billing/webhook", refund);
  const bEnt = await (await nativeFetch(base + "/api/billing/entitlements", { headers: { Authorization: `Bearer ${b.accessToken}` } })).json();
  assert.equal(bEnt.lifetime.active, false);
  assert.equal((await (await nativeFetch(base + "/api/billing/config")).json()).lifetime.remaining, 1);
});

test("subscription lifecycle: active → cancelled (grace) → expired", async () => {
  const s = await (await nativeFetch(base + "/api/auth/test-login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: "sub@example.test" }) })).json();
  const ent = () => nativeFetch(base + "/api/billing/entitlements", { headers: { Authorization: `Bearer ${s.accessToken}` } }).then(r => r.json());
  const future = new Date(Date.now() + 7 * 864e5).toISOString();
  const past = new Date(Date.now() - 864e5).toISOString();

  await signedPost("/api/billing/webhook", subscriptionEvent("subscription_created", "sub-1", "active", "sub@example.test", s.user.id));
  assert.equal((await ent()).subscription.active, true);

  await signedPost("/api/billing/webhook", subscriptionEvent("subscription_updated", "sub-1", "cancelled", "sub@example.test", s.user.id, { ends_at: future, renews_at: future }));
  const cancelled = await ent();
  assert.equal(cancelled.subscription.active, true); // paid period continues
  assert.equal(cancelled.subscription.status, "cancelled");

  await signedPost("/api/billing/webhook", subscriptionEvent("subscription_updated", "sub-1", "expired", "sub@example.test", s.user.id, { ends_at: past }));
  assert.equal((await ent()).subscription.active, false);
});

test("checkout creates a Lemon Squeezy checkout with the buyer bound in custom data", async () => {
  const s = await (await nativeFetch(base + "/api/auth/test-login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: "sub@example.test" }) })).json();
  let captured: any;
  globalThis.fetch = async (input: any, init: any) => {
    if (String(input) === "https://api.lemonsqueezy.com/v1/checkouts") {
      captured = { url: String(input), body: JSON.parse(init.body), headers: init.headers };
      return Response.json({ data: { attributes: { url: "https://checkout.lemonsqueezy.com/buy/test" } } });
    }
    return nativeFetch(input, init);
  };
  const res = await nativeFetch(base + "/api/billing/checkout", {
    method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${s.accessToken}` },
    body: JSON.stringify({ plan: "monthly" }),
  });
  assert.equal(res.status, 200);
  assert.equal((await res.json()).url, "https://checkout.lemonsqueezy.com/buy/test");
  assert.equal(captured.body.data.relationships.variant.data.id, "222");
  assert.equal(captured.body.data.attributes.checkout_data.custom.user_id, s.user.id);
  assert.equal(captured.headers.Authorization, "Bearer test-api-key");
  assert.deepEqual(captured.body.data.relationships.store.data, { type: "stores", id: "333" });
  assert.deepEqual(captured.body.data.attributes.product_options.enabled_variants, [222]);
  assert.equal(captured.headers["Content-Type"], "application/vnd.api+json");
  assert.ok(captured.body.data.attributes.product_options.redirect_url.includes("/?checkout=success"));
  globalThis.fetch = nativeFetch;
});

test("already-entitled users cannot start a duplicate checkout", async () => {
  const login = await (await nativeFetch(base + "/api/auth/test-login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: "life@example.test" }) })).json();
  const res = await nativeFetch(base + "/api/billing/checkout", {
    method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${login.accessToken}` },
    body: JSON.stringify({ plan: "lifetime" }),
  });
  assert.equal(res.status, 409);
});

test("checkout endpoint degrades honestly when billing is unconfigured", async () => {
  const { config, billingConfigured } = await import("../src/config.js");
  const realKey = config.lemonsqueezy.apiKey;
  config.lemonsqueezy.apiKey = "";
  try {
    assert.equal(billingConfigured(), false);
    const token = (await (await nativeFetch(base + "/api/auth/test-login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: "sub@example.test" }) })).json()).accessToken;
    const res = await nativeFetch(base + "/api/billing/checkout", {
      method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ plan: "monthly" }),
    });
    assert.equal(res.status, 503);
    const body = await res.json();
    assert.deepEqual(body.missingVariables, ["LEMONSQUEEZY_API_KEY"]);
    assert.match(body.error, /Checkout setup incomplete.*LEMONSQUEEZY_API_KEY/);
    assert.ok(!JSON.stringify(body).includes("test-webhook-signing-secret"));
  } finally {
    config.lemonsqueezy.apiKey = realKey;
  }
  const noAuth = await nativeFetch(base + "/api/billing/checkout", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ plan: "monthly" }) });
  assert.equal(noAuth.status, 401);
  const badPlan = await nativeFetch(base + "/api/billing/checkout", {
    method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${(await (await nativeFetch(base + "/api/auth/test-login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: "life@example.test" }) })).json()).accessToken}` },
    body: JSON.stringify({ plan: "forever" }),
  });
  assert.equal(badPlan.status, 400);
});

test("unattributed lifetime orders are recorded but never grant access", async () => {
  const before = (await (await nativeFetch(base + "/api/billing/config")).json()).lifetime.claimed;
  await signedPost("/api/billing/webhook", orderCreated(`order-${randomUUID()}`, "stranger@example.test"));
  const after = (await (await nativeFetch(base + "/api/billing/config")).json()).lifetime.claimed;
  assert.equal(after, before);
});
