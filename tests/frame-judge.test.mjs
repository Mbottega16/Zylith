// Run: node --test tests/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const { judge, mount } = createRequire(import.meta.url)('../lab/frame.js');

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

test('mount generates a session token and passes it to loader during boot handshake', () => {
  let messageHandler = null;
  const originalWindow = globalThis.window;
  const originalDoc = globalThis.document;
  const originalLoc = globalThis.location;

  try {
    let bootPayload = null;
    const fakeContentWindow = {
      postMessage: msg => { if (msg && msg.zy === 'boot') bootPayload = msg; },
    };
    const fakeFrame = {
      setAttribute: () => {},
      className: '',
      srcdoc: '',
      contentWindow: fakeContentWindow,
      remove: () => {},
    };
    globalThis.window = {
      addEventListener: (evt, fn) => { if (evt === 'message') messageHandler = fn; },
      removeEventListener: (evt, fn) => { if (evt === 'message' && messageHandler === fn) messageHandler = null; },
    };
    globalThis.document = { createElement: () => fakeFrame };
    globalThis.location = { href: 'http://localhost/' };

    const host = { appendChild: () => {} };
    const m = mount(host, { files: new Map(), entry: 'index.html' });

    assert.ok(typeof m.token === 'string' && m.token.length >= 10, 'mount must generate a session token');

    messageHandler({ source: fakeContentWindow, data: { zy: 1, t: 'ready' } });
    assert.ok(bootPayload, 'boot payload must be sent');
    assert.equal(bootPayload.token, m.token, 'token must be passed during boot handshake');

    m.destroy();
  } finally {
    globalThis.window = originalWindow;
    globalThis.document = originalDoc;
    globalThis.location = originalLoc;
  }
});

test('mount rejects any message lacking the session token or with a mismatched token', () => {
  let messageHandler = null;
  const originalWindow = globalThis.window;
  const originalDoc = globalThis.document;
  const originalLoc = globalThis.location;

  try {
    const fakeContentWindow = { postMessage: () => {} };
    const fakeFrame = {
      setAttribute: () => {},
      className: '',
      srcdoc: '',
      contentWindow: fakeContentWindow,
      remove: () => {},
    };
    globalThis.window = {
      addEventListener: (evt, fn) => { if (evt === 'message') messageHandler = fn; },
      removeEventListener: (evt, fn) => { if (evt === 'message' && messageHandler === fn) messageHandler = null; },
    };
    globalThis.document = { createElement: () => fakeFrame };
    globalThis.location = { href: 'http://localhost/' };

    const probes = [];
    const saves = [];
    let navigated = false;
    let fatal = null;

    const host = { appendChild: () => {} };
    const m = mount(host, { files: new Map(), entry: 'index.html' }, {
      onProbe: p => probes.push(p),
      onSave: d => saves.push(d),
      onNavigated: () => { navigated = true; },
      onFatal: msg => { fatal = msg; },
    });

    // Complete boot handshake
    messageHandler({ source: fakeContentWindow, data: { zy: 1, t: 'ready' } });

    // 1. Calls lacking token are ignored
    messageHandler({ source: fakeContentWindow, data: { zy: 1, t: 'probe', p: { draws2d: 100 } } });
    messageHandler({ source: fakeContentWindow, data: { zy: 1, t: 'save', data: { cheat: true } } });
    messageHandler({ source: fakeContentWindow, data: { zy: 1, t: 'navigated' } });
    messageHandler({ source: fakeContentWindow, data: { zy: 1, t: 'fatal', msg: 'fake' } });

    assert.equal(probes.length, 0, 'probe lacking token must be rejected');
    assert.equal(saves.length, 0, 'save lacking token must be rejected');
    assert.equal(navigated, false, 'navigated lacking token must be rejected');
    assert.equal(fatal, null, 'fatal lacking token must be rejected');

    // 2. Calls with wrong token are ignored
    messageHandler({ source: fakeContentWindow, data: { zy: 1, token: 'wrong', t: 'probe', p: { draws2d: 100 } } });
    messageHandler({ source: fakeContentWindow, data: { zy: 1, token: 'wrong', t: 'save', data: { cheat: true } } });
    messageHandler({ source: fakeContentWindow, data: { zy: 1, token: 'wrong', t: 'navigated' } });
    messageHandler({ source: fakeContentWindow, data: { zy: 1, token: 'wrong', t: 'fatal', msg: 'fake' } });

    assert.equal(probes.length, 0, 'probe with mismatched token must be rejected');
    assert.equal(saves.length, 0, 'save with mismatched token must be rejected');
    assert.equal(navigated, false, 'navigated with mismatched token must be rejected');
    assert.equal(fatal, null, 'fatal with mismatched token must be rejected');

    // 3. Calls with valid token are accepted
    messageHandler({ source: fakeContentWindow, data: { zy: 1, token: m.token, t: 'probe', p: { draws2d: 42 } } });
    messageHandler({ source: fakeContentWindow, data: { zy: 1, token: m.token, t: 'save', data: { level: 2 } } });
    messageHandler({ source: fakeContentWindow, data: { zy: 1, token: m.token, t: 'fatal', msg: 'real error' } });
    messageHandler({ source: fakeContentWindow, data: { zy: 1, token: m.token, t: 'navigated' } });

    assert.deepEqual(probes, [{ draws2d: 42 }]);
    assert.deepEqual(saves, [{ level: 2 }]);
    assert.equal(fatal, 'real error');
    assert.equal(navigated, true);

    m.destroy();
  } finally {
    globalThis.window = originalWindow;
    globalThis.document = originalDoc;
    globalThis.location = originalLoc;
  }
});

