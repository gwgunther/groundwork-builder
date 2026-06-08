// Polite homepage fetcher: realistic UA, timeout, single retry, captures
// final URL after redirects (some mills redirect to a vendor-hosted subdomain).

const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/605.1.15 ' +
  '(KHTML, like Gecko) Version/17.5 Safari/605.1.15';

export async function fetchHtml(url, { timeoutMs = 15000 } = {}) {
  const attempt = async () => {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        headers: {
          'User-Agent': UA,
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
        },
        redirect: 'follow',
        signal: ctrl.signal,
      });
      const html = await res.text();
      return {
        ok: res.ok,
        status: res.status,
        finalUrl: res.url,
        html,
        headers: Object.fromEntries(res.headers.entries()),
      };
    } finally {
      clearTimeout(t);
    }
  };

  try {
    return await attempt();
  } catch (e1) {
    // Single retry on transient failures.
    try {
      return await attempt();
    } catch (e2) {
      return { ok: false, status: 0, finalUrl: url, html: '', error: e2.message };
    }
  }
}
