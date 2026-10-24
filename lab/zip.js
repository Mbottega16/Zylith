/* Minimal zip reader. Uses the browser's built-in DecompressionStream, so it needs no library.
 * Stops early when the unpacked size passes the limit, so a zip bomb cannot fill memory. */
(function (root) {
  'use strict';

  const u16 = (b, o) => b[o] | (b[o + 1] << 8);
  const u32 = (b, o) => (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0;

  async function inflateRaw(data, maxBytes) {
    const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
    const reader = stream.getReader();
    const parts = [];
    let size = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > maxBytes) { await reader.cancel(); throw new Error('A file in the zip unpacks past the size limit (zip bomb?).'); }
      parts.push(value);
    }
    const out = new Uint8Array(size);
    let at = 0;
    for (const p of parts) { out.set(p, at); at += p.length; }
    return out;
  }

  /** @param {Uint8Array} bytes @param {{maxTotal?:number,maxFile?:number,maxFiles?:number}} [opts]
   *  @returns {Promise<Map<string, Uint8Array>>} */
  async function readZip(bytes, opts) {
    const maxTotal = (opts && opts.maxTotal) || 300 * 1024 * 1024;
    const maxFile = (opts && opts.maxFile) || 80 * 1024 * 1024;
    const maxFiles = (opts && opts.maxFiles) || 4000;
    // Find the end-of-central-directory record.
    let eocd = -1;
    for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) {
      if (u32(bytes, i) === 0x06054b50) { eocd = i; break; }
    }
    if (eocd < 0) throw new Error('This is not a zip file.');
    const count = u16(bytes, eocd + 10);
    let at = u32(bytes, eocd + 16);
    if (count > maxFiles) throw new Error(`The zip has ${count} files. The limit is ${maxFiles}.`);

    const entries = [];
    let declared = 0;
    for (let i = 0; i < count; i++) {
      if (u32(bytes, at) !== 0x02014b50) throw new Error('The zip index is damaged.');
      const flags = u16(bytes, at + 8), method = u16(bytes, at + 10);
      const csize = u32(bytes, at + 20), usize = u32(bytes, at + 24);
      const nlen = u16(bytes, at + 28), xlen = u16(bytes, at + 30), clen = u16(bytes, at + 32);
      const local = u32(bytes, at + 42);
      const name = new TextDecoder().decode(bytes.subarray(at + 46, at + 46 + nlen));
      at += 46 + nlen + xlen + clen;
      if (name.endsWith('/')) continue;
      if (flags & 1) throw new Error('The zip is password-protected.');
      declared += usize;
      if (usize > maxFile) throw new Error(`${name} is larger than the file limit.`);
      entries.push({ name, method, csize, usize, local });
    }
    if (declared > maxTotal) throw new Error(`The zip unpacks to ${(declared / 1048576).toFixed(0)} MB. The limit is ${maxTotal / 1048576} MB.`);

    const files = new Map();
    let total = 0;
    for (const e of entries) {
      if (u32(bytes, e.local) !== 0x04034b50) throw new Error('The zip is damaged.');
      const start = e.local + 30 + u16(bytes, e.local + 26) + u16(bytes, e.local + 28);
      const raw = bytes.subarray(start, start + e.csize);
      let data;
      if (e.method === 0) data = raw.slice();
      else if (e.method === 8) data = await inflateRaw(raw, Math.min(maxFile, e.usize + 1024));
      else throw new Error(`${e.name} uses an unsupported compression method (${e.method}).`);
      total += data.length;
      if (total > maxTotal) throw new Error('The zip unpacks past the size limit.');
      files.set(e.name.replace(/\\/g, '/'), data);
    }
    return files;
  }

  const api = { readZip };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.ZylithZip = api;
})(typeof window !== 'undefined' ? window : globalThis);
