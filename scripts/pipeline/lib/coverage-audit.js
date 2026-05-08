/**
 * coverage-audit.js — before/after audit for the pipeline.
 *
 * Compares the scraped/silver/bronze data against the final rebuilt site
 * and reports gaps. Catches the kind of failures where the pipeline silently
 * drops content (e.g. a second doctor going missing, a service page losing
 * 80% of its body, etc.).
 *
 * Inputs (read from disk):
 *   - bronze:    _pipeline/01-bronze.json         (raw scrape)
 *   - silver:    _pipeline/01-scrape.json         (AI extraction)
 *   - merged:    _pipeline/06-merge.json          (merged data)
 *   - rebuild:   src/config/{site,design-dna}.ts, public/images/image-roles.json
 *   - built:     dist/index.html, dist/services/<slug>/index.html, dist/about/...
 *
 * Output:
 *   _pipeline/coverage-audit.json    (structured)
 *   _pipeline/coverage-audit.md      (human report)
 *
 * Severity levels:
 *   CRITICAL — content the pipeline definitively dropped (multi-doctor → 1 doctor)
 *   WARNING  — content the pipeline thinned out (page bodyText went from 6KB → 1KB)
 *   NOTE     — informational (low-confidence pairings, etc.)
 */

import { readFile, stat } from 'node:fs/promises';
import { resolve } from 'node:path';

const SEVERITY = { CRITICAL: 'CRITICAL', WARNING: 'WARNING', NOTE: 'NOTE' };

/**
 * Run the audit.
 * @param {string} outputDir  - root of the rebuilt project
 * @returns {Promise<{ findings: Array, summary: object, markdown: string }>}
 */
export async function runCoverageAudit(outputDir) {
  const findings = [];

  // --- Load all inputs ----------------------------------------------------
  const bronze = await tryReadJson(resolve(outputDir, '_pipeline/01-bronze.json'));
  const silverWrap = await tryReadJson(resolve(outputDir, '_pipeline/01-scrape.json'));
  const silver = silverWrap?.output || silverWrap;
  const mergedWrap = await tryReadJson(resolve(outputDir, '_pipeline/06-merge.json'));
  const merged = mergedWrap?.output || mergedWrap;

  const imageRoles = await tryReadJson(resolve(outputDir, 'public/images/image-roles.json'));

  // Built HTML (only if site has been built)
  const builtHomeHtml = await tryReadText(resolve(outputDir, 'dist/index.html'));
  const builtAboutHtml = await tryReadText(resolve(outputDir, 'dist/about/index.html'));

  // --- Comparators --------------------------------------------------------
  await checkDoctors(findings, { bronze, silver, merged, builtAboutHtml, builtHomeHtml });
  await checkDoctorPhotoPairing(findings, { silver, merged, imageRoles });
  await checkServiceCount(findings, { bronze, silver, outputDir });
  await checkServicePageDepth(findings, { bronze, outputDir });
  await checkDifferentiators(findings, { silver, merged, builtHomeHtml, builtAboutHtml });
  await checkContact(findings, { silver, merged, outputDir });
  await checkBlogPresence(findings, { silver, outputDir });
  await checkAdditionalContent(findings, { silver, outputDir });

  // --- Summary ------------------------------------------------------------
  const summary = {
    total: findings.length,
    critical: findings.filter(f => f.severity === SEVERITY.CRITICAL).length,
    warning:  findings.filter(f => f.severity === SEVERITY.WARNING).length,
    note:     findings.filter(f => f.severity === SEVERITY.NOTE).length,
  };

  const markdown = renderMarkdown(findings, summary);

  return { findings, summary, markdown };
}

// ---------------------------------------------------------------------------
// Comparators
// ---------------------------------------------------------------------------

