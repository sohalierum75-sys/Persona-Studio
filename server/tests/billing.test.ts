// ============================================================
// Billing integration tests — Paddle webhook signature verification,
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
process.env.PADDLE_ENVIRONMENT = "sandbox";
process.env.PADDLE_API_KEY = "test-paddle-api-key";
process.env.PADDLE_WEBHOOK_SECRET = "test-paddle-webhook-signing-secret";
process.env.PADDLE_LIFETIME_PRICE_ID = "pri_test_lifetime_111";
process.env.PADDLE_MONTHLY_PRICE_ID = "pri_test_monthly_222";
process.env.LIFETIME_DEAL_LIMIT = "2";
process.env.PUBLIC_BASE_URL = "http://localhost:3210";

const WEBHOOK_SECRET = process.env.PADDLE_WEBHOOK_SECRET!;
let server: any, base: string, prisma: any;
const nativeFetch = globalThis.fetch;

// ─── Paddle signature helper ─────────────────────────────────────────────────
// Mirrors the production verifyWebhookSignature logic so tests can generate
// valid Paddle-format signatures: ts=<epoch_secs>;h1=<hmac(ts:body)>
const paddleSign = (body: unknown, secret = WEBHOOK_SECRET): { header: string; raw: string } => {
  const raw = JSON.stringify(body);
  const ts = Math.floor(Date.now() / 1000).toString();
  const h1 = createHmac("sha256", secret).update(`${ts}:${raw}`).digest("hex");
  return { header: `ts=${ts};h1=${h1}`, raw };
};

const signedPost = async (path: string, payload: unknown, secret = WEBHOOK_SECRET) => {
  const { header, raw } = paddleSign(payload, secret);
  return nativeFetch(base + path, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Paddle-Signature": header },
    body: raw,
  });
};

let _seq = 0;
const uniqueStamp = () => new Date(Date.now() + (_seq++) * 1000).toISOString();
const eventId = () => `evt_${randomUUID().replace(/-/g, "")}`;

// ─── Payload factories ────────────────────────────────────────────────────────

/** transaction.completed — used to grant the lifetime deal */
const transactionCompleted = (txnId: string, email: string, priceId = "pri_test_lifetime_111", userId?: string) => ({
  event_id: eventId(),
  event_type: "transaction.completed",
  occurred_at: uniqueStamp(),
  data: {
    id: txnId,
    status: "completed",
    currency_code: "USD",
    custom_data: userId ? { user_id: userId } : null,
    customer: { id: `ctm_${txnId}`, email },
    items: [{ price: { id: priceId }, quantity: 1 }],
    details: { totals: { grand_total: "3900", currency_code: "USD" } },
  },
});

/** transaction.updated with status:refunded — triggers refund revocation */
const transactionRefunded = (txnId: string) => ({
  event_id: eventId(),
  event_type: "transaction.updated",
  occurred_at: uniqueStamp(),
  data: {
    id: txnId,
    status: "refunded",
    currency_code: "USD",
    customer: { id: `ctm_${txnId}` },
  },
});

/** subscription.created / subscription.updated */
const subscriptionEvent = (
  evtType: string,
  subId: string,
  status: string,
  email: string,
  userId?: string,
  endsAt?: string,
) => ({
  event_id: eventId(),
  event_type: evtType,
  occurred_at: uniqueStamp(),
  data: {
    id: subId,
    status,
    custom_data: userId ? { user_id: userId } : null,
    customer: { id: `ctm_${subId}`, email },
    items: [{ price: { id: "pri_test_monthly_222" }, quantity: 1 }],
    current_billing_period: {
      starts_at: new Date().toISOString(),
      ends_at: endsAt ?? new Date(Date.now() + 30 * 864e5).toISOString(),
    },
  },
});

// ─── Setup / teardown ─────────────────────────────────────────────────────────

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

// ─── Tests ────────────────────────────────────────────────────────────────────

test("billing config reports unconfigured → configured", async () => {
  const res = await nativeFetch(base + "/api/billing/config");
  assert.equal(res.status, 200);
  const json = await res.json();
  assert.equal(json.configured, true);
  assert.equal(json.lifetime.limit, 2);
  assert.equal(json.lifetime.remaining, 2);
});

test("webhook rejects missing Paddle-Signature", async () => {
  const bad = await nativeFetch(base + "/api/billing/webhook", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify(transactionCompleted("txn-x", "x@example.test")),
  });
  assert.equal(bad.status, 401);
});

test("webhook rejects wrong HMAC value", async () => {
  const payload = transactionCompleted("txn-x2", "x@example.test");
  const raw = JSON.stringify(payload);
  const ts = Math.floor(Date.now() / 1000).toString();
  const res = await nativeFetch(base + "/api/billing/webhook", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Paddle-Signature": `ts=${ts};h1=deadbeef` },
    body: raw,
  });
  assert.equal(res.status, 401);
});

