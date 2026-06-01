/**
 * Canonical slug derivation. Used in EVERY surface that needs a stable
 * cross-system identifier for a practice: Airtable, GCS, output folder,
 * GitHub clients/ path, Cloudflare Pages project name.
 *
 * Derived from the URL hostname only (NOT from the practice name) so it's:
 *   - Stable across re-audits (silver extraction may shift practice name
 *     formatting between runs; URL stays put)
 *   - Available before silver runs (used to create the Airtable Run row
 *     at the start of the pipeline)
 *   - CF Pages-compatible (lowercase alphanumeric + hyphens, no dots)
 *
 * Example:  https://www.springstdentistry.com/  →  'springstdentistry'
 * Example:  https://chang-orthodontics.com      →  'chang-orthodontics'
 * Example:  https://www.smithdental.co.uk       →  'smithdental'  (multi-part TLD stripped)
 */

const MULTI_PART_TLDS = /\.(co|com|org|net|gov|ac)\.[a-z]{2}$/i;

export function slugFromUrl(url) {
  if (!url) return null;
  let hostname;
  try {
    hostname = new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
  // Strip leading www.
  hostname = hostname.replace(/^www\./, '');
  // Strip TLD — handle .co.uk / .com.au shape first, then single TLDs
  hostname = hostname.replace(MULTI_PART_TLDS, '').replace(/\.[a-z]+$/i, '');
  // Slugify: lowercase alphanumeric + hyphens only
  const slug = hostname
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
  return slug || null;
}
