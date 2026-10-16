import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'vite';
import { chromium } from 'playwright';
import fs from 'node:fs';
import { createHash } from 'node:crypto';

let vite, browser, origin;
before(async () => {
  vite = await createServer({ server: { host: '127.0.0.1', port: 0 } });
  await vite.listen();
  origin = `http://127.0.0.1:${vite.httpServer.address().port}`;
  const installed = chromium.executablePath();
  browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ?? (fs.existsSync(installed) ? installed : undefined) });
});
after(async () => { await browser?.close(); await vite?.close(); });

// Exercise the real frontend with controlled API responses; never print credentials.
const user = { id: 'auth-regression', name: 'Auth Test', email: 'auth@example.test', avatarUrl: null };
const session = () => ({ user, accessToken: 'test-access', refreshToken: 'test-refresh', expiresAt: Date.now() + 3600000 });
async function pageFor(t, tokenStatus = 200) {
  const context = await browser.newContext();
  t.after(() => context.close());
  const page = await context.newPage();
  // Cold Vite dependency compilation can exceed Playwright's 30s navigation default.
  page.setDefaultNavigationTimeout(90000);
  const calls = { exchange: 0, authenticated: 0, refresh: 0, challenge: null };
  await page.route('**/api/**', async route => {
    const request = route.request();
    const pathname = new URL(request.url()).pathname;
    if (pathname === '/api/billing/config') {
      return route.fulfill({ json: { configured: true, lifetime: { limit: 50, claimed: null, remaining: null } } });
    }
    if (pathname === '/api/auth/logout') return route.fulfill({ json: { ok: true } });
    if (pathname === '/api/auth/token') {
      calls.exchange++;
      const verifier = request.postDataJSON().verifier;
      const validVerifier = calls.challenge
        ? typeof verifier === 'string' && createHash('sha256').update(verifier).digest('base64url') === calls.challenge
        : verifier === 'v'.repeat(43);
      assert.ok(validVerifier, 'exchange must send the original PKCE verifier');
      if (new URL(page.url()).pathname !== '/pricing') await page.getByText('Loading Persona Studio…', { exact: true }).waitFor();
      assert.equal(await page.getByRole('button', { name: 'Continue with Google' }).count(), 0);
      await new Promise(resolve => setTimeout(resolve, 200));
      return route.fulfill({ status: tokenStatus, json: tokenStatus === 200 ? session() : { error: 'Invalid or expired code. Please sign in again.' } });
    }
    if (pathname === '/api/auth/refresh') {
      calls.refresh++;
      assert.ok(request.postDataJSON().refreshToken === 'test-refresh', 'refresh must use persisted credentials');
      return route.fulfill({ json: session() });
    }
    assert.ok(request.headers().authorization === 'Bearer test-access', 'authenticated request must send saved access token');
    calls.authenticated++;
    if (pathname === '/api/billing/entitlements') {
      return route.fulfill({ json: { plan: 'free', lifetime: { active: false, since: null }, subscription: null, limits: { characters: 1, episodes: 1, prompts: 10, bulkScenes: 3 }, usage: { characters: 0, episodes: 0, prompts: 0 } } });
    }
    return route.fulfill({ json: pathname === '/api/auth/me' ? { user } : { records: [] } });
  });
  return { page, calls };
}

test('Google callback saves tokens, enters existing Studio and survives refresh', async t => {
  const { page, calls } = await pageFor(t);
  await page.goto(origin + '/characters');
  await page.getByRole('button', { name: 'Continue with Google' }).waitFor();
  // Capture the actual outgoing login URL without visiting Google.
  let redirect;
  await page.route('**/api/auth/google/start?**', route => {
    const start = new URL(route.request().url());
    redirect = start.searchParams.get('redirect');
    calls.challenge = start.searchParams.get('challenge');
    return route.fulfill({ contentType: 'text/html', body: 'Provider redirect' });
  });
  await page.getByRole('button', { name: 'Continue with Google' }).click();
  await page.waitForURL('**/api/auth/google/start?**');
  assert.equal(redirect, origin + '/characters');
  // Return in the same tab: the original verifier must survive the round trip.
  await page.goto(origin + '/characters?code=test-code');
  await page.getByRole('button', { name: 'New Character', exact: true }).first().waitFor();
  assert.equal(new URL(page.url()).pathname, '/characters');
  assert.equal(new URL(page.url()).search, '');
  assert.equal(calls.exchange, 1);
  assert.ok(calls.authenticated > 0);
  assert.ok(await page.evaluate(() => !!localStorage.getItem('ps_auth_tokens') && !sessionStorage.getItem('ps_pkce')));
  // Signed-in visit to the marketing root bounces to the Studio.
  await page.goto(origin);
  await page.getByRole('button', { name: 'New Character', exact: true }).first().waitFor();
  assert.equal(new URL(page.url()).pathname, '/characters');
  const beforeReload = calls.authenticated;
  await page.reload();
  await page.getByRole('button', { name: 'New Character', exact: true }).first().waitFor();
  assert.ok(calls.authenticated > beforeReload);
  assert.equal(calls.exchange, 1);
  // Expired access tokens also restore via the existing refresh flow.
  await page.evaluate(() => {
    const saved = JSON.parse(localStorage.getItem('ps_auth_tokens'));
    saved.expiresAt = 0;
    localStorage.setItem('ps_auth_tokens', JSON.stringify(saved));
  });
  await page.reload();
  await page.getByRole('button', { name: 'New Character', exact: true }).first().waitFor();
  assert.equal(calls.refresh, 1);
  await page.goto(origin + '/?pricing=1#pricing');
  await page.getByRole('button', { name: 'Use Free plan — no purchase required' }).click();
  await page.getByRole('button', { name: 'New Character', exact: true }).first().waitFor();
});