test("webhook rejects wrong secret", async () => {
  const res = await signedPost("/api/billing/webhook", transactionCompleted("txn-x3", "x@example.test"), "not-the-secret");
  assert.equal(res.status, 401);
});

test("webhook rejects stale timestamps (>5 min)", async () => {
  const payload = transactionCompleted("txn-stale", "x@example.test");
  const raw = JSON.stringify(payload);
  const staleTs = Math.floor((Date.now() - 6 * 60 * 1000) / 1000).toString();
  const h1 = createHmac("sha256", WEBHOOK_SECRET).update(`${staleTs}:${raw}`).digest("hex");
  const res = await nativeFetch(base + "/api/billing/webhook", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Paddle-Signature": `ts=${staleTs};h1=${h1}` },
    body: raw,
  });
  assert.equal(res.status, 401);
});

test("transaction.completed grants lifetime; retries are idempotent", async () => {
  const login = (await (await nativeFetch(base + "/api/auth/test-login", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "life@example.test" }),
  })).json());
  const payload = transactionCompleted("txn-life-1", "life@example.test", "pri_test_lifetime_111", login.user.id);

  const grant = await signedPost("/api/billing/webhook", payload);
  assert.equal(grant.status, 200);

  const who = await nativeFetch(base + "/api/billing/entitlements", { headers: { Authorization: `Bearer ${login.accessToken}` } });
  assert.equal((await who.json()).lifetime.active, true);

  // Replay of the exact same event_id must be a no-op
  const replay = await signedPost("/api/billing/webhook", payload);
  assert.equal(replay.status, 200);
  const purchases = await prisma.purchase.findMany({ where: { providerOrderId: "txn-life-1" } });
  assert.equal(purchases.length, 1);
  const cfg = await (await nativeFetch(base + "/api/billing/config")).json();
  assert.equal(cfg.lifetime.claimed, 1);
  assert.equal(cfg.lifetime.remaining, 1);
});

test("lifetime deal limit is enforced server-side", async () => {
  const b = await (await nativeFetch(base + "/api/auth/test-login", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "b@example.test" }),
  })).json();
  const c = await (await nativeFetch(base + "/api/auth/test-login", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "c@example.test" }),
  })).json();

  await signedPost("/api/billing/webhook", transactionCompleted("txn-life-2", "b@example.test", "pri_test_lifetime_111", b.user.id));
  assert.equal((await (await nativeFetch(base + "/api/billing/config")).json()).lifetime.remaining, 0);

  // Third transaction arrives: recorded in ledger but NOT granted
  await signedPost("/api/billing/webhook", transactionCompleted("txn-life-3", "c@example.test", "pri_test_lifetime_111", c.user.id));
  const cEnt = await (await nativeFetch(base + "/api/billing/entitlements", { headers: { Authorization: `Bearer ${c.accessToken}` } })).json();
  assert.equal(cEnt.lifetime.active, false);
  const over = await prisma.purchase.findUnique({ where: { providerOrderId: "txn-life-3" } });
  assert.equal(over.status, "limit_reached");

  // Checkout also refuses when sold out
  const checkout = await nativeFetch(base + "/api/billing/checkout", {
    method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${c.accessToken}` },
    body: JSON.stringify({ plan: "lifetime" }),
  });
  assert.equal(checkout.status, 409);
});

test("transaction.updated (refunded) revokes lifetime access", async () => {
  const b = await (await nativeFetch(base + "/api/auth/test-login", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "b@example.test" }),
  })).json();

  await signedPost("/api/billing/webhook", transactionRefunded("txn-life-2"));

  const bEnt = await (await nativeFetch(base + "/api/billing/entitlements", { headers: { Authorization: `Bearer ${b.accessToken}` } })).json();
  assert.equal(bEnt.lifetime.active, false);
  assert.equal((await (await nativeFetch(base + "/api/billing/config")).json()).lifetime.remaining, 1);
});

test("subscription lifecycle: active → canceled (grace) → expired", async () => {
  const s = await (await nativeFetch(base + "/api/auth/test-login", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "sub@example.test" }),
  })).json();
  const ent = () => nativeFetch(base + "/api/billing/entitlements", { headers: { Authorization: `Bearer ${s.accessToken}` } }).then(r => r.json());
  const future = new Date(Date.now() + 7 * 864e5).toISOString();
  const past   = new Date(Date.now() - 864e5).toISOString();

  // subscription.created
  await signedPost("/api/billing/webhook", subscriptionEvent("subscription.created", "sub-1", "active", "sub@example.test", s.user.id, future));
  assert.equal((await ent()).subscription.active, true);

  // subscription.updated — customer cancelled but period still active
  await signedPost("/api/billing/webhook", subscriptionEvent("subscription.updated", "sub-1", "canceled", "sub@example.test", s.user.id, future));
  const cancelled = await ent();
  assert.equal(cancelled.subscription.active, true);   // paid period continues
  assert.equal(cancelled.subscription.status, "canceled");

  // subscription.updated — period has now ended
  await signedPost("/api/billing/webhook", subscriptionEvent("subscription.updated", "sub-1", "canceled", "sub@example.test", s.user.id, past));
  assert.equal((await ent()).subscription.active, false);
});

test("checkout creates a Paddle transaction with buyer bound in custom_data", async () => {
  const s = await (await nativeFetch(base + "/api/auth/test-login", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "sub@example.test" }),
  })).json();

  let captured: any;
  globalThis.fetch = async (input: any, init: any) => {
    if (String(input).includes("sandbox-api.paddle.com/transactions")) {
      captured = { url: String(input), body: JSON.parse(init.body), headers: init.headers };
      return Response.json({ data: { checkout: { url: "https://sandbox-checkout.paddle.com/checkout/test" } } });
    }
    return nativeFetch(input, init);
  };

  const res = await nativeFetch(base + "/api/billing/checkout", {
    method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${s.accessToken}` },
    body: JSON.stringify({ plan: "monthly" }),
  });
  assert.equal(res.status, 200);
  assert.equal((await res.json()).url, "https://sandbox-checkout.paddle.com/checkout/test");

  assert.equal(captured.body.items[0].price_id, "pri_test_monthly_222");
  assert.equal(captured.body.custom_data.user_id, s.user.id);
  assert.equal(captured.body.custom_data.plan, "monthly");
  assert.equal(captured.body.customer.email, "sub@example.test");
  assert.ok(captured.body.settings.success_url.includes("/?checkout=success"));
  assert.ok(String(captured.url).includes("sandbox-api.paddle.com"));
  assert.equal(new Headers(captured.headers).get("Authorization"), "Bearer test-paddle-api-key");

  globalThis.fetch = nativeFetch;
});

