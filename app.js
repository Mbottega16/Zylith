(() => {
  const seed = window.ZYLITH_GAMES || [];
  const STORAGE = 'zylith-library-v1';
  const FAVORITES = 'zylith-favorites-v1';
  let userGames = safeParse(localStorage.getItem(STORAGE), []);
  let favorites = new Set(safeParse(localStorage.getItem(FAVORITES), []));
  let activeShelf = 'All games', search = '', genre = 'All', mood = 'All', pageSize = 12, listView = false;
  const $ = (s, root=document) => root.querySelector(s);
  const grid = $('#gameGrid'), empty = $('#emptyState'), dialog = $('#gameDialog'), submitDialog = $('#submitDialog');
  const games = () => [...userGames, ...seed];
  const escapeHtml = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function safeParse(s, fallback) { try { const v=JSON.parse(s); return Array.isArray(v)?v:fallback; } catch { return fallback; } }
  function persist() { localStorage.setItem(STORAGE, JSON.stringify(userGames)); localStorage.setItem(FAVORITES, JSON.stringify([...favorites])); }
  function toast(message) { const el=$('#toast'); el.textContent=message; el.classList.add('show'); clearTimeout(toast.timer); toast.timer=setTimeout(()=>el.classList.remove('show'),2400); }
  function drawFilters() {
    const genres=['All',...new Set(games().map(g=>g.genre).filter(Boolean))], moods=['All',...new Set(games().map(g=>g.mood).filter(Boolean))];
    $('#genreFilters').innerHTML=genres.map(v=>`<button class="filter-chip ${genre===v?'active':''}" data-kind="genre" data-value="${escapeHtml(v)}">${escapeHtml(v)}</button>`).join('');
    $('#moodFilters').innerHTML=moods.map(v=>`<button class="filter-chip ${mood===v?'active':''}" data-kind="mood" data-value="${escapeHtml(v)}">${escapeHtml(v)}</button>`).join('');
  }
  function filteredGames() {
    let rows=games().filter(g=>{
      const matchShelf=activeShelf==='All games'||(activeShelf==='Favorites'&&favorites.has(g.id))||(activeShelf==='Recently added'&&userGames.some(u=>u.id===g.id));
      const needle=search.toLowerCase(); const text=[g.title,g.creator,g.genre,g.mood,g.description].join(' ').toLowerCase();
      return matchShelf&&(!needle||text.includes(needle))&&(genre==='All'||g.genre===genre)&&(mood==='All'||g.mood===mood);
    });
    const sort=$('#sortSelect').value;
    if(sort==='az') rows.sort((a,b)=>a.title.localeCompare(b.title));
    if(sort==='newest') rows.sort((a,b)=>Number(userGames.some(x=>x.id===b.id))-Number(userGames.some(x=>x.id===a.id))||Number(Boolean(b.featured))-Number(Boolean(a.featured)));
    if(sort==='featured') rows.sort((a,b)=>Number(Boolean(b.featured))-Number(Boolean(a.featured)));
    return rows;
  }
  function render() {
    const rows=filteredGames(); const visible=rows.slice(0,pageSize);
    grid.classList.toggle('list-view',listView);
    grid.innerHTML=visible.map((g,i)=>`<article class="game-card" data-game="${escapeHtml(g.id)}" tabindex="0" role="button" aria-label="View ${escapeHtml(g.title)}"><div class="cover-art" style="--card-bg:${escapeHtml(g.colors?.[0]||'#29213c')};--card-accent:${escapeHtml(g.colors?.[1]||'#c8ff5e')}"><span class="cover-index">${String(i+1).padStart(2,'0')} / ZY</span><span class="cover-symbol">${escapeHtml(g.symbol||'✳')}</span><span class="cover-word">${escapeHtml(g.word||'')}</span><button class="save-button ${favorites.has(g.id)?'saved':''}" data-save="${escapeHtml(g.id)}" aria-label="${favorites.has(g.id)?'Remove from':'Add to'} favorites">${favorites.has(g.id)?'♥':'♡'}</button></div><div class="card-copy"><div class="card-topline"><span class="genre-label">${escapeHtml(g.genre||'Indie')}</span><span class="play-label">${g.playMode==='Browser'?'↗ PLAY IN BROWSER':'↗ CREATOR PAGE'}</span></div><h3>${escapeHtml(g.title)}</h3><p class="creator-name">by ${escapeHtml(g.creator||'Independent creator')}</p><div class="card-bottom"><span class="mood-tag">${escapeHtml(g.mood||g.playMode||'Discover')}</span><span class="card-arrow">↗</span></div></div></article>`).join('');
    empty.hidden=visible.length!==0; grid.hidden=visible.length===0; $('#loadMoreWrap').hidden=visible.length>=rows.length;
    $('#allCount').textContent=games().length; $('#favoriteCount').textContent=favorites.size; $('#gameCountTop').textContent=`${games().length} games and counting`; $('#filterCount').textContent=(genre!=='All'||mood!=='All')?'•':'';
  }
  function openGame(id) {
    const g=games().find(x=>x.id===id); if(!g)return;
    $('#dialogTitle').textContent=g.title; $('#dialogDescription').textContent=g.description||'Explore this game on the creator’s page.'; $('#dialogGenre').textContent=`${g.genre||'INDIE'}  ·  ${g.creator||'INDEPENDENT CREATOR'}`.toUpperCase();
    $('#dialogMeta').innerHTML=[g.mood,g.playMode,'Creator-hosted page'].filter(Boolean).map(v=>`<span>${escapeHtml(v)}</span>`).join('');
    $('#dialogArt').style.background=`linear-gradient(135deg, ${g.colors?.[0]||'#48366b'}, #211a32)`; $('#dialogArt').style.setProperty('--art-accent',g.colors?.[1]||'#c8ff5e'); $('#dialogArt').innerHTML=`<span style="position:relative;z-index:1;font-size:95px;color:${escapeHtml(g.colors?.[1]||'#c8ff5e')}">${escapeHtml(g.symbol||'✳')}</span>`;
    const play=$('#playGame'); play.href=g.url; play.setAttribute('aria-label',`Play ${g.title} on the creator's page`);
    const fav=$('#dialogFavorite'); fav.dataset.save=id; fav.textContent=favorites.has(id)?'♥ Saved':'♡ Save'; fav.classList.toggle('saved',favorites.has(id));
    dialog.showModal();
  }
  function toggleFavorite(id) { if(favorites.has(id)){favorites.delete(id);toast('Removed from favorites.')}else{favorites.add(id);toast('Saved to your favorites.')}persist();render(); if(dialog.open){$('#dialogFavorite').textContent=favorites.has(id)?'♥ Saved':'♡ Save';$('#dialogFavorite').classList.toggle('saved',favorites.has(id));} }
  function openSubmit(){submitDialog.showModal();}
  function selectShelf(s){activeShelf=s;pageSize=12;document.querySelectorAll('.shelf-tab').forEach(b=>b.classList.toggle('active',b.dataset.shelf===s));render();}
  drawFilters(); render(); $('#year').textContent=new Date().getFullYear();
  document.addEventListener('click',e=>{
    const save=e.target.closest('[data-save]'); if(save){e.stopPropagation();toggleFavorite(save.dataset.save);return;}
    const card=e.target.closest('[data-game]'); if(card){openGame(card.dataset.game);return;}
    const chip=e.target.closest('.filter-chip'); if(chip){if(chip.dataset.kind==='genre')genre=chip.dataset.value;else mood=chip.dataset.value;drawFilters();render();}
    const shelf=e.target.closest('[data-shelf]'); if(shelf)selectShelf(shelf.dataset.shelf);
  });
  grid.addEventListener('keydown',e=>{if((e.key==='Enter'||e.key===' ')&&e.target.matches('[data-game]')){e.preventDefault();openGame(e.target.dataset.game);}});
  $('#searchInput').addEventListener('input',e=>{search=e.target.value;pageSize=12;render();});
  $('#sortSelect').addEventListener('change',render); $('#filterButton').addEventListener('click',()=>{const d=$('#filterDrawer');d.hidden=!d.hidden;});
  $('#gridView').addEventListener('click',()=>{listView=false;$('#gridView').classList.add('selected');$('#listView').classList.remove('selected');grid.classList.remove('list-view');});
  $('#listView').addEventListener('click',()=>{listView=true;$('#listView').classList.add('selected');$('#gridView').classList.remove('selected');grid.classList.add('list-view');});
  $('#loadMore').addEventListener('click',()=>{pageSize+=12;render();});
  $('#surpriseButton').addEventListener('click',()=>{const rows=filteredGames();if(rows.length)openGame(rows[Math.floor(Math.random()*rows.length)].id);else toast('No games match those filters.');});
  $('#surpriseLink').addEventListener('click',()=>$('#surpriseButton').click());
  $('#resetFilters').addEventListener('click',()=>{search='';genre='All';mood='All';$('#searchInput').value='';selectShelf('All games');drawFilters();render();});
  ['submitTop','submitInline','submitBanner'].forEach(id=>$('#'+id)?.addEventListener('click',openSubmit));
  document.querySelectorAll('[data-filter-link]').forEach(link=>link.addEventListener('click',()=>selectShelf(link.dataset.filterLink)));
  $('#closeGame').addEventListener('click',()=>dialog.close()); $('#closeSubmit').addEventListener('click',()=>submitDialog.close());
  dialog.addEventListener('click',e=>{if(e.target===dialog)dialog.close();}); submitDialog.addEventListener('click',e=>{if(e.target===submitDialog)submitDialog.close();});
  $('#submitForm').addEventListener('submit',e=>{
    e.preventDefault(); const f=new FormData(e.currentTarget); let url;
    try{url=new URL(f.get('url'));if(!['http:','https:'].includes(url.protocol))throw new Error();}catch{toast('Please enter a valid http or https URL.');return;}
    const title=String(f.get('title')).trim(); if(!title){toast('Add a title first.');return;}
    const palette=[['#574174','#d1ff71'],['#255c63','#b1f7ed'],['#713d58','#ffc0dd'],['#664d29','#ffe08b'],['#334b80','#b4c7ff']][Math.floor(Math.random()*5)];
    const id='submitted-'+Date.now(); userGames.unshift({id,title,creator:String(f.get('creator')).trim(),genre:String(f.get('genre')),mood:'New find',playMode:String(f.get('playMode')),url:url.href,description:'Community-submitted listing. The destination is the creator’s public page.',symbol:['✳','◈','✿','▲','☾'][Math.floor(Math.random()*5)],word:title.slice(0,18).toUpperCase(),colors:palette,featured:false,submittedAt:Date.now()});persist();e.currentTarget.reset();submitDialog.close();selectShelf('Recently added');toast('Added to this browser’s local Zylith list.');
  });
  $('#themeButton').addEventListener('click',()=>{document.body.classList.toggle('light');localStorage.setItem('zylith-theme',document.body.classList.contains('light')?'light':'dark');});
  if(localStorage.getItem('zylith-theme')==='light')document.body.classList.add('light');
  document.addEventListener('keydown',e=>{if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='k'){e.preventDefault();$('#searchInput').focus();}});
})();
