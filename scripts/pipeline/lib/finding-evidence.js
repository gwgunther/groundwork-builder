/**
 * Per-page evidence for audit findings — what's wrong today vs. what good looks like.
 */

const EVIDENCE_ROW_CAP = 200;

/**
 * Compose a 120–160 char meta description from page content (same logic as build fixer).
 *
 * @param {{ h1?: string, intro?: string, practice?: string, city?: string }} opts
 * @returns {string|null}
 */
export function composeMetaDescription({ h1, intro, practice, city }) {
  if (intro && intro.length >= 80) {
    let d = intro.replace(/\s+/g, ' ').trim();
    if (d.length > 158) d = d.slice(0, 155).replace(/\s+\S*$/, '') + '…';
    return d;
  }
  if (h1) {
    const tail = practice ? ` at ${practice}` : '';
    const loc = city ? ` in ${city}` : '';
    const candidate = `${h1}${tail}${loc}.`;
    if (candidate.length >= 80 && candidate.length <= 160) return candidate;
    if (candidate.length <= 160) return candidate;
  }
  return null;
}

export function shortPath(url) {
  try {
    const u = new URL(url);
    return u.pathname === '/' ? '/' : u.pathname;
  } catch {
    return url;
  }
}

function pageByUrl(pages, url) {
  return pages.find(p => p.url === url) || null;
}

function pageH1(page) {
  return page?.headings?.find(h => h.level === 1)?.text?.trim() || '';
}

function pageIntro(page) {
  return page?.firstParagraph?.trim()
    || page?.paragraphs?.[0]?.trim()
    || '';
}

function practiceContext(scraped) {
  return {
    practice: scraped?.practice?.name || '',
    city: scraped?.address?.city || '',
  };
}

export function suggestMetaDescription(page, scraped) {
  if (!page) return null;
  const { practice, city } = practiceContext(scraped);
  const h1 = pageH1(page) || page.title?.trim() || '';
  const intro = pageIntro(page);
  const composed = composeMetaDescription({ h1, intro, practice, city });
  if (composed) return composed;
  if (h1) {
    const tail = practice ? ` — ${practice}` : '';
    const loc = city ? ` in ${city}` : '';
    return `${h1}${tail}${loc}. Book online today.`.slice(0, 160);
  }
  return null;
}

export function suggestTitle(page, scraped, city) {
  if (!page) return null;
  const { practice } = practiceContext(scraped);
  const h1 = pageH1(page);
  const base = h1 || page.title?.trim() || 'Dental Care';
  if (city) {
    const candidate = `${base} | ${practice || 'Dental Practice'} in ${city}`;
    return candidate.length <= 60 ? candidate : `${base} | ${city}`.slice(0, 60);
  }
  if (practice) return `${base} | ${practice}`.slice(0, 60);
  return base.slice(0, 60);
}

/**
 * @param {object} f - raw finding from tech-audit
 * @param {object|null} bronze - { pages: [...] }
 * @param {object|null} scraped - silver / practice context
 * @returns {object|null}
 */
