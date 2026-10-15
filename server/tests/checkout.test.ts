import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { config, billingConfigured, billingMissingVariables } from "../src/config.js";
import { verifyWebhook, isDodoCheckoutUrl, hasActiveSubscription, dodoClient } from "../src/lib/dodo.js";

const secret = 'whsec_' + Buffer.from('test-secret-with-at-least-32-bytes').toString('base64');
export function signed(raw: string, id = 'msg_signature', seconds = Math.floor(Date.now()/1000)) {
  const signature = createHmac('sha256', Buffer.from(secret.slice(6), 'base64')).update(`${id}.${seconds}.${raw}`).digest('base64');
  return { 'webhook-id': id, 'webhook-timestamp': String(seconds), 'webhook-signature': `v1,${signature}` };
}
config.dodo.webhookSecret = secret;
test('official SDK accepts valid Standard Webhooks signature and rejects tamper, missing headers, stale/future timestamps', () => {
  const raw = JSON.stringify({ type: 'payment.succeeded', data: {}, timestamp: new Date().toISOString() });
  assert.deepEqual(verifyWebhook(Buffer.from(raw), signed(raw)), JSON.parse(raw));
  for (const headers of [{}, { ...signed(raw), 'webhook-id': 'changed' }, signed(raw, 'msg', Math.floor(Date.now()/1000)-601), signed(raw, 'msg', Math.floor(Date.now()/1000)+601), { ...signed(raw), 'webhook-signature': 'v1,invalid' }]) {
    assert.throws(() => verifyWebhook(Buffer.from(raw), headers));
  }
  assert.throws(() => verifyWebhook(Buffer.from(raw + ' '), signed(raw)));
});
test('config reports names only and rejects placeholders', () => {
  const saved = { ...config.dodo };
  try {
    Object.assign(config.dodo, {apiKey:'',webhookSecret:'YOUR_SECRET',lifetimeProductId:'pdt_a',monthlyProductId:'pdt_b',redirectUrl:'https://studio.example'});
    assert.equal(billingConfigured(), false);
    assert.deepEqual(billingMissingVariables(), ['DODO_PAYMENTS_API_KEY','DODO_PAYMENTS_WEBHOOK_KEY']);
  } finally { Object.assign(config.dodo,saved); }
});
test('hosted checkout URLs are restricted to Dodo HTTPS hosts', () => {
  assert.equal(isDodoCheckoutUrl('https://test.checkout.dodopayments.com/session/cks_a'),true);
  assert.equal(isDodoCheckoutUrl('https://checkout.dodopayments.com/session/cks_a'),true);
  for (const url of ['javascript:alert(1)','http://checkout.dodopayments.com','https://checkout.dodopayments.com.evil.test','https://user:password@checkout.dodopayments.com']) assert.equal(isDodoCheckoutUrl(url),false);
});
test('paid cancellation lasts until period end; failed, refunded and on-hold subscriptions have no access', () => {
  for (const status of ['active','canceled']) assert.equal(hasActiveSubscription({subscriptionStatus:status,subscriptionEndsAt:new Date(Date.now()+60000)}),true);
  for (const status of ['expired','failed','refunded','on_hold']) assert.equal(hasActiveSubscription({subscriptionStatus:status,subscriptionEndsAt:new Date(Date.now()+60000)}),false);
  assert.equal(hasActiveSubscription({subscriptionStatus:'canceled',subscriptionEndsAt:new Date(0)}),false);
});
test('SDK selects separate test and live API hosts without exposing credentials', async () => {
  const saved={...config.dodo}; const original=globalThis.fetch;
  try {
    config.dodo.apiKey='test-private-key';
    for(const [mode,host] of [['test_mode','test.dodopayments.com'],['live_mode','live.dodopayments.com']] as const){
      config.dodo.environment=mode;
      globalThis.fetch=async(input,init)=>{
        const req=new Request(input,init);assert.equal(new URL(req.url).hostname,host);
        assert.equal(req.headers.get('authorization'),'Bearer test-private-key');
        return Response.json({product_id:'pdt_test'});
      };
      assert.equal((await dodoClient().products.retrieve('pdt_test')).product_id,'pdt_test');
    }
  } finally {globalThis.fetch=original;Object.assign(config.dodo,saved);}
});
