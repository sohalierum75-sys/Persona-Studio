// Read-only public smoke check. Never follow the Google redirect or log state.
const origin = process.env.PUBLIC_BASE_URL?.replace(/\/$/, '');
if (!origin || !process.env.EXPECTED_REVISION) throw new Error('Public URL and expected revision required');
const health = await fetch(`${origin}/api/health?verify=${Date.now()}`, { cache: 'no-store', signal: AbortSignal.timeout(20000) }).then(r => r.json());
if (health.revision !== process.env.EXPECTED_REVISION) throw new Error(`Public site is serving revision ${health.revision ?? 'unknown'}, expected ${process.env.EXPECTED_REVISION}`);
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
if (!csp.includes('https://cdn.paddle.com') || !csp.includes('frame-src https://*.paddle.com')) throw new Error('Public CSP still blocks Paddle checkout');
console.log(`Public revision ${health.revision} verified; Paddle CSP enabled. Authenticated Google return and checkout still require a real browser session.`);
