/**
 * designer-agent.js — The agentic design loop.
 *
 * Replaces the one-shot Creative Director with an iterative agent that:
 *   1. observe()  — screenshot the built site
 *   2. critique() — score against the 9-dimension rubric
 *   3. act()      — pick the weakest dimension's linked skill, apply changes
 *   4. rebuild()  — call buildFn(projectDir) to rebuild Astro
 *   5. repeat     — until gate_pass OR no improvement for 2 iters OR budget
 *
 * Adapted from the agent_loop_contract in rubric.json.
 */

import { readFile, writeFile, readdir } from 'node:fs/promises';
import { join, resolve }                from 'node:path';
import { spawn }                        from 'node:child_process';
import { observe }                      from './observe.js';
import { runSkill }                     from '../skills/index.js';
import { upsertManagedFile }            from './managed-file.js';

// Skill linked to each rubric dimension (from rubric.json + skills-registry.json)
const DIM_TO_SKILL = {
  typography:            'typeset',
  color_contrast:        'colorize',
  spatial_layout:        'layout',
  information_hierarchy: 'layout',
  craft:                 'polish',
  ux_writing:            'polish',
  trust_signals:         'polish',
  distinctiveness:       'bolder',   // pushes creative differentiation
  imagery:               'imagery',  // selects better images from analyzed pool
};

// Dimensions that don't block the agent gate — reported as action items instead
const HUMAN_DIMS = new Set(['distinctiveness', 'imagery', 'trust_signals']);
const SKIP_DIMS  = new Set([]); // nothing fully skipped — all dims now have skills

// Track which skills returned 0 changes this run — avoid re-picking exhausted skills
const exhaustedSkills = new Set();

