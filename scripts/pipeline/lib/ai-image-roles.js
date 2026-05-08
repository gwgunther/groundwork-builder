/**
 * ai-image-roles.js — Claude Vision classifier for downloaded images.
 *
 * Input:  public/images/**.{jpg,png,webp} inside the generated project.
 * Output: public/images/image-roles.json
 *   {
 *     hero:           "heroes/office-1.jpg",
 *     doctorPortrait: "team/team-1.jpg",
 *     team:           ["team/team-1.jpg", "team/team-2.jpg"],
 *     interior:       ["heroes/office-1.jpg", "heroes/office-2.jpg"],
 *     gallery:        [...],
 *     beforeAfter:    [...],
 *     unused:         [...]
 *   }
 *
 * Uses Haiku 4.5 (fast + cheap; the task is straightforward).
 */

import { readdir, readFile, writeFile, stat } from 'node:fs/promises';
import { join, relative, extname } from 'node:path';
import { renderSkillPrompt } from './skill-loader.js';

const MODEL     = 'claude-haiku-4-5';
const IMG_EXTS  = new Set(['.jpg', '.jpeg', '.png', '.webp']);
const MAX_BYTES = 4 * 1024 * 1024;   // Anthropic vision per-image cap

/**
 * Classify all images in <projectRoot>/public/images/ and write a roles manifest.
 *
 * @param {string} projectRoot
 * @param {object} [opts]
 * @param {object} [opts.silver]  - silver data ({ doctor, additionalDoctors }) for name pairing
 */
export async function classifyImageRoles(projectRoot, opts = {}) {
  const start      = Date.now();
  const imagesDir  = join(projectRoot, 'public', 'images');
  const files      = await collectImages(imagesDir);

  if (files.length === 0) {
    const empty = { hero: null, doctorPortrait: null, doctorPortraits: {}, team: [], interior: [], gallery: [], beforeAfter: [], unused: [] };
    await writeFile(join(imagesDir, 'image-roles.json'), JSON.stringify(empty, null, 2));
    return { roles: empty, _meta: { model: MODEL, duration_ms: 0, classified: 0 } };
  }

  // Load the per-image source sidecar (original URL filename + alt text).
  // image-downloader.js writes this on download. May be missing on older builds.
  let sourceMap = {};
  try {
    sourceMap = JSON.parse(await readFile(join(imagesDir, 'image-source.json'), 'utf8'));
  } catch { /* no sidecar — classifier will operate without alt/source hints */ }

  const { callAnthropic } = await import('./ai-call.js');

  // Classify images one at a time (Haiku is fast; keeps prompts small + parseable).
  const labels = [];
  for (const file of files) {
    const rel = relative(imagesDir, file).replace(/\\/g, '/');
    const sourceMeta = sourceMap[rel] || {};
    const label = await classifyOne(callAnthropic, file, imagesDir, sourceMeta).catch(err => {
      console.warn(`  [image-roles] ${rel} — ${err.message}`);
      return { category: 'unknown', confidence: 0, reason: 'error' };
    });
    labels.push({ path: rel, ...label, _source: sourceMeta });
  }

  // Collect doctor names from silver data (primary + additional)
  const doctorNames = collectDoctorNames(opts.silver);

  const roles = assignRoles(labels, doctorNames);

  await writeFile(join(imagesDir, 'image-roles.json'), JSON.stringify(roles, null, 2));

  return {
    roles,
    labels,
    _meta: {
      model: MODEL,
      duration_ms: Date.now() - start,
      classified: labels.length,
    },
  };
}

function collectDoctorNames(silver) {
  if (!silver) return [];
  // X3: prefer unified doctors[]; fall back to legacy doctor + additionalDoctors
  if (Array.isArray(silver.doctors)) {
    return silver.doctors.map(d => d?.name).filter(Boolean);
  }
  const primary = silver.doctor?.name ? [silver.doctor.name] : [];
  const additional = (silver.additionalDoctors || []).map(d => d?.name).filter(Boolean);
  return [...primary, ...additional];
}

// ---------------------------------------------------------------------------
// Collect image files
// ---------------------------------------------------------------------------

