/* Zylith local store. Games you add live in this browser's IndexedDB. Nothing leaves your device.
 * Game saves (the game's own localStorage) are kept per game in localStorage. */
(function (root) {
  'use strict';

  const DB = 'zylith-lab', STORE = 'packages';
  let dbp = null;
  function open() {
    if (!dbp) dbp = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'id' });
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return dbp;
  }
  const tx = async (mode, fn) => {
    const db = await open();
    return new Promise((resolve, reject) => {
      const t = db.transaction(STORE, mode);
      const out = fn(t.objectStore(STORE));
      t.oncomplete = () => resolve(out && 'result' in out ? out.result : undefined);
      t.onerror = () => reject(t.error);
      t.onabort = () => reject(t.error || new Error('Storage failed. The device may be out of space.'));
    });
  };

  async function put(meta, files) {
    const list = [...files].map(([path, bytes]) => [path, new Blob([bytes])]);
    await tx('readwrite', s => s.put({ id: meta.id, meta, files: list }));
  }
  async function get(id) {
    const row = await tx('readonly', s => s.get(id));
    if (!row) return null;
    const files = new Map();
    for (const [path, blob] of row.files) files.set(path, new Uint8Array(await blob.arrayBuffer()));
    return { meta: row.meta, files };
  }
  async function list() {
    const rows = await tx('readonly', s => s.getAll());
    return (rows || []).map(r => r.meta).sort((a, b) => b.addedAt - a.addedAt);
  }
  async function remove(id) {
    await tx('readwrite', s => s.delete(id));
    try { localStorage.removeItem('zylith-save-' + id); } catch (e) { /* ignore */ }
  }
  const saveKey = id => 'zylith-save-' + id;
  function loadSave(id) { try { return JSON.parse(localStorage.getItem(saveKey(id)) || '{}'); } catch (e) { return {}; } }
  function writeSave(id, data) {
    try {
      const json = JSON.stringify(data);
      if (json.length > 2e6) return;   // a game may not fill this site's storage
      localStorage.setItem(saveKey(id), json);
    } catch (e) { /* quota */ }
  }

  root.ZylithStore = { put, get, list, remove, loadSave, writeSave };
})(window);
