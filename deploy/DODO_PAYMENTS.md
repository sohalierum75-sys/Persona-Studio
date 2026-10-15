# Dodo Payments migration and operations

## Existing architecture and scope

React/Vite calls the existing Express `/api/billing` endpoints. Google OAuth,
PKCE, refresh tokens, user IDs, Studio data and free-plan limits are unchanged.
The existing buttons navigate to real Dodo hosted Checkout Sessions; no browser
SDK or public payment token is needed. A return URL only polls entitlements.
Only verified webhooks change paid access.

Prices remain **USD $39 one-time lifetime**, limited to the first 50, and
**USD $9 every month**. The UI's crossed-out $49 reference and all benefits stay
unchanged. The server retrieves the Dodo product before checkout and rejects
different amounts, currencies, recurring intervals, trials, discounts, or
pay-what-you-want pricing. Applicable taxes remain handled by the merchant of record.

Official references used (reviewed October 15, 2026):

- [Create Checkout Session](https://docs.dodopayments.com/api-reference/checkout-sessions/create): SDK `checkoutSessions.create`, POST `/checkouts`, `product_cart`, `metadata`, `customer`, `return_url`.
- [Webhooks and signature verification](https://docs.dodopayments.com/developer-resources/webhooks): official SDK `webhooks.unwrap` with all three Standard Webhooks headers and the original request bytes.
- [Event catalog](https://docs.dodopayments.com/developer-resources/webhooks/intents/webhook-events-guide).
- [Payment payload](https://docs.dodopayments.com/developer-resources/webhooks/intents/payment), [subscription payload](https://docs.dodopayments.com/developer-resources/webhooks/intents/subscription), [refund payload](https://docs.dodopayments.com/developer-resources/webhooks/intents/refund).
- [Subscription migration](https://docs.dodopayments.com/miscellaneous/subscription-migration).

## Dashboard and server configuration

1. Complete Dodo merchant onboarding/verification. Use test mode first.
2. Create two products in that mode: $39 USD one-time and $9 USD recurring every
   one Month. No trial, product discounts, purchasing-power-parity discounts,
   pay-what-you-want, or extra add-ons. Preserve the existing plan descriptions.
3. Create an API key with product-read and checkout-create access. Put it only
   in the server environment. Product IDs, keys and webhook secrets differ
   between test and live; never mix modes in one production database.
4. Under Developer → Webhooks, create an HTTPS endpoint:
   `https://personastudio.site/api/billing/webhook`. Subscribe to
   `payment.succeeded`, `payment.failed`, `payment.cancelled`, `refund.succeeded`,
   `refund.failed`, and all `subscription.*` events (active, updated, renewed,
   plan_changed, cancelled, expired, on_hold, paused, unpaused, past_due, failed,
   update_payment_method). Failed payments/refunds are acknowledged without
   granting or revoking access. Copy the endpoint signing secret unchanged.
5. Set these variables in the API runtime's secret environment, using
   `server/.env.example` as the template:

   ```dotenv
   DODO_PAYMENTS_ENVIRONMENT=test_mode
   DODO_PAYMENTS_API_KEY=YOUR_DODO_API_KEY
   DODO_PAYMENTS_WEBHOOK_KEY=YOUR_DODO_WEBHOOK_SIGNING_SECRET
   DODO_LIFETIME_PRODUCT_ID=YOUR_DODO_LIFETIME_PRODUCT_ID
   DODO_MONTHLY_PRODUCT_ID=YOUR_DODO_MONTHLY_PRODUCT_ID
   DODO_RETURN_BASE_URL=https://personastudio.site
   LIFETIME_DEAL_LIMIT=50
   ```

   `test_mode` uses `https://test.dodopayments.com`; `live_mode` uses
   `https://live.dodopayments.com`. Never put credentials in `VITE_*`, source
   control, browser storage, CI output, or logs. No Dodo secrets are returned by
   `/config`. `DODO_RETURN_BASE_URL` defaults to `PUBLIC_BASE_URL`.
6. Keep existing Google redirect URI, allowed origins, JWT secret, database URL
   and account data. Test both plans from signed-out and signed-in states.
   Use a publicly reachable HTTPS tunnel for local webhook delivery.

## Database migration and deployment

The additive migration `20261015000000_dodo_payments` creates checkout,
subscription, payment, and refund tables and changes the default provider for
**new** purchases. It does not rewrite old provider values, purchases, billing
events, users, subscription IDs, or entitlements. Historical migration files
must remain unchanged, including their Paddle/Lemon Squeezy names.

Before production cutover, back up the existing PostgreSQL database and verify
the backup. Audit existing paid subscriptions and uncompleted legacy payment
links. Do not deploy this as an unattended switch while Paddle subscriptions
continue charging: changing API code cannot transfer payment mandates.

Coordinate existing recurring-subscription migration with Dodo and the old
provider. Preserve each account's existing paid-through date and prevent double
billing. New Dodo subscriptions must carry server-created `user_id`, `plan`, and
`checkout_id` metadata matching a `BillingCheckout` record; do not guess matches
by payer email. For subscribers who must reauthorize, wait for the old paid term
to end, then use the normal authenticated Dodo checkout. Imported subscriptions
need an operator-verified account/checkout mapping before replaying their signed
Dodo events. This external migration is a release gate, not automated by SQL.
Drain/reconcile old pending purchases, refunds and cancellations before retiring
the old endpoint. Historic refunds after cutover need an audited operator process
with the old provider; they must not be sent to the Dodo signature verifier.

Local/server commands (use `npm.cmd` on Windows):

```sh
npm ci
npm --prefix server ci
npm --prefix server run generate
npm --prefix server run migrate:deploy
npm test
npm run test:auth
npm --prefix server test
npm run lint
npm --prefix server run typecheck
npm --prefix server run build
npm run build
```

Tests apply migrations only to unique test schemas and remove those schemas
afterward. Set `DATABASE_URL` to a dedicated test PostgreSQL instance. Install
Playwright Chromium (`npx playwright install chromium`) for browser checks.
Never run `db push`, `migrate reset`, drop the production schema, or remove the
production volume for this migration.

Production retains the existing GHCR Docker image, Caddy, Express and PostgreSQL
Compose services. Configure server secrets in `/opt/persona-studio/.env`, build
the image from this revision, and use the existing `deploy/deploy.sh` workflow:
it applies `prisma migrate deploy` before starting the new API. Verify the new
tables and revision, `/api/health`, `/api/billing/config`, Google checkout
continuation, and actual signed webhook deliveries. The Caddy policy no longer
loads payment scripts or frames; hosted checkout is a top-level navigation.

Only after sandbox purchase, cancellation, renewal and refund verification,
create equivalent live products/webhook, replace the server variables with live
values and set `DODO_PAYMENTS_ENVIRONMENT=live_mode`. Complete a controlled live
purchase and refund before declaring live payments operational. Automated tests
mock the provider network; they cannot verify your dashboard or credentials.

## Capacity, retries and reconciliation

An authenticated lifetime checkout reserves capacity under a PostgreSQL advisory
transaction lock. Capacity includes historical lifetime purchases (including
refunds), legacy lifetime accounts without ledger rows, and outstanding checkout
reservations. Refunds do not create a 51st first-50 offer. Concurrent requests
reuse an existing payable checkout; only one grant may consume a reservation.

**Reservations are deliberately durable.** The documented Checkout Sessions API
does not provide an expiry/cancellation control. A local timeout cannot prove an
old checkout is unpayable. Abandoned sessions therefore hold a slot until the
operator reconciles them. Failed creates with an ambiguous network outcome also
retain their reservation; automatic retries could create duplicate payable links.

For a reservation with no saved URL, search the dashboard/API using the
`checkout_id` metadata. After verifying its account, product and environment,
recover the original session ID and URL into that record. If Dodo confirms no
session was created, the record can be marked `released` under the same advisory
lock. Never release a reservation for an existing session unless Dodo confirms
it cannot accept payment and all related payment events have been reconciled.
Keep the row for audit. A delayed payment for a released reservation is recorded
as `limit_reached` without access; refund/reconcile that payment in the dashboard.
Do not enable external static payment links for these products: unbound payments
cannot establish an account entitlement.

Receipts use `dodo:<environment>:<webhook-id>`. The receipt, ledger entries and
entitlements commit in one transaction. Invalid signatures return 401; database
or payload failures return 500 for retry. Unknown events return 200 without
access changes. Replay failed deliveries in the Dodo dashboard after resolving
the cause; alert on repeated non-2xx responses and `limit_reached` purchases.

Subscription timestamps reject stale updates. Cancellation honors the last paid
period; expiry/failure/on-hold/paused and unknown products revoke Dodo access.
Successful full refunds (including cumulative partial refunds) revoke the paid
entitlement, while partial refunds retain it. Refund tombstones prevent a
delayed payment event from restoring refunded access. Refunds of an older monthly
payment do not revoke a newer paid renewal. Workspace content is never deleted.

Rollback: retain all new tables and records and redeploy a reviewed compatible
image. Do not reverse migrations or restore over newer customer data. Disable
new checkout during reconciliation; preserve webhook delivery/replay records.

## Changed file map

| Area | Files |
| --- | --- |
| Server billing | `server/src/lib/dodo.ts`, `server/src/routes/billing.ts`, `server/src/config.ts`, `server/src/index.ts`, `server/src/routes/sync.ts` |
| Schema and dependency | `server/prisma/schema.prisma`, `server/prisma/migrations/20261015000000_dodo_payments/migration.sql`, `server/package.json`, `server/package-lock.json` |
| Checkout continuation | `src/lib/billing.ts`, `src/components/home/PricingSection.tsx`, `src/App.tsx` |
| Provider wording/links | `src/pages/PricingPage.tsx`, `src/pages/TermsPage.tsx`, `src/pages/PrivacyPolicyPage.tsx`, `src/pages/RefundPolicyPage.tsx` |
| Tests | `server/tests/billing.test.ts`, `server/tests/checkout.test.ts`, `server/tests/integration.test.ts`, `tests/auth-flow.test.mjs` |
| Deployment and configuration | `server/.env.example`, `deploy/Caddyfile`, `deploy/compose.production.yaml`, `.github/workflows/deploy.yml`, `.dockerignore`, `.gitignore` |
| Verification/documentation | `scripts/verify-checkout-browser.mjs`, `scripts/verify-checkout-local.mjs`, `scripts/verify-production.mjs`, `README.md`, `deploy/README.md`, this guide |
| Removed runtime Paddle integration | `server/src/lib/paddle.ts`, `src/lib/paddle-checkout.ts` |