export async function runDesignerAgent({
  projectDir,
  dna,
  practice,
  maxIterations = 6,
  buildFn,        // async (projectDir) => void  — rebuilds the Astro project
} = {}) {
  if (!projectDir) throw new Error('designer-agent: projectDir required');
  if (!buildFn)    throw new Error('designer-agent: buildFn required');

  const trace = [];
  let previousScore  = null;
  let noImprovementCount = 0;
  let finalScore     = null;
  let gate_pass      = false;

  for (let iter = 1; iter <= maxIterations; iter++) {
    console.log(`\n[designer-agent] iteration ${iter}/${maxIterations}`);

    // ── 1. Observe ─────────────────────────────────────────────────────────
    const { screenshots } = await observe({
      projectDir,
      routes:   ['/'],
      viewports: [{ w: 1280, h: 900 }, { w: 375, h: 812 }],
      narrate:  false,
    });

    // ── 2. Load relevant files for skill context ────────────────────────────
    const files = await loadKeyFiles(projectDir);

    // ── 3. Critique ─────────────────────────────────────────────────────────
    const critiqueResult = await runSkill('critique', { dna, practice, screenshots, files });
    const score          = critiqueResult.score;
    // Gate passes when all agent-fixable dimensions reach ≥ 7
    // Human dims (imagery, distinctiveness, trust_signals) don't block shipping
    const agentDims = ['typography','color_contrast','spatial_layout','information_hierarchy','craft','ux_writing'];
    const dims = score?.dimensions || {};
    gate_pass = agentDims.every(d => (dims[d]?.score ?? dims[d] ?? 0) >= 7);

    console.log(`[designer-agent] score=${score?.overall} gate=${gate_pass}`);

    // ── 4. Log trace entry ──────────────────────────────────────────────────
    const entry = {
      iteration:    iter,
      scores_before: previousScore?.dimensions
        ? dimScoreMap(previousScore.dimensions)
        : null,
      scores_after:  score?.dimensions
        ? dimScoreMap(score.dimensions)
        : null,
      overall:       score?.overall,
      gate_pass,
      action_taken:  null,
      delta:         null,
    };

    // Compute delta vs previous
    if (previousScore?.overall !== undefined) {
      entry.delta = Math.round((score.overall - previousScore.overall) * 10) / 10;
    }

    // ── 5. Stop conditions ──────────────────────────────────────────────────
    if (gate_pass) {
      console.log(`[designer-agent] gate passed at iteration ${iter}!`);
      entry.action_taken = 'gate_passed';
      trace.push(entry);
      finalScore = score;
      break;
    }

    // No improvement for 2 consecutive iterations → local max, ship best
    const improved = previousScore === null || (score?.overall ?? 0) > (previousScore?.overall ?? 0);
    if (!improved) noImprovementCount++;
    else           noImprovementCount = 0;

    if (noImprovementCount >= 2) {
      console.log(`[designer-agent] no improvement for 2 iters — local max, stopping.`);
      entry.action_taken = 'local_max';
      trace.push(entry);
      finalScore = score;
      break;
    }

    // ── 6. Pick skill ───────────────────────────────────────────────────────
    // Default sequence used when critique returns null (JSON parse failed):
    // iter 1 → typeset, iter 2 → colorize, iter 3 → layout, iter 4 → polish
    const DEFAULT_SEQUENCE = ['typeset', 'colorize', 'layout', 'polish'];
    const targetSkill = pickSkill(score, iter) ?? DEFAULT_SEQUENCE[(iter - 1) % DEFAULT_SEQUENCE.length];

    if (!targetSkill) {
      console.log(`[designer-agent] no actionable skill found — stopping.`);
      entry.action_taken = 'no_skill';
      trace.push(entry);
      finalScore = score;
      break;
    }

    if (!score) {
      console.warn(`[designer-agent] critique returned null score — using default skill: ${targetSkill}`);
    }

    console.log(`[designer-agent] running skill: ${targetSkill}`);

    // ── 7. Run skill ────────────────────────────────────────────────────────
    let skillResult;
    try {
      skillResult = await runSkill(targetSkill, { dna, practice, screenshots, files });
    } catch (err) {
      console.error(`[designer-agent] skill ${targetSkill} failed:`, err.message);
      entry.action_taken = `${targetSkill}:failed`;
      trace.push(entry);
      previousScore = score;
      continue;
    }

    entry.action_taken = `${targetSkill}:${skillResult.changes?.length ?? 0}_changes`;

    // ── 8. Snapshot files before applying ────────────────────────────────────
    const snapshot = await snapshotFiles(projectDir, skillResult.changes || []);

    // ── 9. Apply changes ─────────────────────────────────────────────────────
    const applied = await applyChanges(projectDir, skillResult.changes || []);
    console.log(`[designer-agent] applied ${applied} changes from ${targetSkill}`);

    // Mark skill as exhausted if it produced no applicable changes — don't re-pick it
    if (applied === 0) {
      exhaustedSkills.add(targetSkill);
      console.log(`[designer-agent] ${targetSkill} exhausted (0 changes applied) — will skip next iteration`);
      trace.push(entry);
      previousScore = score;
      continue;
    }

    // ── 10. Rebuild ───────────────────────────────────────────────────────────
    let buildFailed = false;
    try {
      await buildFn(projectDir);
    } catch (err) {
      buildFailed = true;
      console.error(`[designer-agent] rebuild failed after ${targetSkill}:`, err.message);
    }

    // ── 11. Re-score after rebuild to check for regression ───────────────────
    let postSkillScore = score; // fallback: use pre-skill score if re-score fails
    if (!buildFailed) {
      try {
        const { screenshots: newShots } = await observe({
          projectDir, routes: ['/'], viewports: [{ w: 1280, h: 900 }], narrate: false,
        });
        const postFiles = await loadKeyFiles(projectDir);
        const postCritique = await runSkill('critique', { dna, practice, screenshots: newShots, files: postFiles });
        if (postCritique?.score) postSkillScore = postCritique.score;
      } catch (err) {
        console.warn(`[designer-agent] post-skill re-score failed:`, err.message);
      }
    }

    // ── 12. Rollback on regression ────────────────────────────────────────────
    // Regressed = build failed OR score dropped by more than ROLLBACK_THRESHOLD vs pre-skill
    const ROLLBACK_THRESHOLD = 0.5;
    const scoreDropped = !buildFailed && previousScore !== null
      && (postSkillScore?.overall ?? 0) - (previousScore?.overall ?? 0) < -ROLLBACK_THRESHOLD;

    if (buildFailed || scoreDropped) {
      const reason = buildFailed ? 'build_failed' : `score_dropped(${previousScore.overall}→${postSkillScore?.overall})`;
      console.warn(`[designer-agent] rolling back ${targetSkill} — ${reason}`);
      await restoreSnapshot(snapshot);
      exhaustedSkills.add(targetSkill);
      entry.action_taken = `${targetSkill}:rolled_back:${reason}`;

      // Restore the build to the last-known-good state
      if (buildFailed) {
        try { await buildFn(projectDir); } catch {}
      }

      trace.push(entry);
      previousScore = score;
      continue;
    }

    // Successful, non-regressing changes — reset exhaustion tracking
    exhaustedSkills.clear();

    // Use the post-skill score as the baseline for the next iteration
    entry.scores_after = postSkillScore?.dimensions ? dimScoreMap(postSkillScore.dimensions) : entry.scores_after;
    entry.delta = previousScore !== null
      ? Math.round(((postSkillScore?.overall ?? score.overall) - previousScore.overall) * 10) / 10
      : null;

    trace.push(entry);
    previousScore = postSkillScore ?? score;
  }

  // If loop exhausted without finalScore, use last score
  if (!finalScore && previousScore) finalScore = previousScore;

  return {
    finalScore,
    gate_pass,
    iterations: trace.length,
    trace,
  };
}

// ── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Pick the best skill to run next.
 * Strategy: lowest non-skipped dimension that has a mapped skill.
 * On final iteration, always run 'polish'.
 */
