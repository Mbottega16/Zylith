/* Zylith lab UI: the player, and the Add-a-game flow (fetch -> scan -> sandbox test -> keep). */
(function (root) {
  'use strict';

  const { ZylithScan: S, ZylithPack: Pack, ZylithFrame: Frame, ZylithStore: Store } = root;
  const $ = (s, r = document) => r.querySelector(s);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const TEST_MS = 9000;
  const hooks = { toast() {}, changed() {} };

  const lab = $('#labDialog'), player = $('#playerDialog');
  let cur = null;          // the package being tested
  let playing = null;      // the mounted player frame
  let timers = [];

  const clearTimers = () => { timers.forEach(clearTimeout); timers = []; };
  const later = (fn, ms) => timers.push(setTimeout(fn, ms));
  const mb = n => (n / 1048576).toFixed(n > 10485760 ? 0 : 1) + ' MB';

  // ---------- player ----------
  function stopPlayer() {
    if (playing) { playing.destroy(); playing = null; }
    $('#playerStage').textContent = '';
    $('#playerStage').classList.remove('has-msg');
  }
  function playerMessage(html) {
    const stage = $('#playerStage');
    const div = document.createElement('div');
    div.className = 'player-msg';
    div.innerHTML = html;
    stage.appendChild(div);
    return div;
  }
  function openPlayer({ title, note, tabUrl, foot }) {
    $('#playerTitle').textContent = title;
    $('#playerNote').textContent = note || '';
    const tab = $('#playerTab');
    tab.hidden = !tabUrl;
    if (tabUrl) tab.href = tabUrl;
    $('#playerFoot').innerHTML = foot || '';
    if (!player.open) player.showModal();
  }

  /** Play a catalog game that lives on its creator's own page. */
  function playRemote(g) {
    stopPlayer();
    openPlayer({
      title: g.title, note: 'Creator-hosted page', tabUrl: g.url,
      foot: `Playing ${esc(g.title)} on its creator's own page inside Zylith. Nothing loads? <a href="${esc(g.url)}" target="_blank" rel="noopener noreferrer">Open it in a new tab</a>.`,
    });
    const f = document.createElement('iframe');
    f.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-forms allow-pointer-lock allow-popups allow-modals');
    f.setAttribute('allow', 'fullscreen; gamepad; autoplay; accelerometer; gyroscope; clipboard-write');
    f.setAttribute('allowfullscreen', '');
    f.setAttribute('referrerpolicy', 'no-referrer');
    f.title = g.title;
    f.src = g.url;
    $('#playerStage').appendChild(f);
    playing = { destroy() { f.remove(); }, restart() { f.src = g.url; } };
    player._restart = () => playing && playing.restart();
  }

  /** Play a game the user added. It is scanned again before it runs. */
  async function playLocal(meta) {
    stopPlayer();
    openPlayer({ title: meta.title, note: 'Sandboxed · saved in this browser', tabUrl: '', foot: 'This game runs in a locked box: no internet, no access to Zylith. Its saves stay in this browser.' });
    const msg = playerMessage('Loading...');
    let row;
    try { row = await Store.get(meta.id); } catch (e) { msg.innerHTML = 'Could not read this game from storage.'; return; }
    if (!row) { msg.innerHTML = 'This game is no longer stored in this browser.'; return; }
    const scan = S.scan(row.files);
    if (scan.verdict === 'block' || scan.verdict === 'reject') { msg.innerHTML = `<b>Zylith will not run this game.</b><span>${esc(scan.headline)}</span>`; return; }
    msg.remove();
    const boot = () => {
      if (playing) playing.destroy();
      $('#playerStage').textContent = '';
      playing = Frame.mount($('#playerStage'), { files: row.files, entry: scan.entry }, {
        saves: Store.loadSave(meta.id),
        onSave: data => Store.writeSave(meta.id, data),
        onNavigated: () => {
          const m = playerMessage('<b>The game tried to leave or reload itself.</b><span>Zylith stopped it.</span><button class="button button-primary">Restart</button>');
          m.querySelector('button').onclick = boot;
        },
        onFatal: e => playerMessage('<b>Could not start.</b><span>' + esc(e) + '</span>'),
      });
    };
    player._restart = boot;
    boot();
  }

  // ---------- add a game ----------
  const status = (text, bad) => { const el = $('#labStatus'); el.textContent = text || ''; el.classList.toggle('err', !!bad); };

  function resetReport() {
    clearTimers();
    if (cur && cur.mount) cur.mount.destroy();
    cur = null;
    $('#labReport').hidden = true;
    $('#labReport').textContent = '';
  }

  async function begin(loader) {
    resetReport();
    status('Working...');
    try {
      const loaded = await loader(t => status(t));
      status('');
      analyse(loaded);
    } catch (e) {
      status(e.message || String(e), true);
    }
  }

  function analyse(loaded) {
    const { files } = loaded;
    const info = loaded.info || {};
    if (!files.size) {
      cur = { files, info, scan: { verdict: 'reject', headline: 'Not a runnable web game.', findings: [], gameSignals: [], notes: [], stats: { files: 0, bytes: 0 }, notAGame: loaded.native ? "This repository is native source code (C, C++, Rust, and so on). It must be compiled for a computer or console, and most decompilation projects also need your own copy of the game. It has no browser build." : loaded.needsBuild ? 'This repository is source code that needs a build step (npm run build). It has no page to open.' : 'No HTML page was found in this repository.', externalHosts: [] }, done: true };
      renderReport();
      return;
    }
    const scan = S.scan(files);
    const first = [...files.keys()].find(k => /\.html?$/i.test(k));
    const guess = info.title || (loaded.name || '').replace(/\.(zip|html?)$/i, '') || (first ? first.replace(/\.html?$/i, '') : 'Untitled game');
    cur = { files, info, scan, title: guess, judged: null, probe: null, done: false, started: false, source: info.repoUrl ? 'github' : 'upload' };
    renderReport();
    if (scan.verdict !== 'block' && scan.verdict !== 'reject') runTest();
    else { cur.done = true; renderReport(); }
  }

  function decide() {
    const { scan, judged: j, done } = cur;
    if (scan.verdict === 'block') return { tone: 'bad', head: 'Blocked: dangerous content', detail: 'The scan found code or files that a game never needs. Zylith will not run or keep it.', can: false };
    if (scan.verdict === 'reject') return { tone: 'bad', head: 'Not a runnable web game', detail: scan.notAGame, can: false };
    if (!j || !cur.started) return { tone: 'work', head: 'Testing in the sandbox...', detail: 'The game runs in a locked box for a few seconds. Zylith watches what it does.', can: false };
    if (j.result === 'escape') return { tone: 'bad', head: 'Unsafe: it tried to escape its box', detail: 'The game tried to open a window or change the page. Zylith will not keep it.', can: false };
    if (!done) return { tone: 'work', head: 'Testing in the sandbox...', detail: 'Watching the game. You can also play it in the preview.', can: false };
    if (j.result === 'notgame') return { tone: 'bad', head: 'It does not behave like a game', detail: 'It ran, but it did not draw, loop, and read input the way a game does. If you are sure it is a game, it may need a build or files that are missing.', can: false };
    const warn = scan.verdict === 'review' || j.result === 'maybe' || j.tries > 0;
    if (warn) return { tone: 'caution', head: 'Caution: check the notes first', detail: 'It runs, but some behavior needs your judgment. It stays in the locked box either way.', can: true, ack: true };
    return { tone: 'ok', head: 'Looks like a game, and it behaves', detail: 'The scan found nothing dangerous, and the sandbox test saw a real game loop with input.', can: true };
  }

  function stepsHtml(d) {
    const s = cur.scan, blocked = s.verdict === 'block' || s.verdict === 'reject';
    const li = (cls, t) => `<li class="${cls}">${t}</li>`;
    const test = blocked ? li('fail', '3 · Sandbox test skipped') : cur.done ? li(cur.judged && cur.judged.result === 'escape' ? 'fail' : 'done', '3 · Sandbox test') : li('run', '3 · Sandbox test running');
    return li('done', `1 · Fetched ${s.stats.files} files (${mb(s.stats.bytes)})`) + li(blocked ? 'fail' : 'done', '2 · Static scan') + test + li(d.tone === 'bad' ? 'fail' : cur.done ? 'done' : 'run', '4 · Verdict');
  }

  function findingsHtml() {
    const { scan } = cur;
    const rows = scan.findings.map(f => `<li><span class="sev ${f.sev}">${f.sev}</span><div>${esc(f.msg)}<small>${esc(f.file)}${f.count > 1 ? ' + ' + (f.count - 1) + ' more file(s)' : ''}${f.sample ? ' — <code>' + esc(f.sample.slice(0, 110)) + '</code>' : ''}</small></div></li>`);
    return rows.length ? `<ul class="lab-list findings">${rows.join('')}</ul>` : '<p class="lab-fine">No dangerous patterns found.</p>';
  }

  function checksHtml() {
    if (!cur.judged) return '<p class="lab-fine">Waiting for the game to start...</p>';
    return `<ul class="lab-list">${cur.judged.checks.map(c => `<li><span class="${c.ok ? 'yes' : cur.done ? 'no' : 'wait'}">${c.ok ? '✔' : cur.done ? '✖' : '…'}</span><div>${esc(c.label)}${c.detail ? '<small>' + esc(c.detail) + '</small>' : ''}</div></li>`).join('')}</ul>`;
  }

  function renderReport() {
    const box = $('#labReport');
    const d = decide();
    const { scan, info } = cur;
    const blocked = scan.verdict === 'block' || scan.verdict === 'reject';
    const hosted = info.homepage && /^https?:/i.test(info.homepage) ? info.homepage : '';
    box.hidden = false;
    box.innerHTML = `
      <div class="lab-verdict ${d.tone}" id="labVerdict"><b>${esc(d.head)}</b><span>${esc(d.detail)}</span></div>
      <ul class="lab-steps" id="labSteps">${stepsHtml(d)}</ul>
      <div class="lab-cols">
        <div>${blocked ? `<div class="lab-stage"><div class="player-msg"><span>${scan.verdict === 'reject' && hosted ? 'This repository has a hosted page:' : 'Nothing was run.'}</span>${scan.verdict === 'reject' && hosted ? `<a class="button button-primary" target="_blank" rel="noopener noreferrer" href="${esc(hosted)}">Open ${esc(new URL(hosted).hostname)} ↗</a>` : ''}</div></div>` : '<div class="lab-stage" id="labStage"></div>'}
          ${blocked ? '' : '<p class="lab-fine" style="margin-top:8px">This preview is live. Click it and play. The game cannot reach the internet or this page.</p>'}</div>
        <div class="lab-panel">
          <div><h3>Sandbox test</h3><div id="labChecks">${blocked ? '<p class="lab-fine">Skipped.</p>' : checksHtml()}</div></div>
          <div><h3>Code scan</h3>${findingsHtml()}</div>
          ${scan.gameSignals.length ? `<div><h3>Game signals</h3><div class="lab-signals">${scan.gameSignals.map(s => `<span>${esc(s)}</span>`).join('')}</div></div>` : ''}
          ${scan.notes.length ? `<p class="lab-fine">${scan.notes.map(esc).join(' ')}</p>` : ''}
        </div>
      </div>
      ${blocked ? '' : `<div class="lab-meta"><label>Name<input id="labTitle" maxlength="80" value="${esc(cur.title)}"></label><label>Creator<input id="labCreator" maxlength="80" value="${esc(info.creator || '')}" placeholder="Who made it?"></label></div>
      <div class="lab-actions"><button class="button button-outline" id="labRetest">↻ Test again</button>
        <label class="ack" id="labAckWrap" hidden><input type="checkbox" id="labAck"> I read the notes and want to keep it</label>
        <button class="button button-primary" id="labAdd" disabled>＋ Add to My games</button></div>
      <p class="lab-fine">Tests help you judge a game. They cannot prove it is harmless. That is why added games always run in the locked box. They stay in this browser and are not shared.</p>`}`;
    if (!blocked) {
      $('#labRetest').onclick = () => { if (cur.mount) cur.mount.destroy(); cur.done = false; cur.started = false; cur.judged = null; renderReport(); runTest(); };
      $('#labAdd').onclick = addCurrent;
      $('#labAck').onchange = refreshActions;
      refreshActions();
    }
  }

  function refreshActions() {
    if (!cur || !$('#labAdd')) return;
    const d = decide();
    $('#labAckWrap').hidden = !d.ack;
    $('#labAdd').disabled = !(d.can && cur.done && (!d.ack || $('#labAck').checked));
  }

  function updateLive() {
    const d = decide();
    const v = $('#labVerdict'); if (!v) return;
    v.className = 'lab-verdict ' + d.tone;
    v.innerHTML = `<b>${esc(d.head)}</b><span>${esc(d.detail)}</span>`;
    $('#labSteps').innerHTML = stepsHtml(d);
    $('#labChecks').innerHTML = checksHtml();
    refreshActions();
  }

  function runTest() {
    const stage = $('#labStage'); if (!stage) return;
    cur.started = true; cur.done = false;
    const mount = Frame.mount(stage, { files: cur.files, entry: cur.scan.entry }, {
      saves: {},
      onProbe: p => { cur.probe = p; cur.judged = Frame.judge(p); updateLive(); },
      onNavigated: () => { cur.probe = Object.assign({}, cur.probe, { navigated: true }); cur.judged = Frame.judge(cur.probe); cur.done = true; updateLive(); },
      onFatal: e => { cur.judged = { result: 'notgame', checks: [{ id: 'loads', ok: false, label: 'Loads and runs without crashing', detail: e }], tries: 0 }; cur.done = true; updateLive(); },
    });
    cur.mount = mount;
    later(() => mount.poke(), 1600);
    later(() => mount.poke(), 4200);
    later(() => { cur.done = true; if (cur.probe) cur.judged = Frame.judge(cur.probe); updateLive(); }, TEST_MS);
  }

  async function addCurrent() {
    const d = decide();
    if (!d.can || !cur.done) return;
    const title = ($('#labTitle').value || cur.title).trim().slice(0, 80) || 'Untitled game';
    const creator = ($('#labCreator').value || '').trim().slice(0, 80);
    const id = 'local-' + title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 30) + '-' + Date.now().toString(36);
    const meta = {
      id, title, creator, description: cur.info.description || '', source: cur.source, repoUrl: cur.info.repoUrl || '', license: cur.info.license || '',
      addedAt: Date.now(), entry: cur.scan.entry, fileCount: cur.scan.stats.files, bytes: cur.scan.stats.bytes,
      scan: cur.scan.verdict, test: cur.judged ? cur.judged.result : '',
    };
    $('#labAdd').disabled = true;
    try {
      await Store.put(meta, cur.files);
      hooks.toast(`${title} is in My games.`);
      hooks.changed(meta);
      lab.close();
    } catch (e) { status('Could not save: ' + (e.message || e), true); $('#labAdd').disabled = false; }
  }

  // ---------- wiring ----------
  function setTab(name) {
    document.querySelectorAll('[data-labtab]').forEach(b => b.classList.toggle('active', b.dataset.labtab === name));
    document.querySelectorAll('[data-labpane]').forEach(p => { p.hidden = p.dataset.labpane !== name; });
  }

  function init(h) {
    Object.assign(hooks, h);
    document.querySelectorAll('[data-labtab]').forEach(b => b.addEventListener('click', () => setTab(b.dataset.labtab)));
    $('#closeLab').addEventListener('click', () => lab.close());
    lab.addEventListener('close', resetReport);
    lab.addEventListener('click', e => { if (e.target === lab) lab.close(); });

    $('#ghForm').addEventListener('submit', e => { e.preventDefault(); const v = $('#ghInput').value; begin(on => Pack.fromGithub(v, on)); });
    document.querySelectorAll('[data-gh]').forEach(b => b.addEventListener('click', () => { $('#ghInput').value = b.dataset.gh; $('#ghForm').requestSubmit(); }));

    const pickFile = $('#pickFile'), pickDir = $('#pickDir');
    $('#chooseFile').addEventListener('click', () => pickFile.click());
    $('#chooseDir').addEventListener('click', () => pickDir.click());
    pickFile.addEventListener('change', () => { const f = pickFile.files[0]; if (f) begin(async () => Object.assign(await Pack.fromFile(f), { name: f.name })); pickFile.value = ''; });
    pickDir.addEventListener('change', () => { const list = [...pickDir.files]; if (list.length) begin(async () => Object.assign(await Pack.fromFiles(list), { name: (list[0].webkitRelativePath || '').split('/')[0] })); pickDir.value = ''; });
    const drop = $('#labDrop');
    ['dragenter', 'dragover'].forEach(t => drop.addEventListener(t, e => { e.preventDefault(); drop.classList.add('over'); }));
    ['dragleave', 'drop'].forEach(t => drop.addEventListener(t, e => { e.preventDefault(); drop.classList.remove('over'); }));
    drop.addEventListener('drop', e => { begin(async () => Object.assign(await Pack.fromDrop(e.dataTransfer), { name: (e.dataTransfer.files[0] || {}).name || '' })); });

    $('#playerClose').addEventListener('click', () => player.close());
    player.addEventListener('close', stopPlayer);
    $('#playerReload').addEventListener('click', () => player._restart && player._restart());
    $('#playerFull').addEventListener('click', () => { const s = $('#playerStage'); (s.requestFullscreen || s.webkitRequestFullscreen || (() => {})).call(s); });
  }

  /** Open the Add-a-game dialog. Optionally start on a tab, or start a GitHub import at once. */
  function openAdd(opts) {
    opts = opts || {};
    setTab(opts.tab || 'github');
    resetReport(); status('');
    if (!lab.open) lab.showModal();
    if (opts.github) { $('#ghInput').value = opts.github; $('#ghForm').requestSubmit(); }
  }

  root.ZylithLab = { init, openAdd, playRemote, playLocal, list: () => Store.list(), remove: id => Store.remove(id) };
})(window);
