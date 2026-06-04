/**
 * Step 6 — deterministic image binder (the service-image guardrail).
 *
 * Joins the normalized image model (silver.images.items[]) to the content-plan
 * (pages with slug/role/sourcePath) WITHOUT any AI and WITHOUT fabricating a
 * mismatch. The core rule:
 *
 *   A service page binds an image ONLY when that image actually appeared on the
 *   service's original source page — i.e. image.sourcePages.includes(page.sourcePath).
 *
 * If no source-matched image exists, the service page gets NO service-specific
 * image (null) rather than a random treatment photo from another service. This
 * is the "don't fabricate / don't mismatch" rule applied to imagery.
 *
 * Role-keyed slots (hero, headshots, badges, office, gallery) are filled from
 * the canonical items[] by role. Doctor portraits are matched by personName.
 *
 * Input:
 *   contentPlan : output of planContent() — { pages:[{slug,role,sourcePath,...}], ... }
 *   images      : silver.images — { items:[{src,alt,role,sourcePages,personName}], ... }
 *   opts.activeProviders : optional [{name}] to scope portrait matching to the
 *                          evergreen roster (so we never bind a departing doctor's headshot)
 *
 * Output (pure data, no I/O):
 *   {
 *     globals:   { logo, logoFooter, hero:[src], badges:[src], office:[src], gallery:[src] },
 *     portraits: { byName:{ '<name>':src }, unmatched:[<name>] },
 *     byPage:    { '<slug>': { image:src|null, images:[{src,alt,role}], match:'source'|'role'|'none' } },
 *     unused:    [{ src, role, sourcePages }],
 *     diagnostics: { ... }   // for the eval harness
 *   }
 */