test('callback failure is visible instead of silently returning to marketing', async t => {
  const { page } = await pageFor(t);
  await page.goto(origin + '/?auth_error=oauth_failed');
  await page.getByRole('button', { name: 'Continue with Google' }).waitFor({ timeout: 5000 });
  assert.match(await page.getByRole('alert').innerText(), /Sign-in failed/);
});

test('failed code exchange remains visible when opening Studio', async t => {
  const { page } = await pageFor(t, 401);
  await page.goto(origin);
  await page.evaluate(() => sessionStorage.setItem('ps_pkce', 'v'.repeat(43)));
  await page.goto(origin + '/?code=expired-code');
  await page.getByText('Invalid or expired code. Please sign in again.', { exact: true }).waitFor({ timeout: 5000 });
  await page.evaluate(() => { history.pushState({}, '', '/characters'); dispatchEvent(new PopStateEvent('popstate')); });
  await page.getByRole('button', { name: 'Continue with Google' }).waitFor();
  assert.match(await page.locator('body').innerText(), /Invalid or expired code/);
});

test('a cancelled callback restores the saved session instead of starting a Google loop', async t => {
  const { page, calls } = await pageFor(t);
  await page.goto(origin);
  await page.evaluate(saved => localStorage.setItem('ps_auth_tokens', JSON.stringify(saved)), session());
  await page.goto(origin + '/?auth_error=cancelled');
  await page.getByRole('button', { name: 'New Character', exact: true }).first().waitFor();
  assert.ok(calls.authenticated > 0, 'the stored session must be used, not discarded');
});

test('stale callback code keeps the session and still resumes checkout once', async t => {
  const { page } = await pageFor(t, 401);
  await page.goto(origin);
  await page.evaluate(saved => localStorage.setItem('ps_auth_tokens', JSON.stringify(saved)), session());
  await page.evaluate(() => sessionStorage.setItem('ps_pkce', 'v'.repeat(43)));
  let checkouts = 0;
  await page.route('**/api/billing/checkout', route => {
    checkouts++;
    assert.deepEqual(route.request().postDataJSON(), { plan: 'monthly' });
    assert.equal(route.request().headers().authorization, 'Bearer test-access');
    return route.fulfill({ json: { url: 'https://test.checkout.dodopayments.com/session/resumed' } });
  });
  await page.route('https://test.checkout.dodopayments.com/**', route => route.fulfill({ contentType: 'text/html', body: 'Hosted checkout' }));
  await page.goto(origin + '/?checkout=monthly&code=stale-code');
  await page.waitForURL('https://test.checkout.dodopayments.com/session/resumed');
  assert.equal(checkouts, 1);
});

for (const plan of ['lifetime', 'monthly']) {
  test(`${plan} purchase uses authenticated checkout and follows its hosted URL`, async t => {
    const { page } = await pageFor(t);
    await page.goto(origin);
    await page.evaluate(saved => localStorage.setItem('ps_auth_tokens', JSON.stringify(saved)), session());
    await page.route('**/api/billing/checkout', route => {
      assert.equal(route.request().headers().authorization, 'Bearer test-access');
      assert.deepEqual(route.request().postDataJSON(), { plan });
      return route.fulfill({ json: { url: `https://test.checkout.dodopayments.com/session/${plan}` } });
    });
    await page.route('https://test.checkout.dodopayments.com/**', route => route.fulfill({ contentType: 'text/html', body: 'Hosted checkout' }));
    await page.goto(origin + '/?pricing=1');
    await page.locator(`#pricing-${plan}-cta`).click();
    await page.waitForURL(`https://test.checkout.dodopayments.com/session/${plan}`);
  });
}

