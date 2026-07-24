/**
 * Grade My Site — Cloudflare Worker
 * POST /api/grade  { "url": "https://..." }
 * GET  /           landing form
 * GET  /api/grade?url=...
 *
 * Homepage HTML checks + optional PageSpeed (GOOGLE_PAGESPEED_API_KEY secret).
 * Returns Groundwork Growth Score JSON for prospects.
 */

const WEIGHTS = {
  'missing-title': 1.5,
  'missing-meta': 1.2,
  'missing-h1': 1.2,
  'multiple-h1': 0.8,
  'missing-schema': 1.0,
  'missing-canonical': 0.7,
  'no-viewport': 1.5,
  'missing-alt': 1.0,
  'no-faq': 0.8,
  'no-testimonials': 0.9,
  'thin-content': 1.3,
  'low-performance': 1.4,
  'low-lcp': 1.2,
  'high-cls': 1.0,
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'no-store',
    },
  });
}

function deriveState(severity) {
  if (severity === 'passed') return 'fixed';
  if (severity === 'critical' || severity === 'warning') return 'issue';
  return 'not_applicable';
}

function enrich(findings) {
  return findings.map((f) => ({
    ...f,
    state: deriveState(f.severity),
    weight: WEIGHTS[f.id] ?? 1,
  }));
}

function growthScore(findings) {
  let max = 0, earned = 0, total = 0, passed = 0, critical = 0, warnings = 0;
  for (const f of findings) {
    if (f.state === 'not_applicable') continue;
    total++;
    max += f.weight;
    if (f.state === 'fixed') { passed++; earned += f.weight; }
    else if (f.severity === 'critical') critical++;
    else warnings++;
  }
  const score = max > 0 ? Math.round((100 * earned) / max) : 0;
  return { score, summary: { total, passed, issues: critical + warnings, critical, warnings } };
}

