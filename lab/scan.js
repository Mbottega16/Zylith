/* Zylith static scanner.
 * Reads a game package (a Map of path -> Uint8Array) and answers two questions:
 *   1. Does it look like a web game?
 *   2. Does it contain code that steals data, mines coins, or tricks the player?
 * It never runs the package. Run the sandbox test (frame.js) for that.
 * Works in the browser (window.ZylithScan) and in Node (module.exports). */
(function (root) {
  'use strict';

  const LIMITS = { files: 4000, totalBytes: 300 * 1024 * 1024, fileBytes: 80 * 1024 * 1024, textBytes: 8 * 1024 * 1024 };

  const BLOCK_EXT = new Set(['exe', 'dll', 'bat', 'cmd', 'com', 'scr', 'msi', 'ps1', 'psm1', 'vbs', 'vbe', 'wsf', 'hta', 'cpl',
    'lnk', 'reg', 'jar', 'apk', 'ipa', 'dmg', 'pkg', 'deb', 'rpm', 'appimage', 'so', 'dylib', 'crx', 'xpi', 'msc', 'iso', 'sys', 'drv']);
  const REVIEW_EXT = new Set(['php', 'asp', 'aspx', 'jsp', 'py', 'pl', 'rb', 'sh', 'bash', 'zsh', 'cgi', 'swf', 'zip', 'rar', '7z', 'tar', 'gz', 'tgz', 'bz2']);
  const TEXT_EXT = new Set(['html', 'htm', 'js', 'mjs', 'cjs', 'css', 'json', 'txt', 'xml', 'svg', 'md', 'glsl', 'vert', 'frag', 'tmx', 'tsx',
    'atlas', 'csv', 'webmanifest', 'map', 'ts', 'lua', 'yml', 'yaml', 'ini', 'fnt', 'tmj', 'scss', 'sass', 'less', 'styl', 'tsx', 'jsx', 'vue', 'svelte', 'coffee', 'pug', 'hbs', 'ejs', 'mdx', 'toml', 'lock', 'cfg', 'conf', 'sql', 'ase', 'gdscript']);
  const ASSET_EXT = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'avif', 'bmp', 'ico', 'cur', 'mp3', 'ogg', 'oga', 'wav', 'm4a', 'aac', 'flac', 'opus',
    'mp4', 'webm', 'm4v', 'ogv', 'woff', 'woff2', 'ttf', 'otf', 'eot', 'wasm', 'glb', 'gltf', 'bin', 'obj', 'mtl', 'fbx', 'hdr', 'ktx', 'ktx2',
    'basis', 'dds', 'data', 'mem', 'unityweb', 'pck', 'sf2', 'mid', 'midi', 'wad', 'dat', 'tga', 'psd', 'ase', 'aseprite', 'pdf', 'gz']);

  // Hosts a game may load libraries from. The sandbox allows scripts and fonts from these hosts only.
  const CDN_HOSTS = ['cdnjs.cloudflare.com', 'cdn.jsdelivr.net', 'unpkg.com', 'ajax.googleapis.com', 'code.jquery.com',
    'fonts.googleapis.com', 'fonts.gstatic.com', 'stackpath.bootstrapcdn.com', 'maxcdn.bootstrapcdn.com', 'cdn.skypack.dev', 'esm.sh'];

  const ext = p => { const m = /\.([a-z0-9]+)$/i.exec(p); return m ? m[1].toLowerCase() : ''; };
  const dec = new TextDecoder('utf-8', { fatal: false });

  // ---- text rules ---------------------------------------------------------
  // sev: critical blocks the package. high = 5 points, medium = 3, low = 1.
  const RULES = [
    { id: 'miner', sev: 'critical', re: /coinhive|coin-hive|cryptonight|cryptoloot|minero\.cc|webminepool|authedmine|deepminer|stratum\+tcp|jsecoin|nicehash|xmrig|crypto-?jacking|\bmonero\b/i,
      msg: 'Crypto-miner marker. The code may use your CPU to mine coins.' },
    { id: 'webhook-exfil', sev: 'critical', re: /discord(?:app)?\.com\/api\/webhooks\/|api\.telegram\.org\/bot|hooks\.slack\.com\/services\/|pastebin\.com\/api|grabify|iplogger|webhook\.site/i,
      msg: 'Sends data to a chat webhook or an IP logger. This is the usual way stolen data leaves a page.' },
    { id: 'shell-command', sev: 'critical', re: /powershell(?:\.exe)?\s+(?:-|\/)(?:e|enc|encodedcommand|nop|w\s+hidden|windowstyle)|cmd(?:\.exe)?\s+\/c\s|mshta(?:\.exe)?\s|certutil\s+-urlcache|regsvr32\s+\/s|wscript\.shell|Scripting\.FileSystemObject|Shell\.Application|bitsadmin\s+\/transfer|curl[^\n"']{0,80}\|\s*(?:ba)?sh/i,
      msg: 'Contains an operating-system shell command. A browser game never needs one.' },
    { id: 'clipboard-command', sev: 'critical', re: /clipboard\.writeText\s*\([^)]{0,300}(?:powershell|cmd\s*\/c|mshta|curl|wget|bash|\.exe)|execCommand\(\s*['"]copy['"]\s*\)[\s\S]{0,300}(?:powershell|mshta|cmd\s*\/c)/i,
      msg: 'Copies a command to your clipboard so you paste it into a terminal ("ClickFix" trick).' },
    { id: 'extension-install', sev: 'high', re: /chrome\.webstore\.install|addons\.mozilla\.org\/.{0,40}\/addon\/|chromewebstore\.google\.com\/detail/i,
      msg: 'Tries to install a browser extension.' },
    { id: 'eval-decode', sev: 'high', re: /(?:\beval|\bFunction|setTimeout|setInterval)\s*\(\s*(?:atob|unescape|decodeURIComponent|String\.fromCharCode)\s*\(/,
      msg: 'Decodes a hidden string and runs it as code.' },
    { id: 'doc-write-unescape', sev: 'high', re: /document\.write\s*\(\s*(?:unescape|atob|decodeURIComponent)\s*\(/,
      msg: 'Writes decoded hidden markup into the page.' },
    { id: 'packed-eval', sev: 'medium', re: /eval\s*\(\s*function\s*\(\s*p\s*,\s*a\s*,\s*c\s*,\s*k\s*,\s*e\s*,\s*[dr]\s*\)/,
      msg: 'Packed code (eval packer). Some small games use this to save space. The scanner cannot read it.' },
    { id: 'obfuscated', sev: 'medium', re: /_0x[a-f0-9]{4,6}/g, min: 40,
      msg: 'Obfuscated code (obfuscator.io style). Honest games rarely need it.' },
    { id: 'redirect', sev: 'high', re: /(?:\blocation(?:\.href)?\s*=|\blocation\.(?:replace|assign)\s*\()\s*['"`]https?:\/\//i,
      msg: 'Sends the player to another website.' },
    { id: 'meta-refresh', sev: 'high', markup: true, re: /<meta[^>]+http-equiv\s*=\s*["']?refresh/i, msg: 'Page redirects itself with a meta refresh tag.' },
    { id: 'top-nav', sev: 'high', re: /\b(?:top|parent)\.location\b|window\.(?:top|parent)\.location|\.opener\.location/i, msg: 'Tries to change the address of the page that holds it.' },
    { id: 'top-access', sev: 'medium', re: /\b(?:window\.)?(?:top|parent)\.(?:document|postMessage|frames)\b|window\.opener\b/, msg: 'Reaches for the page that holds it.' },
    { id: 'password-field', sev: 'high', markup: true, re: /<input[^>]+type\s*=\s*["']?password|autocomplete\s*=\s*["'](?:cc-number|current-password|new-password)|name\s*=\s*["'](?:cardnumber|cvv|cvc)["']/i,
      msg: 'Asks for a password or card number. A game does not need either.' },
    { id: 'phish-text', sev: 'high', re: /enter your (?:password|seed phrase|private key|card number)|verify your (?:account|identity|wallet)|sign in to (?:continue|your account)|connect (?:your )?wallet|seed phrase|private key/i,
      msg: 'Phishing wording (password, wallet, or account prompts).' },
    { id: 'scare-text', sev: 'high', re: /your (?:computer|device|pc|browser) (?:is|has been) (?:infected|hacked|compromised)|virus (?:was )?detected|flash player (?:is )?(?:out of date|needs? (?:to be )?updat)|call (?:microsoft|apple|tech) support|you have won (?:a|an) /i,
      msg: 'Scare or prize text of the kind used in scams.' },
    { id: 'download-exe', sev: 'high', re: /["'`][^"'`\s]{1,200}\.(?:exe|msi|scr|bat|apk|dmg|jar|ps1|vbs)(?:\?[^"'`]*)?["'`]/i,
      msg: 'Points to an executable file download.' },
    { id: 'clipboard-read', sev: 'high', re: /clipboard\.read(?:Text)?\s*\(/, msg: 'Reads your clipboard.' },
    { id: 'cookie-read', sev: 'medium', re: /document\.cookie\b/, msg: 'Reads or writes cookies.' },
    { id: 'beacon', sev: 'medium', re: /navigator\.sendBeacon\s*\(/, msg: 'Sends data in the background with sendBeacon.' },
    { id: 'websocket', sev: 'medium', re: /new\s+WebSocket\s*\(\s*['"`]wss?:\/\/(?!localhost|127\.0\.0\.1)/i, msg: 'Opens a WebSocket to an outside server (online play or data exfiltration).' },
    { id: 'hidden-iframe', sev: 'high', markup: true, re: /<iframe[^>]+(?:width\s*=\s*["']?0|height\s*=\s*["']?0|display\s*:\s*none|visibility\s*:\s*hidden)/i, msg: 'Hidden frame. Hidden frames load tracking or attack pages.' },
    { id: 'hidden-iframe-js', sev: 'high', re: /createElement\(\s*['"]iframe['"]\s*\)[\s\S]{0,240}(?:display\s*=\s*['"]none|visibility\s*=\s*['"]hidden|\.width\s*=\s*['"]?0|\.height\s*=\s*['"]?0)/,
      msg: 'Creates a hidden frame.' },
    { id: 'external-iframe', sev: 'medium', markup: true, re: /<iframe[^>]+src\s*=\s*["']https?:\/\//i, msg: 'Embeds an outside web page.' },
    { id: 'meta-csp-strip', sev: 'low', markup: true, re: /<meta[^>]+Content-Security-Policy/i, msg: 'Sets its own security policy (the sandbox policy still applies).' },
    { id: 'device-access', sev: 'medium', re: /getUserMedia|getDisplayMedia|navigator\.geolocation|Notification\.requestPermission|requestMIDIAccess|navigator\.(?:bluetooth|usb|serial|hid)\b/,
      msg: 'Asks for the camera, microphone, screen, location, or a device.' },
    { id: 'service-worker', sev: 'medium', re: /serviceWorker\.register\s*\(/, msg: 'Registers a service worker (survives after you close the game).' },
    { id: 'remote-code', sev: 'high', re: /importScripts\s*\(\s*['"`]https?:|\bimport\s*\(\s*['"`]https?:|\.src\s*=\s*['"`]https?:\/\/(?!(?:cdnjs\.cloudflare\.com|cdn\.jsdelivr\.net|unpkg\.com|ajax\.googleapis\.com|code\.jquery\.com))/i,
      msg: 'Loads more code from an outside server at run time.' },
    { id: 'tab-trap', sev: 'medium', re: /onbeforeunload\s*=|addEventListener\(\s*['"]beforeunload|history\.pushState[\s\S]{0,80}(?:popstate|setInterval)|setInterval\([^)]{0,80}debugger|\bwhile\s*\(\s*(?:true|1)\s*\)\s*\{\s*\}/,
      msg: 'Tries to trap the tab (blocks closing, or freezes the page).' },
    { id: 'popup', sev: 'low', re: /window\.open\s*\(/, msg: 'Opens new windows.' },
    { id: 'fingerprint', sev: 'low', re: /getBattery|navigator\.plugins|deviceMemory|WebGLRenderingContext[\s\S]{0,60}getParameter\(\s*37446/, msg: 'Reads device details that can identify you.' },
    { id: 'download-trigger', sev: 'low', re: /\.download\s*=|<a[^>]+\sdownload\b/i, msg: 'Triggers a file download.' },
  ];
  const WEIGHT = { critical: 100, high: 5, medium: 3, low: 1 };

  // ---- game signals -------------------------------------------------------
  const SIGNALS = {
    render: /<canvas|getContext\s*\(\s*['"`](?:2d|webgl2?|webgpu|bitmaprenderer)|\bPIXI\b|\bTHREE\b|\bPhaser\b|\bBABYLON\b|\bkaboom\b|\bkaplay\b|createjs|\bCanvasRenderingContext2D\b|<svg[^>]+(?:viewBox)/i,
    loop: /requestAnimationFrame|setInterval\s*\(|setTimeout\s*\([^)]*,\s*\d{1,3}\s*\)|\bPhaser\b|\bgameLoop\b|\bgame_loop\b|\bupdate\s*\(\s*(?:dt|delta|time)/i,
    input: /keydown|keyup|keypress|mousedown|mouseup|pointerdown|touchstart|gamepad|\.onclick|addEventListener\(\s*['"`]click|\bonclick\s*=/i,
    audio: /AudioContext|new\s+Audio\s*\(|\bHowl\b|<audio|\bhowler\b/i,
    state: /\bscore\b|\blives\b|\bgame\s*over\b|\bhigh\s*score\b|\bhighscore\b|\blevel\b|\bplayer\b|\benemy\b|\benemies\b|\bhealth\b|\brestart\b|\bplay again\b|\bnew game\b/ig,
    engine: /\b(?:phaser|pixi(?:\.js)?|three(?:\.js)?|babylon(?:\.js)?|p5(?:\.js)?|kaboom|kaplay|melonjs|excalibur|matter-js|planck|cannon(?:-es)?|playcanvas|gdevelop|littlejs|kontra|zzfx|howler|rot\.js|boardgame\.io|createjs|easeljs|crafty|impact\.js|enchant\.js|cocos2d|egret|laya)\b/i,
  };

  function hostOf(u) { try { return new URL(u).hostname.toLowerCase(); } catch (e) { return ''; } }
  const isCdn = h => CDN_HOSTS.some(c => h === c || h.endsWith('.' + c));

  function snippet(text, index) {
    const a = Math.max(0, index - 30), b = Math.min(text.length, index + 90);
    return text.slice(a, b).replace(/\s+/g, ' ').trim();
  }

  function startsWith(bytes, sig) { return sig.every((v, i) => bytes[i] === v); }
  function disguised(path, bytes) {
    // A media file or data file that is really a program or a script.
    if (startsWith(bytes, [0x4d, 0x5a]) && ext(path) !== 'wasm') return 'Windows program (MZ header)';
    if (startsWith(bytes, [0x7f, 0x45, 0x4c, 0x46])) return 'Linux program (ELF header)';
    if (startsWith(bytes, [0xcf, 0xfa, 0xed, 0xfe]) || startsWith(bytes, [0xca, 0xfe, 0xba, 0xbe]) || startsWith(bytes, [0xfe, 0xed, 0xfa, 0xcf])) return 'Mac or Java program';
    if (startsWith(bytes, [0x23, 0x21])) return 'shell script (#! header)';
    if (ASSET_EXT.has(ext(path)) && ext(path) !== 'data' && ext(path) !== 'bin' && ext(path) !== 'dat') {
      const head = dec.decode(bytes.subarray(0, 64)).trimStart();
      if (/^(?:<script|<html|<!doctype|function\s|var\s|const\s|eval\()/i.test(head)) return 'script inside a media file';
    }
    return '';
  }

  function pickEntry(paths) {
    const htmls = paths.filter(p => /\.html?$/i.test(p));
    if (!htmls.length) return '';
    const depth = p => p.split('/').length;
    const idx = htmls.filter(p => /(^|\/)index\.html?$/i.test(p)).sort((a, b) => depth(a) - depth(b) || a.length - b.length);
    return idx[0] || htmls.sort((a, b) => depth(a) - depth(b) || a.length - b.length)[0];
  }

  /** @param {Map<string, Uint8Array>} files  @param {{entry?:string}} [opts] */
  function scan(files, opts) {
    opts = opts || {};
    const findings = [];       // {id, sev, msg, file, sample, count}
    const notes = [];          // plain facts for the report
    const add = (id, sev, msg, file, sample, count) => findings.push({ id, sev, msg, file: file || '', sample: sample || '', count: count || 1 });

    const paths = [...files.keys()];
    let total = 0;
    for (const b of files.values()) total += b.length;
    const stats = { files: paths.length, bytes: total };

    // 1. Size and path checks
    if (paths.length > LIMITS.files) add('too-many-files', 'critical', `Package has ${paths.length} files. The limit is ${LIMITS.files}.`);
    if (total > LIMITS.totalBytes) add('too-big', 'critical', `Package is ${(total / 1048576).toFixed(0)} MB unpacked. The limit is ${LIMITS.totalBytes / 1048576} MB.`);
    for (const p of paths) {
      if (files.get(p).length > LIMITS.fileBytes) add('file-too-big', 'critical', 'One file is larger than ' + LIMITS.fileBytes / 1048576 + ' MB.', p);
      if (p.split('/').includes('..') || p.startsWith('/') || /^[a-z]:/i.test(p)) add('bad-path', 'critical', 'File path tries to leave the package folder.', p);
    }

    // 2. File types
    const unknown = [];
    for (const p of paths) {
      const e = ext(p), bytes = files.get(p);
      if (/(^|\/)\.[^/]*$/.test(p)) continue; // dotfiles such as .gitignore
      if (BLOCK_EXT.has(e)) { add('program-file', 'critical', `Program or installer file (.${e}). A browser game does not need it.`, p); continue; }
      if (REVIEW_EXT.has(e)) { add('review-file', 'medium', `File type .${e} is not part of a browser game (server code, script, or archive).`, p); continue; }
      const d = disguised(p, bytes);
      if (d) add('disguised', 'critical', `File name says one thing, content is another: ${d}.`, p);
      if (e && !TEXT_EXT.has(e) && !ASSET_EXT.has(e)) unknown.push(p);
    }
    if (unknown.length) add('unknown-types', unknown.length > 10 ? 'medium' : 'low', `${unknown.length} file(s) have an unfamiliar type: ${unknown.slice(0, 4).join(', ')}${unknown.length > 4 ? ', ...' : ''}.`);

    // 3. Entry page
    const entry = opts.entry && files.has(opts.entry) ? opts.entry : pickEntry(paths);
    let notAGame = '';
    if (!entry) {
      const pkg = files.get('package.json');
      let build = false;
      if (pkg) { try { build = !!JSON.parse(dec.decode(pkg)).scripts?.build; } catch (e) { /* ignore */ } }
      notAGame = build
        ? 'This is source code that needs a build step (npm run build). It has no HTML page to open. Look for its hosted page or a dist/ build.'
        : 'No HTML page found. Zylith runs games that start from an HTML page.';
    }

    // 4. Text rules
    const hits = new Map();   // rule id -> {count, file, sample}
    const signals = { render: false, loop: false, input: false, audio: false, engine: '', stateWords: 0 };
    const stateSeen = new Set();
    const externalHosts = new Map();
    let textFiles = 0;
    for (const p of paths) {
      const e = ext(p);
      if (!TEXT_EXT.has(e) || e === 'map') continue;
      const bytes = files.get(p);
      if (bytes.length > LIMITS.textBytes) { notes.push(`${p} is large (${(bytes.length / 1048576).toFixed(1)} MB). Only its first ${LIMITS.textBytes / 1048576} MB was scanned.`); }
      const text = dec.decode(bytes.length > LIMITS.textBytes ? bytes.subarray(0, LIMITS.textBytes) : bytes);
      textFiles++;
      if (e === 'md' || e === 'txt') continue; // docs do not run
      const isMarkup = e === 'html' || e === 'htm' || e === 'svg';
      for (const r of RULES) {
        if (r.markup && !isMarkup) continue;
        r.re.lastIndex = 0;
        const m = r.re.exec(text);
        if (!m) continue;
        if (r.min) { let n = 1; while (r.re.exec(text)) if (++n >= r.min) break; if (n < r.min) continue; }
        const prev = hits.get(r.id);
        if (prev) { prev.count++; continue; }
        hits.set(r.id, { count: 1, file: p, sample: snippet(text, m.index) });
      }
      if (e === 'js' || e === 'mjs' || e === 'html' || e === 'htm' || e === 'cjs') {
        for (const k of ['render', 'loop', 'input', 'audio']) if (!signals[k] && SIGNALS[k].test(text)) signals[k] = true;
        if (!signals.engine) { const m = SIGNALS.engine.exec(text); if (m) signals.engine = m[0].toLowerCase(); }
        for (const w of text.slice(0, 2e6).match(SIGNALS.state) || []) stateSeen.add(w.toLowerCase());
      }
      // external resources
      const urlRe = /<(?:script|img|iframe|source|audio|video|embed|link)[^>]*?(?:src|href)\s*=\s*["'](https?:\/\/[^"']+)["']|(?:fetch|open)\s*\(\s*(?:['"]\w+['"]\s*,\s*)?["'`](https?:\/\/[^"'`]+)["'`]|new\s+(?:Image|Audio|Worker|EventSource)\s*\(\s*["'`](https?:\/\/[^"'`]+)/gi;
      let um;
      while ((um = urlRe.exec(text))) {
        const u = um[1] || um[2] || um[3], h = hostOf(u);
        if (!h || /(^|\.)(w3\.org|schema\.org|mozilla\.org|github\.com|localhost)$/.test(h)) continue;
        if (!externalHosts.has(h)) externalHosts.set(h, { cdn: isCdn(h), file: p, how: um[1] ? 'page tag' : 'request' });
      }
    }
    signals.stateWords = stateSeen.size;
    for (const r of RULES) {
      const h = hits.get(r.id);
      if (h) add(r.id, r.sev, r.msg, h.file, h.sample, h.count);
    }
    const outside = [...externalHosts].filter(([, v]) => !v.cdn);
    if (outside.length) add('external-hosts', outside.length > 3 ? 'medium' : 'low',
      `Talks to ${outside.length} outside host(s): ${outside.slice(0, 5).map(([h]) => h).join(', ')}${outside.length > 5 ? ', ...' : ''}. The sandbox blocks all of them.`, outside[0][1].file);
    const cdns = [...externalHosts].filter(([, v]) => v.cdn).map(([h]) => h);
    if (cdns.length) notes.push('Loads libraries from: ' + cdns.join(', ') + '.');

    // 5. Game verdict
    const gameSignals = [];
    if (signals.render) gameSignals.push('draws graphics');
    if (signals.loop) gameSignals.push('runs a game loop or timers');
    if (signals.input) gameSignals.push('reads keys, mouse, or touch');
    if (signals.audio) gameSignals.push('plays sound');
    if (signals.engine) gameSignals.push('uses ' + signals.engine);
    if (signals.stateWords >= 2) gameSignals.push('has game words (score, level, lives...)');
    const looksLikeGame = !!entry && ((signals.render && signals.input) || (signals.input && signals.loop && signals.stateWords >= 2) || (signals.engine && signals.input));

    // 6. Verdict
    let points = 0, critical = 0;
    for (const f of findings) { if (f.sev === 'critical') critical++; else points += WEIGHT[f.sev]; }
    let verdict, headline;
    if (critical) { verdict = 'block'; headline = 'Blocked: contains dangerous content.'; }
    else if (notAGame) { verdict = 'reject'; headline = 'Not a runnable web game.'; }
    else if (points >= 8) { verdict = 'review'; headline = 'High caution: several risky behaviors.'; }
    else if (!looksLikeGame) { verdict = 'review'; headline = 'Does not look like a game from its code. Run the sandbox test.'; }
    else if (points >= 4) { verdict = 'review'; headline = 'Looks like a game, with some behaviors to check.'; }
    else { verdict = 'pass'; headline = 'Looks like a game. No dangerous code found.'; }

    findings.sort((a, b) => WEIGHT[b.sev] - WEIGHT[a.sev]);
    return { verdict, headline, points, entry, notAGame, looksLikeGame, gameSignals, findings, notes, stats, textFiles,
      externalHosts: [...externalHosts].map(([host, v]) => ({ host, ...v })) };
  }

  const api = { scan, pickEntry, ext, LIMITS, CDN_HOSTS, TEXT_EXT, ASSET_EXT };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.ZylithScan = api;
})(typeof window !== 'undefined' ? window : globalThis);
