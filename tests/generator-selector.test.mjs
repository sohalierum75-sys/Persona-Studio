// GUI smoke test for the unified Target Generator selector on the episode page.
// Seeds the per-account IndexedDB, mocks the API (same pattern as
// auth-flow.test.mjs), then drives the real Ready Prompt panel.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'vite';
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

let vite, browser, origin;
before(async () => {
  vite = await createServer({ server: { host: '127.0.0.1', port: 0 } });
  await vite.listen();
  origin = `http://127.0.0.1:${vite.httpServer.address().port}`;
  const candidates = [
    process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE,
    path.join(process.env.LOCALAPPDATA ?? '', 'ms-playwright/chromium-1243/chrome-win64/chrome.exe'),
    path.join(process.env.LOCALAPPDATA ?? '', 'ms-playwright/chromium-1217/chrome-win64/chrome.exe'),
  ].filter(Boolean);
  const installed = candidates.find(p => fs.existsSync(p));
  browser = await chromium.launch({ headless: true, executablePath: installed });
});
after(async () => { await browser?.close(); await vite?.close(); });

const user = { id: 'gen-selector-test', name: 'Gen Test', email: 'gen@example.test', avatarUrl: null };
const now = new Date().toISOString();

const character = {
  id: 'c1', name: 'Aria', referenceAssetIds: [], createdAt: now, updatedAt: now,
  identityFields: [
    { key: 'hair', label: 'Hair', value: 'long silver hair', locked: false },
    { key: 'eyes', label: 'Eyes', value: 'green eyes', locked: false },
  ],
};
const episode = { id: 'e1', characterId: 'c1', title: 'Test Episode', description: '', order: 0, status: 'draft', sceneIds: ['s1'], continuityGroupIds: [], createdAt: now, updatedAt: now };
const outfit = { id: 'o1', characterId: 'c1', name: 'Red dress', description: 'a long red silk dress', garmentType: 'dress', primaryColor: 'red', colorFamily: 'red', accessories: 'gold earrings', notes: '', createdAt: now, updatedAt: now };
const location = { id: 'l1', name: 'Rooftop', category: 'urban', setting: 'a moonlit rooftop garden', lighting: 'cool blue night light', mood: '', notes: '', createdAt: now, updatedAt: now };
const scene = {
  id: 's1', episodeId: 'e1', order: 0, title: 'Scene 01', status: 'draft',
  sceneDescription: 'leans on a railing, looking out over the city',
  action: 'leans on a railing, looking out over the city',
  dialogue: 'We made it.', cameraAngle: 'wide-shot', duration: '', props: 'a paper map', notes: '',
  outfitId: 'o1', locationId: 'l1', prompts: [], createdAt: now, updatedAt: now,
};

