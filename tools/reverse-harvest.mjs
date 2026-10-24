// Find reverse-engineered or re-implemented games that have a live web page.
// Inputs: a JSON list of "owner/repo" (the old source index), plus a GitHub topic search.
// Usage: node tools/reverse-harvest.mjs <repos.json> <out.json>   (needs the `gh` CLI)
// Output has the same shape as harvest.json, so verify.mjs and build-catalog.mjs accept it.
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { check } from './lib-check.mjs';

const [reposFile, outFile] = process.argv.slice(2);
const BAD_HOSTS = /(^|\.)(github\.com|npmjs\.com|youtube\.com|youtu\.be|twitter\.com|x\.com|discord\.gg|discord\.com|facebook\.com|reddit\.com|store\.steampowered\.com|steamcommunity\.com|docs\.google\.com|gitlab\.com|bitbucket\.org|itch\.io|patreon\.com|ko-fi\.com|wiki|fandom\.com|gamebanana\.com|nexusmods\.com|moddb\.com)$/i;
const TOPICS = ['decompilation', 'reverse-engineering', 'reimplementation', 'game-reimplementation', 'source-port', 'engine-recreation', 'open-source-engine',
  'openra', 'emscripten', 'webassembly-game', 'wasm-game', 'recompilation', 'static-recompilation', 'fan-game', 'remake', 'game-remake', 'clone'];

const gh = args => JSON.parse(execFileSync('gh', args, { encoding: 'utf8', maxBuffer: 1 << 28 }));
const FIELDS = 'nameWithOwner name description homepageUrl stargazerCount url licenseInfo{spdxId} isFork isArchived repositoryTopics(first:12){nodes{topic{name}}}';

function graphql(list) {
  const out = [];
  for (let i = 0; i < list.length; i += 40) {
    const part = list.slice(i, i + 40);
    const q = 'query{' + part.map((full, k) => { const [o, n] = full.split('/'); return `r${k}:repository(owner:${JSON.stringify(o)},name:${JSON.stringify(n)}){${FIELDS}}`; }).join(' ') + '}';
    try {
      const r = gh(['api', 'graphql', '-f', 'query=' + q]);
      for (const v of Object.values(r.data || {})) if (v) out.push(v);
    } catch (e) { const m = String(e.stdout || e.message); try { for (const v of Object.values(JSON.parse(m).data || {})) if (v) out.push(v); } catch { /* skip batch */ } }
    console.error('graphql', Math.min(i + 40, list.length), '/', list.length, out.length);
  }
  return out;
}

function search() {
  const seen = new Map();
  for (const t of TOPICS) for (const page of [1, 2]) {
    try {
      const r = gh(['api', '-X', 'GET', 'search/repositories', '-f', `q=topic:${t} stars:>=15`, '-f', 'sort=stars', '-f', 'per_page=100', '-f', `page=${page}`]);
      for (const x of r.items || []) seen.set(x.full_name, { nameWithOwner: x.full_name, name: x.name, description: x.description, homepageUrl: x.homepage, stargazerCount: x.stargazers_count, url: x.html_url, licenseInfo: x.license && { spdxId: x.license.spdx_id }, isFork: x.fork, repositoryTopics: { nodes: (x.topics || []).map(n => ({ topic: { name: n } })) } });
      if ((r.items || []).length < 100) break;
    } catch (e) { break; }
  }
  console.error('search', seen.size);
  return [...seen.values()];
}

const repos = new Map();
for (const r of graphql(JSON.parse(readFileSync(reposFile, 'utf8')))) repos.set(r.nameWithOwner, r);
for (const r of search()) if (!repos.has(r.nameWithOwner)) repos.set(r.nameWithOwner, r);

const cands = [];
for (const r of repos.values()) {
  let h = (r.homepageUrl || '').trim();
  if (!h || r.isFork) continue;
  if (!/^https?:\/\//i.test(h)) h = 'https://' + h;
  try { const u = new URL(h); if (BAD_HOSTS.test(u.hostname)) continue; u.protocol = 'https:'; h = u.href; } catch { continue; }
  cands.push({ id: 0, name: r.name, full_name: r.nameWithOwner, owner: r.nameWithOwner.split('/')[0], description: r.description, homepage: r.homepageUrl, topics: r.repositoryTopics.nodes.map(n => n.topic.name),
    stars: r.stargazerCount, license: r.licenseInfo && r.licenseInfo.spdxId, html_url: r.url, page: h, reverse: true });
}
console.error('with homepage', cands.length, 'of', repos.size);

let i = 0;
const good = [];
await Promise.all(Array.from({ length: 12 }, async () => {
  while (i < cands.length) { const c = cands[i++]; c.check = await check(c.page); if (c.check.ok) good.push(c); }
}));
good.sort((a, b) => b.stars - a.stars);
console.error('alive', good.length, 'embeddable', good.filter(g => g.check.embed).length);
writeFileSync(outFile, JSON.stringify(good, null, 1));
