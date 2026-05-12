/**
 * Publish — deploys a built client site and generates the pitch page.
 *
 * Steps (in order):
 *   1. Generate pitch.html from _pipeline/ artifacts
 *   2. Copy pitch.html to groundwork-dental/public/pitch/<slug>/index.html
 *   3. Git commit + push monorepo (groundwork-builder) — triggers CF Pages deploy
 *   4. Git commit + push groundwork-dental — pitch page goes live
 *   5. Create Cloudflare Pages project (if not exists) + add subdomain
 *   6. Write Airtable row (client tracker)
 *
 * Usage:
 *   import { publish } from './publish.js';
 *   await publish({ outputDir, slug, practiceUrl, previewUrl });
 *
 * Required env vars:
 *   CLOUDFLARE_API_TOKEN     — CF API token with Pages:Edit permission
 *   CLOUDFLARE_ACCOUNT_ID    — CF account ID
 *   GROUNDWORK_DENTAL_PATH   — absolute path to groundwork-dental repo (optional, defaults below)
 *   AIRTABLE_API_KEY         — Airtable personal access token
 *   AIRTABLE_BASE_ID         — Airtable base ID
 *   AIRTABLE_TABLE_NAME      — table name (default: "Clients")
 *   GROUNDWORK_SUBDOMAIN     — base subdomain (default: groundworkdental.com)
 *   GITHUB_REPO_OWNER        — GitHub repo owner (default: gwgunther)
 *   GITHUB_REPO_NAME         — GitHub repo name (default: groundwork-builder)
 */

import { execSync }                        from 'node:child_process';
import { copyFile, mkdir, readFile }       from 'node:fs/promises';
import { existsSync }                      from 'node:fs';
import { resolve, dirname, basename }      from 'node:path';
import { generatePitchPage }              from './pitch-generator.js';

// ---------------------------------------------------------------------------
// Main entry
// ---------------------------------------------------------------------------

