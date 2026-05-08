/**
 * AI Image Analysis — uses Claude vision to classify and describe images
 * scraped from a practice website.
 *
 * Results are cached in Supabase `images` table keyed by URL, so each image
 * is only analyzed once across all runs and environments.
 *
 * Export:
 *   analyzeImages(bronze, opts) → { [url]: ImageAnalysis }
 */

const SUBJECT_VALUES = ['doctor', 'team', 'operatory', 'exterior', 'patient', 'before-after', 'stock', 'graphic'];
const TAG_VALUES = ['smiling', 'candid', 'posed', 'modern', 'dated', 'family', 'diversity', 'before-after', 'outdoor', 'logo-visible'];

// How many images to send in one Claude call (vision supports multi-image)
const BATCH_SIZE = 4;

// Only analyze images that look like real photos (skip icons, logos, tiny images)
const SKIP_PATTERNS = [
  /\.(svg|ico|gif|webp)$/i,
  /logo/i,
  /icon/i,
  /favicon/i,
  /pixel|tracking|spacer/i,
  /\d{1,2}x\d{1,2}/,   // tiny dimension patterns like 1x1
];

function shouldSkip(url) {
  return SKIP_PATTERNS.some(re => re.test(url));
}

/**
 * Collect all image URLs from bronze data.
 * Returns deduplicated list of absolute URLs.
 */
function collectImageUrls(bronze) {
  const seen = new Set();
  const urls = [];

  const base = bronze.url || '';
  const origin = (() => {
    try { return new URL(base).origin; } catch { return ''; }
  })();

  for (const page of (bronze.pages || [])) {
    for (const img of (page.images || [])) {
      const src = typeof img === 'string' ? img : (img?.src || img?.url || '');
      if (!src) continue;

      // Resolve relative URLs
      let absolute = src;
      if (src.startsWith('//')) absolute = 'https:' + src;
      else if (src.startsWith('/') && origin) absolute = origin + src;
      else if (!src.startsWith('http')) continue;

      if (seen.has(absolute) || shouldSkip(absolute)) continue;
      seen.add(absolute);
      urls.push(absolute);
    }
  }

  return urls;
}

/**
 * Load already-analyzed URLs from Supabase for a specific site slug.
 * Returns a map of url → ImageAnalysis.
 */
async function loadCachedAnalyses(slug, urls) {
  try {
    const { queryImageAnalyses } = await import('./db.js');
    const rows = await queryImageAnalyses(slug, urls);
    if (!rows) return {};
    const map = {};
    for (const row of rows) map[row.url] = row;
    return map;
  } catch {
    return {};
  }
}

/**
 * Analyze a batch of image URLs with Claude vision.
 * Returns array of ImageAnalysis objects (same order as urls input).
 */
async function analyzeBatch(urls, client /* callAnthropic */, opts = {}) {
  // Build content blocks: one image per URL
  const imageBlocks = await Promise.all(urls.map(async (url) => {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15_000);
      let res;
      try {
        res = await fetch(url, {
          signal: controller.signal,
          headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Groundwork/1.0)' },
        });
      } finally {
        clearTimeout(timeout);
      }

      if (!res.ok) return null;

      const contentType = res.headers.get('content-type') || 'image/jpeg';
      const mimeType = contentType.split(';')[0].trim();
      if (!mimeType.startsWith('image/')) return null;

      // Claude vision supports jpeg, png, gif, webp — skip others
      if (!['image/jpeg', 'image/png', 'image/gif', 'image/webp'].includes(mimeType)) return null;

      const buffer = await res.arrayBuffer();
      const base64 = Buffer.from(buffer).toString('base64');

      return { type: 'image', source: { type: 'base64', media_type: mimeType, data: base64 }, _url: url };
    } catch {
      return null;
    }
  }));

  // Filter out failed fetches, track which URLs we actually have
  const valid = imageBlocks.filter(Boolean);
  if (valid.length === 0) return [];

  if (opts.verbose) {
    console.log(`    [images] Analyzing batch of ${valid.length} images...`);
  }

  // Build the prompt — one analysis object per image, indexed by position
  const content = [];
  for (let i = 0; i < valid.length; i++) {
    content.push({
      type: 'text',
      text: `Image ${i + 1} (URL: ${valid[i]._url}):`,
    });
    content.push({ type: 'image', source: valid[i].source });
  }

  content.push({
    type: 'text',
    text: ANALYSIS_PROMPT(valid.length),
  });

  try {
    const response = await client({
      phase:     'images:analyze-batch',
      model:     'claude-opus-4-5',
      maxTokens: 1024,
      messages:  [{ role: 'user', content }],
    });

    const text = response.text;

    const parsed = parseJsonResponse(text);
    if (!parsed) return [];

    // Map results back to URLs
    const results = [];
    const items = Array.isArray(parsed) ? parsed : (parsed.images || []);
    for (let i = 0; i < valid.length; i++) {
      const item = items[i];
      if (!item) continue;
      results.push(normalizeAnalysis(valid[i]._url, item));
    }
    return results;
  } catch (err) {
    if (opts.verbose) console.warn(`    [images] Batch failed: ${err.message}`);
    return [];
  }
}

function normalizeAnalysis(url, item) {
  return {
    url,
    subject:     SUBJECT_VALUES.includes(item.subject) ? item.subject : 'stock',
    authentic:   item.authentic === true,
    quality:     Math.min(5, Math.max(1, Math.round(Number(item.quality) || 3))),
    description: String(item.description || '').slice(0, 300),
    tags:        (Array.isArray(item.tags) ? item.tags : []).filter(t => TAG_VALUES.includes(t)),
  };
}

