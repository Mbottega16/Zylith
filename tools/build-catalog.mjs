// Build games.js (the playable catalog) from checked data.
// Usage: node tools/build-catalog.mjs <harvest.json,...> <verified.jsonl,...> [exclude.txt]
// Rows that need the player's own game files, and unofficial ports of commercial games, never get in.
// (The old 2,285-row link index is in git history: commit 743a7ad.)
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const [harvestFile, verifiedFile, excludeFile] = process.argv.slice(2);


const harvest = new Map(harvestFile.split(',').flatMap(f => JSON.parse(readFileSync(f, 'utf8'))).map(r => [r.full_name, r]));
const verified = verifiedFile.split(',').flatMap(f => readFileSync(f, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l)));
const include = new Set(existsSync('tools/reverse-include.txt') ? readFileSync('tools/reverse-include.txt', 'utf8').split('\n').map(l => l.trim().toLowerCase()).filter(l => l && !l.startsWith('#')) : []);
const exclude = new Set(existsSync(excludeFile || '') ? readFileSync(excludeFile, 'utf8').split('\n').map(l => l.trim().toLowerCase()).filter(l => l && !l.startsWith('#')) : []);

const PALETTES = [['#574174', '#d1ff71'], ['#255c63', '#b1f7ed'], ['#713d58', '#ffc0dd'], ['#664d29', '#ffe08b'], ['#334b80', '#b4c7ff']];
const SYMBOLS = ['✳', '◈', '✿', '▲', '☾'];
const hash = s => Math.abs([...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 7));

const GENRES = [
  ['Puzzle', /puzzle|2048|tetris|sudoku|minesweeper|sokoban|match-?3|nonogram|crossword|solitaire|logic|maze/i],
  ['Platformer', /platform|mario|jump|metroidvania/i],
  ['Shooter', /shoot|fps|space invaders|bullet|asteroids|top-?down shooter/i],
  ['Racing', /racing|race|driving|kart|car game/i],
  ['Strategy', /strategy|tower defen[sc]e|rts|4x|tactics|turn-based|auto ?chess/i],
  ['RPG', /\brpg\b|dungeon|roguelike|rogue-?like|pokemon|pokémon|adventure/i],
  ['Card & Board', /\bcard\b|poker|chess|checkers|board game|go game|backgammon|mahjong|domino|othello|reversi/i],
  ['Idle', /idle|clicker|incremental/i],
  ['Word', /word|wordle|typing/i],
  ['Sandbox', /sandbox|voxel|minecraft|craft/i],
  ['Sports', /soccer|football|basketball|golf|pong|tennis|bowling/i],
  ['Simulation', /simulat|farm|city builder|tycoon/i],
];
const genreOf = r => (GENRES.find(([, re]) => re.test(`${r.name} ${r.description || ''} ${(r.topics || []).join(' ')}`)) || ['Arcade'])[0];

const GAMEWORD = /\b(game|puzzle|clone|snake|tetris|chess|2048|pacman|breakout|pong|platformer|roguelike|shooter|minesweeper|sudoku|wordle|flappy|invaders|arcade)\b/i;
const GAMETOPIC = /^(html5-game|browser-game|javascript-game|canvas-game|js13k|js13kgames|phaser-game|webgl-game|threejs-game|puzzle-game|snake-game|tetris|idle-game|incremental-game|tower-defense|platformer|roguelike|card-game|board-game)$/;

function pretty(r, v) {
  const slug = r.name.replace(/[-_.]+/g, ' ').replace(/\s+/g, ' ').trim();
  const cased = slug === slug.toLowerCase() ? slug.replace(/\b\w/g, c => c.toUpperCase()) : slug;
  let t = (v.title || '').replace(/\s*[|•·–—-]\s*.*$/, '').trim();            // "Hextris | A game" -> "Hextris"
  if (/^(\S ){3,}\S?$/.test(t)) t = '';                                       // "T E T R I S" -> use the repo name
  if (t && t.length >= 3 && t.length <= 36 && !/github|untitled|document|index|home|react app|vite/i.test(t)) return t;
  return cased;
}

const entries = [];
const seenUrl = new Set();
for (const v of verified) {
  const r = harvest.get(v.full_name);
  // Hand-picked rows only need a live page: headless Chromium often cannot start WebGL games or pass consent screens.
  const passed = v.ok || (r && r.curated && !(v.probe && v.probe.needs));
  if (!r || !passed || exclude.has(v.full_name.toLowerCase())) continue;
  if (r.reverse && !r.curated && !include.has(v.full_name.toLowerCase())) continue;
  const bonus = (r.reverse ? 2 : 0) + (GAMEWORD.test(`${r.name} ${r.description || ''}`) ? 2 : 0) + ((r.topics || []).some(t => GAMETOPIC.test(t)) ? 1 : 0);
  if (!r.curated && !r.reverse && v.score + bonus < 7) continue;
  if (!r.curated && !r.reverse && r.stars < 60) continue;   // the long tail is mostly demos and tutorials
  const url = (v.final || r.page).replace(/#.*$/, '');
  const key = url.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '').toLowerCase();
  if (seenUrl.has(key)) continue; seenUrl.add(key);
  const n = hash(r.full_name), embed = v.mode === 'embed';
  const title = r.curated ? r.title : pretty(r, v);
  entries.push({
    id: 'web-' + r.full_name.toLowerCase().replace(/[^a-z0-9]+/g, '-'), title, creator: r.owner, genre: r.curated ? r.genre : genreOf(r), mood: r.curated ? 'Hand-picked' : r.reverse ? 'Reverse-engineered' : 'Open source',
    platform: r.reverse ? 'Reverse-engineered' : 'Open-source web game', accessType: 'instant', embed, url, repoUrl: r.html_url || undefined, license: r.license || '', stars: r.stars,
    description: (r.description || `${title}, an open-source browser game by ${r.owner}.`).replace(/\s+/g, ' ').slice(0, 200),
    symbol: SYMBOLS[n % 5], word: title.slice(0, 18).toUpperCase(), colors: PALETTES[n % 5], featured: (r.stars >= 300 || r.curated) && embed, catalogSource: r.curated ? 'Hand-picked + browser check' : 'GitHub topic search + browser check',
  });
}
entries.sort((a, b) => (b.embed - a.embed) || b.stars - a.stars);

const head = '// Zylith catalog. Every row was loaded in a real browser and acted like a game, with no game files supplied by the player. Links only: no game files are hosted here.\n';
writeFileSync('games.js', head + 'window.ZYLITH_GAMES = ' + JSON.stringify(entries) + ';\n');
const re = entries.filter(e => e.platform === 'Reverse-engineered');
console.log(`playable ${entries.length} (embed ${entries.filter(e => e.embed).length}), reverse-engineered ${re.length}`);
