// Open each candidate page in a real browser, inside the same kind of iframe the Zylith player uses,
// and record whether it behaves like a game (draws, loops, reads input).
// Usage: PLAYWRIGHT=<module path> node tools/verify.mjs <harvest.json> <verified.jsonl> [concurrency]
import http from 'node:http';
import { readFileSync, appendFileSync, existsSync } from 'node:fs';

const [inFile, outFile, conc = '6'] = process.argv.slice(2);
const { chromium } = await import(process.env.PLAYWRIGHT || 'playwright');

const PROBE = `(() => {
  if (window.__zp) return;
  const P = window.__zp = { raf: 0, frames: 0, draws: 0, canvases: 0, input: 0, key: 0, mut: 0, audio: 0, errors: 0 };
  const wrap = (o, n, f) => { try { const x = o[n]; if (typeof x === 'function') o[n] = function () { f(); return x.apply(this, arguments); }; } catch (e) {} };
  const raf = window.requestAnimationFrame; window.requestAnimationFrame = cb => { P.raf++; return raf.call(window, t => { P.frames++; cb(t); }); };
  for (const n of ['fillRect','drawImage','fillText','stroke','fill','putImageData','clearRect']) wrap(CanvasRenderingContext2D.prototype, n, () => P.draws++);
  for (const C of [window.WebGLRenderingContext, window.WebGL2RenderingContext]) if (C) for (const n of ['drawArrays','drawElements','drawArraysInstanced','drawElementsInstanced']) wrap(C.prototype, n, () => P.draws++);
  wrap(HTMLCanvasElement.prototype, 'getContext', () => P.canvases++);
  const IN = /^(?:key(?:down|up)|mouse(?:down|up)|pointer(?:down|up)|touchstart|click|gamepadconnected)$/;
  const add = EventTarget.prototype.addEventListener;
  EventTarget.prototype.addEventListener = function (t) { if (IN.test(t)) { P.input++; if (/^key/.test(t)) P.key++; } return add.apply(this, arguments); };
  for (const k of ['AudioContext','webkitAudioContext']) { const A = window[k]; if (A) window[k] = function () { P.audio++; return new A(...arguments); }; }
  addEventListener('error', () => P.errors++);
  addEventListener('DOMContentLoaded', () => { try { new MutationObserver(r => { P.mut += r.length; }).observe(document.documentElement, { childList: true, attributes: true, characterData: true, subtree: true }); } catch (e) {} });
})();`;

const HOST = u => `<!doctype html><body style="margin:0"><iframe id=f src="${u}" style="width:1000px;height:640px;border:0" sandbox="allow-scripts allow-same-origin allow-forms allow-pointer-lock allow-popups allow-modals" allow="fullscreen; gamepad; autoplay"></iframe>`;

const server = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x'); res.writeHead(200, { 'content-type': 'text/html' }); res.end(HOST(u.searchParams.get('u') || ''));
}).listen(0);
const port = server.address().port;

const cands = JSON.parse(readFileSync(inFile, 'utf8'));
const done = new Set(existsSync(outFile) ? readFileSync(outFile, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l).full_name) : []);
const todo = cands.filter(c => !done.has(c.full_name));
console.error('todo', todo.length, 'already', done.size);

const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required', '--mute-audio'] });

async function test(c) {
  const embed = c.check.embed;
  const ctx = await browser.newContext({ viewport: { width: 1000, height: 640 } });
  await ctx.addInitScript(PROBE);
  const page = await ctx.newPage();
  const out = { full_name: c.full_name, mode: embed ? 'embed' : 'tab', ok: false };
  try {
    await page.goto(embed ? `http://127.0.0.1:${port}/?u=${encodeURIComponent(c.check.final || c.page)}` : c.check.final || c.page, { waitUntil: 'domcontentloaded', timeout: 12000 });
    await page.waitForTimeout(3500);
    const frame = embed ? page.frames().find(f => f !== page.mainFrame()) : page.mainFrame();
    if (!frame) throw new Error('no frame');
    const url = frame.url();
    if (embed && (url === 'about:blank' || url.startsWith('chrome-error'))) throw new Error('frame blocked: ' + url);
    // nudge the page like a player would
    await page.mouse.click(500, 320).catch(() => {});
    for (const k of ['Space', 'ArrowRight', 'Enter']) await page.keyboard.press(k).catch(() => {});
    await page.waitForTimeout(1200);
    const p = await frame.evaluate(() => {
      const z = window.__zp || {}, t = (document.body && document.body.innerText || '');
      const area = Math.max(...[...document.getElementsByTagName('canvas')].map(x => { const r = x.getBoundingClientRect(); return r.width * r.height; }), 0);
      return { ...z, text: t.length, links: document.getElementsByTagName('a').length, area: Math.round(area), title: document.title,
        market: (t.match(/\b(download|install|documentation|docs|getting started|pricing|features|releases|contribute|sponsor|changelog|api reference)\b/gi) || []).length,
        needs: /\b(upload|drop|select|choose|load|provide|insert|supply|import|bring)\b[^.\n]{0,40}\b(roms?|isos?|game files?|your (copy|game|own)|assets|disc|dump)\b|\.(pak|wad|z64|nes|sfc|gba|nds)\b|legally (obtained|owned|acquired)|own copy|you (must|need to) own|requires? (a |an |the )?(copy|rom|original|retail)|\bbuy\b[^.\n]{0,30}\b(game|steam)\b/i.test(t),
        gamey: (t.match(/\b(score|level|lives|game over|play|start|restart|new game|high ?score|moves)\b/gi) || []).length };
    });
    out.probe = p;
    let score = 0;
    if (p.area >= 150000) score += 3; else if (p.area >= 40000) score += 1;
    if (p.draws > 200) score += 2;
    if (p.frames > 100) score += 1;
    if (p.key > 0) score += 2; else if (p.input > 0) score += 1;
    if (p.audio) score += 1;
    if (p.gamey >= 2) score += 1;
    if (p.links > 12) score -= 2;
    if (p.text > 1500) score -= 2;
    if (p.market >= 2) score -= 3;
    out.score = score;
    out.ok = score >= 3 && p.input > 0 && !p.needs;
    out.title = p.title;
    out.final = url;
  } catch (e) { out.err = String(e.message).slice(0, 100); }
  await ctx.close();
  return out;
}

let i = 0, okCount = 0;
await Promise.all(Array.from({ length: Number(conc) }, async () => {
  while (i < todo.length) {
    const c = todo[i++];
    const r = await Promise.race([test(c), new Promise(res => setTimeout(() => res({ full_name: c.full_name, ok: false, err: 'timeout' }), 45000))]);
    if (r.ok) okCount++;
    appendFileSync(outFile, JSON.stringify(r) + '\n');
    if (i % 25 === 0) console.error(`${i}/${todo.length} ok=${okCount}`);
  }
}));
await browser.close(); server.close();
console.error('finished ok=', okCount);