export async function publish(opts = {}) {
  const {
    outputDir,                                    // absolute path to clients/<slug>/
    slug,                                         // chang-orthodontics
    practiceUrl  = null,                          // changorthodontics.com
    previewUrl   = null,                          // changorthodontics.groundworkdental.com (auto-derived if null)
    ctaUrl       = null,                          // override CTA link on pitch page
  } = opts;

  if (!outputDir) throw new Error('publish: outputDir is required');
  if (!slug)      throw new Error('publish: slug is required');

  const pipelineDir = resolve(outputDir, '_pipeline');

  const baseDomain  = process.env.GROUNDWORK_SUBDOMAIN || 'groundworkdental.com';
  const resolvedPreviewUrl = previewUrl || `${slug}.${baseDomain}`;
  const pitchUrl    = `${baseDomain}/pitch/${slug}`;

  console.log('');
  console.log('[Publish] Starting publish pipeline...');
  console.log(`  slug:       ${slug}`);
  console.log(`  preview:    ${resolvedPreviewUrl}`);
  console.log(`  pitch:      ${pitchUrl}`);

  const results = {
    pitchHtml:      null,
    pitchLive:      null,
    cfProject:      null,
    cfDomain:       null,
    airtable:       null,
    gitBuilder:     null,
    gitDental:      null,
  };

  // 1a. Run PageSpeed on the deployed preview URL to get real after-scores
  let afterScores = null;
  try {
    console.log(`  Running PageSpeed on rebuilt site (${resolvedPreviewUrl})...`);
    const { runPageSpeed, extractScoreReasons } = await import('./pagespeed.js');
    const ps = await runPageSpeed(`https://${resolvedPreviewUrl}`);
    afterScores = {
      mobile:  ps.mobile?.performance  ?? null,
      desktop: ps.desktop?.performance ?? null,
      seo:     ps.mobile?.seo          ?? null,
      // Top reasons score isn't 100 (honest tradeoffs)
      reasons: extractScoreReasons(ps.mobile, 3),
    };
    console.log(`  ✓ After scores — Mobile: ${afterScores.mobile} Desktop: ${afterScores.desktop}`);
    // Write to pipeline so pitch can read it later
    const { writeFile } = await import('node:fs/promises');
    await writeFile(
      resolve(pipelineDir, '03-pagespeed-after.json'),
      JSON.stringify({ step: '03-pagespeed-after', timestamp: new Date().toISOString(), output: afterScores }, null, 2)
    );
  } catch (err) {
    console.warn(`  ⚠ After PageSpeed skipped: ${err.message}`);
  }

  // 1b. Generate pitch.html (with real after-scores if available)
  try {
    results.pitchHtml = await generatePitchPage(pipelineDir, {
      previewUrl: resolvedPreviewUrl,
      slug,
      pitchUrl,
      ctaUrl,
      afterScores,
    });
    console.log(`  ✓ Pitch page generated: ${results.pitchHtml}`);
  } catch (err) {
    console.warn(`  ⚠ Pitch generation failed: ${err.message}`);
  }

  // 2. Copy pitch.html to groundwork-dental repo
  try {
    const dentalPath = process.env.GROUNDWORK_DENTAL_PATH
      || resolve(dirname(new URL(import.meta.url).pathname), '..', '..', '..', '..', 'groundwork-dental');

    if (existsSync(dentalPath)) {
      const destDir = resolve(dentalPath, 'public', 'pitch', slug);
      await mkdir(destDir, { recursive: true });
      const destFile = resolve(destDir, 'index.html');
      await copyFile(results.pitchHtml, destFile);
      results.pitchLive = destFile;
      console.log(`  ✓ Pitch copied to groundwork-dental: public/pitch/${slug}/index.html`);
    } else {
      console.warn(`  ⚠ groundwork-dental not found at ${dentalPath} — skipping pitch copy`);
    }
  } catch (err) {
    console.warn(`  ⚠ Pitch copy failed: ${err.message}`);
  }

  // 3. Git push monorepo (groundwork-builder)
  try {
    const repoRoot = resolve(dirname(new URL(import.meta.url).pathname), '..', '..', '..', '..');
    gitCommitPush(repoRoot, `feat: add ${slug} client site`, [
      `clients/${slug}`,
    ]);
    results.gitBuilder = 'pushed';
    console.log(`  ✓ Monorepo pushed → CF Pages will auto-deploy ${slug}`);
  } catch (err) {
    console.warn(`  ⚠ Monorepo push failed: ${err.message}`);
  }

  // 4. Git push groundwork-dental (pitch page)
  try {
    const dentalPath = process.env.GROUNDWORK_DENTAL_PATH
      || resolve(dirname(new URL(import.meta.url).pathname), '..', '..', '..', '..', 'groundwork-dental');
    if (results.pitchLive && existsSync(dentalPath)) {
      gitCommitPush(dentalPath, `feat: add pitch page for ${slug}`, [
        `public/pitch/${slug}`,
      ]);
      results.gitDental = 'pushed';
      console.log(`  ✓ groundwork-dental pushed → pitch page will go live`);
    }
  } catch (err) {
    console.warn(`  ⚠ groundwork-dental push failed: ${err.message}`);
  }

  // 5. Cloudflare Pages — create project + add custom domain
  try {
    const cfResult = await ensureCfPagesProject({ slug, baseDomain });
    results.cfProject = cfResult.project;
    results.cfDomain  = cfResult.domain;
    console.log(`  ✓ CF Pages: ${cfResult.created ? 'created' : 'already exists'} — ${resolvedPreviewUrl}`);
  } catch (err) {
    console.warn(`  ⚠ Cloudflare setup failed: ${err.message}`);
  }

  // 6. Airtable row
  try {
    const airtableId = await writeAirtableRow({ slug, practiceUrl, resolvedPreviewUrl, pitchUrl, pipelineDir });
    results.airtable = airtableId;
    console.log(`  ✓ Airtable row created/updated (id: ${airtableId})`);
  } catch (err) {
    console.warn(`  ⚠ Airtable write failed: ${err.message}`);
  }

  console.log('');
  console.log('[Publish] Done.');
  console.log(`  Preview:  https://${resolvedPreviewUrl}`);
  console.log(`  Pitch:    https://${pitchUrl}`);
  console.log('');

  return results;
}

// ---------------------------------------------------------------------------
// Git helpers
// ---------------------------------------------------------------------------

function gitCommitPush(repoPath, message, paths = []) {
  const addTargets = paths.length > 0 ? paths.join(' ') : '.';
  execSync(`git -C "${repoPath}" add ${addTargets}`, { stdio: 'pipe' });

  // Check if there's anything to commit
  const status = execSync(`git -C "${repoPath}" status --porcelain`, { stdio: 'pipe' }).toString().trim();
  if (!status) {
    console.log(`    (nothing new to commit in ${basename(repoPath)})`);
    return;
  }

  execSync(`git -C "${repoPath}" commit -m "${message.replace(/"/g, '\\"')}"`, { stdio: 'pipe' });
  execSync(`git -C "${repoPath}" push`, { stdio: 'pipe' });
}

// ---------------------------------------------------------------------------
// Cloudflare Pages
// ---------------------------------------------------------------------------