/** Did all scraped doctors make it into the rebuild? */
async function checkDoctors(findings, { bronze, silver, merged, builtHomeHtml, builtAboutHtml }) {
  // Source: collect Person/Dentist names from bronze JSON-LD
  const bronzeDoctors = new Set();
  if (bronze) {
    for (const page of bronze.pages || []) {
      for (const sd of page.structuredData || []) {
        const types = Array.isArray(sd['@type']) ? sd['@type'] : [sd['@type']];
        if (types.some(t => /Person|Dentist|Orthodontist|Physician|MedicalProfessional/i.test(t || ''))) {
          if (sd.name && /^(Dr\.?|Doctor)\s/i.test(sd.name)) {
            bronzeDoctors.add(sd.name.trim());
          }
        }
      }
    }
  }

  // Rebuild side: unified doctors[] array (X3); legacy doctor + additionalDoctors fall back
  const rebuildDoctors = new Set();
  const allRebuiltDoctors = silver?.doctors
    ? silver.doctors
    : [silver?.doctor, ...(silver?.additionalDoctors || [])].filter(Boolean);
  for (const d of allRebuiltDoctors) {
    if (d?.name) rebuildDoctors.add(d.name);
  }

  // Find scraped doctors that are missing from the rebuild
  const missing = [...bronzeDoctors].filter(name => {
    const norm = name.toLowerCase().trim();
    return ![...rebuildDoctors].some(r => r.toLowerCase().trim() === norm);
  });

  if (missing.length > 0) {
    findings.push({
      severity:  SEVERITY.CRITICAL,
      check:     'doctors-missing',
      message:   `${missing.length} doctor(s) scraped from JSON-LD but not in rebuild: ${missing.join(', ')}`,
      detail:    {
        scraped: [...bronzeDoctors],
        rebuilt: [...rebuildDoctors],
        missing,
      },
      hint:      'ai-silver.js may have truncated about-page bodyText before reaching their bios. Check the bodyText cap and ensure additionalDoctors[] is populated.',
    });
  }

  // Also check: built /about page should mention every rebuild doctor by name
  if (builtAboutHtml && rebuildDoctors.size > 0) {
    const text = builtAboutHtml.replace(/<[^>]+>/g, ' ').toLowerCase();
    const missingFromAbout = [...rebuildDoctors].filter(name => {
      const last = name.split(' ').pop()?.toLowerCase();
      return last && !text.includes(last);
    });
    if (missingFromAbout.length > 0) {
      findings.push({
        severity:  SEVERITY.WARNING,
        check:     'doctors-not-on-about-page',
        message:   `Doctor(s) in design-dna but not rendered on /about: ${missingFromAbout.join(', ')}`,
        detail:    { missing: missingFromAbout },
        hint:      'about.astro template should iterate over additionalDoctors[].',
      });
    }
  }
}

/** Is the doctor portrait actually paired with the right doctor name? */
async function checkDoctorPhotoPairing(findings, { silver, merged, imageRoles }) {
  if (!imageRoles?.doctorPortrait) return;

  const primaryDoctor = silver?.doctor?.name || merged?.doctor?.name;
  if (!primaryDoctor) return;

  // Check if the doctorPortrait filename or doctorPortraits map references the primary doctor's name
  const portraitPath = imageRoles.doctorPortrait;
  const lastName = primaryDoctor.replace(/^Dr\.?\s+/i, '').split(' ').pop()?.toLowerCase();

  const pairingMap = imageRoles.doctorPortraits || {};
  const explicitPairing = pairingMap[primaryDoctor];

  if (!explicitPairing) {
    if (lastName && !portraitPath.toLowerCase().includes(lastName)) {
      findings.push({
        severity:  SEVERITY.WARNING,
        check:     'doctor-photo-pairing-uncertain',
        message:   `Primary doctor "${primaryDoctor}" but doctorPortrait="${portraitPath}" — filename does NOT contain "${lastName}". Photo may not match the named doctor.`,
        detail:    { primaryDoctor, portraitPath, expectedToken: lastName, doctorPortraits: pairingMap },
        hint:      'Verify photo↔doctor pairing. Multi-doctor practices: ai-image-roles.js name-matching may have failed if filename was renamed.',
      });
    }
  }

  // For each additional doctor, check if there's a paired photo
  // Check every secondary doctor (doctors[1..]) for a paired portrait
  const secondaryDoctors = silver?.doctors
    ? silver.doctors.slice(1)
    : (silver?.additionalDoctors || []);
  for (const d of secondaryDoctors) {
    if (!d?.name) continue;
    if (!pairingMap[d.name]) {
      findings.push({
        severity:  SEVERITY.NOTE,
        check:     'secondary-doctor-no-photo',
        message:   `Doctor "${d.name}" has no paired portrait in image-roles.doctorPortraits.`,
        detail:    { name: d.name, doctorPortraits: pairingMap },
        hint:      'Check if their photo was downloaded — search image-source.json for matching filename.',
      });
    }
  }
}

