/**
 * Shared utility functions for the build pipeline.
 */

export function slugify(text) {
  return text.toLowerCase().trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

export function formatPhone(digits) {
  if (!digits || digits.length !== 10) return digits || '';
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
}

export function esc(str) {
  return String(str || '').replace(/'/g, "\\'").replace(/\\/g, '\\\\');
}

export function mostFrequent(arr) {
  if (!arr || arr.length === 0) return null;
  const counts = {};
  for (const item of arr) {
    counts[item] = (counts[item] || 0) + 1;
  }
  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];
}

export function parseAddressText(text) {
  if (!text) return {};

  // Strategy 1: Find ZIP that follows a 2-letter state abbreviation (most reliable)
  // e.g. "123 Main St, City, CA 90210"
  const stateZipMatch = text.match(/,?\s*([A-Z]{2})\s+(\d{5}(?:-\d{4})?)/);
  if (stateZipMatch) {
    const state = stateZipMatch[1];
    const zip = stateZipMatch[2];
    const idx = text.indexOf(stateZipMatch[0]);
    const beforeStateZip = text.substring(0, idx).trim();
    const parts = beforeStateZip.split(',').map(s => s.trim()).filter(Boolean);
    return {
      street: parts.slice(0, -1).join(', ') || null,
      city: parts[parts.length - 1] || null,
      state,
      zip,
    };
  }

  // Strategy 2: Find the last 5-digit number that looks like a ZIP (not a street number)
  // A street number is typically followed by a street name, while a ZIP is at the end
  const allZips = [...text.matchAll(/\b(\d{5}(?:-\d{4})?)\b/g)];
  if (allZips.length > 0) {
    // Use the last match — ZIPs appear at the end, street numbers at the beginning
    const lastZip = allZips[allZips.length - 1];
    const zip = lastZip[1];
    const beforeZip = text.substring(0, lastZip.index).trim();
    const stateMatch = beforeZip.match(/,?\s*([A-Z]{2})\s*$/);
    const state = stateMatch ? stateMatch[1] : null;
    const withoutState = beforeZip.replace(/,?\s*[A-Z]{2}\s*$/, '');
    const parts = withoutState.split(',').map(s => s.trim()).filter(Boolean);
    return {
      street: parts.slice(0, -1).join(', ') || null,
      city: parts[parts.length - 1] || null,
      state,
      zip,
    };
  }

  return {};
}

/**
 * Extract email addresses from raw text using regex.
 * Falls back for sites that don't use mailto: links.
 */
export function extractEmailsFromText(text) {
  if (!text) return [];
  const matches = text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g);
  return matches ? [...new Set(matches.map(e => e.toLowerCase()))] : [];
}