async function openEpisodePage(t) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  t.after(() => context.close());
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  await page.route('**/api/**', async route => {
    const pathname = new URL(route.request().url()).pathname;
    if (pathname === '/api/billing/config') return route.fulfill({ json: { configured: false, lifetime: { limit: 50, claimed: null, remaining: null } } });
    if (pathname === '/api/billing/entitlements') {
      return route.fulfill({ json: { plan: 'free', lifetime: { active: false, since: null }, subscription: null, limits: { characters: 5, episodes: 5, prompts: 50, bulkScenes: 10 }, usage: { characters: 1, episodes: 1, prompts: 0 } } });
    }
    return route.fulfill({ json: pathname === '/api/auth/me' ? { user } : { records: [] } });
  });
  await page.goto(origin + '/');
  await page.evaluate(async ([user, records]) => {
    localStorage.setItem('ps_auth_tokens', JSON.stringify({ user, accessToken: 'test-access', refreshToken: 'test-refresh', expiresAt: Date.now() + 3600000 }));
    const db = await indexedDB.open(`PersonaStudio_account_${user.id}`, 3);
    await new Promise((resolve, reject) => {
      db.onupgradeneeded = () => {
        for (const store of ['projects', 'characters', 'episodes', 'scenes', 'outfits', 'locations', 'referenceAssets', 'usageRecords', 'continuityGroups', 'settings']) {
          if (!db.result.objectStoreNames.contains(store)) db.result.createObjectStore(store, { keyPath: 'id' });
        }
        if (!db.result.objectStoreNames.contains('meta')) db.result.createObjectStore('meta', { keyPath: 'key' });
        if (!db.result.objectStoreNames.contains('ops')) db.result.createObjectStore('ops', { keyPath: 'key' });
      };
      db.onsuccess = () => resolve();
      db.onerror = () => reject(db.error);
    });
    await new Promise((resolve, reject) => {
      const tx = db.result.transaction(['characters', 'episodes', 'scenes', 'outfits', 'locations'], 'readwrite');
      for (const [store, value] of records) tx.objectStore(store).put(value);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.result.close();
  }, [user, [['characters', character], ['episodes', episode], ['scenes', scene], ['outfits', outfit], ['locations', location]]]);
  await page.goto(origin + '/episodes/e1');
  await page.getByText('Ready Prompt').waitFor();
  return { page, errors };
}

const promptText = page => page.locator('.ppp-preview').innerText();
const openOptions = page => page.getByRole('button', { name: /Generator options/ }).click();

test('extension panel keeps the selector and options within a narrow viewport in both themes', async t => {
  const { page, errors } = await openEpisodePage(t);
  await page.setViewportSize({ width: 360, height: 720 });
  await page.goto(origin + '/floating-panel.html');
  await page.getByLabel('Select character').selectOption('c1');
  await page.getByLabel('Select episode').selectOption('e1');
  await page.getByRole('button', { name: /Scene 01/ }).click();
  for (const theme of ['light', 'dark']) {
    await page.evaluate(theme => document.documentElement.dataset.theme = theme, theme);
    await page.locator('button[aria-haspopup="menu"]').click();
    const menu = page.getByRole('menu');
    const bounds = await menu.boundingBox();
    assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= 360, 'More menu must fit the viewport');
    await page.getByRole('menuitemradio', { name: /Hailuo/ }).click();
    await page.getByRole('button', { name: 'Toggle generator options' }).click();
    await page.getByText('Hailuo / MiniMax options', { exact: true }).waitFor();
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.screenshot({ path: `test-results/generator-panel-${theme}.png` });
    await page.getByRole('button', { name: 'Toggle generator options' }).click();
  }
  assert.deepEqual(errors, []);
});

test('unified selector: primary tabs + More list, switching preserves scene data', async t => {
  const { page, errors } = await openEpisodePage(t);

  // Primary tabs render in one strip with a More button — no image/video split.
  for (const label of ['Midjourney', 'Stable Diffusion', 'Flux', 'Veo', 'Kling', 'Runway']) {
    assert.equal(await page.getByRole('button', { name: label, exact: true }).count(), 1, `${label} tab missing`);
  }
  await page.locator('button[aria-haspopup="menu"]').click();
  const menu = page.getByRole('menu');
  await menu.waitFor();
  for (const label of ['GPT Image', 'Nano Banana', 'Seedream', 'Ideogram', 'Leonardo', 'Adobe Firefly', 'Hailuo / MiniMax', 'WAN', 'Luma', 'Pika', 'Custom']) {
    assert.ok(await menu.getByText(label, { exact: true }).count() >= 1, `${label} missing from More menu`);
  }
  await page.screenshot({ path: 'test-results/generator-more-open.png', fullPage: false });
  await page.keyboard.press('Escape');

  // Default Midjourney → compact comma prompt; Flux → natural language.
  const mj = await promptText(page);
  assert.ok(mj.includes('Aria, long silver hair, green eyes, wearing'), 'midjourney comma prompt shape');
  assert.ok(mj.includes('moonlit rooftop garden') && mj.includes('wide shot'));
  await page.getByRole('button', { name: 'Flux', exact: true }).click();
  const flux = await promptText(page);
  assert.ok(flux.includes('A photo of Aria'), 'flux prompt should be natural language');
  assert.ok(!flux.includes('--ar'), 'flux must not take MJ parameters');

  // Switching back to Midjourney reproduces the exact same prompt —
  // proving switching only changes formatting, never scene data.
  await page.getByRole('button', { name: 'Midjourney', exact: true }).click();
  assert.equal(await promptText(page), mj);

  await page.screenshot({ path: 'test-results/generator-tabs.png', fullPage: false });
  assert.ok(errors.length === 0, `page errors: ${errors.join('; ')}`);
});