export function buildFindingEvidenceRows(f, bronze, scraped = null) {
  const pages = bronze?.pages || [];
  const city = scraped?.address?.city || '';

  if (f.id === 'duplicate-titles') {
    const titleMap = {};
    for (const p of pages) {
      const t = p.title?.trim();
      if (!t) continue;
      if (!titleMap[t]) titleMap[t] = [];
      titleMap[t].push(p.url);
    }
    const dupTitles = Object.entries(titleMap).filter(([, urls]) => urls.length > 1);
    if (dupTitles.length === 0) return null;
    const rows = [];
    for (const [title, urls] of dupTitles) {
      for (const url of urls) {
        rows.push({
          url,
          path: shortPath(url),
          current: `"${title}"`,
          detail: `Same title on ${urls.length} pages`,
        });
      }
    }
    return evidenceTable({
      columns: ['path', 'current', 'detail'],
      columnLabels: {
        path: 'Page',
        current: 'Duplicate title tag',
        detail: 'Why it matters',
      },
      rows: rows.slice(0, EVIDENCE_ROW_CAP),
      total: rows.length,
    });
  }

  if (f.id === 'missing-alt') {
    const byPage = [];
    for (const p of pages) {
      const missing = (p.images || []).filter(img => !img.alt?.trim()).length;
      if (missing > 0) {
        byPage.push({
          url: p.url,
          path: shortPath(p.url),
          current: `${missing} image${missing === 1 ? '' : 's'} with no alt text`,
          suggested: 'Each image needs alt text describing what it shows (e.g. "Smile makeover before and after").',
        });
      }
    }
    if (byPage.length === 0) return null;
    return evidenceTable({
      columns: ['path', 'current', 'suggested'],
      columnLabels: {
        path: 'Page',
        current: 'What we found',
        suggested: 'What good looks like',
      },
      rows: byPage.slice(0, EVIDENCE_ROW_CAP),
      total: byPage.length,
    });
  }

  if (f.id === 'thin-content') {
    const thin = pages
      .filter(p => (p.wordCount || 0) < 200 && p.url)
      .map(p => ({
        url: p.url,
        path: shortPath(p.url),
        current: `${p.wordCount || 0} words`,
        suggested: 'Aim for 200+ words of unique, helpful content patients would actually read.',
      }));
    if (thin.length === 0) return null;
    return evidenceTable({
      columns: ['path', 'current', 'suggested'],
      columnLabels: {
        path: 'Page',
        current: 'Content length',
        suggested: 'Target',
      },
      rows: thin.slice(0, EVIDENCE_ROW_CAP),
      total: thin.length,
    });
  }

  if (f.id === 'multiple-h1') {
    const rows = [];
    for (const url of f.affectedPages || []) {
      const page = pageByUrl(pages, url);
      const h1s = page?.headings?.filter(h => h.level === 1).map(h => h.text) || [];
      rows.push({
        url,
        path: shortPath(url),
        current: h1s.map(t => `"${t}"`).join(', ') || '(unknown)',
        suggested: 'Keep one H1 per page; demote extras to H2.',
      });
    }
    if (rows.length === 0) return null;
    return evidenceTable({
      columns: ['path', 'current', 'suggested'],
      columnLabels: {
        path: 'Page',
        current: 'H1 headings found',
        suggested: 'Fix',
      },
      rows: rows.slice(0, EVIDENCE_ROW_CAP),
      total: rows.length,
    });
  }

  if (!f.affectedPages?.length) return null;

  const rows = f.affectedPages.slice(0, EVIDENCE_ROW_CAP).map(url => {
    const page = pageByUrl(pages, url);
    const row = { url, path: shortPath(url) };

    if (f.id === 'missing-meta') {
      row.current = '(no meta description tag)';
      row.suggested = suggestMetaDescription(page, scraped)
        || 'Add a 120–160 character summary of what this page offers patients.';
    } else if (f.id === 'missing-title') {
      row.current = '(no <title> tag)';
      row.suggested = suggestTitle(page, scraped, city) || 'Add a unique title with the service and city.';
    } else if (f.id === 'title-no-city') {
      row.current = page?.title?.trim() ? `"${page.title.trim()}"` : '(no title)';
      row.suggested = suggestTitle(page, scraped, city) || `Include "${city}" in the title for local search.`;
    } else if (f.id === 'missing-h1') {
      const top = page?.headings?.find(h => h.level === 2)?.text;
      row.current = top ? `No H1 — top heading is H2: "${top}"` : 'No H1 heading on page';
      row.suggested = page?.title?.trim()
        ? `Add H1: "${page.title.trim()}"`
        : 'Add one clear H1 that states what the page is about.';
    } else if (f.id === 'missing-canonical') {
      row.current = '(no canonical URL tag)';
      row.suggested = `Add <link rel="canonical" href="${url}">`;
    } else {
      const col = legacyValueColumn(f.id);
      if (col === 'title') row.current = page?.title?.trim() ? `"${page.title.trim()}"` : '(no title)';
      if (col === 'meta') row.current = page?.metaDescription?.trim() || '(missing)';
    }

    return row;
  });

  const hasSuggested = rows.some(r => r.suggested);
  const columns = hasSuggested
    ? ['path', 'current', 'suggested']
    : ['path', 'current'];

  const columnLabels = {
    path: 'Page',
    current: currentColumnLabel(f.id),
    suggested: 'What good looks like',
  };

  return evidenceTable({
    columns,
    columnLabels,
    rows,
    total: f.affectedPages.length,
    note: f.affectedPages.length > rows.length
      ? `${rows.length} of ${f.affectedPages.length} shown.`
      : undefined,
  });
}