/**
 * Main entry point.
 *
 * @param {object} bronze        - Scraped bronze data
 * @param {string} slug          - Site slug (e.g. 'spring-st-dentistry') for per-site isolation
 * @param {object} [opts]
 * @param {boolean} [opts.verbose]
 * @param {number}  [opts.limit] - Max images to analyze (default 30)
 * @returns {Promise<{ [url]: ImageAnalysis }>}
 */
export async function analyzeImages(bronze, slug, opts = {}) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    if (opts.verbose) console.log('  [images] No API key — skipping image analysis.');
    return {};
  }

  if (!slug) {
    console.warn('  [images] No slug provided — skipping image analysis.');
    return {};
  }

  const limit = opts.limit ?? 30;
  const allUrls = collectImageUrls(bronze).slice(0, limit);
  if (allUrls.length === 0) {
    console.log('  No images found to analyze.');
    return {};
  }

  console.log(`  Found ${allUrls.length} images.`);

  // Load cached results for this site
  const cached = await loadCachedAnalyses(slug, allUrls);
  const cachedCount = Object.keys(cached).length;
  const toAnalyze = allUrls.filter(url => !cached[url]);

  if (cachedCount > 0) {
    console.log(`  ${cachedCount} already analyzed, ${toAnalyze.length} new.`);
  }

  if (toAnalyze.length === 0) {
    return cached;
  }

  // Analyze in batches
  const { callAnthropic } = await import('./ai-call.js');

  const fresh = {};
  for (let i = 0; i < toAnalyze.length; i += BATCH_SIZE) {
    const batch = toAnalyze.slice(i, i + BATCH_SIZE);
    console.log(`  Analyzing images ${i + 1}–${Math.min(i + BATCH_SIZE, toAnalyze.length)} of ${toAnalyze.length}...`);
    const results = await analyzeBatch(batch, callAnthropic, opts);
    for (const r of results) {
      fresh[r.url] = r;
    }
  }

  // Persist new analyses to Supabase
  if (Object.keys(fresh).length > 0) {
    try {
      const { upsertImageAnalyses } = await import('./db.js');
      await upsertImageAnalyses(slug, Object.values(fresh));
      if (opts.verbose) console.log(`  [images] Saved ${Object.keys(fresh).length} analyses to db.`);
    } catch (err) {
      if (opts.verbose) console.warn(`  [images] db save failed (non-fatal): ${err.message}`);
    }
  }

  return { ...cached, ...fresh };
}

// ---------------------------------------------------------------------------
// Prompt
// ---------------------------------------------------------------------------

function ANALYSIS_PROMPT(count) {
  return `
Analyze each of the ${count} dental practice website image(s) shown above.

Return a JSON array with exactly ${count} objects, one per image in order.
Each object must have these fields:

{
  "subject": one of: "doctor" | "team" | "operatory" | "exterior" | "patient" | "before-after" | "stock" | "graphic"
    doctor      = the dentist, solo or clearly prominent
    team        = staff group, front desk, hygienists
    operatory   = treatment room, dental chair, clinical equipment
    exterior    = building facade, parking lot, signage
    patient     = patient receiving care or interacting with staff
    before-after = clinical result photo showing dental transformation
    stock       = generic/stock photography with no visible practice identity
    graphic     = logo, icon, illustration, badge, or any non-photographic image

  "authentic": true if this looks like a real photo taken at this specific practice,
               false if it appears to be purchased stock photography

  "quality": integer 1–5
    1 = blurry, dark, poorly composed, or clearly outdated
    2 = usable but unremarkable
    3 = decent, professional feel
    4 = strong, would work well on a modern site
    5 = exceptional — hero-worthy, conveys clear warmth or clinical expertise

  "description": one concise sentence describing exactly what is in the photo
    Focus on the subject, setting, and any notable detail.
    Do not reference the practice name or doctor name.
    Examples:
      "A dentist in scrubs smiling directly at the camera in a bright modern operatory."
      "Three staff members in navy scrubs standing together at a reception desk."
      "A close-up of a patient's smile showing white, even teeth."

  "tags": array of zero or more applicable tags from this exact list:
    "smiling"      — subject is visibly smiling
    "candid"       — natural, unposed moment
    "posed"        — clearly staged/formal pose
    "modern"       — equipment or decor looks contemporary (last ~5 years)
    "dated"        — equipment or decor looks 10+ years old
    "family"       — child or family group visible
    "diversity"    — visible demographic diversity among people shown
    "before-after" — shows a clinical dental transformation
    "outdoor"      — photo taken outside
    "logo-visible" — practice name, logo, or signage visible in frame
}

Return ONLY the raw JSON array. No prose, no code fences.
`.trim();
}

// ---------------------------------------------------------------------------
// JSON parser (handles code fences)
// ---------------------------------------------------------------------------

function parseJsonResponse(text) {
  const t = text.trim();
  try { return JSON.parse(t); } catch {}
  const fence = t.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/);
  if (fence) { try { return JSON.parse(fence[1].trim()); } catch {} }
  const first = t.indexOf('[');
  if (first !== -1) {
    let depth = 0, last = -1;
    for (let i = first; i < t.length; i++) {
      if (t[i] === '[') depth++;
      else if (t[i] === ']') { depth--; if (depth === 0) { last = i; break; } }
    }
    if (last > first) { try { return JSON.parse(t.slice(first, last + 1)); } catch {} }
  }
  return null;
}