test("already-entitled users cannot start a duplicate checkout", async () => {
  const login = await (await nativeFetch(base + "/api/auth/test-login", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "life@example.test" }),
  })).json();
  const res = await nativeFetch(base + "/api/billing/checkout", {
    method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${login.accessToken}` },
    body: JSON.stringify({ plan: "lifetime" }),
  });
  assert.equal(res.status, 409);
});

test("checkout endpoint degrades honestly when billing is unconfigured", async () => {
  const { config, billingConfigured } = await import("../src/config.js");
  const realKey = config.paddle.apiKey;
  config.paddle.apiKey = "";
  try {
    assert.equal(billingConfigured(), false);
    const token = (await (await nativeFetch(base + "/api/auth/test-login", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "sub@example.test" }),
    })).json()).accessToken;
    const res = await nativeFetch(base + "/api/billing/checkout", {
      method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ plan: "monthly" }),
    });
    assert.equal(res.status, 503);
    const body = await res.json();
    assert.deepEqual(body.missingVariables, ["PADDLE_API_KEY"]);
    assert.match(body.error, /Checkout setup incomplete.*PADDLE_API_KEY/);
    // Webhook secret must never leak in error responses
    assert.ok(!JSON.stringify(body).includes("test-paddle-webhook-signing-secret"));
  } finally {
    config.paddle.apiKey = realKey;
  }

  const noAuth = await nativeFetch(base + "/api/billing/checkout", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ plan: "monthly" }),
  });
  assert.equal(noAuth.status, 401);

  const badPlan = await nativeFetch(base + "/api/billing/checkout", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${(await (await nativeFetch(base + "/api/auth/test-login", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "life@example.test" }),
      })).json()).accessToken}`,
    },
    body: JSON.stringify({ plan: "forever" }),
  });
  assert.equal(badPlan.status, 400);
});

test("unattributed lifetime transactions are recorded but never grant access", async () => {
  const before = (await (await nativeFetch(base + "/api/billing/config")).json()).lifetime.claimed;
  await signedPost("/api/billing/webhook", transactionCompleted(`txn-${randomUUID()}`, "stranger@example.test"));
  const after = (await (await nativeFetch(base + "/api/billing/config")).json()).lifetime.claimed;
  assert.equal(after, before);  // claimed count unchanged (status=unmatched)
});

test("ignored price_id events return 200 without granting access", async () => {
  const login = await (await nativeFetch(base + "/api/auth/test-login", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "ignored@example.test" }),
  })).json();
  // transaction.completed with a price_id that doesn't match any known plan
  const payload = transactionCompleted("txn-ignored-1", "ignored@example.test", "pri_unknown_333", login.user.id);
  const res = await signedPost("/api/billing/webhook", payload);
  assert.equal(res.status, 200);
  const ent = await (await nativeFetch(base + "/api/billing/entitlements", { headers: { Authorization: `Bearer ${login.accessToken}` } })).json();
  assert.equal(ent.lifetime.active, false);
});