function evidenceTable({ columns, columnLabels, rows, total, note }) {
  return { columns, column_labels: columnLabels, rows, total, note, layout: 'compare' };
}

function legacyValueColumn(id) {
  if (id === 'missing-meta') return 'meta';
  if (id === 'duplicate-titles' || id === 'missing-title' || id === 'title-no-city') return 'title';
  return 'detail';
}

function currentColumnLabel(id) {
  const labels = {
    'missing-meta': 'What Google sees in search results',
    'missing-title': 'Browser tab / Google title',
    'title-no-city': 'Current title tag',
    'missing-h1': 'Heading structure',
    'missing-canonical': 'Canonical tag',
  };
  return labels[id] || 'What we found';
}

export function evidenceSummaryLabel(er) {
  const valCol = (er.columns || []).find(c => c !== 'path' && c !== 'url') || 'current';
  if (valCol === 'title' || er.column_labels?.current?.includes('title')) {
    return `Show all ${er.total} pages with this issue`;
  }
  if (valCol === 'unlabeled') return `Show all ${er.total} pages with unlabeled photos`;
  return `Show what's wrong on each of ${er.total} pages`;
}

/**
 * @param {object} er - evidence_rows from assembleAuditData or buildFindingEvidenceRows
 * @param {(s: string) => string} esc
 * @param {{ open?: boolean }} [opts]
 */
export function renderFindingEvidenceHtml(er, esc, opts = {}) {
  if (!er?.rows?.length) return '';

  const labels = er.column_labels || {};
  const open = opts.open !== false;

  if (er.layout === 'compare' && er.rows[0]?.suggested != null) {
    const cards = er.rows.map(r => `
      <div class="page-evidence-card">
        <a class="page-evidence-path" href="${esc(r.url)}" target="_blank" rel="noopener">${esc(r.path || shortPath(r.url))}</a>
        <div class="page-evidence-compare">
          <div class="pe-side pe-now">
            <div class="pe-label">${esc(labels.current || 'What we found')}</div>
            <div class="pe-value">${esc(r.current || '—')}</div>
            ${r.detail ? `<div class="pe-detail">${esc(r.detail)}</div>` : ''}
          </div>
          <div class="pe-side pe-good">
            <div class="pe-label">${esc(labels.suggested || 'What good looks like')}</div>
            <div class="pe-value">${esc(r.suggested || '—')}</div>
          </div>
        </div>
      </div>`).join('');

    const foot = er.note
      || (er.total > er.rows.length
        ? `Showing ${er.rows.length} of ${er.total} pages`
        : `${er.total} page${er.total === 1 ? '' : 's'}`);

    return `<details class="finding-page-evidence"${open ? ' open' : ''}>
      <summary>${esc(evidenceSummaryLabel(er))}</summary>
      <div class="page-evidence-list">${cards}</div>
      <div class="page-evidence-foot">${esc(foot)}</div>
    </details>`;
  }

  // Legacy two-column table (url + single value field)
  const valCol = (er.columns || []).find(c => c !== 'url' && c !== 'path') || 'current';
  const valHeader = labels[valCol]
    || (valCol === 'title' ? 'Its title tag' : valCol === 'unlabeled' ? 'Unlabeled photos' : 'Detail');

  const rows = er.rows.map(r => {
    const path = r.path || shortPath(r.url);
    const val = r[valCol] ?? r.title ?? r.meta ?? r.words ?? r.unlabeled ?? r.current ?? '';
    const quoted = valCol === 'title' ? `"${val}"` : val;
    return `<div class="evidence-row"><span class="url"><a href="${esc(r.url)}" target="_blank" rel="noopener">${esc(path)}</a></span><span class="val">${esc(quoted)}</span></div>`;
  }).join('');

  const foot = er.note
    || (er.total > er.rows.length
      ? `${er.rows.length} of ${er.total} affected pages · scroll for more`
      : `All ${er.total} pages`);

  return `<details class="finding-page-evidence"${open ? ' open' : ''}>
    <summary>${esc(evidenceSummaryLabel(er))}</summary>
    <div class="evidence-table">
      <div class="evidence-scroll">
        <div class="evidence-row head"><span>Page</span><span>${esc(valHeader)}</span></div>
        ${rows}
      </div>
      <div class="page-evidence-foot">${esc(foot)}</div>
    </div>
  </details>`;
}
