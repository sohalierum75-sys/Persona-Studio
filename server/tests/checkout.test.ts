import { test } from "node:test";
import assert from "node:assert/strict";
import { config, billingConfigured, billingMissingVariables } from "../src/config.js";
import { createCheckout } from "../src/lib/lemonsqueezy.js";

const configured = { apiKey: "test-api-key", storeId: "333", webhookSecret: "test-webhook-secret", lifetimeVariantId: "111", monthlyVariantId: "222", redirectUrl: "https://studio.example/" };

test("billing setup reports only exact missing variable names, including placeholders", () => {
  const saved = { ...config.lemonsqueezy };
  try {
    Object.assign(config.lemonsqueezy, configured);
    assert.equal(billingConfigured(), true);
    Object.assign(config.lemonsqueezy, { apiKey: "", storeId: "YOUR_STORE_ID", lifetimeVariantId: " " });
    assert.equal(billingConfigured(), false);
    assert.deepEqual(billingMissingVariables(), ["LEMONSQUEEZY_API_KEY", "LEMONSQUEEZY_STORE_ID", "LEMONSQUEEZY_LIFETIME_VARIANT_ID"]);
  } finally { Object.assign(config.lemonsqueezy, saved); }
});

for (const [plan, variantId] of [["lifetime", "111"], ["monthly", "222"]] as const) {
  test(`${plan} checkout uses the correct store, variant and authenticated buyer`, async () => {
    const saved = { ...config.lemonsqueezy };
    const nativeFetch = globalThis.fetch;
    try {
      Object.assign(config.lemonsqueezy, configured);
      globalThis.fetch = async (input, init) => {
        assert.equal(input, "https://api.lemonsqueezy.com/v1/checkouts");
        assert.equal(init?.method, "POST");
        assert.equal(new Headers(init?.headers).get("Authorization"), "Bearer test-api-key");
        assert.equal(new Headers(init?.headers).get("Content-Type"), "application/vnd.api+json");
        const data = JSON.parse(init?.body as string).data;
        assert.deepEqual(data.relationships, { store: { data: { type: "stores", id: "333" } }, variant: { data: { type: "variants", id: variantId } } });
        assert.deepEqual(data.attributes.product_options, { redirect_url: "https://studio.example/?checkout=success", enabled_variants: [Number(variantId)] });
        assert.deepEqual(data.attributes.checkout_data.custom, { user_id: "buyer-id", plan });
        return Response.json({ data: { attributes: { url: "https://store.lemonsqueezy.com/checkout/test" } } });
      };
      assert.equal(await createCheckout({ plan, user: { id: "buyer-id", email: "buyer@example.test", name: "Buyer" } }), "https://store.lemonsqueezy.com/checkout/test");
      globalThis.fetch = async () => Response.json({ error: "provider error" }, { status: 401 });
      await assert.rejects(createCheckout({ plan, user: { id: "buyer-id", email: "buyer@example.test", name: "Buyer" } }));
      globalThis.fetch = async () => Response.json({ data: { attributes: {} } });
      await assert.rejects(createCheckout({ plan, user: { id: "buyer-id", email: "buyer@example.test", name: "Buyer" } }), /did not include a url/);
    } finally { globalThis.fetch = nativeFetch; Object.assign(config.lemonsqueezy, saved); }
  });
}
