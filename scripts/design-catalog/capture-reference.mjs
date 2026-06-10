/**
 * capture-reference.mjs — URL → screenshot tiles + computed-style probe.
 *
 * The probe is the point: with a live DOM we read EXACT values from
 * getComputedStyle (hexes, font stacks, radii, shadows, chrome geometry)
 * instead of estimating them from pixels. The probe feeds the ingest agent's
 * audit/extract stages as programmatic ground truth, and makes reference-hex
 * accuracy a MECHANICAL check (M7) instead of a judged one.
 *
 * Tiling: full page captured in segments of ≤ TILE_H css px so very tall pages
 * fit API limits (each tile is well under the 8000px edge cap and degrades
 * gracefully under the API's ~1568px downscale).
 *
 * CLI: node scripts/design-catalog/capture-reference.mjs <url> [--out dir]
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const VIEWPORT = { width: 1280, height: 900 };
const TILE_H = 4000;          // css px per tile
const MAX_TILES = 5;

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36';
const LAUNCH_ARGS = ['--disable-blink-features=AutomationControlled'];

async function launch(chromium, headless) {
  // Prefer the real installed Chrome (passes bot checks stock Chromium fails)
  try { return await chromium.launch({ headless, channel: 'chrome', args: LAUNCH_ARGS }); }
  catch { return await chromium.launch({ headless, args: LAUNCH_ARGS }); }
}

const looksBlocked = async (page) =>
  /access denied|forbidden|captcha|are you a robot|attention required/i.test(await page.title()) ||
  (await page.evaluate(() => document.body?.innerText.length || 0)) < 200;

export async function captureReference(url, outDir) {
  const { chromium } = await import('playwright');
  await mkdir(outDir, { recursive: true });
  let browser = await launch(chromium, true);
  try {
    let page = await (await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 1, userAgent: UA, locale: 'en-US' })).newPage();
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForTimeout(2500);

    if (await looksBlocked(page)) {
      // Headless fingerprint rejected — retry headed (brief window flash, far harder to block)
      console.warn('[capture] headless blocked — retrying headed');
      await browser.close();
      browser = await launch(chromium, false);
      page = await (await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 1, locale: 'en-US' })).newPage();
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
      await page.waitForTimeout(3000);
      if (await looksBlocked(page)) throw new Error(`capture blocked by ${new URL(url).hostname} — supply screenshots manually`);
    }

    // Dismiss cookie/consent overlays — targeted: a dismiss/accept control inside
    // a container that talks about cookies/consent. Never click arbitrary buttons.
    await page.evaluate(() => {
      const containers = [...document.querySelectorAll('div,section,aside,dialog')]
        .filter(el => /cookie|consent|privacy/i.test(el.textContent || '') && el.querySelector('button') && (el.textContent || '').length < 4000);
      for (const c of containers) {
        const btn = [...c.querySelectorAll('button')].find(b =>
          /^(accept|agree|allow|got it|ok|okay)/i.test((b.textContent || '').trim()) ||
          /close|dismiss/i.test(b.getAttribute('aria-label') || ''));
        if (btn) { btn.click(); return; }
      }
    });
    await page.keyboard.press('Escape');

    // Slow-scroll to trigger lazy loads, then settle at top.
    await page.evaluate(async () => {
      const h = () => document.body.scrollHeight;
      for (let y = 0; y < h(); y += 600) { window.scrollTo(0, y); await new Promise(r => setTimeout(r, 200)); }
      window.scrollTo(0, h()); await new Promise(r => setTimeout(r, 1500));
      window.scrollTo(0, 0);   await new Promise(r => setTimeout(r, 1200));
    });

    // ── Computed-style probe (exact values from the CSSOM) ──────────────────
    const probe = await page.evaluate(() => {
      const toHex = (c) => {
        const m = c?.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
        if (!m) return null;
        if (m[4] !== undefined && parseFloat(m[4]) === 0) return null; // transparent
        return '#' + [m[1], m[2], m[3]].map(n => (+n).toString(16).padStart(2, '0')).join('');
      };
      const visible = (el) => { const r = el.getBoundingClientRect(); return r.width > 4 && r.height > 4; };
      const area = (el) => { const r = el.getBoundingClientRect(); return r.width * r.height; };

      // Palette census: background colors + text colors weighted by area
      const bg = new Map(), fg = new Map(), fonts = new Map(), radii = new Map(), shadows = new Map();
      const els = [...document.querySelectorAll('body *')].filter(visible).slice(0, 4000);
      for (const el of els) {
        const cs = getComputedStyle(el);
        const a = area(el);
        const b = toHex(cs.backgroundColor); if (b) bg.set(b, (bg.get(b) || 0) + a);
        const t = toHex(cs.color); if (t && el.childNodes.length && [...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim())) fg.set(t, (fg.get(t) || 0) + a);
        const f = (cs.fontFamily || '').split(',')[0].replace(/['"]/g, '').trim(); if (f) fonts.set(f, (fonts.get(f) || 0) + a);
        if (cs.borderRadius && cs.borderRadius !== '0px') radii.set(cs.borderRadius, (radii.get(cs.borderRadius) || 0) + 1);
        if (cs.boxShadow && cs.boxShadow !== 'none') shadows.set(cs.boxShadow.slice(0, 80), (shadows.get(cs.boxShadow.slice(0, 80)) || 0) + 1);
      }
      const top = (m, n) => [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, v]) => ({ value: k, weight: Math.round(v) }));

      // Headings
      const headings = ['h1', 'h2', 'h3'].map(tag => {
        const el = [...document.querySelectorAll(tag)].find(visible);
        if (!el) return null;
        const cs = getComputedStyle(el);
        return { tag, family: cs.fontFamily.split(',')[0].replace(/['"]/g, '').trim(), size: cs.fontSize, weight: cs.fontWeight, style: cs.fontStyle, letterSpacing: cs.letterSpacing, transform: cs.textTransform, color: toHex(cs.color), sample: (el.textContent || '').trim().slice(0, 80) };
      }).filter(Boolean);

      // Buttons (top 8 by visibility)
      const buttons = [...document.querySelectorAll('button, a[class*="btn" i], a[class*="button" i], [role="button"]')]
        .filter(visible).slice(0, 8).map(el => {
          const cs = getComputedStyle(el);
          return { text: (el.textContent || '').trim().slice(0, 40), background: toHex(cs.backgroundColor), color: toHex(cs.color), radius: cs.borderRadius, border: cs.border, transform: cs.textTransform, family: cs.fontFamily.split(',')[0].replace(/['"]/g, '').trim() };
        });

      // Chrome
      const header = document.querySelector('header, [role="banner"], nav');
      const footer = document.querySelector('footer, [role="contentinfo"]');
      const logo = header?.querySelector('img, svg, [class*="logo" i]');
      const logoBox = logo?.getBoundingClientRect();
      const chrome = {
        nav: header ? { background: toHex(getComputedStyle(header).backgroundColor), height: Math.round(header.getBoundingClientRect().height), logoPosition: logoBox ? (Math.abs(logoBox.x + logoBox.width / 2 - innerWidth / 2) < innerWidth * 0.1 ? 'center' : logoBox.x < innerWidth / 2 ? 'left' : 'right') : 'unknown' } : null,
        footer: footer ? { background: toHex(getComputedStyle(footer).backgroundColor), color: toHex(getComputedStyle(footer).color) } : null,
      };

      return {
        pageBackground: toHex(getComputedStyle(document.body).backgroundColor),
        bodyFont: getComputedStyle(document.body).fontFamily.split(',')[0].replace(/['"]/g, '').trim(),
        backgroundsByArea: top(bg, 10),
        textColorsByArea: top(fg, 8),
        fontsByArea: top(fonts, 6),
        radiiHistogram: top(radii, 6),
        shadowsHistogram: top(shadows, 4),
        headings, buttons, chrome,
        pageHeight: document.body.scrollHeight,
      };
    });
    await writeFile(join(outDir, 'probe.json'), JSON.stringify(probe, null, 2));

    // ── Tiled screenshots ────────────────────────────────────────────────────
    const H = Math.min(probe.pageHeight, TILE_H * MAX_TILES);
    const tiles = [];
    for (let y = 0, i = 0; y < H && i < MAX_TILES; y += TILE_H, i++) {
      const h = Math.min(TILE_H, H - y);
      if (h < 200) break;
      const path = join(outDir, `tile-${i}.jpeg`);
      await page.screenshot({ path, type: 'jpeg', quality: 88, fullPage: true, clip: { x: 0, y, width: VIEWPORT.width, height: h } });
      tiles.push(path);
    }
    return { tiles, probe, probePath: join(outDir, 'probe.json') };
  } finally {
    await browser.close();
  }
}

// ── CLI ─────────────────────────────────────────────────────────────────────
if (import.meta.url === `file://${process.argv[1]}`) {
  const url = process.argv[2];
  const oi = process.argv.indexOf('--out');
  const outDir = oi !== -1 ? process.argv[oi + 1] : 'capture-out';
  if (!url) { console.error('usage: capture-reference.mjs <url> [--out dir]'); process.exit(2); }
  const r = await captureReference(url, outDir);
  console.log(`${r.tiles.length} tile(s), probe: bg=${r.probe.pageBackground}, fonts=${r.probe.fontsByArea.slice(0, 2).map(f => f.value).join('/')}, nav logo=${r.probe.chrome?.nav?.logoPosition}`);
  console.log(r.tiles.join('\n'));
}