/** Did all scraped service pages get a corresponding rebuild service page? */
async function checkServiceCount(findings, { bronze, silver, outputDir }) {
  if (!bronze) return;

  // Bronze service URLs
  const bronzeServices = new Set();
  for (const page of bronze.pages || []) {
    const path = page.path || '';
    const m = path.match(/^\/services\/([^/]+)\/?$/);
    if (m) bronzeServices.add(m[1]);
  }

  if (bronzeServices.size === 0) return;

  // Rebuild service slugs
  const rebuildServices = new Set();
  for (const svc of (silver?.services?.offered || [])) {
    if (svc.slug) rebuildServices.add(svc.slug);
    else if (svc.name) rebuildServices.add(svc.name.toLowerCase().replace(/\s+/g, '-'));
  }

  const missing = [...bronzeServices].filter(s => !rebuildServices.has(s));
  if (missing.length > 0) {
    findings.push({
      severity:  SEVERITY.WARNING,
      check:     'services-missing',
      message:   `${missing.length} scraped service page(s) not in rebuild: ${missing.join(', ')}`,
      detail:    { scraped: [...bronzeServices], rebuilt: [...rebuildServices], missing },
      hint:      'ai-silver.js may have deduplicated services too aggressively, or the silver prompt may have skipped some.',
    });
  }
}

/** Did each rebuilt service page preserve enough of the source content? */
async function checkServicePageDepth(findings, { bronze, outputDir }) {
  if (!bronze) return;

  const builtServiceDir = resolve(outputDir, 'dist/services');

  for (const page of bronze.pages || []) {
    const path = page.path || '';
    const m = path.match(/^\/services\/([^/]+)\/?$/);
    if (!m) continue;
    const slug = m[1];

    const sourceText = (page.bodyText || '').replace(/\s+/g, ' ').trim();
    if (sourceText.length < 1500) continue;   // not enough source to compare meaningfully

    const builtPath = resolve(builtServiceDir, slug, 'index.html');
    const builtHtml = await tryReadText(builtPath);
    if (!builtHtml) continue;

    // Strip nav/footer chrome roughly — extract <main> content if available
    const mainMatch = builtHtml.match(/<main[^>]*>([\s\S]*?)<\/main>/i);
    const innerHtml = mainMatch ? mainMatch[1] : builtHtml;
    const builtText = innerHtml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

    // Coverage ratio: built content should be at least 40% of source
    // (allowing for nav/footer noise stripping in source, copywriting compression, etc.)
    const ratio = builtText.length / sourceText.length;
    if (ratio < 0.35) {
      findings.push({
        severity:  SEVERITY.WARNING,
        check:     'service-page-thin',
        message:   `/services/${slug} rebuild captured only ${Math.round(ratio*100)}% of source bodyText (${builtText.length} of ${sourceText.length} chars).`,
        detail:    { slug, sourceChars: sourceText.length, builtChars: builtText.length, ratio: Number(ratio.toFixed(2)) },
        hint:      'page-generator.js should be running ai-service-page.js for this slug. Verify the AI rewrite ran and produced multi-section output.',
      });
    }
  }
}

/** Were any practice differentiators (languages, financing, technology) lost? */
async function checkDifferentiators(findings, { silver, merged, builtHomeHtml, builtAboutHtml }) {
  // Read the new field name first; fall back to legacy `signals` for older silver outputs
  const differentiators = silver?.differentiators || merged?.differentiators
                       || silver?.signals || merged?.signals || [];
  if (differentiators.length === 0) return;

  const allText = ((builtHomeHtml || '') + (builtAboutHtml || ''))
    .replace(/<[^>]+>/g, ' ')
    .toLowerCase();

  const missing = differentiators.filter(d => {
    const label = (d.label || '').toLowerCase();
    if (!label) return false;
    // Use the first 2-3 distinctive words of the label
    const tokens = label.split(/\s+/).filter(t => t.length >= 4 && !['practice','offers','provides'].includes(t)).slice(0, 2);
    if (tokens.length === 0) return false;
    return !tokens.every(tok => allText.includes(tok));
  });

  if (missing.length >= 2) {
    findings.push({
      severity:  SEVERITY.NOTE,
      check:     'differentiators-missing',
      message:   `${missing.length} practice differentiator(s) scraped but not in rebuild copy: ${missing.map(s => s.label).join(', ')}`,
      detail:    { missing: missing.map(s => ({ type: s.type, label: s.label })) },
      hint:      'Director or copy briefs may need to surface these differentiators more prominently.',
    });
  }
}