// Wait until the pill background transition has finished (solid rgb, no alpha).
const bgSolid = (page, selector) => page.waitForFunction(
  (sel) => {
    const el = document.querySelector(sel);
    return !!el && getComputedStyle(el).backgroundColor.startsWith('rgb(');
  },
  selector, { timeout: 5000 },
);

test('generator from More becomes active with its own options panel', async t => {
  const { page, errors } = await openEpisodePage(t);

  await page.locator('button[aria-haspopup="menu"]').click();
  await page.getByRole('menuitemradio', { name: /GPT Image/ }).click();

  // The More pill takes over as the active tab: it shows the generator's
  // name and is highlighted exactly like a selected primary tab.
  const pill = page.locator('button[aria-haspopup="menu"]');
  assert.equal((await pill.innerText()).trim(), 'GPT Image');
  assert.equal(await pill.getAttribute('aria-pressed'), 'true');
  await bgSolid(page, 'button[aria-haspopup="menu"]');
  const pillBg = await pill.evaluate(el => getComputedStyle(el).backgroundColor);

  await page.getByRole('button', { name: 'Veo', exact: true }).click();
  await bgSolid(page, 'button[title="Format prompt for Veo"]');
  const veoBg = await page.getByRole('button', { name: 'Veo', exact: true }).evaluate(el => getComputedStyle(el).backgroundColor);
  assert.equal(pillBg, veoBg, 'More pill highlight must match the primary-tab highlight');

  // Back to GPT Image via More — its own options panel renders from the registry.
  await page.locator('button[aria-haspopup="menu"]').click();
  await page.getByRole('menuitemradio', { name: /GPT Image/ }).click();
  await openOptions(page);
  await page.getByText('GPT IMAGE OPTIONS').waitFor();
  for (const label of ['Size', 'Style', 'Composition', 'Character consistency']) {
    assert.ok(await page.getByText(label, { exact: true }).count() >= 1, `GPT Image option "${label}" missing`);
  }
  const gpt = await promptText(page);
  assert.ok(gpt.includes('identical face'), 'default consistency should be included for GPT Image');
  await page.screenshot({ path: 'test-results/generator-more-active.png', fullPage: false });
  assert.ok(errors.length === 0, `page errors: ${errors.join('; ')}`);
});

test('per-generator options persist across switches and reloads', async t => {
  const { page, errors } = await openEpisodePage(t);

  await page.getByRole('button', { name: 'Veo', exact: true }).click();
  await openOptions(page);
  await page.getByText('VEO OPTIONS').waitFor();
  // Defaults applied to the prompt before the user touches anything.
  assert.ok((await promptText(page)).includes('DURATION: 5 seconds.'));

  await page.getByRole('button', { name: '8s' }).click();
  assert.ok((await promptText(page)).includes('DURATION: 8 seconds.'));
  await page.getByRole('button', { name: 'Image → Video' }).click();
  assert.ok((await promptText(page)).includes('REFERENCE: Use the attached image as the first frame.'));

  // Switch away and back — previous Veo options must be restored.
  await page.getByRole('button', { name: 'Flux', exact: true }).click();
  assert.ok((await promptText(page)).includes('A photo of Aria'));
  await page.getByRole('button', { name: 'Veo', exact: true }).click();
  assert.ok((await promptText(page)).includes('DURATION: 8 seconds.'));
  assert.ok((await promptText(page)).includes('REFERENCE:'));
  assert.equal(await page.getByRole('button', { name: '8s' }).getAttribute('aria-pressed'), 'true');

  // Reload — selection and options survive from localStorage.
  await page.reload();
  await page.getByText('Ready Prompt').waitFor();
  await openOptions(page);
  await page.getByText('VEO OPTIONS').waitFor();
  assert.ok((await promptText(page)).includes('DURATION: 8 seconds.'));
  assert.equal(await page.getByRole('button', { name: '8s' }).getAttribute('aria-pressed'), 'true');

  await page.screenshot({ path: 'test-results/generator-veo-options.png', fullPage: false });
  assert.ok(errors.length === 0, `page errors: ${errors.join('; ')}`);
});