async function collectImages(dir) {
  const results = [];
  async function walk(d) {
    let entries = [];
    try { entries = await readdir(d, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      const full = join(d, e.name);
      if (e.isDirectory()) await walk(full);
      else if (IMG_EXTS.has(extname(e.name).toLowerCase())) results.push(full);
    }
  }
  await walk(dir);
  return results;
}

// ---------------------------------------------------------------------------
// Classify one image
// ---------------------------------------------------------------------------

async function classifyOne(callAnthropic, filePath, imagesDir, sourceMeta = {}) {
  const { size } = await stat(filePath);
  if (size > MAX_BYTES) return { category: 'skipped-too-large', confidence: 0, reason: 'size' };

  const buf    = await readFile(filePath);
  const media  = mediaType(filePath);
  const base64 = buf.toString('base64');

  const rel  = relative(imagesDir, filePath).replace(/\\/g, '/');
  const orig = sourceMeta.originalFilename || '';
  const alt  = sourceMeta.alt || '';

  // Surface every available text signal — original filename and alt text from
  // the source HTML are the most reliable indicators for doctor-portrait pairing.
  const hintLines = [`Local filename: "${rel}"`];
  if (orig && orig !== rel.split('/').pop()) hintLines.push(`Original URL filename: "${orig}"`);
  if (alt) hintLines.push(`Alt text from source HTML: "${alt}"`);

  const promptText = await renderSkillPrompt('extraction/image-roles', {
    hintLines: hintLines.join('\n'),
  });

  const res = await callAnthropic({
    phase:     'image-roles',
    model:     MODEL,
    maxTokens: 250,
    messages: [{
      role: 'user',
      content: [
        {
          type: 'image',
          source: { type: 'base64', media_type: media, data: base64 },
        },
        { type: 'text', text: promptText },
      ],
    }],
  });

  const text = res.text.trim();
  const f = text.indexOf('{'), l = text.lastIndexOf('}');
  if (f === -1 || l <= f) return { category: 'unknown', confidence: 0, reason: 'no-json' };
  try { return JSON.parse(text.slice(f, l + 1)); }
  catch { return { category: 'unknown', confidence: 0, reason: 'parse-err' }; }
}

function mediaType(path) {
  const ext = extname(path).toLowerCase();
  if (ext === '.png')  return 'image/png';
  if (ext === '.webp') return 'image/webp';
  return 'image/jpeg';
}

// ---------------------------------------------------------------------------
// Role assignment
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Name normalization for matching photos to doctors
// ---------------------------------------------------------------------------

function normalizeName(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/^dr\.?\s+/i, '')      // strip leading "Dr. "
    .replace(/[,.]/g, '')           // punctuation
    .replace(/\s+/g, ' ')
    .trim();
}

/** Score how well a photo's text signals match a given doctor name (0-1). */
function nameMatchScore(label, doctorName) {
  const target = normalizeName(doctorName);
  if (!target) return 0;
  const targetTokens = target.split(' ').filter(t => t.length >= 3);
  if (targetTokens.length === 0) return 0;

  const candidates = [
    label.personName || '',
    label._source?.alt || '',
    label._source?.originalFilename || '',
    label.path || '',
  ].map(s => String(s).toLowerCase()).join(' ');

  // Count how many target name tokens appear in any signal
  let hits = 0;
  for (const tok of targetTokens) {
    if (candidates.includes(tok)) hits++;
  }
  return hits / targetTokens.length;
}

// ---------------------------------------------------------------------------
// Role assignment with doctor-name pairing
// ---------------------------------------------------------------------------

function assignRoles(labels, doctorNames = []) {
  const by = (cat) => labels.filter(l => l.category === cat)
                            .sort((a, b) => (b.confidence || 0) - (a.confidence || 0));

  const offices   = by('hero-office');
  const interiors = by('interior');
  const doctors   = by('doctor-portrait');
  const teams     = by('team-group');
  const patients  = by('patient-smile');

  // Hero fallback chain. The Vision classifier sometimes mis-labels wide
  // office shots that include staff as `team-group` instead of `hero-office`.
  // When all preferred categories are empty, fall back to ANY image stored
  // in the `heroes/` subdirectory (downloader put it there because silver
  // tagged it as office-category — that's a stronger signal than the
  // post-hoc Vision label). Final fallback: any team-group image whose
  // local path lives in `heroes/`.
  const heroDirImage = labels.find(l => /^heroes\//.test(l.path || ''));
  const hero = offices[0]?.path
    || interiors[0]?.path
    || heroDirImage?.path
    || null;

  // Multi-doctor pairing: for each known doctor name, find the photo whose
  // filename/alt/personName best matches. doctorPortrait (singular) keeps the
  // primary doctor's portrait for backward compatibility.
  const doctorPortraits = {};        // { "Dr. Name": "team/team-1-dr-name.jpg" }
  const matchedPaths = new Set();

  if (doctorNames.length > 0 && doctors.length > 0) {
    // For each doctor, pick the best-matching unmatched portrait
    for (const name of doctorNames) {
      let best = null;
      let bestScore = 0;
      for (const candidate of doctors) {
        if (matchedPaths.has(candidate.path)) continue;
        const score = nameMatchScore(candidate, name);
        if (score > bestScore) {
          best = candidate;
          bestScore = score;
        }
      }
      // Require at least one full token match to claim a pairing
      if (best && bestScore >= 0.5) {
        doctorPortraits[name] = best.path;
        matchedPaths.add(best.path);
      }
    }
  }

  // Primary doctor portrait: use the matched photo for the first known doctor
  // if available; otherwise fall back to the highest-confidence portrait.
  let doctorPortrait = null;
  if (doctorNames.length > 0 && doctorPortraits[doctorNames[0]]) {
    doctorPortrait = doctorPortraits[doctorNames[0]];
  } else if (doctors[0]) {
    doctorPortrait = doctors[0].path;
  }

  const team = [
    ...doctors.filter(d => d.path !== doctorPortrait).map(x => x.path),
    ...teams.map(x => x.path),
  ];

  const interior = [
    ...offices.slice(hero ? 1 : 0).map(x => x.path),
    ...interiors.map(x => x.path),
  ].filter(p => p !== hero);

  const gallery = [
    ...patients.map(x => x.path),
    ...interior.slice(3),
  ];

  const used = new Set([hero, doctorPortrait, ...Object.values(doctorPortraits), ...team, ...interior, ...gallery].filter(Boolean));
  const unused = labels.map(l => l.path).filter(p => !used.has(p));

  return {
    hero,
    doctorPortrait,                 // primary doctor (back-compat)
    doctorPortraits,                // NEW: per-doctor mapping for multi-doctor sites
    team,
    interior,
    gallery,
    beforeAfter: [],
    unused,
  };
}