test('checkout setup error is visible without claiming payment', async t => {
  const { page } = await pageFor(t);
  await page.goto(origin);
  await page.evaluate(saved => localStorage.setItem('ps_auth_tokens', JSON.stringify(saved)), session());
  await page.route('**/api/billing/checkout', route => route.fulfill({ status: 503, json: { error: 'Checkout setup incomplete. Set these server environment variables: DODO_PAYMENTS_API_KEY.' } }));
  await page.goto(origin + '/?pricing=1');
  await page.locator('#pricing-lifetime-cta').click();
  await page.getByRole('alert').filter({ hasText: 'DODO_PAYMENTS_API_KEY' }).waitFor();
  assert.equal(new URL(page.url()).origin, origin);
  await page.goto(origin + '/?checkout=success');
  await page.getByText('Checking your access. Payment confirmation may take a few seconds.').waitFor();
  assert.doesNotMatch(await page.locator('body').innerText(), /Payment received|your access is active/);
});

for (const plan of ['lifetime', 'monthly']) for (const path of ['/', '/pricing']) {
test(`${plan} purchase from ${path} survives Google sign-in and resumes once`, async t => {
  const { page, calls } = await pageFor(t);
  await page.goto(origin + path);
  await page.route('**/api/auth/google/start?**', route => {
    const url = new URL(route.request().url());
    assert.equal(url.searchParams.get('redirect'), origin + path + '?checkout=' + plan);
    calls.challenge = url.searchParams.get('challenge');
    return route.fulfill({ contentType: 'text/html', body: 'Provider redirect' });
  });
  await page.locator(`#pricing-${plan}-cta`).click();
  await page.waitForURL('**/api/auth/google/start?**');
  let checkouts = 0;
  await page.route('**/api/billing/checkout', route => {
    checkouts++;
    assert.equal(calls.exchange, 1);
    assert.equal(new URL(page.url()).pathname, path);
    assert.equal(route.request().headers().authorization, 'Bearer test-access');
    assert.deepEqual(route.request().postDataJSON(), { plan });
    return route.fulfill({ json: { url: 'https://test.checkout.dodopayments.com/session/resumed' } });
  });
  await page.route('https://test.checkout.dodopayments.com/**', route => route.fulfill({ contentType: 'text/html', body: 'Hosted checkout' }));
  await page.goto(origin + path + '?checkout=' + plan + '&code=test-code');
  await page.waitForURL('https://test.checkout.dodopayments.com/session/resumed');
  assert.equal(checkouts, 1);
  await page.goBack();
  await page.locator(`#pricing-${plan}-cta`).waitFor();
  await page.reload();
  await page.locator(`#pricing-${plan}-cta`).waitFor();
  assert.equal(checkouts, 1);
});
}

for (const source of ['url', 'storage']) test(`checkout resumes with ${source} intent only`, async t => {
  const { page } = await pageFor(t);
  await page.goto(origin);
  await page.evaluate(({ saved, source }) => {
    localStorage.setItem('ps_auth_tokens', JSON.stringify(saved));
    if (source === 'storage') sessionStorage.setItem('ps_billing_intent', 'monthly');
  }, { saved: session(), source });
  let checkouts = 0;
  await page.route('**/api/billing/checkout', route => {
    checkouts++;
    assert.equal(new URL(page.url()).pathname, '/');
    assert.deepEqual(route.request().postDataJSON(), { plan: 'monthly' });
    return route.fulfill({ status: 502, json: { error: 'Checkout could not be created. Please try again.' } });
  });
  await page.goto(origin + (source === 'url' ? '/?checkout=monthly' : '/'));
  await page.getByRole('alert').filter({ hasText: 'Checkout could not be created' }).waitFor();
  await page.reload();
  await page.locator('#pricing-monthly-cta').waitFor();
  assert.equal(checkouts, 1);
});

