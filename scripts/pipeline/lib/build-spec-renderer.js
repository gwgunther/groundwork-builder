/**
 * Internal build-spec view — full render of audit-data.json for operator QA.
 */

export function renderBuildSpec(data) {
  const json = JSON.stringify(data, null, 2);
  const escaped = json.replace(/<\/script/gi, '<\\/script');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Audit Data — ${esc(data.meta?.business_name || 'Site')}</title>
<style>
  * { box-sizing:border-box; margin:0; padding:0; }
  :root{
    --ink:#1f2933; --soft:#5a6672; --mute:#9aa0a8; --line:#e6e4dd; --line2:#f0eee8;
    --bg:#fcfcfa; --panel:#fff; --key:#3d5a48; --str:#1f2933; --num:#b15c2e;
    --fail:#b42318; --pass:#4a6b55; --warn:#92400e;
    --mono:ui-monospace,"SF Mono",Menlo,Consolas,monospace;
    --ui:-apple-system,BlinkMacSystemFont,"Segoe UI",Helvetica,Arial,sans-serif;
  }
  body{ font-family:var(--ui); background:var(--bg); color:var(--ink); font-size:13.5px; line-height:1.5; max-width:880px; margin:0 auto; padding:34px 28px 60px; }
  .top{ display:flex; justify-content:space-between; align-items:baseline; gap:16px; padding-bottom:12px; border-bottom:2px solid var(--ink); flex-wrap:wrap; }
  .top h1{ font-size:17px; font-weight:600; }
  .top .src{ font-family:var(--mono); font-size:11px; color:var(--mute); }
  .legend{ font-size:11px; color:var(--mute); margin:8px 0 22px; }
  .block{ margin:22px 0; border:1px solid var(--line); background:var(--panel); }
  .block > .bh{ font-family:var(--mono); font-size:12px; font-weight:600; color:var(--key); padding:8px 14px; background:#f7f6f1; border-bottom:1px solid var(--line); }
  .block > .bh .count{ color:var(--mute); font-weight:400; }
  .body{ padding:6px 14px 12px; }
  .kv{ display:grid; grid-template-columns:200px 1fr; gap:0; }
  .kv > div{ padding:5px 0; border-bottom:1px solid var(--line2); min-width:0; }
  .kv > div:nth-last-child(-n+2){ border-bottom:none; }
  .k{ font-family:var(--mono); font-size:12px; color:var(--key); }
  .v{ font-family:var(--mono); font-size:12px; color:var(--str); word-break:break-word; }
  .v.num{ color:var(--num); }
  table{ width:100%; border-collapse:collapse; font-size:12px; margin:4px 0; }
  th{ text-align:left; font-family:var(--mono); font-size:10.5px; font-weight:600; color:var(--mute); padding:5px 8px; border-bottom:1px solid var(--line); }
  td{ font-family:var(--mono); font-size:11.5px; padding:5px 8px; border-bottom:1px solid var(--line2); vertical-align:top; word-break:break-word; }
  tr:last-child td{ border-bottom:none; }
  td.num{ text-align:right; color:var(--num); }
  .st-fail{ color:var(--fail); } .st-pass{ color:var(--pass); } .st-warn{ color:var(--warn); }
  .finding{ border:1px solid var(--line); margin:10px 0; }
  .finding > .fh{ display:flex; align-items:baseline; gap:8px; padding:8px 12px; background:#f7f6f1; border-bottom:1px solid var(--line); flex-wrap:wrap; }
  .finding .fid{ font-family:var(--mono); font-weight:600; }
  .finding .fcat{ font-weight:600; }
  .finding .fbadges{ margin-left:auto; font-family:var(--mono); font-size:11px; color:var(--mute); }
  .finding .fbadges .crit{ color:var(--fail); } .finding .fbadges .warn{ color:var(--warn); }
  .finding .fbadges .nosum{ font-style:italic; }
  .fbody{ padding:8px 12px; }
  .fsub{ font-family:var(--mono); font-size:10.5px; color:var(--mute); text-transform:uppercase; letter-spacing:0.06em; margin:8px 0 3px; }
  .fsub:first-child{ margin-top:0; }
  .ftext{ font-size:12.5px; }
  .ftext.soft{ color:var(--soft); }
  footer{ margin-top:30px; font-family:var(--mono); font-size:10.5px; color:var(--mute); }
</style>
</head>
<body>
<div id="app"></div>
<script id="data" type="application/json">${escaped}</script>
<script>
const D = JSON.parse(document.getElementById('data').textContent);
const el = (t,c,h)=>{const e=document.createElement(t); if(c)e.className=c; if(h!=null)e.innerHTML=h; return e;};
const esc = s => String(s).replace(/[&<>]/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[m]));
const isURL = s => typeof s==='string' && /^https?:\\/\\//.test(s);
const app = document.getElementById('app');

const hdr = el('div','top');
hdr.innerHTML = '<h1>Audit Data · '+esc(D.meta?.business_name||'')+'</h1><span class="src">source: audit-data.json · schema '+esc(D['$schema']||'')+'</span>';
app.appendChild(hdr);
app.appendChild(el('div','legend','Internal view — every field in the source-of-truth JSON. The sales one-pager is a curated subset.'));

function kvBlock(title, obj, skip=[]) {
  const b = el('div','block');
  b.appendChild(el('div','bh',title));
  const body = el('div','body');
  const grid = el('div','kv');
  for (const [k,v] of Object.entries(obj||{})) {
    if (skip.includes(k) || k.startsWith('_') || k==='$schema') continue;
    grid.appendChild(el('div','k',esc(k)));
    const d = el('div','v');
    if (v && typeof v==='object' && !Array.isArray(v)) d.textContent = JSON.stringify(v);
    else if (Array.isArray(v)) d.textContent = v.join(', ');
    else d.textContent = v==null?'':String(v);
    grid.appendChild(d);
  }
  body.appendChild(grid);
  b.appendChild(body);
  return b;
}

function tableFrom(rows, cols) {
  const t = el('table');
  const thead = el('thead'); const htr = el('tr');
  cols.forEach(c=>{ htr.appendChild(el('th',null,esc(c))); });
  thead.appendChild(htr); t.appendChild(thead);
  const tb = el('tbody');
  rows.forEach(r=>{
    const tr = el('tr');
    cols.forEach(c=>{
      const td = el('td', /value|score|target/.test(c)?'num':null);
      const val = r[c];
      if (isURL(val)) td.innerHTML = '<a href="'+esc(val)+'" target="_blank">'+esc(val)+'</a>';
      else td.textContent = val==null?'—':val;
      tr.appendChild(td);
    });
    tb.appendChild(tr);
  });
  t.appendChild(tb);
  return t;
}

app.appendChild(kvBlock('meta', D.meta));
app.appendChild(kvBlock('scan', D.scan));

{
  const b = el('div','block'); b.appendChild(el('div','bh','lighthouse'));
  const body = el('div','body');
  body.appendChild(el('div','fsub','raw_metrics'));
  body.appendChild(tableFrom(D.lighthouse?.raw_metrics||[], ['id','name','value','unit','target','status']));
  body.appendChild(el('div','fsub','consumer_scores'));
  body.appendChild(tableFrom(D.lighthouse?.consumer_scores||[], ['key','label','desc','score','status']));
  b.appendChild(body); app.appendChild(b);
}

if (D.agentic_browsing) {
  const ab = D.agentic_browsing;
  const b = el('div','block');
  b.appendChild(el('div','bh','agentic_browsing'));
  const body = el('div','body');
  const summaryGrid = el('div','kv');
  for (const [k,v] of Object.entries({
    source: ab.source,
    llms_txt_status: ab.llms_txt_status,
    llms_txt_present: ab.llms_txt_present,
    pass_ratio: ab.pass_ratio ? ab.pass_ratio.passed+'/'+ab.pass_ratio.total : null,
    fractional_score: ab.fractional_score,
    headline: ab.headline,
  })) {
    summaryGrid.appendChild(el('div','k',esc(k)));
    const d = el('div','v');
    d.textContent = v==null?'':String(v);
    summaryGrid.appendChild(d);
  }
  body.appendChild(summaryGrid);
  if (ab.llms_evidence) {
    body.appendChild(el('div','fsub','llms_evidence'));
    const ev = ab.llms_evidence;
    const evGrid = el('div','kv');
    for (const [k,v] of Object.entries(ev)) {
      if (k === 'current_excerpt' || k === 'recommended_excerpt') continue;
      evGrid.appendChild(el('div','k',esc(k)));
      const d = el('div','v');
      if (Array.isArray(v)) d.textContent = v.join('; ');
      else d.textContent = v==null?'':String(v);
      evGrid.appendChild(d);
    }
    body.appendChild(evGrid);
    if (ev.current_excerpt) {
      body.appendChild(el('div','fsub','current_excerpt'));
      const pre = el('pre','ftext soft');
      pre.style.whiteSpace = 'pre-wrap';
      pre.textContent = ev.current_excerpt;
      body.appendChild(pre);
    }
    if (ev.recommended_excerpt) {
      body.appendChild(el('div','fsub','recommended_excerpt'));
      const pre = el('pre','ftext');
      pre.style.whiteSpace = 'pre-wrap';
      pre.textContent = ev.recommended_excerpt;
      body.appendChild(pre);
    }
  }
  b.appendChild(body); app.appendChild(b);
}

{
  const b = el('div','block');
  b.appendChild(el('div','bh','findings <span class="count">'+(D.findings?.length||0)+'</span>'));
  const body = el('div','body');
  (D.findings||[]).forEach(f=>{
    const card = el('div','finding');
    const sev = f.severity==='critical'?'crit':f.severity==='warning'?'warn':'';
    const sum = f.show_in_summary ? 'in summary (rank '+f.summary_rank+')' : '<span class="nosum">spec-only</span>';
    const fh = el('div','fh');
    fh.innerHTML = '<span class="fid">'+esc(f.id)+'</span><span class="fcat">'+esc(f.category)+'</span><span class="fbadges"><span class="'+sev+'">'+esc(f.severity)+'</span> · '+esc(f.workstream)+' · impact '+esc(f.impact)+' · effort '+esc(f.effort)+' · '+sum+'</span>';
    card.appendChild(fh);
    const fb = el('div','fbody');
    fb.appendChild(el('div','fsub','measurement'));
    const m = f.measurement||{};
    fb.appendChild(el('div','ftext', m.type==='metric' ? esc(m.value)+' '+esc(m.label||'') : 'status: '+esc(m.value)));
    if (f.consumer) {
      fb.appendChild(el('div','fsub','consumer'));
      fb.appendChild(el('div','ftext','✕ '+esc(f.consumer.now)));
      fb.appendChild(el('div','ftext soft','✓ '+esc(f.consumer.good)));
    }
    if (f.technical) {
      fb.appendChild(el('div','fsub','technical'));
      if (f.technical.evidence) fb.appendChild(el('div','ftext soft','evidence: '+esc(f.technical.evidence)));
      if (f.technical.build) fb.appendChild(el('div','ftext','build: '+esc(f.technical.build)));
    }
    if (f.evidence_rows?.rows?.length) {
      fb.appendChild(el('div','fsub','evidence_rows ('+f.evidence_rows.total+' total, showing '+f.evidence_rows.rows.length+')'));
      const er = el('div','ftext soft');
      const valKey = (f.evidence_rows.columns||[]).find(c=>c!=='url')||'value';
      er.innerHTML = f.evidence_rows.rows.slice(0,30).map(r=>'<a href="'+esc(r.url)+'" target="_blank">'+esc(r.url)+'</a> — '+esc(r[valKey]||'')).join('<br>');
      fb.appendChild(er);
    }
    card.appendChild(fb);
    body.appendChild(card);
  });
  b.appendChild(body); app.appendChild(b);
}

if (D.strategy_bridge?.length) {
  const b = el('div','block');
  b.appendChild(el('div','bh','strategy_bridge <span class="count">'+D.strategy_bridge.length+'</span>'));
  const body = el('div','body');
  D.strategy_bridge.forEach(s=>{
    const d = el('div'); d.style.padding='7px 0'; d.style.borderBottom='1px solid var(--line2)';
    d.innerHTML = '<div class="ftext"><b>gap:</b> '+esc(s.gap)+'</div><div class="ftext" style="color:#3d5a48">→ '+esc(s.build)+'</div>';
    body.appendChild(d);
  });
  b.appendChild(body); app.appendChild(b);
}

app.appendChild(el('footer',null,'Groundwork Dental · rendered from audit-data.json · internal'));
</script>
</body>
</html>`;
}

function esc(s) {
  if (s == null) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
