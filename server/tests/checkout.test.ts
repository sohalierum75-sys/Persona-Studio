// ============================================================
// Checkout unit tests — Paddle config validation and the
// createCheckout function (fetch is mocked to avoid real API calls).
// ============================================================
import { test } from "node:test";
import assert from "node:assert/strict";
import { config, billingConfigured, billingMissingVariables } from "../src/config.js";
import { createCheckout } from "../src/lib/paddle.js";

const configured = {
  apiKey: "test-paddle-api-key",
  webhookSecret: "test-paddle-webhook-signing-secret-long-enough",
  lifetimePriceId: "pri_test_lifetime_111",
  monthlyPriceId: "pri_test_monthly_222",
  environment: "sandbox" as const,
  redirectUrl: "https://studio.example/",
};

test("billing setup reports only exact missing variable names, including placeholders", () => {
  const saved = {
    apiKey: config.paddle.apiKey,
    webhookSecret: config.paddle.webhookSecret,
    lifetimePriceId: config.paddle.lifetimePriceId,
    monthlyPriceId: config.paddle.monthlyPriceId,
  };
  try {
    Object.assign(config.paddle, configured);
    assert.equal(billingConfigured(), true);
    Object.assign(config.paddle, { apiKey: "", lifetimePriceId: "YOUR_PADDLE_LIFETIME_PRICE_ID", webhookSecret: " " });
    assert.equal(billingConfigured(), false);
    assert.deepEqual(
      billingMissingVariables(),
      ["PADDLE_API_KEY", "PADDLE_WEBHOOK_SECRET", "PADDLE_LIFETIME_PRICE_ID"],
    );
  } finally {
    Object.assign(config.paddle, saved);
  }
});

for (const [plan, priceId] of [["lifetime", "pri_test_lifetime_111"], ["monthly", "pri_test_monthly_222"]] as const) {
  test(`${plan} checkout calls Paddle sandbox API with correct price, customer and custom_data`, async () => {
    const saved = {
      apiKey: config.paddle.apiKey,
      webhookSecret: config.paddle.webhookSecret,
      lifetimePriceId: config.paddle.lifetimePriceId,
      monthlyPriceId: config.paddle.monthlyPriceId,
      environment: config.paddle.environment,
      redirectUrl: config.paddle.redirectUrl,
    };
    const nativeFetch = globalThis.fetch;
    try {
      Object.assign(config.paddle, configured);

      globalThis.fetch = async (input, init) => {
        // Must call sandbox API (not live)
        assert.ok(String(input).includes("sandbox-api.paddle.com/transactions"), `expected sandbox URL, got ${String(input)}`);
        assert.equal(init?.method, "POST");
        assert.equal(new Headers(init?.headers).get("Authorization"), "Bearer test-paddle-api-key");
        assert.equal(new Headers(init?.headers).get("Content-Type"), "application/json");

        const body = JSON.parse(init?.body as string);
        assert.deepEqual(body.items, [{ price_id: priceId, quantity: 1 }]);
        assert.equal(body.customer.email, "buyer@example.test");
        assert.deepEqual(body.custom_data, { user_id: "buyer-id", plan });
        assert.ok(body.settings.success_url.includes("/?checkout=success"), "success_url must include /?checkout=success");

        return Response.json({ data: { checkout: { url: "https://sandbox-checkout.paddle.com/checkout/test" } } });
      };

      const result = await createCheckout({ plan, user: { id: "buyer-id", email: "buyer@example.test", name: "Buyer" } });
      assert.equal(result, "https://sandbox-checkout.paddle.com/checkout/test");

      // Non-OK response → PaddleApiError
      globalThis.fetch = async () => Response.json({ error: "unauthorized" }, { status: 401 });
      await assert.rejects(createCheckout({ plan, user: { id: "buyer-id", email: "buyer@example.test", name: "Buyer" } }));

      // OK response without checkout.url → PaddleApiError
      globalThis.fetch = async () => Response.json({ data: { checkout: {} } });
      await assert.rejects(
        createCheckout({ plan, user: { id: "buyer-id", email: "buyer@example.test", name: "Buyer" } }),
        /did not include checkout\.url/,
      );
    } finally {
      globalThis.fetch = nativeFetch;
      Object.assign(config.paddle, saved);
    }
  });
}