for (const failure of [
  { name: 'missing config endpoint', endpoint: 'config', status: 404, body: 'Not found', message: /config endpoint is missing/ },
  { name: 'unconfigured Dodo Payments', endpoint: 'config', json: { configured: false }, message: /Dodo Payments checkout is not configured/ },
  { name: 'missing variables', endpoint: 'config', json: { configured: false, missingVariables: ['DODO_PAYMENTS_API_KEY'] }, message: /DODO_PAYMENTS_API_KEY/ },
  { name: 'missing checkout endpoint', endpoint: 'checkout', status: 404, body: 'Not found', message: /Checkout endpoint.*missing/ },
  { name: 'SPA fallback', endpoint: 'checkout', body: '<html>App</html>', message: /Checkout endpoint.*invalid response/ },
  { name: 'missing checkout URL', endpoint: 'checkout', json: {}, message: /valid checkout URL/ },
  { name: 'unsafe checkout URL', endpoint: 'checkout', json: { url: 'javascript:alert(1)' }, message: /valid checkout URL/ },
  { name: 'unexpected checkout host', endpoint: 'checkout', json: { url: 'https://evil.example/checkout' }, message: /valid checkout URL/ },
  { name: 'malformed checkout URL', endpoint: 'checkout', json: { url: 'https://' }, message: /valid checkout URL/ },
]) test(`checkout shows ${failure.name} and remains on pricing`, async t => {
  const { page } = await pageFor(t);
  await page.goto(origin);
  await page.evaluate(saved => localStorage.setItem('ps_auth_tokens', JSON.stringify(saved)), session());
  const { name: _name, endpoint, message, ...response } = failure;
  await page.route(`**/api/billing/${endpoint}`, route => route.fulfill(response));
  await page.goto(origin + '/?pricing=1');
  await page.locator('#pricing-monthly-cta').click();
  await page.getByRole('alert').waitFor();
  assert.match(await page.getByRole('alert').innerText(), message);
  assert.equal(new URL(page.url()).pathname, '/');
  assert.equal(await page.locator('#pricing-monthly-cta').isEnabled(), true);
});

test('account shows identity, usage, sync and actions; Escape restores focus', async t => {
  const { page } = await pageFor(t);
  await page.goto(origin);
  await page.evaluate(saved => localStorage.setItem('ps_auth_tokens', JSON.stringify(saved)), session());
  await page.goto(origin + '/characters');
  await page.getByRole('button', { name: 'Account', exact: true }).click();
  const panel = page.getByRole('region', { name: 'Your account' });
  await panel.getByText('Free plan', { exact: true }).waitFor();
  assert.match(await panel.innerText(), /Auth Test[\s\S]*auth@example.test/);
  assert.equal(await panel.locator('dl > div').count(), 3);
  // Status UI is activity-only: the Save status block appears during/just after
  // a save, then hides while idle (waitFor detached also rides out the "Saved" flash).
  await panel.getByText('Save status', { exact: true }).waitFor({ state: 'detached' });
  await panel.getByRole('link', { name: 'Upgrade to unlimited' }).waitFor();
  await panel.getByRole('button', { name: 'Sign out' }).waitFor();
  if (process.env.ACCOUNT_MENU_SCREENSHOT) await page.screenshot({ path: process.env.ACCOUNT_MENU_SCREENSHOT });
  await page.keyboard.press('Escape');
  assert.equal(await panel.count(), 0);
  assert.equal(await page.getByRole('button', { name: 'Account', exact: true }).evaluate(el => el === document.activeElement), true);
});


const homeHeader = page => page.locator('header.hp-header');

test('homepage header shows signed-out actions and keeps mobile navigation usable', async t => {
  const { page } = await pageFor(t);
  await page.goto(origin + '/?pricing=1');
  const header = homeHeader(page);
  await header.getByRole('link', { name: 'Sign in', exact: true }).waitFor();
  assert.equal(await header.getByRole('button', { name: 'Account', exact: true }).count(), 0);
  assert.equal(await header.getByRole('link', { name: 'Open Studio' }).getAttribute('href'), '/characters');
  await header.getByRole('link', { name: 'Download extension' }).waitFor();
  await page.setViewportSize({ width: 375, height: 812 });
  await header.getByRole('link', { name: 'Sign in', exact: true }).waitFor();
  await header.getByRole('button', { name: 'Toggle navigation' }).click();
  await page.getByRole('navigation', { name: 'Mobile navigation' }).getByRole('link', { name: 'Download extension' }).waitFor();
  await page.screenshot({ path: 'test-results/header-mobile.png' });
  const overflow = await page.evaluate(() => [...document.querySelectorAll('*')].filter(el => el.getBoundingClientRect().right > innerWidth + 1).slice(0, 12).map(el => ({ tag: el.tagName, class: el.className, right: el.getBoundingClientRect().right })));
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), JSON.stringify(overflow));
});

