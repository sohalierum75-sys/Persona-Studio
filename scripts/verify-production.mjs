// Read-only public smoke check. Never follow the Google redirect or log state.
const origin = process.env.PUBLIC_BASE_URL?.replace(/\/$/, '');
if (!origin || !process.env.EXPECTED_REVISION) throw new Error('Public URL and expected revision required');
const health = await fetch(`${origin}/api/health?verify=${Date.now()}`, { cache: 'no-store', signal: AbortSignal.timeout(20000) }).then(r => r.json());
if (health.revision !== process.env.EXPECTED_REVISION) throw new Error(`Public site is serving revision ${health.revision ?? 'unknown'}, expected ${process.env.EXPECTED_REVISION}`);
const billingResponse = await fetch(`${origin}/api/billing/config`, { cache: 'no-store', signal: AbortSignal.timeout(20000) });
if (!billingResponse.ok) throw new Error('Billing configuration endpoint unavailable');
const billing = await billingResponse.json();
if (billing.provider !== 'dodo') throw new Error('Deployment is not running the Dodo billing integration');
if (!['test_mode', 'live_mode'].includes(billing.environment)) throw new Error('Invalid Dodo environment');
if (!billing.configured) throw new Error('Dodo server configuration is incomplete; update the VPS environment and recreate the API container');
console.log(`Dodo billing configuration present (${billing.environment}); credentials and webhook delivery still require a real payment test.`);
for (const plan of ['lifetime','monthly']) {
  const url = new URL('/api/auth/google/start', origin);
  url.searchParams.set('client', 'web');
  url.searchParams.set('challenge', 'a'.repeat(43));
  url.searchParams.set('redirect', `${origin}/pricing?checkout=${plan}`);
  const response = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(20000) });
  if (response.status !== 302 || new URL(response.headers.get('location') ?? origin).hostname !== 'accounts.google.com') throw new Error(`${plan} OAuth start failed (${response.status})`);
  console.log(`${plan}: production OAuth start redirects to Google`);
}
const page = await fetch(`${origin}/pricing`, { signal: AbortSignal.timeout(20000) });
const csp = page.headers.get('content-security-policy') ?? '';
if (!csp.includes("script-src 'self'") || !csp.includes("frame-src 'none'")) throw new Error('Unexpected checkout CSP');
console.log(`Public revision ${health.revision} verified; hosted Dodo checkout CSP verified. Authenticated Google return and checkout still require a real browser session.`);
