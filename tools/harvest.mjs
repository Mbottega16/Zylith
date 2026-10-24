// Find open-source browser games that have a live, playable page, and check each page.
// Usage: node tools/harvest.mjs <out.json>
// Needs the `gh` CLI signed in. Writes only candidates whose page loads and allows framing or opening.
import { execFileSync } from 'node:child_process';
import { writeFileSync, existsSync, readFileSync } from 'node:fs';

const out = process.argv[2] || 'harvest.json';
const rawCache = out.replace(/\.json$/, '') + '-raw.json';

const TOPICS = ['html5-game', 'browser-game', 'javascript-game', 'canvas-game', 'phaser', 'phaser3', 'phaser-game',
  'webgl-game', 'threejs-game', 'pixijs', 'kaboom', 'js13k', 'js13kgames', 'js-game', 'web-game', 'puzzle-game',
  'platformer', 'roguelike', 'tower-defense', 'idle-game', 'incremental-game', 'card-game', 'board-game', 'snake-game',
  'tetris', 'chess', 'pokemon', 'fan-game', 'rpg', 'shooter', 'racing-game', 'game-jam', 'ludum-dare', 'gamedev'];
const BAD_HOSTS = /(^|\.)(github\.com|npmjs\.com|youtube\.com|youtu\.be|twitter\.com|x\.com|linkedin\.com|medium\.com|discord\.gg|discord\.com|facebook\.com|reddit\.com|apps\.apple\.com|play\.google\.com|chrome\.google\.com|store\.steampowered\.com|steamcommunity\.com|docs\.google\.com|pypi\.org|crates\.io|readthedocs\.io|gitlab\.com|bitbucket\.org|heroku\.com|herokuapp\.com)$/i;

function gh(args) {
  return JSON.parse(execFileSync('gh', ['api', ...args], { encoding: 'utf8', maxBuffer: 1 << 28 }));
}

function searchAll() {
  const seen = new Map();
  for (const topic of TOPICS) {
    for (const page of [1, 2, 3]) {
      try {
        const r = gh(['-X', 'GET', 'search/repositories', '-f', `q=topic:${topic} stars:>=8`, '-f', 'sort=stars',
          '-f', 'per_page=100', '-f', `page=${page}`]);
        for (const repo of r.items || []) if (!seen.has(repo.id)) seen.set(repo.id, repo);
        if ((r.items || []).length < 100) break;
      } catch (e) { console.error('search failed', topic, page, String(e.message).slice(0, 120)); break; }
    }
    console.error(topic, seen.size);
  }
  return [...seen.values()];
}

function pageUrl(repo) {
  let h = (repo.homepage || '').trim();
  if (!h) return null;
  if (!/^https?:\/\//i.test(h)) h = 'https://' + h;
  try {
    const u = new URL(h);
    if (BAD_HOSTS.test(u.hostname)) return null;
    u.protocol = 'https:';
    return u.href;
  } catch { return null; }
}

import { check } from './lib-check.mjs';

async function pool(items, n, fn) {
  const results = new Array(items.length); let i = 0;
  await Promise.all(Array.from({ length: n }, async () => { while (i < items.length) { const k = i++; results[k] = await fn(items[k]); } }));
  return results;
}

const repos = existsSync(rawCache) ? JSON.parse(readFileSync(rawCache, 'utf8')) : searchAll();
if (!existsSync(rawCache)) writeFileSync(rawCache, JSON.stringify(repos.map(r => ({
  id: r.id, name: r.name, full_name: r.full_name, owner: r.owner.login, description: r.description, homepage: r.homepage,
  topics: r.topics, stars: r.stargazers_count, license: r.license?.spdx_id, archived: r.archived, pushed_at: r.pushed_at, html_url: r.html_url,
  default_branch: r.default_branch, fork: r.fork }))));
const slim = existsSync(rawCache) ? JSON.parse(readFileSync(rawCache, 'utf8')) : [];
const cands = slim.filter(r => !r.fork && pageUrl(r)).map(r => ({ ...r, page: pageUrl(r) }));
console.error('repos', slim.length, 'with page', cands.length);
const checked = await pool(cands, 16, async r => ({ ...r, check: await check(r.page) }));
const good = checked.filter(r => r.check.ok).sort((a, b) => b.stars - a.stars);
console.error('alive', good.length, 'embeddable', good.filter(r => r.check.embed).length);
writeFileSync(out, JSON.stringify(good, null, 1));