const norm = (p) => {
  if (!p) return null;
  let s = String(p).trim().toLowerCase();
  s = s.replace(/[?#].*$/, '');          // drop query/hash
  s = s.replace(/\/index\.\w+$/, '/');   // /index.php → /
  s = s.replace(/\.(php|html?|aspx?)$/, ''); // drop common page extensions
  s = s.replace(/\/+$/, '');             // trailing slash
  return s === '' ? '/' : s;
};

export function bindImages(contentPlan, images, opts = {}) {
  const items = Array.isArray(images?.items) ? images.items : [];
  const byRole = (r) => items.filter((i) => i.role === r);
  const srcOf = (i) => i?.src || null;

  // ---- portrait matching (scoped to active roster if provided) ---------------
  // Keep the full provider objects so we can join on each doctor's bio page
  // (sourcePath) — the most reliable identity signal when alt-text/filenames lie.
  const providers = (opts.activeProviders || [])
    .map((p) => (typeof p === 'string' ? { name: p } : p))
    .filter((p) => p && p.name);
  const activeNames = providers.map((p) => p.name);
  const headshots = byRole('headshot');
  const normName = (n) => String(n || '').toLowerCase().replace(/^dr\.?\s+/, '').replace(/[^a-z\s]/g, '').trim();
  const lastName = (n) => normName(n).split(/\s+/).pop() || '';

  const portraitsByName = {};
  for (const h of headshots) {
    if (!h.personName) continue;
    portraitsByName[h.personName] = h.src;
  }

  // A dedicated bio page (e.g. /meet-dr-jeremy-vistica) is real provenance;
  // the homepage ('/') or empty is not specific enough to attribute a face.
  const isBioPage = (sp) => {
    const n = norm(sp);
    return n && n !== '/' && n.length > 1;
  };
  // Portrait candidate = a person photo, NOT a logo/badge/decorative asset.
  // role headshot/team are explicit; we also allow alt naming a person.
  const PORTRAIT_ROLES = new Set(['headshot', 'team']);
  const looksPortrait = (i) =>
    PORTRAIT_ROLES.has(i.role) || /headshot|portrait|\bdr\.?\b/i.test(i.alt || '');
  const portraitRank = (i) => (i.role === 'headshot' ? 0 : i.role === 'team' ? 1 : 2);

  // Resolve each active provider: (1) exact name, (2) last-name, then
  // (3) BIO-PAGE JOIN — an image whose sourcePages include the doctor's bio page.
  const resolvedPortraits = {};
  const portraitMatch = {};   // name -> 'name' | 'bio-page'
  const unmatchedProviders = [];
  const usedPortraitSrc = new Set();
  for (const prov of providers) {
    const name = prov.name;
    let src = portraitsByName[name];
    if (src) { portraitMatch[name] = 'name'; }
    if (!src) {
      const ln = lastName(name);
      const hit = headshots.find((h) => h.personName && lastName(h.personName) === ln && !usedPortraitSrc.has(h.src));
      if (hit) { src = hit.src; portraitMatch[name] = 'name'; }
    }
    if (!src) {
      const bio = prov.sourcePath || prov.source || null;
      if (isBioPage(bio)) {
        const target = norm(bio);
        const cand = items
          .filter((i) => !usedPortraitSrc.has(i.src) && looksPortrait(i) &&
            (i.sourcePages || []).some((sp) => norm(sp) === target))
          .sort((a, b) => portraitRank(a) - portraitRank(b))[0];
        if (cand) { src = cand.src; portraitMatch[name] = 'bio-page'; }
      }
    }
    if (src) { resolvedPortraits[name] = src; usedPortraitSrc.add(src); }
    else unmatchedProviders.push(name);
  }
  // If caller gave no roster, expose every named headshot.
  const portraits = {
    byName: activeNames.length ? resolvedPortraits : { ...portraitsByName },
    match: portraitMatch,
    unmatched: unmatchedProviders,
  };

  // ---- globals (role pools) --------------------------------------------------
  const usedSrc = new Set();
  const take = (arr) => arr.map(srcOf).filter(Boolean);
  const globals = {
    logo: images?.logo || (byRole('logo')[0]?.src ?? null),
    logoFooter: images?.logoFooter || (byRole('logoFooter')[0]?.src ?? null),
    hero: take(byRole('hero')),
    badges: take(byRole('badge')),
    office: take(byRole('office')),
    gallery: take(byRole('gallery')),
    team: take(byRole('team')),
  };
  Object.values(portraits.byName).forEach((s) => usedSrc.add(s));

  // ---- service-image guardrail (sourcePages join) ----------------------------
  // Candidate imagery for a service page = images whose sourcePages overlap the
  // page's original source path. Prefer treatment role, then any non-structural.
  const STRUCTURAL = new Set(['logo', 'logoFooter']);
  const bindable = items.filter((i) => !STRUCTURAL.has(i.role));
  const pageSrcMatches = (sourcePath) => {
    const target = norm(sourcePath);
    if (!target) return [];
    return bindable.filter((i) =>
      (i.sourcePages || []).some((sp) => norm(sp) === target)
    );
  };

  const byPage = {};
  const servicePages = (contentPlan?.pages || []).filter((p) => p.role === 'service');
  let withSource = 0;
  const withoutSource = [];

  for (const page of servicePages) {
    const matches = pageSrcMatches(page.sourcePath);
    // Rank: treatment role first (most topical), then gallery/beforeAfter/office.
    const ranked = matches.slice().sort((a, b) => roleRank(a.role) - roleRank(b.role));
    if (ranked.length) {
      withSource++;
      ranked.forEach((m) => usedSrc.add(m.src));
      byPage[page.slug] = {
        image: ranked[0].src,
        images: ranked.map((m) => ({ src: m.src, alt: m.alt || '', role: m.role })),
        match: 'source',
      };
    } else {
      withoutSource.push(page.slug);
      byPage[page.slug] = { image: null, images: [], match: 'none' };
    }
  }

  // ---- home / about role-based slots ----------------------------------------
  globals.hero.forEach((s) => usedSrc.add(s));
  globals.badges.forEach((s) => usedSrc.add(s));
  globals.office.forEach((s) => usedSrc.add(s));
  globals.gallery.forEach((s) => usedSrc.add(s));
  globals.team.forEach((s) => usedSrc.add(s));

  const unused = items
    .filter((i) => !STRUCTURAL.has(i.role) && i.role !== 'unused' && !usedSrc.has(i.src))
    .map((i) => ({ src: i.src, role: i.role, sourcePages: i.sourcePages || [] }));

  // Coverage is measured over CONTENT images only — images the classifier
  // deemed role:'unused' (decorative/duplicate/tracking) are not expected to bind.
  const contentImages = items.filter((i) => i.role !== 'unused' && !STRUCTURAL.has(i.role));
  const contentBound = contentImages.filter((i) => usedSrc.has(i.src)).length;
  const diagnostics = {
    images: {
      total: items.length,
      content: contentImages.length,
      bound: contentBound,
      unused: unused.length,
      decorative: items.filter((i) => i.role === 'unused').length,
      coverage: contentImages.length ? +(contentBound / contentImages.length).toFixed(3) : 1,
    },
    servicePages: {
      total: servicePages.length,
      withSourceMatch: withSource,
      withoutMatch: withoutSource,
      matchRate: servicePages.length ? +(withSource / servicePages.length).toFixed(3) : 1,
    },
    portraits: {
      providersRequested: activeNames.length,
      matched: Object.keys(portraits.byName).length,
      unmatched: portraits.unmatched,
    },
    roleCounts: countRoles(items),
  };

  return { globals, portraits, byPage, unused, diagnostics };
}

function roleRank(role) {
  const order = ['treatment', 'beforeAfter', 'gallery', 'office', 'team', 'hero'];
  const idx = order.indexOf(role);
  return idx === -1 ? 99 : idx;
}

function countRoles(items) {
  const c = {};
  for (const i of items) c[i.role] = (c[i.role] || 0) + 1;
  return c;
}

export default bindImages;