test('homepage header waits for session restoration then shows the account across refreshes', async t => {
  const { page } = await pageFor(t);
  await page.addInitScript(saved => localStorage.setItem('ps_auth_tokens', JSON.stringify(saved)), { ...session(), expiresAt: 0 });
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  t.after(() => release());
  await page.route('**/api/auth/refresh', async route => { await gate; await route.fulfill({ json: session() }); });
  await page.goto(origin + '/?pricing=1');
  const header = homeHeader(page);
  await header.getByRole('status', { name: 'Restoring account' }).waitFor();
  assert.equal(await header.getByRole('link', { name: 'Sign in', exact: true }).count(), 0);
  release();
  const account = header.getByRole('button', { name: 'Account', exact: true });
  await account.waitFor(); assert.equal(await account.innerText(), 'AT');
  await account.click();
  const menu = header.getByRole('region', { name: 'Your account' });
  await menu.getByText(user.email, { exact: true }).waitFor();
  assert.equal(await menu.getByRole('link', { name: 'Open workspace' }).getAttribute('href'), '/characters');
  await page.reload(); await account.waitFor();
  assert.equal(await header.getByRole('link', { name: 'Sign in', exact: true }).count(), 0);
  assert.doesNotMatch(await header.innerHTML(), /test-access|test-refresh/);
});

test('homepage header reacts to Google code exchange without reloading and sign-out clears account memory', async t => {
  const { page } = await pageFor(t);
  await page.goto(origin + '/?pricing=1');
  const header = homeHeader(page);
  await header.getByRole('link', { name: 'Sign in', exact: true }).waitFor();
  await page.route('**/api/auth/token', route => {
    assert.equal(route.request().postDataJSON().verifier, 'v'.repeat(43));
    return route.fulfill({ json: session() });
  });
  await page.evaluate(async () => {
    window.headerDocumentMarker = 'same-document';
    sessionStorage.setItem('ps_pkce', 'v'.repeat(43));
    history.replaceState(history.state, '', '/?pricing=1&code=test-code');
    const { initAuth } = await import('/src/lib/auth.ts'); await initAuth();
    const { useStudio } = await import('/src/store/index.ts');
    const { selectAccount } = await import('/src/db/index.ts');
    selectAccount('auth-regression');
    useStudio.setState({ characters: [{ id: 'private-character', name: 'Private character' }], activeCharacterId: 'private-character' });
  });
  await header.getByRole('button', { name: 'Account', exact: true }).click();
  await header.getByRole('region', { name: 'Your account' }).getByText(user.email, { exact: true }).waitFor();
  assert.equal(await page.evaluate(() => window.headerDocumentMarker), 'same-document');
  assert.ok(!page.url().includes('code='));
  await header.getByRole('button', { name: 'Sign out', exact: true }).click();
  await header.getByRole('link', { name: 'Sign in', exact: true }).waitFor();
  assert.equal(await header.getByRole('region', { name: 'Your account' }).count(), 0);
  const cleared = await page.evaluate(async () => {
    const { useStudio } = await import('/src/store/index.ts');
    const { currentAccount } = await import('/src/db/index.ts');
    return { count: useStudio.getState().characters.length, active: useStudio.getState().activeCharacterId, account: currentAccount(), stored: !!localStorage.getItem('ps_auth_tokens') };
  });
  assert.deepEqual(cleared, { count: 0, active: null, account: null, stored: false });
});

test('homepage header handles missing names, broken avatars and expired sessions on mobile', async t => {
  const { page } = await pageFor(t);
  await page.setViewportSize({ width: 375, height: 812 });
  await page.addInitScript(saved => localStorage.setItem('ps_auth_tokens', JSON.stringify(saved)), { ...session(), user: { ...user, name: '', avatarUrl: 'https://avatar.example/broken.png' } });
  await page.route('https://avatar.example/**', route => route.fulfill({ status: 404, body: '' }));
  await page.goto(origin + '/?pricing=1');
  const header = homeHeader(page), account = header.getByRole('button', { name: 'Account', exact: true });
  await account.locator('.account-initials').waitFor(); assert.equal(await account.innerText(), 'A');
  await account.click();
  const panel = header.getByRole('region', { name: 'Your account' });
  await panel.getByText(user.email, { exact: true }).waitFor();
  const box = await panel.boundingBox(); assert.ok(box.x >= 0 && box.x + box.width <= 375);
  await page.route('**/api/billing/entitlements', route => route.fulfill({ status: 401, json: { error: 'Expired' } }));
  await page.route('**/api/auth/refresh', route => route.fulfill({ status: 401, json: { error: 'Expired' } }));
  await page.evaluate(async () => {
    const { apiFetch } = await import('/src/lib/api.ts');
    try { await apiFetch('/api/billing/entitlements'); } catch { /* Expected expiry. */ }
  });
  await header.getByRole('link', { name: 'Sign in', exact: true }).waitFor();
  assert.equal(await panel.count(), 0);
});
