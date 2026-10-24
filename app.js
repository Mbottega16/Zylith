(() => {
  const seed = window.ZYLITH_GAMES || [];
  const STORAGE = 'zylith-library-v1';
  let userGames = safeParse(localStorage.getItem(STORAGE), []);   // hosted-page links the user added
  let localGames = [];                                            // sandboxed games stored in this browser (IndexedDB)
  let activeShelf = 'All games', search = '', genre = 'All', platform = 'All', accessFilter = 'instant', pageSize = 12, listView = false;
  const accessType = g => g.accessType || (g.playMode === 'Browser' ? 'instant' : g.playMode === 'Web page' ? 'source' : 'files');
  const accessLabel = g => ({ instant: g.embed === false ? 'PLAY · NEW TAB' : 'PLAY HERE', local: 'MY GAME' })[accessType(g)] || 'GAME PAGE';
  const $ = (s, root = document) => root.querySelector(s);
  const grid = $('#gameGrid'), empty = $('#emptyState'), dialog = $('#gameDialog');
  const games = () => [...localGames, ...userGames, ...seed];
  const inTab = g => accessType(g) === accessFilter;
  const escapeHtml = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  function safeParse(s, fallback) { try { const v = JSON.parse(s); return Array.isArray(v) ? v : fallback; } catch { return fallback; } }
  function persist() { localStorage.setItem(STORAGE, JSON.stringify(userGames)); }
  function toast(message) { const el = $('#toast'); el.textContent = message; el.classList.add('show'); clearTimeout(toast.timer); toast.timer = setTimeout(() => el.classList.remove('show'), 2600); }

  const PALETTES = [['#574174', '#d1ff71'], ['#255c63', '#b1f7ed'], ['#713d58', '#ffc0dd'], ['#664d29', '#ffe08b'], ['#334b80', '#b4c7ff']];
  const hash = s => [...String(s)].reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 7);
  function cardify(meta) {
    const n = Math.abs(hash(meta.id));
    return {
      id: meta.id, title: meta.title, creator: meta.creator || 'You', genre: 'My games', mood: meta.source === 'github' ? 'From GitHub' : 'Uploaded',
      platform: 'In this browser', accessType: 'local', description: meta.description || 'A game you added. It runs in a locked sandbox and stays in this browser.',
      symbol: ['✳', '◈', '✿', '▲', '☾'][n % 5], word: meta.title.slice(0, 18).toUpperCase(), colors: PALETTES[n % 5], repoUrl: meta.repoUrl, license: meta.license, localMeta: meta,
    };
  }
  async function reloadLocal() {
    try { localGames = (await ZylithLab.list()).map(cardify); } catch { localGames = []; }
    drawFilters(); render();
  }
  function drawFilters() {
    const pool = games().filter(inTab);
    const genres = ['All', ...new Set(pool.map(g => g.genre).filter(Boolean))].slice(0, 40), platforms = ['All', ...new Set(pool.map(g => g.platform).filter(Boolean))].slice(0, 40);
    if (!genres.includes(genre)) genre = 'All';
    if (!platforms.includes(platform)) platform = 'All';
    $('#genreFilters').innerHTML = genres.map(v => `<button class="filter-chip ${genre === v ? 'active' : ''}" data-kind="genre" data-value="${escapeHtml(v)}">${escapeHtml(v)}</button>`).join('');
    $('#platformFilters').innerHTML = platforms.map(v => `<button class="filter-chip ${platform === v ? 'active' : ''}" data-kind="platform" data-value="${escapeHtml(v)}">${escapeHtml(v)}</button>`).join('');
  }
  function filteredGames() {
    const rows = games().filter(g => {
      const matchShelf = activeShelf === 'All games' || (activeShelf === 'Recently added' && (userGames.some(u => u.id === g.id) || localGames.some(u => u.id === g.id)));
      const matchAccess = inTab(g);
      const needle = search.toLowerCase(), text = [g.title, g.creator, g.genre, g.mood, g.platform, g.description].join(' ').toLowerCase();
      return matchShelf && matchAccess && (!needle || text.includes(needle)) && (genre === 'All' || g.genre === genre) && (platform === 'All' || g.platform === platform);
    });
    const sort = $('#sortSelect').value, isNew = g => Number(localGames.some(x => x.id === g.id) || userGames.some(x => x.id === g.id));
    if (sort === 'az') rows.sort((a, b) => a.title.localeCompare(b.title));
    if (sort === 'newest') rows.sort((a, b) => isNew(b) - isNew(a) || Number(Boolean(b.featured)) - Number(Boolean(a.featured)));
    if (sort === 'featured') rows.sort((a, b) => Number(Boolean(b.featured)) - Number(Boolean(a.featured)) || Number(b.platform === 'Reverse-engineered') - Number(a.platform === 'Reverse-engineered') || (b.stars || 0) - (a.stars || 0));
    return rows;
  }
  function render() {
    const rows = filteredGames(), visible = rows.slice(0, pageSize);
    grid.classList.toggle('list-view', listView);
    grid.innerHTML = visible.map((g, i) => `<article class="game-card" data-game="${escapeHtml(g.id)}" tabindex="0" role="button" aria-label="View ${escapeHtml(g.title)}"><div class="cover-art" style="--card-bg:${escapeHtml(g.colors?.[0] || '#29213c')};--card-accent:${escapeHtml(g.colors?.[1] || '#c8ff5e')}"><span class="cover-index">${String(i + 1).padStart(2, '0')} / ZY</span><span class="cover-symbol">${escapeHtml(g.symbol || '✳')}</span><span class="cover-word">${escapeHtml(g.word || '')}</span></div><div class="card-copy"><div class="card-topline"><span class="genre-label">${escapeHtml(g.genre || 'Indie')}</span><span class="play-label">${accessType(g) === 'instant' || accessType(g) === 'local' ? '▶' : '↗'} ${escapeHtml(accessLabel(g))}</span></div><h3>${escapeHtml(g.title)}</h3><p class="creator-name">by ${escapeHtml(g.creator || 'Independent creator')}</p><div class="card-bottom"><span class="mood-tag">${escapeHtml(g.platform || g.mood || 'Explore')}</span><span class="card-arrow">↗</span></div></div></article>`).join('');
    empty.hidden = visible.length !== 0; grid.hidden = visible.length === 0; $('#loadMoreWrap').hidden = visible.length >= rows.length;
    if (visible.length === 0) {
      const mine = accessFilter === 'local';
      $('#emptyState h3').textContent = mine ? 'No games of your own yet.' : 'No games on this shelf.';
      $('#emptyState p').textContent = mine ? 'Add one from GitHub or upload a zip. It is scanned and tested before it is kept.' : 'Try another search or reset the filters.';
    }
    const counts = { instant: 0, local: 0 };
    games().forEach(g => { counts[accessType(g)] = (counts[accessType(g)] || 0) + 1; });
    const playable = counts.instant + counts.local;
    $('#allCount').textContent = counts[accessFilter] || 0;
    $('#gameCountTop').textContent = `${playable} games ready to play`; $('#filterCount').textContent = (genre !== 'All' || platform !== 'All') ? '•' : '';
    Object.entries(counts).forEach(([key, value]) => { const node = $('#count' + key[0].toUpperCase() + key.slice(1)); if (node) node.textContent = value; });
    document.querySelectorAll('.access-tab').forEach(b => { b.classList.toggle('active', b.dataset.access === accessFilter); b.setAttribute('aria-selected', b.dataset.access === accessFilter ? 'true' : 'false'); });
  }

  function setAccess(kind) {
    accessFilter = kind; pageSize = 12; genre = 'All'; platform = 'All';
    drawFilters(); render();
  }

  function openGame(id) {
    const g = games().find(x => x.id === id); if (!g) return;
    const kind = accessType(g), canEmbed = kind === 'instant' && g.embed !== false;
    $('#dialogTitle').textContent = g.title; $('#dialogDescription').textContent = g.description || 'Explore this game on the creator’s page.'; $('#dialogGenre').textContent = `${g.genre || 'INDIE'}  ·  ${g.creator || 'INDEPENDENT CREATOR'}`.toUpperCase();
    const meta = [g.mood, ({ instant: canEmbed ? 'Plays right here' : 'Opens in a new tab', local: 'Sandboxed, saved in this browser' })[kind], g.platform, g.license && g.license !== 'NOASSERTION' ? g.license : '', g.stars ? '★ ' + g.stars.toLocaleString() : ''];
    $('#dialogMeta').innerHTML = meta.filter(Boolean).map(v => `<span>${escapeHtml(v)}</span>`).join('');
    $('#dialogArt').style.background = `linear-gradient(135deg, ${g.colors?.[0] || '#48366b'}, #211a32)`; $('#dialogArt').style.setProperty('--art-accent', g.colors?.[1] || '#c8ff5e'); $('#dialogArt').innerHTML = `<span style="position:relative;z-index:1;font-size:95px;color:${escapeHtml(g.colors?.[1] || '#c8ff5e')}">${escapeHtml(g.symbol || '✳')}</span>`;
    const here = $('#playHere'), tab = $('#playGame'), del = $('#deleteLocal'), note = $('#creatorNote');
    here.hidden = !(canEmbed || kind === 'local'); here.dataset.play = id;
    tab.hidden = kind === 'local';
    tab.href = g.url || '#';
    tab.className = 'button ' + (here.hidden ? 'button-primary' : 'button-outline');
    tab.textContent = canEmbed ? 'Open in new tab ↗' : 'Play in new tab ↗';
    tab.setAttribute('aria-label', `${tab.textContent.replace(' ↗', '')} for ${g.title}`);
    del.hidden = kind !== 'local'; del.dataset.id = id;
    note.textContent = ({ instant: canEmbed ? 'Runs on the creator’s own page, inside Zylith.' : 'This creator’s page cannot be shown inside Zylith, so it opens in a new tab.', local: 'Runs in a locked box with no internet. Scanned and tested when you added it.' })[kind];
    dialog.showModal();
  }
  function selectShelf(s) { activeShelf = s; pageSize = 12; document.querySelectorAll('.shelf-tab').forEach(b => b.classList.toggle('active', b.dataset.shelf === s)); drawFilters(); render(); }
  const openAdd = opts => { if (dialog.open) dialog.close(); ZylithLab.openAdd(opts); };

  ZylithLab.init({ toast, changed: () => { setAccess('local'); reloadLocal(); } });
  drawFilters(); render(); reloadLocal(); $('#year').textContent = new Date().getFullYear();

  document.addEventListener('click', e => {
    const card = e.target.closest('[data-game]'); if (card) { openGame(card.dataset.game); return; }
    const chip = e.target.closest('.filter-chip'); if (chip) { if (chip.dataset.kind === 'genre') genre = chip.dataset.value; else platform = chip.dataset.value; drawFilters(); render(); }
    const access = e.target.closest('[data-access]'); if (access) setAccess(access.dataset.access);
    const jump = e.target.closest('[data-access-link]'); if (jump) { selectShelf('All games'); setAccess(jump.dataset.accessLink); }
    const shelf = e.target.closest('[data-shelf]'); if (shelf) selectShelf(shelf.dataset.shelf);
  });
  grid.addEventListener('keydown', e => { if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('[data-game]')) { e.preventDefault(); openGame(e.target.dataset.game); } });
  $('#searchInput').addEventListener('input', e => { search = e.target.value; pageSize = 12; render(); });
  $('#sortSelect').addEventListener('change', render); $('#filterButton').addEventListener('click', () => { const d = $('#filterDrawer'); d.hidden = !d.hidden; });
  $('#gridView').addEventListener('click', () => { listView = false; $('#gridView').classList.add('selected'); $('#listView').classList.remove('selected'); grid.classList.remove('list-view'); });
  $('#listView').addEventListener('click', () => { listView = true; $('#listView').classList.add('selected'); $('#gridView').classList.remove('selected'); grid.classList.add('list-view'); });
  $('#loadMore').addEventListener('click', () => { pageSize += 12; render(); });
  $('#surpriseButton').addEventListener('click', () => {
    const rows = games().filter(g => accessType(g) === 'instant' && g.embed !== false);
    if (rows.length) ZylithLab.playRemote(rows[Math.floor(Math.random() * rows.length)]); else toast('No games to pick from yet.');
  });
  $('#surpriseLink').addEventListener('click', () => { const rows = filteredGames(); if (rows.length) openGame(rows[Math.floor(Math.random() * rows.length)].id); else toast('No games match those filters.'); });
  $('#resetFilters').addEventListener('click', () => { search = ''; genre = 'All'; platform = 'All'; $('#searchInput').value = ''; selectShelf('All games'); });
  ['submitTop', 'submitInline', 'submitBanner', 'addInline'].forEach(id => $('#' + id)?.addEventListener('click', () => openAdd()));
  $('#closeGame').addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', e => { if (e.target === dialog) dialog.close(); });

  $('#playHere').addEventListener('click', () => {
    const g = games().find(x => x.id === $('#playHere').dataset.play); if (!g) return;
    dialog.close();
    if (accessType(g) === 'local') ZylithLab.playLocal(g.localMeta); else ZylithLab.playRemote(g);
  });
  $('#deleteLocal').addEventListener('click', async () => {
    const id = $('#deleteLocal').dataset.id, g = localGames.find(x => x.id === id);
    if (!g || !confirm(`Delete "${g.title}" and its saves from this browser?`)) return;
    await ZylithLab.remove(id); dialog.close(); await reloadLocal(); toast('Deleted.');
  });

  $('#submitForm').addEventListener('submit', e => {
    e.preventDefault(); const f = new FormData(e.currentTarget); let url;
    try { url = new URL(f.get('url')); if (!['http:', 'https:'].includes(url.protocol)) throw new Error(); } catch { toast('Please enter a valid http or https URL.'); return; }
    const title = String(f.get('title')).trim(); if (!title) { toast('Add a title first.'); return; }
    const palette = PALETTES[Math.floor(Math.random() * 5)], playMode = String(f.get('playMode'));
    userGames.unshift({ id: 'submitted-' + Date.now(), title, creator: String(f.get('creator')).trim(), genre: String(f.get('genre')), mood: 'Hosted link', playMode, accessType: 'instant', embed: false, url: url.href, description: 'A hosted page you added. Zylith could not scan it, so it opens exactly as its creator hosts it.', symbol: ['✳', '◈', '✿', '▲', '☾'][Math.floor(Math.random() * 5)], word: title.slice(0, 18).toUpperCase(), colors: palette, featured: false, submittedAt: Date.now() });
    persist(); e.currentTarget.reset(); $('#labDialog').close(); selectShelf('Recently added'); setAccess(userGames[0].accessType); toast('Added to this browser’s Zylith list.');
  });
  $('#themeButton').addEventListener('click', () => { document.body.classList.toggle('light'); localStorage.setItem('zylith-theme', document.body.classList.contains('light') ? 'light' : 'dark'); });
  if (localStorage.getItem('zylith-theme') === 'light') document.body.classList.add('light');
  document.addEventListener('keydown', e => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); $('#searchInput').focus(); } });
})();
