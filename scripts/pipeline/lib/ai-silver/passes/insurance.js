/**
 * Pass: insurance / financial — accepted insurance plans, financing options,
 * payment methods. From dedicated financial/insurance/billing pages.
 */

import { loadPrompt, fillTemplate, runPassCall, renderPagesAsContext, pagesMatching, MODELS } from '../shared.js';

export const name = 'insurance';

const PATTERNS = [
  /financial/i, /insurance/i, /\/payment/i, /\/billing/i, /\/cost/i, /\/fee/i,
  /\/financing/i, /\/affordab/i,
  /\/(for[-_]?)?patients?/i, /\/patient[-_]?(info|resources?|center)/i,
  /\/new[-_]?patients?/i, /\/your[-_]?visit/i,
];

// Known insurance carrier name fragments — used to detect insurance content on
// pages whose URLs don't match the obvious patterns.
const INSURANCE_NAME_HINTS = /\b(delta\s*dental|aetna|cigna|metlife|guardian|humana|united\s*health|unitedhealthcare|blue\s*cross|bluecross|bcbs|anthem|principal|ameritas|aflac|geha|carecredit|sunbit|lendingclub|invisalign\s*financing|tricare|premera|kaiser|liberty\s*dental|emblem|wellpoint|united\s*concordia)\b/i;

export function selectPages(bronze) {
  const matched = new Set(pagesMatching(bronze.pages, PATTERNS));
  const home = bronze.pages.find(p => p.path === '/' || p.path === '');
  if (home) matched.add(home);
  // Fallback: scan EVERY page's body text + image alt text for known carrier names
  for (const p of bronze.pages) {
    if (matched.has(p)) continue;
    const altsConcat = (p.images || []).map(i => i.alt || '').join(' ');
    if (INSURANCE_NAME_HINTS.test(p.bodyText || '') || INSURANCE_NAME_HINTS.test(altsConcat)) {
      matched.add(p);
    }
  }
  return Array.from(matched);
}

export async function run({ bronze, pages }) {
  if (pages.length === 0) return { content: { insurance: [], financingOptions: [], paymentMethods: [] } };
  // Also collect ALL image alt text that looks like an insurance carrier
  // (some sites only show carrier logos with alt text, no body-text mention)
  const carrierAlts = [];
  for (const p of bronze.pages) {
    for (const img of (p.images || [])) {
      if (img.alt && /\b(delta|aetna|cigna|metlife|guardian|humana|united|blue|bcbs|anthem|principal|ameritas|aflac|geha|carecredit|sunbit|insurance|invisalign)\b/i.test(img.alt)) {
        carrierAlts.push({ alt: img.alt, src: img.src, page: p.path });
      }
    }
  }

  const tmpl = await loadPrompt('insurance');
  const prompt = fillTemplate(tmpl, {
    baseUrl: bronze.baseUrl,
    pageContext: renderPagesAsContext(pages, { bodyChars: 14000, paragraphs: 100, images: 25, includeJsonLd: false }),
    carrierAltsJson: JSON.stringify(carrierAlts.slice(0, 60), null, 2),
  });
  const { slice } = await runPassCall({ name, model: MODELS.default, prompt, maxTokens: 6000 });
  if (slice.insurance || slice.financingOptions || slice.paymentMethods) {
    return { content: {
      insurance: slice.insurance || [],
      financingOptions: slice.financingOptions || [],
      paymentMethods: slice.paymentMethods || [],
    } };
  }
  return slice;
}