function pickSkill(score, iter) {
  if (!score?.dimensions) return null;

  // Use next_action from critique if available and not exhausted
  const suggested = score.next_action?.skill;
  if (suggested && suggested !== 'none'
    && Object.values(DIM_TO_SKILL).includes(suggested)
    && !exhaustedSkills.has(suggested)) {
    return suggested;
  }

  // Fall back to lowest-scoring dimension whose skill hasn't been exhausted
  const ranked = Object.entries(score.dimensions)
    .filter(([dim]) => DIM_TO_SKILL[dim] && !exhaustedSkills.has(DIM_TO_SKILL[dim]))
    .sort((a, b) => a[1].score - b[1].score);

  return ranked[0] ? DIM_TO_SKILL[ranked[0][0]] : null;
}

/**
 * Apply an array of file changes to projectDir.
 * Uses upsertManagedFile for managed blocks; falls back to direct replace.
 * Returns count of successfully applied changes.
 */
async function applyChanges(projectDir, changes) {
  let count = 0;
  for (const change of changes) {
    const absPath = resolve(projectDir, change.file);
    try {
      let content = await readFile(absPath, 'utf8').catch(() => '');

      if (change.type === 'replace' && change.old) {
        if (!content.includes(change.old)) {
          console.warn(`[apply] old string not found in ${change.file}, skipping`);
          continue;
        }
        content = content.replace(change.old, change.new);
      } else if (change.type === 'append') {
        content = content + '\n' + change.new;
      } else if (change.type === 'prepend') {
        content = change.new + '\n' + content;
      } else if (change.type === 'managed') {
        await upsertManagedFile(projectDir, change.file, change.new);
        count++;
        continue;
      } else {
        // Full file overwrite (new file)
        content = change.new;
      }

      await writeFile(absPath, content, 'utf8');
      count++;
    } catch (err) {
      console.warn(`[apply] failed to apply change to ${change.file}:`, err.message);
    }
  }
  return count;
}

/**
 * Snapshot the files that a skill intends to modify.
 * Returns a map of { absPath → originalContent } for restoration.
 */
async function snapshotFiles(projectDir, changes) {
  const snapshot = new Map();
  for (const change of changes) {
    const absPath = resolve(projectDir, change.file);
    try {
      const content = await readFile(absPath, 'utf8');
      snapshot.set(absPath, content);
    } catch {
      // File doesn't exist yet — mark as "new" so rollback can delete it
      snapshot.set(absPath, null);
    }
  }
  return snapshot;
}

/**
 * Restore files from a snapshot taken before a skill ran.
 * Files that didn't exist before (null) are removed.
 */
async function restoreSnapshot(snapshot) {
  for (const [absPath, originalContent] of snapshot.entries()) {
    try {
      if (originalContent === null) {
        // File was created by the skill — delete it on rollback
        const { unlink } = await import('node:fs/promises');
        await unlink(absPath).catch(() => {});
      } else {
        await writeFile(absPath, originalContent, 'utf8');
      }
    } catch (err) {
      console.warn(`[rollback] failed to restore ${absPath}:`, err.message);
    }
  }
  console.log(`[rollback] restored ${snapshot.size} file(s) to pre-skill state`);
}

/**
 * Load the key files the agent needs for skill context.
 */
async function loadKeyFiles(projectDir) {
  const targets = [
    'src/pages/index.astro',
    'tailwind.config.mjs',
    'tailwind.config.js',
    'src/config/design-dna.ts',
    'src/config/site.ts',
  ];

  const files = {};
  for (const rel of targets) {
    try {
      files[rel] = await readFile(join(projectDir, rel), 'utf8');
    } catch {}
  }
  return files;
}

function dimScoreMap(dimensions) {
  return Object.fromEntries(
    Object.entries(dimensions).map(([k, v]) => [k, v.score])
  );
}

/**
 * Default buildFn: runs `npx astro build` in the project directory.
 * Pass a custom buildFn to designer-agent if you need a different build process.
 */
export async function buildAstro(projectDir, timeoutMs = 120000) {
  return new Promise((resolve, reject) => {
    const proc = spawn('npx', ['astro', 'build'], {
      cwd: projectDir,
      env: { ...process.env, NODE_ENV: 'production' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    const out = [];
    proc.stdout?.on('data', d => out.push(d.toString()));
    proc.stderr?.on('data', d => out.push(d.toString()));

    const timer = setTimeout(() => {
      proc.kill('SIGTERM');
      reject(new Error(`astro build timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    proc.on('close', code => {
      clearTimeout(timer);
      if (code === 0) resolve({ output: out.join('') });
      else reject(new Error(`astro build exited ${code}:\n${out.join('').slice(-1000)}`));
    });

    proc.on('error', err => { clearTimeout(timer); reject(err); });
  });
}