async function ensureCfPagesProject({ slug, baseDomain }) {
  const token     = process.env.CLOUDFLARE_API_TOKEN;
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const repoOwner = process.env.GITHUB_REPO_OWNER || 'gwgunther';
  const repoName  = process.env.GITHUB_REPO_NAME  || 'groundwork-builder';

  if (!token || !accountId) {
    throw new Error('CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID are required');
  }

  const headers = {
    'Authorization': `Bearer ${token}`,
    'Content-Type':  'application/json',
  };
  const base = `https://api.cloudflare.com/client/v4/accounts/${accountId}/pages/projects`;

  // Check if project already exists
  const listRes  = await fetch(`${base}/${slug}`, { headers });
  const existing = await listRes.json();
  let created = false;

  if (!existing.success) {
    // Create the project
    const createRes = await fetch(base, {
      method:  'POST',
      headers,
      body: JSON.stringify({
        name:              slug,
        production_branch: 'main',
        source: {
          type:   'github',
          config: {
            owner:             repoOwner,
            repo_name:         repoName,
            production_branch: 'main',
            root_dir:          `clients/${slug}`,
          },
        },
        build_config: {
          build_command:   'npm run build',
          destination_dir: 'dist',
          root_dir:        `clients/${slug}`,
        },
      }),
    });
    const createData = await createRes.json();
    if (!createData.success) {
      throw new Error(`CF create failed: ${JSON.stringify(createData.errors)}`);
    }
    created = true;
  }

  // Add custom subdomain (idempotent — CF ignores if already exists)
  const subdomain = `${slug}.${baseDomain}`;
  const domainRes = await fetch(`${base}/${slug}/domains`, {
    method:  'POST',
    headers,
    body:    JSON.stringify({ name: subdomain }),
  });
  const domainData = await domainRes.json();
  // 409 = already exists, which is fine
  if (!domainData.success && domainData.errors?.[0]?.code !== 8000018) {
    console.warn(`    CF domain warning: ${JSON.stringify(domainData.errors)}`);
  }

  return { project: slug, domain: subdomain, created };
}

// ---------------------------------------------------------------------------
// Airtable
// ---------------------------------------------------------------------------

async function writeAirtableRow({ slug, practiceUrl, resolvedPreviewUrl, pitchUrl, pipelineDir }) {
  const apiKey    = process.env.AIRTABLE_API_KEY;
  const baseId    = process.env.AIRTABLE_BASE_ID;
  const tableName = process.env.AIRTABLE_TABLE_NAME || 'Clients';

  if (!apiKey || !baseId) {
    throw new Error('AIRTABLE_API_KEY and AIRTABLE_BASE_ID are required');
  }

  // Load summary + pagespeed for metadata
  let summary   = {};
  let pagespeed = {};
  let merged    = {};
  try { summary   = JSON.parse(await readFile(resolve(pipelineDir, 'summary.json'),      'utf-8')); } catch {}
  try { pagespeed = JSON.parse(await readFile(resolve(pipelineDir, '03-pagespeed.json'), 'utf-8')); } catch {}
  try { merged    = JSON.parse(await readFile(resolve(pipelineDir, '06-merge.json'),     'utf-8')); merged = merged.output || merged; } catch {}

  const doctors  = merged.doctors || (merged.doctor ? [merged.doctor] : []);
  const services = merged.services || [];

  const fields = {
    'Slug':            slug,
    'Practice Name':   summary.practiceName || merged.practice?.name || slug,
    'Practice URL':    practiceUrl || summary.scrapedUrl || '',
    'Preview URL':     `https://${resolvedPreviewUrl}`,
    'Pitch URL':       `https://${pitchUrl}`,
    'Doctors Found':   doctors.length,
    'Services Found':  services.length,
    'Mobile Score':    pagespeed?.output?.mobile?.performance  ?? pagespeed?.mobile?.performance  ?? null,
    'Desktop Score':   pagespeed?.output?.desktop?.performance ?? pagespeed?.desktop?.performance ?? null,
    'Status':          'Pitched',
    'Built At':        new Date().toISOString().split('T')[0],
  };

  // Remove null fields (Airtable rejects null for number fields)
  for (const k of Object.keys(fields)) {
    if (fields[k] == null) delete fields[k];
  }

  const url = `https://api.airtable.com/v0/${baseId}/${encodeURIComponent(tableName)}`;

  // Check if row with this slug already exists
  const searchRes = await fetch(
    `${url}?filterByFormula=${encodeURIComponent(`{Slug}="${slug}"`)}`,
    { headers: { Authorization: `Bearer ${apiKey}` } }
  );
  const searchData = await searchRes.json();
  const existing   = searchData.records?.[0];

  if (existing) {
    // Update existing row
    const patchRes = await fetch(`${url}/${existing.id}`, {
      method:  'PATCH',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body:    JSON.stringify({ fields }),
    });
    const patchData = await patchRes.json();
    if (patchData.error) throw new Error(patchData.error.message);
    return patchData.id;
  } else {
    // Create new row
    const createRes = await fetch(url, {
      method:  'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body:    JSON.stringify({ fields }),
    });
    const createData = await createRes.json();
    if (createData.error) throw new Error(createData.error.message);
    return createData.id;
  }
}