/** Phone, email, address sanity. */
async function checkContact(findings, { silver, merged, outputDir }) {
  const siteTs = await tryReadText(resolve(outputDir, 'src/config/site.ts'));
  if (!siteTs) return;

  // ─── Phone ──────────────────────────────────────────────────────────────
  const sourcePhone = silver?.practice?.phone || merged?.practice?.phone;
  if (sourcePhone) {
    const phoneMatch = siteTs.match(/phone:\s*['"]([^'"]+)['"]/);
    const rebuildPhone = phoneMatch?.[1];
    if (!rebuildPhone || /^\(555\)/.test(rebuildPhone)) {
      findings.push({
        severity:  SEVERITY.CRITICAL,
        check:     'phone-missing',
        message:   `Source site has phone "${sourcePhone}" but src/config/site.ts has no phone field set (or still placeholder).`,
        detail:    { sourcePhone, rebuildPhone: rebuildPhone || null },
      });
    } else {
      const norm = (s) => String(s).replace(/\D/g, '');
      if (norm(sourcePhone) !== norm(rebuildPhone)) {
        findings.push({
          severity:  SEVERITY.CRITICAL,
          check:     'phone-mismatch',
          message:   `Phone mismatch: source="${sourcePhone}" rebuild="${rebuildPhone}".`,
          detail:    { sourcePhone, rebuildPhone },
        });
      }
    }
  }

  // ─── Email ──────────────────────────────────────────────────────────────
  const sourceEmail = silver?.practice?.email || merged?.practice?.email;
  if (sourceEmail) {
    const emailMatch = siteTs.match(/email:\s*['"]([^'"]+)['"]/);
    const rebuildEmail = emailMatch?.[1];
    const isPlaceholder = !rebuildEmail || /\[DOMAIN\]|info@example/i.test(rebuildEmail);
    if (isPlaceholder) {
      findings.push({
        severity:  SEVERITY.CRITICAL,
        check:     'email-missing',
        message:   `Source site has email "${sourceEmail}" but src/config/site.ts has no email field set (or still placeholder "${rebuildEmail || 'null'}").`,
        detail:    { sourceEmail, rebuildEmail: rebuildEmail || null },
      });
    } else if (sourceEmail.toLowerCase() !== rebuildEmail.toLowerCase()) {
      findings.push({
        severity:  SEVERITY.CRITICAL,
        check:     'email-mismatch',
        message:   `Email mismatch: source="${sourceEmail}" rebuild="${rebuildEmail}".`,
        detail:    { sourceEmail, rebuildEmail },
      });
    }
  }

  // ─── Address (street / city / state / zip) ──────────────────────────────
  const srcAddress = silver?.address || merged?.address || {};
  const addrFields = [
    { key: 'street', sourceVal: srcAddress.street, regex: /street:\s*['"]([^'"]+)['"]/, placeholderRegex: /\[STREET_ADDRESS\]/i },
    { key: 'city',   sourceVal: srcAddress.city,   regex: /city:\s*['"]([^'"]+)['"]/,   placeholderRegex: /\[CITY\]/i },
    { key: 'state',  sourceVal: srcAddress.state,  regex: /state:\s*['"]([^'"]+)['"]/,  placeholderRegex: /\[STATE\]/i },
    { key: 'zip',    sourceVal: srcAddress.zip,    regex: /zip:\s*['"]([^'"]+)['"]/,    placeholderRegex: /\[ZIP\]/i },
  ];
  for (const f of addrFields) {
    if (!f.sourceVal) continue;
    const m = siteTs.match(f.regex);
    const rebuildVal = m?.[1];
    if (!rebuildVal || f.placeholderRegex.test(rebuildVal)) {
      findings.push({
        severity:  SEVERITY.CRITICAL,
        check:     `address-${f.key}-missing`,
        message:   `Source site has address.${f.key} "${f.sourceVal}" but src/config/site.ts has no real ${f.key} field set (got "${rebuildVal || 'null'}").`,
        detail:    { sourceVal: f.sourceVal, rebuildVal: rebuildVal || null },
      });
    } else if (String(f.sourceVal).toLowerCase().trim() !== String(rebuildVal).toLowerCase().trim()) {
      findings.push({
        severity:  SEVERITY.CRITICAL,
        check:     `address-${f.key}-mismatch`,
        message:   `Address ${f.key} mismatch: source="${f.sourceVal}" rebuild="${rebuildVal}".`,
        detail:    { sourceVal: f.sourceVal, rebuildVal },
      });
    }
  }

  // ─── Hours ──────────────────────────────────────────────────────────────
  // Compare day-by-day display arrays. Source hours come as
  // `silver.hours.display: [{ day, time }]`. site.ts hours.display is a
  // similar array literal. Parse the literal heuristically and compare counts +
  // open-day signatures.
  const srcHours = silver?.hours || merged?.hours;
  if (srcHours && Array.isArray(srcHours.display) && srcHours.display.length > 0) {
    const hoursBlock = siteTs.match(/hours\s*=\s*\{[\s\S]*?display:\s*\[([\s\S]*?)\][\s\S]*?\}/);
    const rebuildHoursRaw = hoursBlock?.[1];
    const rebuildEntries = rebuildHoursRaw
      ? Array.from(rebuildHoursRaw.matchAll(/\{\s*day:\s*['"]([^'"]+)['"]\s*,\s*time:\s*['"]([^'"]+)['"]\s*\}/g))
          .map(m => ({ day: m[1], time: m[2] }))
      : [];

    // Detect placeholder hours (template default: Mon-Fri 9am-5pm, Sat/Sun Closed)
    const isPlaceholder = rebuildEntries.length === 7
      && rebuildEntries.slice(0, 5).every(e => e.time === '9am – 5pm')
      && rebuildEntries.slice(5).every(e => /closed/i.test(e.time));

    if (rebuildEntries.length === 0) {
      findings.push({
        severity:  SEVERITY.CRITICAL,
        check:     'hours-missing',
        message:   `Source site has hours but src/config/site.ts has no parseable hours.display array.`,
        detail:    { sourceHours: srcHours.display.slice(0, 3) },
      });
    } else if (isPlaceholder) {
      findings.push({
        severity:  SEVERITY.CRITICAL,
        check:     'hours-placeholder',
        message:   `src/config/site.ts hours.display is the template default (Mon-Fri 9am-5pm, Sat/Sun closed) but source site provided real hours.`,
        detail:    { sourceHours: srcHours.display, rebuildHours: rebuildEntries },
      });
    } else {
      // Compare per-day. Mismatch on any open day = warning.
      const normDay  = (d) => String(d || '').slice(0, 3).toLowerCase();
      const normTime = (t) => String(t || '').toLowerCase().replace(/\s+/g, '').replace(/[–—]/g, '-');
      const srcMap     = new Map(srcHours.display.map(e => [normDay(e.day), normTime(e.time)]));
      const rebuildMap = new Map(rebuildEntries.map(e   => [normDay(e.day), normTime(e.time)]));
      const mismatches = [];
      for (const [day, srcTime] of srcMap) {
        const rebuildTime = rebuildMap.get(day);
        if (rebuildTime == null) continue;     // missing day — fall through to count check
        if (srcTime !== rebuildTime) mismatches.push({ day, srcTime, rebuildTime });
      }
      if (mismatches.length > 0) {
        findings.push({
          severity:  SEVERITY.WARNING,
          check:     'hours-mismatch',
          message:   `Hours differ on ${mismatches.length} day(s) between source and rebuild.`,
          detail:    { mismatches: mismatches.slice(0, 5) },
        });
      }
      if (rebuildEntries.length < srcHours.display.length) {
        findings.push({
          severity:  SEVERITY.WARNING,
          check:     'hours-incomplete',
          message:   `Source has ${srcHours.display.length} hours entries; rebuild has only ${rebuildEntries.length}.`,
          detail:    { sourceCount: srcHours.display.length, rebuildCount: rebuildEntries.length },
        });
      }
    }
  }
}

