// Run: node --test tests/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const { judge } = createRequire(import.meta.url)('../lab/frame.js');

// Probe snapshots, shaped like the object the frame's probe posts to the parent.
const probe = over => Object.assign({
  booted: true, navigated: false, errors: 0, firstError: '', frames: 0, timers: 0, draws2d: 0, drawsGL: 0,
  mutations: 0, listeners: {}, blocked: [], clipboard: 0, media: 0, download: 0, popups: 0,
  hashes: 0, nonBlank: false,
}, over);

const CANVAS_GAME = probe({ draws2d: 300, frames: 120, timers: 2, listeners: { keydown: 1 }, hashes: 6, nonBlank: true });
const DRAWS_AND_LOOP_NO_INPUT = probe({ draws2d: 300, frames: 120, hashes: 6, nonBlank: true });
const DRAWS_ONLY = probe({ draws2d: 300, nonBlank: true });
const EMPTY_PAGE = probe({});

const failed = r => r.checks.filter(c => !c.ok).map(c => c.id);

test('canvas game with a loop and input gives game', () => {
  const r = judge(CANVAS_GAME);
  assert.equal(r.result, 'game', JSON.stringify(r.checks));
  assert.deepEqual(failed(r), []);
});

test('draws and loops but takes no input gives maybe', () => {
  const r = judge(DRAWS_AND_LOOP_NO_INPUT);
  assert.equal(r.result, 'maybe', JSON.stringify(r.checks));
  assert.deepEqual(failed(r), ['input']);
});

test('draws only, with no loop and no input, gives notgame', () => {
  // maybe needs a loop or input as well as a drawing, so a page that only paints once is not a game.
  const r = judge(DRAWS_ONLY);
  assert.equal(r.result, 'notgame', JSON.stringify(r.checks));
});

test('empty page gives notgame', () => {
  const r = judge(EMPTY_PAGE);
  assert.equal(r.result, 'notgame', JSON.stringify(r.checks));
  assert.ok(failed(r).includes('draws'));
});

test('page that navigates away gives escape', () => {
  const r = judge({ ...CANVAS_GAME, navigated: true });
  assert.equal(r.result, 'escape');
  assert.equal(r.checks.find(c => c.id === 'contained').ok, false);
});

test('page that tries a pop-up gives escape', () => {
  const r = judge({ ...CANVAS_GAME, popups: 1 });
  assert.equal(r.result, 'escape');
  assert.equal(r.checks.find(c => c.id === 'contained').ok, false);
});

test('escape wins over a page that otherwise looks like a game', () => {
  const r = judge({ ...CANVAS_GAME, navigated: true, popups: 2 });
  assert.equal(r.result, 'escape');
});

test('outside request blocks the quiet check but still counts as game', () => {
  const r = judge({ ...CANVAS_GAME, blocked: ['fetch https://example.com/x'] });
  assert.equal(r.result, 'game');
  assert.equal(r.checks.find(c => c.id === 'quiet').ok, false);
  assert.equal(r.tries, 1);
});

test('page that fails to load is not a game', () => {
  const r = judge({ ...CANVAS_GAME, booted: false, errors: 6, frames: 0 });
  assert.notEqual(r.result, 'game', JSON.stringify(r.checks));
  assert.ok(failed(r).includes('loads'));
});