test('mount ignores repeated ready messages after boot', () => {
  let messageHandler = null;
  const originalWindow = globalThis.window;
  const originalDoc = globalThis.document;
  const originalLoc = globalThis.location;

  try {
    let bootCount = 0;
    const fakeContentWindow = {
      postMessage: msg => { if (msg && msg.zy === 'boot') bootCount++; },
    };
    const fakeFrame = {
      setAttribute: () => {},
      className: '',
      srcdoc: '',
      contentWindow: fakeContentWindow,
      remove: () => {},
    };
    globalThis.window = {
      addEventListener: (evt, fn) => { if (evt === 'message') messageHandler = fn; },
      removeEventListener: (evt, fn) => { if (evt === 'message' && messageHandler === fn) messageHandler = null; },
    };
    globalThis.document = { createElement: () => fakeFrame };
    globalThis.location = { href: 'http://localhost/' };

    const host = { appendChild: () => {} };
    const m = mount(host, { files: new Map(), entry: 'index.html' });

    messageHandler({ source: fakeContentWindow, data: { zy: 1, t: 'ready' } });
    assert.equal(bootCount, 1);

    messageHandler({ source: fakeContentWindow, data: { zy: 1, t: 'ready' } });
    assert.equal(bootCount, 1, 'repeated ready message must not re-boot');

    m.destroy();
  } finally {
    globalThis.window = originalWindow;
    globalThis.document = originalDoc;
    globalThis.location = originalLoc;
  }
});

test('mount.destroy triggers explicit flush before frame removal', () => {
  let messageHandler = null;
  const originalWindow = globalThis.window;
  const originalDoc = globalThis.document;
  const originalLoc = globalThis.location;

  try {
    const events = [];
    const fakeContentWindow = {
      postMessage: msg => { events.push('postMessage: ' + (msg && msg.zy)); },
    };
    const fakeFrame = {
      setAttribute: () => {},
      className: '',
      srcdoc: '',
      contentWindow: fakeContentWindow,
      remove: () => { events.push('frame.remove'); },
    };
    globalThis.window = {
      addEventListener: (evt, fn) => { if (evt === 'message') messageHandler = fn; },
      removeEventListener: (evt, fn) => { if (evt === 'message' && messageHandler === fn) messageHandler = null; },
    };
    globalThis.document = { createElement: () => fakeFrame };
    globalThis.location = { href: 'http://localhost/' };

    const host = { appendChild: () => {} };
    const m = mount(host, { files: new Map(), entry: 'index.html' });

    messageHandler({ source: fakeContentWindow, data: { zy: 1, t: 'ready' } });
    events.length = 0; // clear boot handshake event

    m.destroy();

    assert.deepEqual(events, ['postMessage: flush', 'frame.remove'], 'flush must precede frame removal');
  } finally {
    globalThis.window = originalWindow;
    globalThis.document = originalDoc;
    globalThis.location = originalLoc;
  }
});

test('mount delivers onSave even if save arrives after destroy()', () => {
  let messageHandler = null;
  const originalWindow = globalThis.window;
  const originalDoc = globalThis.document;
  const originalLoc = globalThis.location;

  try {
    const fakeContentWindow = { postMessage: () => {} };
    const fakeFrame = {
      setAttribute: () => {},
      className: '',
      srcdoc: '',
      contentWindow: fakeContentWindow,
      remove: () => {},
    };
    globalThis.window = {
      addEventListener: (evt, fn) => { if (evt === 'message') messageHandler = fn; },
      removeEventListener: (evt, fn) => { if (evt === 'message' && messageHandler === fn) messageHandler = null; },
    };
    globalThis.document = { createElement: () => fakeFrame };
    globalThis.location = { href: 'http://localhost/' };

    let saved = null;
    const host = { appendChild: () => {} };
    const m = mount(host, { files: new Map(), entry: 'index.html' }, {
      onSave: d => { saved = d; },
    });

    messageHandler({ source: fakeContentWindow, data: { zy: 1, t: 'ready' } });

    m.destroy();

    // Now simulate synchronous flush message from pagehide arriving at window
    messageHandler({ source: fakeContentWindow, data: { zy: 1, token: m.token, t: 'save', data: { score: 99 } } });

    assert.deepEqual(saved, { score: 99 }, 'save message after destroy must be delivered to onSave');
  } finally {
    globalThis.window = originalWindow;
    globalThis.document = originalDoc;
    globalThis.location = originalLoc;
  }
});