/**
 * additionalContent items rescued in silver should appear somewhere in the rebuild.
 * If a "philosophy" paragraph was rescued but no rebuilt page contains a phrase from it,
 * we know that voice content was thrown away again at the generate stage.
 */
async function checkAdditionalContent(findings, { silver, outputDir }) {
  // X2: top-level field; legacy nested location supported for older silver outputs
  const items = silver?.additionalContent || silver?.content?.additionalContent || [];
  if (items.length === 0) return;

  // Concatenate all built HTML pages
  const distDir = resolve(outputDir, 'dist');
  const pagesToCheck = [
    'index.html',
    'about/index.html',
    'services/index.html',
  ];
  let allBuiltText = '';
  for (const p of pagesToCheck) {
    const html = await tryReadText(resolve(distDir, p));
    if (html) {
      allBuiltText += ' ' + html.replace(/<[^>]+>/g, ' ');
    }
  }
  // Also include all service detail pages
  try {
    const { readdir } = await import('node:fs/promises');
    const servicesDir = resolve(distDir, 'services');
    const entries = await readdir(servicesDir, { withFileTypes: true });
    for (const e of entries) {
      if (e.isDirectory()) {
        const html = await tryReadText(resolve(servicesDir, e.name, 'index.html'));
        if (html) allBuiltText += ' ' + html.replace(/<[^>]+>/g, ' ');
      }
    }
  } catch {}
  const builtNorm = allBuiltText.toLowerCase().replace(/\s+/g, ' ');

  // For each rescued item, check whether any distinctive 8+ word phrase from
  // its content shows up in the built pages.
  const notSurfaced = [];
  for (const item of items) {
    const content = (item.content || '').toLowerCase().replace(/\s+/g, ' ');
    if (content.length < 60) continue;
    // Sample 3 candidate phrases (~8 words each) from the content
    const words = content.split(' ').filter(Boolean);
    const probes = [];
    for (let i = 0; i + 8 <= words.length && probes.length < 3; i += Math.max(1, Math.floor(words.length / 4))) {
      probes.push(words.slice(i, i + 8).join(' '));
    }
    const found = probes.some(p => builtNorm.includes(p));
    if (!found) notSurfaced.push(item);
  }

  if (notSurfaced.length === 0) return;

  // Any item not surfaced is a NOTE (not critical) — copywriters legitimately
  // rephrase content. Only call out if a meaningful chunk (3+) was dropped.
  const severity = notSurfaced.length >= 5 ? SEVERITY.WARNING : SEVERITY.NOTE;

  findings.push({
    severity,
    check:    'additional-content-not-surfaced',
    message:  `${notSurfaced.length} of ${items.length} rescued content blocks don't appear (even partially) in the built pages.`,
    detail:   {
      items: notSurfaced.slice(0, 8).map(it => ({
        type: it.type,
        title: it.title,
        source: it.source,
        preview: (it.content || '').slice(0, 120) + '…',
      })),
    },
    hint: 'Generate or page skills may not be consuming additionalContent. Check that doctor brief / service-page brief / faq brief load relevant items by type.',
  });
}

