// Run: node --test tests/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

// lab/store.js is a browser script that hangs ZylithStore off window. Stub the globals it reads.
const items = new Map();
let refuse = false;
globalThis.window = {};
globalThis.localStorage = {
  getItem: k => (items.has(k) ? items.get(k) : null),
  setItem: (k, v) => { if (refuse) throw new Error('QuotaExceededError'); items.set(k, String(v)); },
  removeItem: k => { items.delete(k); },
};
createRequire(import.meta.url)('../lab/store.js');
const { writeSave, loadSave } = globalThis.window.ZylithStore;

const KEY = 'zylith-save-game1';

test('save under the limit is kept and returns true', () => {
  items.clear();
  assert.equal(writeSave('game1', { level: 3 }), true);
  assert.deepEqual(loadSave('game1'), { level: 3 });
});

test('save over 2 MB is refused and returns false, leaving the old save in place', () => {
  items.clear();
  assert.equal(writeSave('game1', { level: 1 }), true);
  const before = items.get(KEY);
  const big = { blob: 'x'.repeat(2e6) };   // JSON is over 2,000,000 characters
  assert.equal(writeSave('game1', big), false);
  assert.equal(items.get(KEY), before);
  assert.deepEqual(loadSave('game1'), { level: 1 });
});

test('browser refusing the write (quota) returns false', () => {
  items.clear();
  refuse = true;
  try {
    assert.equal(writeSave('game1', { level: 2 }), false);
  } finally {
    refuse = false;
  }
  assert.equal(items.has(KEY), false);
});
