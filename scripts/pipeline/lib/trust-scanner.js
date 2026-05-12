/**
 * Trust Scanner — regex/DOM checks on bronze data for trust signals.
 * No network calls. Mirrors the tech-audit.js Finding shape so enrichFindings()
 * adds state/weight/fixed_copy/fix_action from the catalog.
 *
 * Export:
 *   runTrustScan(bronze) → { findings, summary }
 */

import { enrichFindings } from './findings.js';

// Format-tolerant US phone: (555) 555-5555, 555-555-5555, 555.555.5555, +1 555 555 5555
const PHONE_RE = /(?:\+?1[\s.-]?)?\(?[2-9]\d{2}\)?[\s.-]?\d{3}[\s.-]?\d{4}/;

// Street-address tells. Avoid false positives by requiring a number + a suffix.
const ADDRESS_RE = /\b\d{1,6}\s+[A-Z][a-zA-Z.'-]*(?:\s+[A-Z][a-zA-Z.'-]*)*\s+(Street|St\.?|Avenue|Ave\.?|Boulevard|Blvd\.?|Road|Rd\.?|Drive|Dr\.?|Lane|Ln\.?|Court|Ct\.?|Place|Pl\.?|Way|Parkway|Pkwy\.?|Highway|Hwy\.?|Suite|Ste\.?)\b/;

// Hours tells: a day-name plus a time, or "open" + time, or "Mon–Fri".
const DAYS_RE = /\b(Mon(day)?|Tue(s|sday)?|Wed(nesday)?|Thu(r|rs|rsday)?|Fri(day)?|Sat(urday)?|Sun(day)?)\b/i;
const TIME_RE = /\b(1[0-2]|0?[1-9])(:\d{2})?\s?(am|pm|AM|PM)\b/;
const HOURS_KEYWORD_RE = /\b(hours|open|closed)\b/i;

function joinBodyText(bronze) {
  return (bronze?.pages || []).map(p => p.bodyText || '').join('\n');
}

function detectPhone(allText) {
  return PHONE_RE.test(allText);
}

function detectAddress(allText) {
  return ADDRESS_RE.test(allText);
}

function detectHours(allText) {
  // Real hours blocks usually have a day + a time AND the word "hours"/"open"/"closed" nearby.
  // We approximate by requiring all three signals to appear somewhere in body text.
  return DAYS_RE.test(allText) && TIME_RE.test(allText) && HOURS_KEYWORD_RE.test(allText);
}

function detectSocialLinks(bronze) {
  const fromAssets = (bronze?.siteAssets?.socialLinks || []).length;
  return fromAssets > 0;
}

function buildFinding({ id, category, title, benefit, present, severityWhenMissing = 'warning' }) {
  const count = present ? 0 : 1;
  return {
    id,
    category,
    severity: present ? 'passed' : severityWhenMissing,
    title,
    detail: present
      ? `${title} detected on the site.`
      : `${title.replace(/^Missing /, '')} not detected on any crawled page.`,
    benefit,
    affectedPages: [],
    count,
  };
}

/**
 * @param {object} bronze - BronzeData (see scraper.js)
 * @returns {{ findings: object[], summary: { critical: number, warnings: number, passed: number } }}
 */
export function runTrustScan(bronze) {
  const allText = joinBodyText(bronze);
  const raw = [];

  raw.push(buildFinding({
    id: 'no-phone-on-site',
    category: 'trust',
    title: 'Phone number on site',
    benefit: 'A click-to-call phone number is the highest-converting element on a local service site. Without it, mobile visitors bounce.',
    present: detectPhone(allText),
    severityWhenMissing: 'critical',
  }));

  raw.push(buildFinding({
    id: 'no-address-on-site',
    category: 'trust',
    title: 'Address on site',
    benefit: 'A visible street address establishes that the practice is real and local — a top trust signal and a local-SEO ranking factor.',
    present: detectAddress(allText),
  }));

  raw.push(buildFinding({
    id: 'no-hours-on-site',
    category: 'trust',
    title: 'Operating hours on site',
    benefit: 'Hours answer the most common patient question before they call. Missing hours are a top cause of abandoned visits.',
    present: detectHours(allText),
  }));

  raw.push(buildFinding({
    id: 'no-social-links',
    category: 'trust',
    title: 'Social media links',
    benefit: 'Social links extend reach and provide additional channels for patient engagement. Their absence reads as low effort.',
    present: detectSocialLinks(bronze),
  }));

  const findings = enrichFindings(raw);
  const summary = {
    critical: findings.filter(f => f.severity === 'critical').length,
    warnings: findings.filter(f => f.severity === 'warning').length,
    passed:   findings.filter(f => f.severity === 'passed').length,
  };

  return { findings, summary };
}
