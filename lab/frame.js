/* Zylith sandbox frame.
 * Runs an uploaded or imported game inside a locked iframe:
 *   - the iframe has an opaque origin: it cannot read Zylith's page, storage, or cookies;
 *   - a Content-Security-Policy blocks every network request except the game's own files and
 *     a short list of library CDNs, so the game cannot send data out;
 *   - a probe records what the game does (draws, loops, input, blocked requests, escape tries).
 * Parent side: ZylithFrame.mount(). Frame side: loader(), which is stringified into srcdoc. */
(function (root) {
  'use strict';

  const scanApi = typeof module !== 'undefined' && module.exports ? require('./scan.js') : root.ZylithScan;
  const packApi = typeof module !== 'undefined' && module.exports ? require('./pack.js') : root.ZylithPack;

  // ===== Frame side. This function is copied into the iframe as text: it may not use outer variables. =====
  function loader(cfg) {
    'use strict';
    const P = {
      frames: 0, raf: 0, timers: 0, draws2d: 0, drawsGL: 0, canvases: 0, mutations: 0, audio: 0, plays: 0,
      listeners: {}, hashes: 0, nonBlank: false, errors: 0, firstError: '', blocked: [], navigated: false,
      popups: 0, dialogs: 0, storageWrites: 0, clipboard: 0, media: 0, download: 0, pokes: 0, booted: false,
    };
    const seenHash = new Set();
    const post = m => { try { parent.postMessage(Object.assign({ zy: 1 }, m), '*'); } catch (e) { /* ignore */ } };
    const snap = () => Object.assign({}, P, { blocked: P.blocked.slice(0, 12) });

    // ---- probe ----
    const wrap = (obj, name, fn) => { try { const o = obj[name]; if (typeof o !== 'function') return; obj[name] = function () { fn.apply(this, arguments); return o.apply(this, arguments); }; } catch (e) { /* ignore */ } };
    const scratch = document.createElement('canvas'); scratch.width = scratch.height = 16;
    const sctx = scratch.getContext('2d', { willReadFrequently: true });
    let lastSample = 0;
    function sample() {
      const t = performance.now();
      if (t - lastSample < 350) return;
      lastSample = t;
      let best = null, area = 0;
      for (const c of document.getElementsByTagName('canvas')) { const a = c.width * c.height; if (a > area) { area = a; best = c; } }
      if (!best) return;
      try {
        sctx.clearRect(0, 0, 16, 16); sctx.drawImage(best, 0, 0, 16, 16);
        const d = sctx.getImageData(0, 0, 16, 16).data; let h = 0, first = -1, varied = false;
        for (let i = 0; i < d.length; i += 4) {
          h = (h * 31 + d[i] + d[i + 1] * 3 + d[i + 2] * 7 + d[i + 3] * 11) | 0;
          const px = d[i + 3] ? (d[i] << 16 | d[i + 1] << 8 | d[i + 2]) : -2;
          if (first === -1) first = px; else if (px !== first) varied = true;
        }
        if (varied) P.nonBlank = true;
        if (!seenHash.has(h) && seenHash.size < 400) { seenHash.add(h); P.hashes = seenHash.size; }
      } catch (e) { /* tainted or lost context */ }
    }
    const rafOrig = window.requestAnimationFrame.bind(window);
    window.requestAnimationFrame = cb => { P.raf++; return rafOrig(t => { P.frames++; try { cb(t); } finally { sample(); } }); };
    const si = window.setInterval, st = window.setTimeout;
    window.setInterval = function () { P.timers++; return si.apply(window, arguments); };
    window.setTimeout = function () { P.timers++; return st.apply(window, arguments); };
    for (const n of ['fillRect', 'strokeRect', 'drawImage', 'fillText', 'stroke', 'fill', 'putImageData', 'clearRect']) wrap(CanvasRenderingContext2D.prototype, n, () => { P.draws2d++; });
    for (const C of [window.WebGLRenderingContext, window.WebGL2RenderingContext]) if (C) for (const n of ['drawArrays', 'drawElements', 'drawArraysInstanced', 'drawElementsInstanced']) wrap(C.prototype, n, () => { P.drawsGL++; });
    wrap(HTMLCanvasElement.prototype, 'getContext', () => { P.canvases++; });
    const INPUT = /^(?:key(?:down|up|press)|mouse(?:down|up|move)|pointer(?:down|up|move)|touch(?:start|end|move)|click|wheel|gamepadconnected|deviceorientation|devicemotion)$/;
    wrap(EventTarget.prototype, 'addEventListener', function (type) { if (INPUT.test(type)) P.listeners[type] = (P.listeners[type] || 0) + 1; });
    for (const k of ['AudioContext', 'webkitAudioContext']) { const A = window[k]; if (A) window[k] = function () { P.audio++; return new A(...arguments); }; }
    wrap(HTMLMediaElement.prototype, 'play', () => { P.plays++; });
    window.addEventListener('error', e => { P.errors++; if (!P.firstError) P.firstError = String(e.message || 'error').slice(0, 160); });
    window.addEventListener('unhandledrejection', e => { P.errors++; if (!P.firstError) P.firstError = String(e.reason && e.reason.message || e.reason || 'rejection').slice(0, 160); });
    document.addEventListener('securitypolicyviolation', e => { P.blocked.push(`${e.effectiveDirective}: ${String(e.blockedURI).slice(0, 90)}`); });

    // ---- escape and exfiltration tries: log, then refuse ----
    const refuse = (what, ret) => function () { P.blocked.push(what); return ret; };
    window.open = function () { P.popups++; return null; };
    window.alert = window.confirm = window.prompt = function () { P.dialogs++; return null; };
    if (navigator.sendBeacon) navigator.sendBeacon = refuse('sendBeacon', false);
    // The page policy does not cover WebRTC or WebTransport, so cut them off here.
    for (const k of ['WebSocket', 'EventSource', 'RTCPeerConnection', 'webkitRTCPeerConnection', 'WebTransport']) if (window[k]) window[k] = function () { P.blocked.push(k); throw new DOMException('Blocked by Zylith', 'SecurityError'); };
    try {
      if (navigator.clipboard) for (const k of ['writeText', 'readText', 'write', 'read']) navigator.clipboard[k] = function () { P.clipboard++; return Promise.reject(new DOMException('Blocked by Zylith', 'NotAllowedError')); };
    } catch (e) { /* ignore */ }
    try { if (navigator.mediaDevices) { navigator.mediaDevices.getUserMedia = navigator.mediaDevices.getDisplayMedia = function () { P.media++; return Promise.reject(new DOMException('Blocked by Zylith', 'NotAllowedError')); }; } } catch (e) { /* ignore */ }
    wrap(HTMLAnchorElement.prototype, 'click', function () { if (this.hasAttribute('download')) P.download++; });

    // ---- storage: the opaque origin has none, so give the game a private one that Zylith saves for it ----
    let saved = {};
    function makeStorage(persist) {
      const data = {};
      const api = {
        getItem: k => (k in data ? data[k] : null), setItem(k, v) { data[k] = String(v); P.storageWrites++; flush(); },
        removeItem(k) { delete data[k]; flush(); }, clear() { for (const k in data) delete data[k]; flush(); },
        key: i => Object.keys(data)[i] ?? null, get length() { return Object.keys(data).length; },
      };
      let timer = 0;
      function flush() { if (!persist || timer) return; timer = st(() => { timer = 0; post({ t: 'save', data: Object.assign({}, data) }); }, 1500); }
      api._load = obj => { for (const k in obj) data[k] = String(obj[k]); };
      return new Proxy(api, { get: (t, k) => (k in t ? t[k] : data[k]), set: (t, k, v) => { t.setItem(k, v); return true; }, has: (t, k) => k in t || k in data,
        ownKeys: () => Object.keys(data), getOwnPropertyDescriptor: (t, k) => (k in data ? { value: data[k], enumerable: true, configurable: true, writable: true } : undefined) });
    }
    const local = makeStorage(true), session = makeStorage(false);
    for (const [k, v] of [['localStorage', local], ['sessionStorage', session]]) { try { Object.defineProperty(window, k, { value: v, configurable: true }); } catch (e) { /* ignore */ } }

    // ---- file lookup used while rewriting the page and at run time ----
    const files = new Map();
    let originPath = '';
    const norm = (ref, dir) => {
      let p = String(ref).split('#')[0].split('?')[0];
      try { p = decodeURIComponent(p); } catch (e) { /* keep raw */ }
      const parts = (p.startsWith('/') ? [] : dir.split('/').filter(Boolean)).concat(p.split('/'));
      const out = [];
      for (const s of parts) { if (s === '' || s === '.') continue; if (s === '..') out.pop(); else out.push(s); }
      return out.join('/');
    };
    const lowerIndex = new Map();
    function find(ref, dir) {
      ref = String(ref == null ? '' : ref).trim();
      if (!ref || /^(?:data:|blob:|about:|javascript:|mailto:|#)/i.test(ref)) return null;
      if (/^(?:https?:)?\/\//i.test(ref)) {
        let u; try { u = new URL(ref, 'https://x.invalid'); } catch (e) { return null; }
        if (u.hostname === 'zylith.game') ref = u.pathname;                       // built from import.meta.url
        else if (originPath && u.href.startsWith(originPath)) ref = u.pathname.slice(new URL(originPath).pathname.length); // resolved against Zylith's own page
        else return null;                                                          // outside host: leave for the policy to block
      }
      const p = norm(ref, dir || '');
      if (files.has(p)) return p;
      const low = lowerIndex.get(p.toLowerCase());
      if (low) return low;
      for (const k of files.keys()) if (p.endsWith('/' + k) || k.endsWith('/' + p)) return k;
      return null;
    }
    const urlOf = p => { const f = files.get(p); return f ? (f.url || (f.url = URL.createObjectURL(new Blob([f.buf], { type: f.mime })))) : null; };
    let entryDir = '';
    const mapRef = ref => { const p = find(ref, entryDir); return p ? urlOf(p) : null; };

    // ---- runtime patches so games that load files by name still work ----
    const patchProp = (proto, prop) => {
      const d = Object.getOwnPropertyDescriptor(proto, prop);
      if (!d || !d.set) return;
      Object.defineProperty(proto, prop, { configurable: true, enumerable: d.enumerable, get: d.get, set(v) { d.set.call(this, mapRef(v) || v); } });
    };
    for (const [C, p] of [[HTMLImageElement, 'src'], [HTMLMediaElement, 'src'], [HTMLSourceElement, 'src'], [HTMLScriptElement, 'src'], [HTMLLinkElement, 'href'], [HTMLVideoElement, 'poster']]) patchProp(C.prototype, p);
    const setAttr = Element.prototype.setAttribute;
    Element.prototype.setAttribute = function (n, v) { if (/^(?:src|href|poster|data)$/i.test(n) && !(this instanceof HTMLAnchorElement)) v = mapRef(v) || v; return setAttr.call(this, n, v); };
    const fetchOrig = window.fetch.bind(window);
    window.fetch = function (input, init) {
      const s = typeof input === 'string' ? input : input instanceof URL ? input.href : (input && input.url);
      const m = s && mapRef(s);
      if (m) return fetchOrig(m, init);
      if (s && /^https?:/i.test(s)) P.blocked.push('fetch ' + s.slice(0, 80));
      return fetchOrig(input, init);
    };
    const xhrOpen = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function (method, url) {
      const m = mapRef(url);
      const a = Array.prototype.slice.call(arguments); if (m) a[1] = m; else if (/^https?:/i.test(String(url))) P.blocked.push('xhr ' + String(url).slice(0, 80));
      return xhrOpen.apply(this, a);
    };
    const AudioOrig = window.Audio;
    window.Audio = function (src) { const a = new AudioOrig(); if (src !== undefined) a.src = src; return a; };
    window.Audio.prototype = AudioOrig.prototype;
    const WorkerOrig = window.Worker;
    if (WorkerOrig) window.Worker = function (url, o) { return new WorkerOrig(mapRef(url) || url, o); };

    // ---- rewriting the entry page ----
    const cssCache = new Map();
    function cssUrl(path, stack) {
      if (cssCache.has(path)) return cssCache.get(path);
      const f = files.get(path); if (!f) return null;
      if ((stack || []).includes(path)) return urlOf(path);
      const dir = path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '';
      const out = URL.createObjectURL(new Blob([rewriteCss(new TextDecoder().decode(f.buf), dir, (stack || []).concat(path))], { type: 'text/css' }));
      cssCache.set(path, out);
      return out;
    }
    function rewriteCss(text, dir, stack) {
      text = text.replace(/@import\s+(?:url\(\s*)?(['"])([^'"]+)\1\s*\)?/g, (m, q, ref) => { const p = find(ref, dir); const u = p && cssUrl(p, stack); return u ? `@import url("${u}")` : m; });
      return text.replace(/url\(\s*(['"]?)([^'")]+)\1\s*\)/g, (m, q, ref) => {
        if (/^(?:data:|blob:|#)/i.test(ref)) return m;
        const p = find(ref, dir); if (!p) return m;
        const u = /\.css$/i.test(p) ? cssUrl(p, stack) : urlOf(p);
        return u ? `url("${u}")` : m;
      });
    }
    const modCache = new Map();
    function modUrl(path, stack) {
      if (modCache.has(path)) return modCache.get(path);
      const f = files.get(path); if (!f) return null;
      if ((stack || []).includes(path)) return urlOf(path);
      const dir = path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '';
      const out = URL.createObjectURL(new Blob([rewriteModule(new TextDecoder().decode(f.buf), dir, path, (stack || []).concat(path))], { type: 'text/javascript' }));
      modCache.set(path, out);
      return out;
    }
    function rewriteModule(text, dir, path, stack) {
      text = text.replace(/import\.meta\.url/g, JSON.stringify('https://zylith.game/' + path));
      return text.replace(/(\bimport\s*(?:[\w*{}\s,$]+?\s*from\s*)?|\bexport\s*(?:\*|\{[^}]*\})\s*from\s*|\bimport\s*\(\s*)(['"])(\.{0,2}\/[^'"]+)\2/g, (m, pre, q, spec) => {
        const p = find(spec, dir); const u = p && modUrl(p, stack);
        return u ? pre + q + u + q : m;
      });
    }
    function rewritePage(htmlText, entry) {
      const dir = entry.includes('/') ? entry.slice(0, entry.lastIndexOf('/')) : '';
      entryDir = dir;
      const doc = new DOMParser().parseFromString(htmlText, 'text/html');
      // Remove base tags and connection hints: a hint can leak a host name even when requests are blocked.
      for (const b of doc.querySelectorAll('base,link[rel~="dns-prefetch"],link[rel~="preconnect"],link[rel~="prefetch"],link[rel~="prerender"]')) b.remove();
      const swap = (el, attr, asKind) => {
        const ref = el.getAttribute(attr); if (!ref) return;
        const p = find(ref, dir); if (!p) return;
        const u = asKind === 'css' ? cssUrl(p) : asKind === 'module' ? modUrl(p) : urlOf(p);
        if (u) { el.setAttribute(attr, u); el.removeAttribute('integrity'); el.removeAttribute('crossorigin'); }
      };
      for (const el of doc.querySelectorAll('script[src]')) swap(el, 'src', el.type === 'module' ? 'module' : '');
      for (const el of doc.querySelectorAll('link[href]')) swap(el, 'href', /stylesheet/i.test(el.rel) ? 'css' : '');
      for (const el of doc.querySelectorAll('img[src],source[src],audio[src],video[src],embed[src],input[src],track[src]')) swap(el, 'src');
      for (const el of doc.querySelectorAll('video[poster]')) swap(el, 'poster');
      for (const el of doc.querySelectorAll('object[data]')) swap(el, 'data');
      for (const el of doc.querySelectorAll('[srcset]')) {
        el.setAttribute('srcset', el.getAttribute('srcset').split(',').map(part => { const [u, ...rest] = part.trim().split(/\s+/); const p = find(u, dir); return (p ? urlOf(p) : u) + (rest.length ? ' ' + rest.join(' ') : ''); }).join(', '));
      }
      for (const el of doc.querySelectorAll('style')) el.textContent = rewriteCss(el.textContent, dir, []);
      for (const el of doc.querySelectorAll('[style]')) el.setAttribute('style', rewriteCss(el.getAttribute('style'), dir, []));
      for (const el of doc.querySelectorAll('script:not([src])')) if (el.type === 'module') el.textContent = rewriteModule(el.textContent, dir, entry, [entry]);
      return '<!DOCTYPE html>' + doc.documentElement.outerHTML;
    }

    // ---- poke: send a few key presses and a click, to wake games that wait for input ----
    function poke() {
      P.pokes++;
      const keys = [['ArrowRight', 39], ['ArrowLeft', 37], ['ArrowUp', 38], ['ArrowDown', 40], [' ', 32], ['Enter', 13], ['a', 65], ['d', 68], ['w', 87], ['s', 83], ['z', 90], ['x', 88]];
      const targets = [window, document, document.body, document.getElementsByTagName('canvas')[0]].filter(Boolean);
      for (const [key, code] of keys) for (const t of targets) for (const type of ['keydown', 'keyup']) {
        try { const e = new KeyboardEvent(type, { key, code: key.length === 1 ? 'Key' + key.toUpperCase() : key, keyCode: code, which: code, bubbles: true }); t.dispatchEvent(e); } catch (e) { /* ignore */ }
      }
      const c = document.getElementsByTagName('canvas')[0] || document.body;
      if (c) {
        const r = c.getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + r.height / 2;
        for (const type of ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click']) {
          try { c.dispatchEvent(new (type.startsWith('pointer') ? PointerEvent : MouseEvent)(type, { clientX: x, clientY: y, bubbles: true, button: 0 })); } catch (e) { /* ignore */ }
        }
      }
    }

    // ---- boot ----
    window.addEventListener('message', e => {
      const m = e.data;
      if (!m || m.zy !== 'boot' || P.booted) return;
      P.booted = true;
      originPath = m.origin || '';
      saved = m.saves || {};
      local._load(saved);
      for (const [path, mime, buf] of m.files) { files.set(path, { mime, buf, url: null }); lowerIndex.set(path.toLowerCase(), path); }
      let html;
      try { html = rewritePage(new TextDecoder().decode(files.get(m.entry).buf), m.entry); }
      catch (err) { post({ t: 'fatal', msg: String(err && err.message || err) }); return; }
      document.open(); document.write(html); document.close();
      const leave = () => { P.navigated = true; post({ t: 'navigated' }); };
      window.addEventListener('pagehide', leave);
      window.addEventListener('beforeunload', leave);
      try {
        new MutationObserver(r => { P.mutations += r.length; }).observe(document.documentElement, { childList: true, attributes: true, characterData: true, subtree: true });
      } catch (err) { /* ignore */ }
      window.addEventListener('message', ev => { if (ev.data && ev.data.zy === 'poke') poke(); });
      setInterval(() => { sample(); post({ t: 'probe', p: snap() }); }, 700);
      post({ t: 'booted' });
    });
    post({ t: 'ready' });
  }

  // ===== Parent side =====
  function csp() {
    const cdn = scanApi.CDN_HOSTS.map(h => 'https://' + h).join(' ');
    return ["default-src 'none'", `script-src blob: 'unsafe-inline' 'unsafe-eval' 'wasm-unsafe-eval' ${cdn}`,
      `style-src blob: 'unsafe-inline' ${cdn}`, 'img-src blob: data:', 'media-src blob: data:', `font-src blob: data: ${cdn}`,
      'connect-src blob: data:', 'worker-src blob:', "frame-src 'none'", "object-src 'none'", "form-action 'none'"].join('; ');
  }

  function loaderDoc() {
    return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${csp()}"><style>html,body{margin:0;height:100%;background:#000}</style></head><body><script>(${loader.toString()})({});<\/script></body></html>`;
  }

  /** Judge a probe snapshot. */
  function judge(p) {
    p = Object.assign({ draws2d: 0, drawsGL: 0, frames: 0, timers: 0, mutations: 0, listeners: {}, blocked: [], clipboard: 0, media: 0, download: 0, popups: 0, errors: 0, hashes: 0, nonBlank: false, booted: true, navigated: false, firstError: '' }, p);
    const input = Object.entries(p.listeners || {}).reduce((n, [, c]) => n + c, 0);
    const draws = p.draws2d + p.drawsGL;
    const checks = [];
    const add = (id, ok, label, detail) => checks.push({ id, ok, label, detail: detail || '' });
    add('loads', p.booted && !p.navigated && (p.errors < 6 || p.frames > 5), 'Loads and runs without crashing', p.errors ? `${p.errors} script error(s). First: ${p.firstError}` : '');
    add('draws', draws > 20 || p.mutations > 20 || p.nonBlank, 'Draws something on screen', `${draws} canvas draw calls, ${p.mutations} page changes${p.nonBlank ? ', canvas is not blank' : ''}`);
    add('loop', p.frames >= 30 || p.timers >= 8, 'Runs a game loop', `${p.frames} animation frames, ${p.timers} timer calls`);
    add('input', input > 0, 'Listens for keys, mouse, or touch', input ? Object.keys(p.listeners).join(', ') : 'no input listeners found');
    add('changes', p.hashes >= 2 || p.mutations >= 30, 'The picture changes over time', `${p.hashes} distinct canvas snapshots`);
    const escaped = p.navigated || p.popups > 0;
    add('contained', !escaped, 'Stays inside its box', p.navigated ? 'tried to leave the page' : p.popups ? `${p.popups} pop-up attempt(s) blocked` : '');
    const tries = (p.blocked || []).length + p.clipboard + p.media + p.download;
    add('quiet', tries === 0, 'Makes no outside requests', tries ? `${tries} blocked: ${(p.blocked || []).slice(0, 4).join('; ')}${p.clipboard ? '; clipboard' : ''}${p.media ? '; camera/mic' : ''}${p.download ? '; download' : ''}` : '');
    const core = ['loads', 'draws', 'loop', 'input'].every(id => checks.find(c => c.id === id).ok);
    let result;
    if (escaped) result = 'escape';
    else if (core) result = 'game';
    else if (checks.find(c => c.id === 'draws').ok && (checks.find(c => c.id === 'loop').ok || checks.find(c => c.id === 'input').ok)) result = 'maybe';
    else result = 'notgame';
    return { result, checks, tries };
  }

  /**
   * Mount a package in a sandboxed iframe.
   * @param {HTMLElement} host
   * @param {{files:Map<string,Uint8Array>, entry:string}} pkg
   * @param {{saves?:object, onProbe?:Function, onSave?:Function, onNavigated?:Function, onFatal?:Function}} [hooks]
   */
  function mount(host, pkg, hooks) {
    hooks = hooks || {};
    const frame = document.createElement('iframe');
    frame.className = 'sandbox-frame';
    frame.setAttribute('sandbox', 'allow-scripts allow-pointer-lock');
    frame.setAttribute('allow', 'fullscreen; gamepad; autoplay; accelerometer; gyroscope');
    frame.setAttribute('allowfullscreen', '');
    frame.setAttribute('title', 'Game');
    frame.srcdoc = loaderDoc();
    let alive = true;
    const onMsg = e => {
      if (e.source !== frame.contentWindow || !e.data || e.data.zy !== 1) return;
      const m = e.data;
      if (m.t === 'ready') {
        const list = [], transfer = [];
        for (const [path, bytes] of pkg.files) { const buf = bytes.slice().buffer; list.push([path, packApi.mimeOf(path), buf]); transfer.push(buf); }
        frame.contentWindow.postMessage({ zy: 'boot', entry: pkg.entry, files: list, saves: hooks.saves || {}, origin: location.href.replace(/[^/]*$/, '') }, '*', transfer);
      } else if (m.t === 'probe' && hooks.onProbe) hooks.onProbe(m.p);
      else if (m.t === 'save' && hooks.onSave) hooks.onSave(m.data);
      else if (m.t === 'navigated') { if (alive && hooks.onNavigated) hooks.onNavigated(); }
      else if (m.t === 'fatal' && hooks.onFatal) hooks.onFatal(m.msg);
    };
    window.addEventListener('message', onMsg);
    host.appendChild(frame);
    return {
      frame,
      poke() { try { frame.contentWindow.postMessage({ zy: 'poke' }, '*'); } catch (e) { /* ignore */ } },
      destroy() { alive = false; window.removeEventListener('message', onMsg); frame.remove(); },
    };
  }

  const api = { mount, judge, csp, loaderDoc };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.ZylithFrame = api;
})(typeof window !== 'undefined' ? window : globalThis);
