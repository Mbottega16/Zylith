// Run: PLAYWRIGHT=<playwright module url> node tests/e2e-remove.mjs
// Drives the real page: add two hosted links, remove one, check it stays gone after a reload.
// The site is served by Playwright request routing (no local port), so it runs in the sandbox.
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const root = join(fileURLToPath(import.meta.url), '..', '..');
const { chromium } = await import(process.env.PLAYWRIGHT || 'playwright');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' };
const ORIGIN = 'http://zylith.test';

const STORAGE = 'zylith-library-v1';
const stamp = Date.now();
const KEEP = `Keep Me ${stamp}`, DROP = `Drop Me ${stamp}`;

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
await context.route(`${ORIGIN}/**`, async route => {
  const p = normalize(decodeURIComponent(new URL(route.request().url()).pathname));
  try {
    const body = await readFile(join(root, p === '/' || p === '\\' ? 'index.html' : p));
    await route.fulfill({ status: 200, contentType: types[extname(p)] || 'text/html', body });
  } catch { await route.fulfill({ status: 404, body: '' }); }
});
const page = await context.newPage();
const errors = [];
page.on('pageerror', e => errors.push(e.message));
let failed = 0;
const step = async (name, fn) => { try { await fn(); console.log('ok   ', name); } catch (e) { failed++; console.log('FAIL ', name, '\n     ', String(e.message).split('\n').slice(0, 4).join('\n      ')); } };

const card = title => page.locator('.game-card', { hasText: title });
const stored = () => page.evaluate(k => JSON.parse(localStorage.getItem(k) || '[]'), STORAGE);

async function addHostedLink(title, url) {
  await page.locator('#submitTop').click();
  await page.waitForSelector('#labDialog[open]');
  await page.locator('[data-labtab=link]').click();
  const form = page.locator('#submitForm');
  await form.locator('input[name=title]').fill(title);
  await form.locator('input[name=creator]').fill('Test Studio');
  await form.locator('input[name=url]').fill(url);
  await form.locator('input[name=permission]').check();
  await form.locator('button[type=submit]').click();
  await page.waitForSelector(`.game-card:has-text("${title}")`);
}

async function openCard(title) {
  await card(title).click();
  await page.waitForSelector('#gameDialog[open]');
}

await page.goto(`${ORIGIN}/`);
await page.waitForSelector('.game-card');
// Start from an empty list in this browser profile.
await page.evaluate(k => localStorage.removeItem(k), STORAGE);
await page.reload();
await page.waitForSelector('.game-card');

await step('a hosted link added from the form shows in the list', async () => {
  await addHostedLink(KEEP, 'https://example.com/keep');
  await addHostedLink(DROP, 'https://example.com/drop');
  assert.equal(await card(DROP).count(), 1);
  assert.equal(await card(KEEP).count(), 1);
});

await step('Remove button shows only for hosted links', async () => {
  await openCard(DROP);
  assert.equal(await page.locator('#removeHosted').isVisible(), true);
  await page.locator('#closeGame').click();
  await page.waitForFunction(() => !document.getElementById('gameDialog').open);
  await page.locator('[data-shelf="All games"]').click();
  await page.locator('.game-card:not([data-game^="submitted-"])').first().click();
  await page.waitForSelector('#gameDialog[open]');
  assert.equal(await page.locator('#removeHosted').isVisible(), false, 'catalog row shows Remove');
  await page.locator('#closeGame').click();
  await page.waitForFunction(() => !document.getElementById('gameDialog').open);
  await page.locator('[data-shelf="Recently added"]').click();
});

await step('cancelling the confirm keeps the link', async () => {
  await openCard(DROP);
  page.once('dialog', d => d.dismiss());
  await page.locator('#removeHosted').click();
  await page.waitForTimeout(200);
  assert.equal(await page.locator('#gameDialog').evaluate(d => d.open), true, 'dialog closed after cancel');
  await page.locator('#closeGame').click();
  await page.waitForFunction(() => !document.getElementById('gameDialog').open);
  assert.equal(await card(DROP).count(), 1, 'row vanished after cancel');
  assert.ok((await stored()).some(g => g.title === DROP), 'stored list lost the link after cancel');
});

await step('confirming removes the link from the list and storage', async () => {
  await openCard(DROP);
  page.once('dialog', d => d.accept());
  await page.locator('#removeHosted').click();
  await page.waitForFunction(() => !document.getElementById('gameDialog').open);
  await page.waitForFunction(t => ![...document.querySelectorAll('.game-card h3')].some(h => h.textContent === t), DROP);
  assert.equal(await card(DROP).count(), 0, 'row still in grid');
  assert.equal(await card(KEEP).count(), 1, 'other hosted link was removed too');
  assert.ok(!(await stored()).some(g => g.title === DROP), 'stored list still has the link');
  assert.match(await page.locator('#toast').textContent(), /Removed from your list/);
});

await step('removed link stays gone after a reload', async () => {
  await page.reload();
  await page.waitForSelector('.game-card');
  // Search the whole catalog, not just the first page of cards.
  await page.locator('#searchInput').fill(DROP);
  assert.equal(await card(DROP).count(), 0, 'removed link came back after reload');
  assert.ok(!(await stored()).some(g => g.title === DROP), 'storage restored the link');
  await page.locator('#searchInput').fill(KEEP);
  await page.waitForSelector(`.game-card:has-text("${KEEP}")`);
  assert.ok((await stored()).some(g => g.title === KEEP), 'other hosted link lost on reload');
});

await step('the other hosted link is still playable after removal', async () => {
  await openCard(KEEP);
  assert.equal(await page.locator('#removeHosted').isVisible(), true);
  await page.locator('#closeGame').click();
});

assert.deepEqual(errors, [], 'page errors: ' + errors.join(' | '));
await browser.close();
process.exit(failed ? 1 : 0);