/** Blog: if scraped, did it survive? */
async function checkBlogPresence(findings, { silver, outputDir }) {
  // (Light check) — if blog index exists in dist, all good. If not but source had blog, warn.
  const distBlog = await tryStat(resolve(outputDir, 'dist/blog/index.html'));
  if (!distBlog) {
    findings.push({
      severity:  SEVERITY.NOTE,
      check:     'no-blog-index',
      message:   'Site built without a /blog/ index page.',
      detail:    {},
    });
  }
}

// ---------------------------------------------------------------------------
// Markdown report
// ---------------------------------------------------------------------------

function renderMarkdown(findings, summary) {
  const lines = [];
  lines.push('# Coverage Audit Report');
  lines.push('');
  lines.push(`Generated: ${new Date().toISOString()}`);
  lines.push('');
  lines.push('## Summary');
  lines.push('');
  lines.push(`- **Total findings:** ${summary.total}`);
  lines.push(`- 🔴 **Critical:** ${summary.critical}`);
  lines.push(`- 🟡 **Warning:** ${summary.warning}`);
  lines.push(`- 🔵 **Note:** ${summary.note}`);
  lines.push('');

  if (findings.length === 0) {
    lines.push('No coverage gaps detected. ✅');
    return lines.join('\n');
  }

  // Group by severity
  for (const sev of ['CRITICAL', 'WARNING', 'NOTE']) {
    const group = findings.filter(f => f.severity === sev);
    if (group.length === 0) continue;
    const icon = sev === 'CRITICAL' ? '🔴' : sev === 'WARNING' ? '🟡' : '🔵';
    lines.push(`## ${icon} ${sev}`);
    lines.push('');
    for (const f of group) {
      lines.push(`### ${f.check}`);
      lines.push('');
      lines.push(`**${f.message}**`);
      lines.push('');
      if (f.hint) {
        lines.push(`> 💡 ${f.hint}`);
        lines.push('');
      }
      if (f.detail && Object.keys(f.detail).length > 0) {
        lines.push('<details><summary>Detail</summary>');
        lines.push('');
        lines.push('```json');
        lines.push(JSON.stringify(f.detail, null, 2));
        lines.push('```');
        lines.push('');
        lines.push('</details>');
        lines.push('');
      }
    }
  }
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function tryReadJson(path) {
  try {
    return JSON.parse(await readFile(path, 'utf-8'));
  } catch {
    return null;
  }
}

async function tryReadText(path) {
  try {
    return await readFile(path, 'utf-8');
  } catch {
    return null;
  }
}

async function tryStat(path) {
  try {
    return await stat(path);
  } catch {
    return null;
  }
}