function extractMeta(html, url) {
  const title = (html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || '').replace(/\s+/g, ' ').trim();
  const metaDesc = html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["']/i)?.[1]
    || html.match(/<meta[^>]+content=["']([^"']*)["'][^>]+name=["']description["']/i)?.[1]
    || '';
  const canonical = html.match(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/i)?.[1] || '';
  const viewport = /<meta[^>]+name=["']viewport["']/i.test(html);
  const h1s = [...html.matchAll(/<h1\b[^>]*>([\s\S]*?)<\/h1>/gi)].map((m) => m[1].replace(/<[^>]+>/g, '').trim());
  const hasSchema = /application\/ld\+json/i.test(html);
  const imgTags = [...html.matchAll(/<img\b[^>]*>/gi)].map((m) => m[0]);
  const missingAlt = imgTags.filter((t) => !/\balt\s*=/i.test(t) || /\balt\s*=\s*["']\s*["']/i.test(t)).length;
  const hasFaq = /\bfaq\b|frequently asked|FAQPage/i.test(html);
  const hasTestimonials = /testimonial|patient review|google.?review|reviewRating/i.test(html);
  const wordish = html.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ');
  const wordCount = wordish.trim().split(/\s+/).filter(Boolean).length;
  return { title, metaDescription: metaDesc.trim(), canonical, viewport, h1Count: h1s.length, h1Text: h1s[0] || '', hasSchema, imageCount: imgTags.length, missingAlt, hasFaq, hasTestimonials, wordCount, url };
}

function findingsFromMeta(meta, psi) {
  const f = [];
  const push = (id, category, severity, title, detail, count = severity === 'passed' ? 0 : 1) => {
    f.push({ id, category, severity, title, detail, count, affectedPages: ['/'], benefit: '' });
  };
  push('missing-title', 'seo', meta.title ? 'passed' : 'critical', 'Homepage title tag', meta.title ? `Title present` : 'Missing <title>');
  push('missing-meta', 'seo', meta.metaDescription ? 'passed' : 'critical', 'Meta description', meta.metaDescription ? 'Present' : 'Missing meta description');
  push('missing-h1', 'seo', meta.h1Count >= 1 ? 'passed' : 'critical', 'Homepage H1', meta.h1Count ? 'H1 present' : 'Missing H1');
  push('multiple-h1', 'seo', meta.h1Count <= 1 ? 'passed' : 'warning', 'Single H1', meta.h1Count <= 1 ? 'OK' : `${meta.h1Count} H1s`, meta.h1Count > 1 ? meta.h1Count : 0);
  push('missing-schema', 'seo', meta.hasSchema ? 'passed' : 'warning', 'Structured data', meta.hasSchema ? 'JSON-LD found' : 'No JSON-LD');
  push('missing-canonical', 'seo', meta.canonical ? 'passed' : 'warning', 'Canonical URL', meta.canonical ? 'Present' : 'Missing canonical');
  push('no-viewport', 'mobile', meta.viewport ? 'passed' : 'critical', 'Viewport meta', meta.viewport ? 'Present' : 'Missing viewport');
  push('missing-alt', 'accessibility', meta.missingAlt === 0 ? 'passed' : meta.missingAlt >= 3 ? 'critical' : 'warning', 'Image alt text', `${meta.missingAlt}/${meta.imageCount} missing alt`, meta.missingAlt);
  push('no-faq', 'content', meta.hasFaq ? 'passed' : 'warning', 'FAQ content', meta.hasFaq ? 'Detected' : 'Not detected');
  push('no-testimonials', 'content', meta.hasTestimonials ? 'passed' : 'warning', 'Testimonials', meta.hasTestimonials ? 'Detected' : 'Not detected');
  push('thin-content', 'content', meta.wordCount >= 200 ? 'passed' : 'warning', 'Content depth', `~${meta.wordCount} words`);
  if (psi && typeof psi.performance === 'number') {
    const s = psi.performance;
    push('low-performance', 'performance', s >= 70 ? 'passed' : s >= 50 ? 'warning' : 'critical', 'Mobile PageSpeed', `${s}/100`);
  }
  return f;
}

async function runPsi(url, apiKey) {
  if (!apiKey) return null;
  const params = new URLSearchParams({ url, strategy: 'mobile', category: 'performance', key: apiKey });
  const res = await fetch(`https://www.googleapis.com/pagespeedonline/v5/runPagespeed?${params}`, {
    signal: AbortSignal.timeout(55000),
  });
  if (!res.ok) return null;
  const data = await res.json();
  const cats = data.lighthouseResult?.categories || {};
  const audits = data.lighthouseResult?.audits || {};
  return {
    performance: Math.round((cats.performance?.score ?? 0) * 100),
    metrics: {
      lcp: audits['largest-contentful-paint']?.numericValue,
      cls: audits['cumulative-layout-shift']?.numericValue,
    },
  };
}

async function grade(url, env) {
  const normalized = /^https?:\/\//i.test(url) ? url : `https://${url}`;
  const res = await fetch(normalized, {
    redirect: 'follow',
    headers: { 'User-Agent': 'GroundworkGradeBot/1.0', Accept: 'text/html' },
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${normalized}`);
  const html = await res.text();
  const finalUrl = res.url || normalized;
  const meta = extractMeta(html, finalUrl);
  const psi = await runPsi(finalUrl, env.GOOGLE_PAGESPEED_API_KEY);
  const findings = enrich(findingsFromMeta(meta, psi));
  const { score, summary } = growthScore(findings);
  const grade = score >= 80 ? 'A' : score >= 65 ? 'B' : score >= 50 ? 'C' : score >= 35 ? 'D' : 'F';
  return {
    url: finalUrl,
    growthScore: score,
    grade,
    summary,
    findings,
    meta: { title: meta.title, h1: meta.h1Text, wordCount: meta.wordCount, hasSchema: meta.hasSchema },
    pagespeed: psi ? { mobile: psi } : null,
    engine: 'grade-my-site-worker',
  };
}

function landingHtml() {
  return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Grade My Site — Groundwork Dental</title>
<style>
  :root { --ink:#1a1a1a; --muted:#667085; --line:#e4e4e7; --sage:#5F7F6B; --bg:#fafaf9; }
  *{box-sizing:border-box} body{margin:0;font-family:Georgia,"Times New Roman",serif;background:var(--bg);color:var(--ink)}
  main{max-width:640px;margin:0 auto;padding:48px 20px}
  h1{font-size:2rem;margin:0 0 8px} p.lead{color:var(--muted);font-size:1.05rem;line-height:1.5}
  form{display:flex;gap:8px;margin:28px 0;flex-wrap:wrap}
  input[type=url]{flex:1;min-width:220px;padding:12px 14px;border:1px solid var(--line);border-radius:6px;font:inherit}
  button{background:var(--sage);color:#fff;border:0;border-radius:6px;padding:12px 18px;font:600 14px system-ui;cursor:pointer}
  button:disabled{opacity:.6} pre{background:#111;color:#e7ebf0;padding:16px;border-radius:8px;overflow:auto;font-size:12px}
  .score{font-size:3rem;font-weight:700;margin:12px 0 0} .muted{color:var(--muted);font-family:system-ui}
</style></head><body><main>
  <p class="muted" style="font-family:system-ui;font-size:12px;letter-spacing:.08em;text-transform:uppercase">Groundwork Dental</p>
  <h1>Grade My Site</h1>
  <p class="lead">Free homepage score for dental practices — titles, schema, mobile basics, and PageSpeed when available.</p>
  <form id="f"><input id="url" type="url" required placeholder="https://yourpractice.com" />
  <button type="submit">Grade site</button></form>
  <div id="out" hidden><div class="score" id="score"></div><p class="muted" id="sum"></p><pre id="json"></pre></div>
<script>
const f=document.getElementById('f'), out=document.getElementById('out');
f.addEventListener('submit', async (e)=>{
  e.preventDefault();
  const btn=f.querySelector('button'); btn.disabled=true; btn.textContent='Grading…';
  try{
    const url=document.getElementById('url').value;
    const res=await fetch('/api/grade',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({url})});
    const data=await res.json();
    if(!res.ok) throw new Error(data.error||res.statusText);
    out.hidden=false;
    document.getElementById('score').textContent=data.growthScore+'/100 · '+data.grade;
    document.getElementById('sum').textContent=data.summary.passed+' passed · '+data.summary.issues+' issues';
    document.getElementById('json').textContent=JSON.stringify(data,null,2);
  }catch(err){alert(err.message)}
  finally{btn.disabled=false; btn.textContent='Grade site'}
});
</script></main></body></html>`;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
        },
      });
    }

    if (url.pathname === '/' && request.method === 'GET') {
      return new Response(landingHtml(), { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
    }

    if (url.pathname === '/api/grade') {
      try {
        let target = url.searchParams.get('url');
        if (request.method === 'POST') {
          const body = await request.json().catch(() => ({}));
          target = body.url || target;
        }
        if (!target) return json({ error: 'url required' }, 400);
        const result = await grade(target, env);
        return json(result);
      } catch (err) {
        return json({ error: err.message || String(err) }, 500);
      }
    }

    return json({ error: 'not found' }, 404);
  },
};
