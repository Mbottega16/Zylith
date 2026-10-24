// Shared page check: does a URL load as an HTML page, and may it be framed?
const PARKED = /(domain (is )?for sale|this domain|account (has been )?suspended|site not found|there isn't a github pages site here|page not found|404 not found|buy this domain|coming soon)/i;

export async function check(url) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 15000);
  try {
    const res = await fetch(url, { signal: ctl.signal, redirect: 'follow', headers: { 'user-agent': 'Mozilla/5.0 (Zylith link check)', accept: 'text/html' } });
    const type = res.headers.get('content-type') || '';
    const body = (await res.text()).slice(0, 400000);
    const xfo = (res.headers.get('x-frame-options') || '').toLowerCase();
    const csp = res.headers.get('content-security-policy') || '';
    const fa = /frame-ancestors\s+([^;]+)/i.exec(csp);
    const faBlocks = fa && !/(^|\s)\*(\s|$)/.test(fa[1]) && !/mbottega16\.github\.io/.test(fa[1]);
    const title = (/<title[^>]*>([^<]{1,120})/i.exec(body) || [])[1]?.trim() || '';
    const ok = res.ok && /html/i.test(type) && /<script|<canvas|<embed|<object/i.test(body) && !PARKED.test(body.slice(0, 6000));
    return { ok, status: res.status, final: res.url, embed: ok && !xfo && !faBlocks, title, https: res.url.startsWith('https:') };
  } catch (e) { return { ok: false, status: 0, error: String(e.name) }; }
  finally { clearTimeout(timer); }
}

