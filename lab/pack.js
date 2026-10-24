/* Zylith package loader: turns a GitHub link, a zip, a folder, or a single file into a
 * Map of path -> Uint8Array. Nothing here runs the game. */
(function (root) {
  'use strict';

  const zipApi = typeof module !== 'undefined' && module.exports ? require('./zip.js') : root.ZylithZip;
  const scanApi = typeof module !== 'undefined' && module.exports ? require('./scan.js') : root.ZylithScan;

  const ROOT_HINTS = ['docs', 'dist', 'build', 'public', 'web', 'www', 'site', 'game', 'app', 'out', 'release'];
  const JUNK = /(^|\/)(__MACOSX|\.git|\.github|node_modules)(\/|$)|(^|\/)(\.DS_Store|Thumbs\.db)$/;

  const MIME = {
    html: 'text/html', htm: 'text/html', js: 'text/javascript', mjs: 'text/javascript', cjs: 'text/javascript', css: 'text/css',
    json: 'application/json', txt: 'text/plain', xml: 'application/xml', svg: 'image/svg+xml', wasm: 'application/wasm',
    png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', avif: 'image/avif', bmp: 'image/bmp', ico: 'image/x-icon',
    mp3: 'audio/mpeg', ogg: 'audio/ogg', oga: 'audio/ogg', wav: 'audio/wav', m4a: 'audio/mp4', aac: 'audio/aac', flac: 'audio/flac', opus: 'audio/ogg',
    mp4: 'video/mp4', webm: 'video/webm', m4v: 'video/mp4', ogv: 'video/ogg',
    woff: 'font/woff', woff2: 'font/woff2', ttf: 'font/ttf', otf: 'font/otf', glb: 'model/gltf-binary', gltf: 'model/gltf+json',
  };
  const ext = p => { const m = /\.([a-z0-9]+)$/i.exec(p); return m ? m[1].toLowerCase() : ''; };
  const mimeOf = p => MIME[ext(p)] || 'application/octet-stream';

  /** Drop junk files and a single wrapping folder (GitHub zips wrap everything in "repo-main/"). */
  function clean(files) {
    const out = new Map();
    for (const [p, b] of files) if (!JUNK.test(p)) out.set(p, b);
    for (;;) {
      const tops = new Set([...out.keys()].map(p => p.split('/')[0]));
      if (tops.size !== 1) break;
      const only = [...tops][0];
      if (![...out.keys()].every(p => p.includes('/') && p.startsWith(only + '/'))) break;
      const next = new Map();
      for (const [p, b] of out) next.set(p.slice(only.length + 1), b);
      out.clear();
      for (const [p, b] of next) out.set(p, b);
      if (out.has('index.html')) break;
    }
    return out;
  }

  /** Choose the folder that holds the page to run. Returns '' for the top, or 'dist' etc. */
  function chooseRoot(paths) {
    if (paths.includes('index.html')) return '';
    for (const h of ROOT_HINTS) if (paths.includes(h + '/index.html')) return h;
    const entry = scanApi.pickEntry(paths);
    return entry && entry.includes('/') ? entry.slice(0, entry.lastIndexOf('/')) : '';
  }

  function rebase(files, rootDir) {
    if (!rootDir) return files;
    const out = new Map();
    for (const [p, b] of files) if (p.startsWith(rootDir + '/')) out.set(p.slice(rootDir.length + 1), b);
    return out;
  }

  async function fromZip(bytes) {
    const files = clean(await zipApi.readZip(bytes));
    const rootDir = chooseRoot([...files.keys()]);
    return { files: rebase(files, rootDir), root: rootDir };
  }

  /** @param {File[]} list from a folder input (webkitRelativePath) or loose files */
  async function fromFiles(list) {
    const files = new Map();
    for (const f of list) {
      const path = (f.webkitRelativePath || f.relativePath || f.name).replace(/\\/g, '/');
      files.set(path, new Uint8Array(await f.arrayBuffer()));
    }
    const cleaned = clean(files);
    const rootDir = chooseRoot([...cleaned.keys()]);
    return { files: rebase(cleaned, rootDir), root: rootDir };
  }

  async function fromFile(file) {
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (/\.zip$/i.test(file.name) || (bytes[0] === 0x50 && bytes[1] === 0x4b)) return fromZip(bytes);
    if (/\.html?$/i.test(file.name)) return { files: new Map([['index.html', bytes]]), root: '' };
    throw new Error('Choose a .zip, a .html file, or a folder.');
  }

  /** Read dropped items, including whole folders. */
  async function fromDrop(dataTransfer) {
    const items = [...dataTransfer.items || []].map(i => i.webkitGetAsEntry && i.webkitGetAsEntry()).filter(Boolean);
    const loose = [...dataTransfer.files || []];
    if (loose.length === 1 && !items.some(e => e.isDirectory)) return fromFile(loose[0]);
    const list = [];
    async function walk(entry, prefix) {
      if (entry.isFile) {
        const file = await new Promise((res, rej) => entry.file(res, rej));
        file.relativePath = prefix + entry.name;
        list.push(file);
      } else if (entry.isDirectory) {
        const reader = entry.createReader();
        for (;;) {
          const batch = await new Promise((res, rej) => reader.readEntries(res, rej));
          if (!batch.length) break;
          for (const child of batch) await walk(child, prefix + entry.name + '/');
        }
      }
    }
    for (const e of items) await walk(e, '');
    if (!list.length) throw new Error('Nothing to read in that drop.');
    return fromFiles(list);
  }

  // ---- GitHub -----------------------------------------------------------
  function parseGithub(input) {
    input = String(input || '').trim();
    let m = /^(?:https?:\/\/)?(?:www\.)?github\.com\/([\w.-]+)\/([\w.-]+?)(?:\.git)?(?:\/(?:tree|blob)\/([^/?#]+)(?:\/([^?#]*))?)?\/?(?:[?#].*)?$/i.exec(input);
    if (m) return { owner: m[1], repo: m[2], branch: m[3] || '', sub: (m[4] || '').replace(/\/$/, '') };
    m = /^(?:https?:\/\/)?([\w-]+)\.github\.io\/([\w.-]+)(?:\/.*)?$/i.exec(input);
    if (m) return { owner: m[1], repo: m[2], branch: '', sub: '' };
    m = /^([\w.-]+)\/([\w.-]+)$/.exec(input);
    if (m) return { owner: m[1], repo: m[2], branch: '', sub: '' };
    return null;
  }

  async function getJson(url, tries, ms) {
    tries = tries || 3; ms = ms || 15000;
    let res;
    for (let attempt = 0; attempt < tries; attempt++) {
      try { res = await fetch(url, { signal: AbortSignal.timeout(ms) }); }
      catch (e) { res = { ok: false, status: 504 }; }            // timeout counts as server trouble
      if (res.status < 500 && res.status !== 429) break;       // retry brief server trouble
      await new Promise(r => setTimeout(r, 700 * (attempt + 1)));
    }
    if (!res.ok) { const e = new Error(`${res.status} from ${new URL(url).hostname}`); e.status = res.status; throw e; }
    return res.json();
  }

  async function fromGithub(input, onStatus) {
    const say = onStatus || (() => {});
    const spec = parseGithub(input);
    if (!spec) throw new Error('That is not a GitHub link. Use https://github.com/owner/repo.');
    const { owner, repo } = spec;
    say('Reading repository details...');
    let meta = null;
    try { meta = await getJson(`https://api.github.com/repos/${owner}/${repo}`); } catch (e) { /* rate limit or private: fall back to guesses */ }
    if (meta && meta.private) throw new Error('That repository is private.');
    const branches = spec.branch ? [spec.branch] : [meta && meta.default_branch, 'main', 'master'].filter((v, i, a) => v && a.indexOf(v) === i);

    async function listBranch(b, quick) {
      say(`Listing files on ${b}...`);
      try { return await getJson(`https://data.jsdelivr.com/v1/packages/gh/${owner}/${repo}@${encodeURIComponent(b)}?structure=flat`, quick ? 1 : 3, quick ? 6000 : 15000); }
      catch (e) {
        if (e.status === 403) return listFromGithub(b);       // jsDelivr refuses repos over ~50 MB
        if (e.status !== 404) throw new Error('Could not list the repository: ' + e.message);
        return null;
      }
    }
    // Fallback for big repos: list with the GitHub tree API, download from raw.githubusercontent.com (both allow browser requests).
    async function listFromGithub(b) {
      const tooBig = 'This repository is too big to list from the browser. Download the ZIP from GitHub and upload it instead.';
      let tree;
      try { tree = await getJson(`https://api.github.com/repos/${owner}/${repo}/git/trees/${encodeURIComponent(b)}?recursive=1`); }
      catch (e) {
        if (e.status === 404) return null;
        throw new Error(e.status === 403 ? 'GitHub is limiting requests from this network for now. Try again in an hour, or upload the ZIP.' : tooBig);
      }
      if (tree.truncated) throw new Error(tooBig);
      return { raw: true, files: tree.tree.filter(t => t.type === 'blob').map(t => ({ name: '/' + t.path, size: t.size || 0 })) };
    }
    function plan(list) {
      const all = new Map(list.files.map(f => [f.name.replace(/^\//, ''), f.size]));
      let paths = [...all.keys()].filter(p => !JUNK.test(p));
      if (spec.sub) paths = paths.filter(p => p.startsWith(spec.sub + '/'));
      const base = spec.sub ? spec.sub + '/' : '';
      const rootRel = chooseRoot(paths.map(p => p.slice(base.length)));
      const rootDir = base + (rootRel ? rootRel + '/' : '');
      const chosen = paths.filter(p => p.startsWith(rootDir));
      return { all, paths, rootDir, chosen, has: chosen.some(p => /\.html?$/i.test(p)) };
    }

    let list = null, branch = '', pl = null;
    for (const b of branches) {
      list = await listBranch(b);
      if (list) { branch = b; pl = plan(list); break; }
    }
    if (!list) throw new Error('Could not find that repository or branch.');
    // Many games keep their built page on a gh-pages branch. Look there when the main branch has no page.
    if (!pl.has && !spec.branch && branch !== 'gh-pages') {
      let alt = null;
      try { alt = await listBranch('gh-pages', true); } catch (e) { /* no gh-pages branch, or the host is slow: keep the main branch result */ }
      const altPlan = alt && plan(alt);
      if (altPlan && altPlan.has) { list = alt; branch = 'gh-pages'; pl = altPlan; }
    }
    const { all, paths, rootDir, chosen, has } = pl;

    const info = {
      title: meta ? meta.name : repo, creator: owner, description: meta && meta.description || '', license: meta && meta.license && meta.license.spdx_id || '',
      stars: meta ? meta.stargazers_count : 0, homepage: meta && meta.homepage || '', repoUrl: `https://github.com/${owner}/${repo}`,
      branch, root: rootDir.replace(/\/$/, ''), missing: [],
    };
    // A big native source tree (C, C++, Rust...) with a stray HTML file is not a web game. Do not download it all.
    const nat = paths.filter(p => /\.(c|cc|cpp|cxx|h|hpp|rs|s|asm|cs|java|kt|go)$/i.test(p)).length;
    const webCount = paths.filter(p => /\.(html?|js|mjs|wasm)$/i.test(p)).length;
    const native = nat > 40 && nat > webCount * 3 && (!has || chosen.length > 400);
    if (!has || native) {
      // Nothing to run in the repo itself. Hand back what we know so the page can offer the hosted page.
      const pkgPath = paths.includes('package.json') ? 'package.json' : '';
      let needsBuild = false;
      if (pkgPath) {
        const pj = list.raw ? `https://raw.githubusercontent.com/${owner}/${repo}/${encodeURIComponent(branch)}/package.json` : `https://cdn.jsdelivr.net/gh/${owner}/${repo}@${branch}/package.json`;
        try { const t = await (await fetch(pj)).json(); needsBuild = !!(t.scripts && t.scripts.build); } catch (e) { /* ignore */ }
      }
      return { files: new Map(), info, needsBuild, native };
    }

    let bytes = 0;
    for (const p of chosen) bytes += all.get(p) || 0;
    const lim = scanApi.LIMITS;
    if (chosen.length > lim.files) throw new Error(`The page folder has ${chosen.length} files. The limit is ${lim.files}.`);
    if (bytes > lim.totalBytes) throw new Error(`The page folder is ${(bytes / 1048576).toFixed(0)} MB. The limit is ${lim.totalBytes / 1048576} MB.`);

    const files = new Map();
    let done = 0, next = 0;
    async function worker() {
      while (next < chosen.length) {
        const p = chosen[next++];
        const enc = p.split('/').map(encodeURIComponent).join('/');
        const url = list.raw ? `https://raw.githubusercontent.com/${owner}/${repo}/${encodeURIComponent(branch)}/${enc}` : `https://cdn.jsdelivr.net/gh/${owner}/${repo}@${encodeURIComponent(branch)}/${enc}`;
        try {
          const res = await fetch(url);
          if (!res.ok) throw new Error(String(res.status));
          files.set(p.slice(rootDir.length), new Uint8Array(await res.arrayBuffer()));
        } catch (e) { info.missing.push(p.slice(rootDir.length)); }
        done++;
        if (done % 10 === 0 || done === chosen.length) say(`Downloading files... ${done} of ${chosen.length}`);
      }
    }
    await Promise.all(Array.from({ length: 8 }, worker));
    return { files, info };
  }

  const api = { clean, chooseRoot, fromZip, fromFile, fromFiles, fromDrop, fromGithub, parseGithub, mimeOf, ext };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.ZylithPack = api;
})(typeof window !== 'undefined' ? window : globalThis);
