/**
 * @deprecated Legacy Airtable sync for sourcing — RETIRED June 2026.
 * Live sourcing writes via scripts/sourcing/lib/d1.js. Do not import from new code.
 *
 */
// Airtable sync layer for the Sourced Practices table.
//
// Uses the Airtable REST API directly (no SDK). Two concerns:
//   1. Schema creation / verification (one-time setup) — see ensureTable()
//   2. Batched, rate-limited upsert by Place ID — see upsertPractices()
//
// Airtable limits:
//   - 10 records per write request
//   - ~5 req/sec per base
//   - Personal access token must have data.records:read/write + schema.bases:read
//     (and schema.bases:write if we create the table programmatically)

const API_BASE = 'https://api.airtable.com/v0';
const META_BASE = 'https://api.airtable.com/v0/meta';
const WRITE_BATCH = 10;
const RATE_LIMIT_DELAY_MS = 220; // ~4.5 req/sec, under the 5/sec ceiling

const TABLE_NAME = 'Sourced Practices';

// ──────────────────────────────────────────────────────────────────────
// Schema definition — used by ensureTable() to create or verify.
// Order matters for display order in the UI.
// ──────────────────────────────────────────────────────────────────────

export const TABLE_SCHEMA = {
  name: TABLE_NAME,
  description:
    'Bulk-sourced dental practices with website audit + scoring. ' +
    'Funnel-top for the Accounts CRM — promote Tier A rows into Accounts when ready to pitch.',
  fields: [
    // Identity / source
    // Practice Name is the PRIMARY field (must be first). Place ID stays the
    // stable dedup/upsert key (findByPlaceId), it just isn't the primary.
    { name: 'Practice Name', type: 'singleLineText' },
    { name: 'Place ID', type: 'singleLineText' },
    { name: 'Source', type: 'singleSelect',
      options: { choices: [{ name: 'google-places-text-search' }, { name: 'manual' }] } },
    { name: 'Sourced At', type: 'dateTime',
      options: { dateFormat: { name: 'iso' }, timeFormat: { name: '24hour' }, timeZone: 'America/Los_Angeles' } },
    { name: 'MSA / Market', type: 'singleLineText' },

    // Location
    { name: 'Address', type: 'singleLineText' },
    { name: 'City', type: 'singleLineText' },
    { name: 'State', type: 'singleLineText' },
    { name: 'Zip', type: 'singleLineText' },
    { name: 'Latitude', type: 'number', options: { precision: 6 } },
    { name: 'Longitude', type: 'number', options: { precision: 6 } },
    { name: 'Google Maps / GBP', type: 'url' }, // link to the Google Business Profile

    // Contact
    { name: 'Website URL', type: 'url' },
    { name: 'Final URL', type: 'url' },
    { name: 'Phone', type: 'phoneNumber' },
    { name: 'Email', type: 'email' },

    // Places data
    { name: 'Primary Type', type: 'singleLineText' },
    { name: 'Types', type: 'multilineText' },
    { name: 'Rating', type: 'number', options: { precision: 1 } },
    { name: 'Review Count', type: 'number', options: { precision: 0 } },
    { name: 'Business Status', type: 'singleSelect',
      options: { choices: [
        { name: 'OPERATIONAL' }, { name: 'CLOSED_TEMPORARILY' }, { name: 'CLOSED_PERMANENTLY' },
      ] } },

    // Tech audit
    { name: 'HTTP Status', type: 'number', options: { precision: 0 } },
    { name: 'Vendor', type: 'singleLineText' },
    { name: 'Vendor Category', type: 'singleSelect',
      options: { choices: [
        { name: 'dental-mill' }, { name: 'diy-builder' }, { name: 'cms' },
        { name: 'modern-stack' }, { name: 'unknown' }, { name: 'unreachable' },
      ] } },
    { name: 'WordPress Theme', type: 'singleLineText' }, // null if not WP
    { name: 'Rendered HTML (GCS)', type: 'singleLineText' }, // gs:// pointer for re-scoring
    { name: 'Is Chain / DSO', type: 'checkbox', options: { icon: 'check', color: 'redBright' } },
    { name: 'Chain Name', type: 'singleLineText' },
    { name: 'Multi-Location', type: 'checkbox', options: { icon: 'check', color: 'blueBright' } },
    { name: 'Multi-Location Signals', type: 'singleLineText' },
    // Lighthouse raw scores (detail) + Google bands (the unit we use in logic).
    { name: 'Lighthouse Performance', type: 'number', options: { precision: 0 } },
    { name: 'Lighthouse Accessibility', type: 'number', options: { precision: 0 } },
    { name: 'Lighthouse Best Practices', type: 'number', options: { precision: 0 } },
    { name: 'Lighthouse SEO', type: 'number', options: { precision: 0 } },
    ...['Perf Band', 'Accessibility Band', 'Best-Practices Band', 'SEO Band'].map((name) => ({
      name, type: 'singleSelect',
      options: { choices: [
        { name: 'Good', color: 'greenBright' },
        { name: 'Needs Improvement', color: 'yellowBright' },
        { name: 'Poor', color: 'redBright' },
      ] },
    })),
    { name: 'llms.txt Status', type: 'singleSelect',
      options: { choices: [
        { name: 'good', color: 'greenBright' },
        { name: 'poor', color: 'yellowBright' },
        { name: 'absent', color: 'redBright' },
        { name: 'unknown', color: 'grayBright' },
      ] },
    },
    { name: 'llms.txt URL', type: 'url' },
    { name: 'Has HTTPS', type: 'checkbox', options: { icon: 'check', color: 'greenBright' } },
    { name: 'Has Viewport Meta', type: 'checkbox', options: { icon: 'check', color: 'greenBright' } },
    { name: 'Has Schema.org', type: 'checkbox', options: { icon: 'check', color: 'greenBright' } },
    { name: 'Has Click-to-Call', type: 'checkbox', options: { icon: 'check', color: 'greenBright' } },
    { name: 'Has Booking Widget', type: 'checkbox', options: { icon: 'check', color: 'greenBright' } },
    { name: 'Booking Vendor', type: 'singleLineText' },
    { name: 'Has Contact Form', type: 'checkbox', options: { icon: 'check', color: 'greenBright' } },
    { name: 'Per-Service Page Count', type: 'number', options: { precision: 0 } },
    { name: 'Dated-Tech Flags', type: 'number', options: { precision: 0 } },
    { name: 'Dated-Tech Flag List', type: 'multilineText' },

    // Screenshots — captured at sourcing for human review + the later vision
    // passes (audit-on-promotion, exemplar pattern-extraction). Sourcing itself
    // runs NO vision; aesthetic sub-scores are written by those later passes,
    // not stored on the sourcing row.
    { name: 'Desktop Screenshot', type: 'multipleAttachments' },
    { name: 'Mobile Screenshot', type: 'multipleAttachments' },

    // Objective evaluation — a uniform checklist count + gate-based tiers.
    // No weighted composites (the old Website Quality / Business Value /
    // Opportunity / Vendor Multiplier blends are RETIRED — delete in UI).
    { name: 'Quality Score', type: 'number', options: { precision: 0 } },   // 0–11 checklist passed
    { name: 'Weakness Score', type: 'number', options: { precision: 0 } },  // 0–11 failed (= the gaps)
    { name: 'Missing Items', type: 'multilineText' },                       // the outreach pitch
    { name: 'Business Tier', type: 'singleSelect',
      options: { choices: [
        { name: 'High', color: 'greenBright' }, { name: 'Med', color: 'yellowBright' }, { name: 'Low', color: 'grayBright' },
      ] } },
    { name: 'Weakness Tier', type: 'singleSelect',
      options: { choices: [
        { name: 'Severe', color: 'redBright' }, { name: 'Moderate', color: 'orangeBright' }, { name: 'Minor', color: 'grayBright' },
      ] } },
    { name: 'Is Exemplar', type: 'checkbox', options: { icon: 'star', color: 'yellowBright' } }, // Tier A — strict gold standard
    { name: 'Exemplar Blocked By', type: 'singleLineText' }, // why it's not Tier A (if applicable)
    { name: 'Research Tier', type: 'singleSelect',
      options: { choices: [
        { name: 'A', color: 'yellowBright' }, { name: 'B', color: 'greenBright' },
      ] } }, // A = strict exemplar · B = strong non-mill (report pool)
    { name: 'Is Research Pool', type: 'checkbox', options: { icon: 'check', color: 'greenBright' } }, // Tier A ∪ B
    { name: 'Research Blocked By', type: 'singleLineText' },
    { name: 'Tier', type: 'singleSelect',
      options: { choices: [
        { name: 'A', color: 'redBright' }, { name: 'B', color: 'orangeBright' },
        { name: 'C', color: 'yellowBright' }, { name: 'D', color: 'grayBright' },
      ] } },
    { name: 'Quadrant', type: 'singleSelect',
      options: { choices: [
        { name: 'Prime', color: 'greenBright' },
        { name: 'Skip — already sorted', color: 'grayBright' },
        { name: 'Nurture', color: 'blueBright' },
        { name: 'Low Priority', color: 'grayBright' },
      ] } },

    // Outreach state
    { name: 'Status', type: 'singleSelect',
      options: { choices: [
        { name: 'new' }, { name: 'qualified' }, { name: 'excluded-dso' },
        { name: 'excluded-closed' }, { name: 'excluded-no-website' },
        { name: 'excluded-unreachable' },
        { name: 'contacted' }, { name: 'replied' }, { name: 'promoted-to-accounts' },
      ] } },
    { name: 'Notes', type: 'multilineText' },

    // Audit metadata — for a living DB that gets re-scored over time.
    { name: 'Last Audited At', type: 'dateTime',
      options: { dateFormat: { name: 'iso' }, timeFormat: { name: '24hour' }, timeZone: 'America/Los_Angeles' } },
    { name: 'Rubric Version', type: 'singleLineText' },
  ],
};

// ──────────────────────────────────────────────────────────────────────
// HTTP wrapper with rate limiting
// ──────────────────────────────────────────────────────────────────────

class AirtableClient {
  constructor({ apiKey, baseId }) {
    if (!apiKey) throw new Error('AIRTABLE_API_KEY missing');
    if (!baseId) throw new Error('AIRTABLE_BASE_ID missing');
    this.apiKey = apiKey;
    this.baseId = baseId;
    this._lastCallAt = 0;
  }

  async _wait() {
    const since = Date.now() - this._lastCallAt;
    if (since < RATE_LIMIT_DELAY_MS) {
      await new Promise((r) => setTimeout(r, RATE_LIMIT_DELAY_MS - since));
    }
    this._lastCallAt = Date.now();
  }

  async req(method, url, body) {
    await this._wait();
    const res = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    let json;
    try { json = JSON.parse(text); } catch { json = { raw: text }; }
    if (!res.ok) {
      throw new Error(`Airtable ${method} ${res.status}: ${json.error?.message || text.slice(0, 300)}`);
    }
    return json;
  }

  // Schema operations
  async listTables() {
    return this.req('GET', `${META_BASE}/bases/${this.baseId}/tables`);
  }
  async createTable(schema) {
    return this.req('POST', `${META_BASE}/bases/${this.baseId}/tables`, schema);
  }
  async createField(tableId, field) {
    return this.req('POST', `${META_BASE}/bases/${this.baseId}/tables/${tableId}/fields`, field);
  }

  // Record operations
  async findByPlaceId(tableId, placeId) {
    const url = `${API_BASE}/${this.baseId}/${tableId}?filterByFormula=${encodeURIComponent(`{Place ID}="${placeId}"`)}&maxRecords=1`;
    const json = await this.req('GET', url);
    return json.records?.[0] || null;
  }
  async createRecords(tableId, records) {
    return this.req('POST', `${API_BASE}/${this.baseId}/${tableId}`, { records, typecast: true });
  }
  async updateRecords(tableId, records) {
    return this.req('PATCH', `${API_BASE}/${this.baseId}/${tableId}`, { records, typecast: true });
  }
}

// ──────────────────────────────────────────────────────────────────────
// Public API
// ──────────────────────────────────────────────────────────────────────

/**
 * Ensure the Sourced Practices table exists, creating it from TABLE_SCHEMA
 * if missing. Returns the tableId.
 *
 * IMPORTANT: requires the personal access token to have `schema.bases:write`.
 * If you'd rather create the table by hand in the Airtable UI, that works too —
 * this function will just verify presence.
 */
export async function ensureTable({ apiKey, baseId, allowCreate = false, tableName = TABLE_NAME } = {}) {
  const client = new AirtableClient({ apiKey, baseId });
  const { tables } = await client.listTables();
  const existing = tables.find((t) => t.name === tableName);
  const schema = { ...TABLE_SCHEMA, name: tableName };

  if (existing) {
    // Reconcile: add any fields from the schema that don't exist yet.
    // Lets the schema evolve without dropping the table. Requires
    // schema.bases:write on the token; failures are reported, non-fatal.
    const have = new Set(existing.fields.map((f) => f.name));
    const missing = schema.fields.filter((f) => !have.has(f.name));
    const added = [];
    for (const f of missing) {
      try {
        await client.createField(existing.id, f);
        added.push(f.name);
      } catch (e) {
        console.warn(`  [airtable] could not add field "${f.name}": ${e.message}`);
      }
    }
    return { tableId: existing.id, created: false, fieldCount: existing.fields.length, addedFields: added };
  }

  if (!allowCreate) {
    throw new Error(
      `Table "${tableName}" does not exist in base ${baseId}. ` +
      `Re-run with allowCreate=true (or --create-table flag) to create it programmatically.`,
    );
  }

  const created = await client.createTable(schema);
  return { tableId: created.id, created: true, fieldCount: created.fields.length };
}

/**
 * Upsert practices by Place ID. Looks up each by Place ID; updates if exists,
 * creates if not. Batched to 10/request with rate limiting.
 *
 * @param {object} args
 * @param {string} args.tableId
 * @param {Array<{placeId: string, fields: object}>} args.records
 */
export async function upsertPractices({ apiKey, baseId, tableId, records, onProgress }) {
  const client = new AirtableClient({ apiKey, baseId });
  let updated = 0, created = 0, failed = 0;

  // Process serially in chunks of WRITE_BATCH for batched create.
  // Updates need a per-record lookup, so we do them one-at-a-time-grouped.
  const toCreate = [];
  const toUpdate = [];

  for (const r of records) {
    try {
      const found = await client.findByPlaceId(tableId, r.placeId);
      if (found) {
        toUpdate.push({ id: found.id, fields: r.fields });
      } else {
        toCreate.push({ fields: r.fields });
      }
    } catch (e) {
      failed++;
      onProgress?.({ phase: 'lookup', placeId: r.placeId, error: e.message });
    }
  }

  for (let i = 0; i < toCreate.length; i += WRITE_BATCH) {
    const batch = toCreate.slice(i, i + WRITE_BATCH);
    try {
      const result = await client.createRecords(tableId, batch);
      created += result.records?.length || 0;
      onProgress?.({ phase: 'create', count: result.records?.length || 0 });
    } catch (e) {
      failed += batch.length;
      onProgress?.({ phase: 'create', error: e.message });
    }
  }
  for (let i = 0; i < toUpdate.length; i += WRITE_BATCH) {
    const batch = toUpdate.slice(i, i + WRITE_BATCH);
    try {
      const result = await client.updateRecords(tableId, batch);
      updated += result.records?.length || 0;
      onProgress?.({ phase: 'update', count: result.records?.length || 0 });
    } catch (e) {
      failed += batch.length;
      onProgress?.({ phase: 'update', error: e.message });
    }
  }

  return { created, updated, failed };
}

/**
 * Convert one practice's pipeline result into the Airtable fields shape.
 */
export function recordToFields(p) {
  return {
    'Place ID': p.placeId,
    'Practice Name': p.practiceName,
    'Source': p.source || 'google-places-text-search',
    'Sourced At': p.sourcedAt,
    'MSA / Market': p.msa || '',
    'Address': p.address || '',
    'City': p.city || '',
    'State': p.state || '',
    'Zip': p.zip || '',
    'Latitude': p.lat ?? null,
    'Longitude': p.lng ?? null,
    'Google Maps / GBP': p.gbpUrl || '',
    'Website URL': p.websiteUrl || '',
    'Final URL': p.finalUrl || '',
    'Phone': p.phone || '',
    'Email': p.email || '',
    'Primary Type': p.primaryType || '',
    'Types': (p.types || []).join(', '),
    'Rating': p.rating ?? null,
    'Review Count': p.reviewCount ?? null,
    'Business Status': p.businessStatus || 'OPERATIONAL',
    'HTTP Status': p.httpStatus ?? null,
    'Vendor': p.vendor || '',
    'Vendor Category': p.vendorCategory || 'unknown',
    'WordPress Theme': p.wpTheme?.name || '',
    'Rendered HTML (GCS)': p.htmlGcsPath || '',
    'Is Chain / DSO': !!p.isChain,
    'Chain Name': p.chainName || '',
    'Multi-Location': !!p.multiLocation?.multiLocation,
    'Multi-Location Signals': p.multiLocation?.reason || '',
    'Lighthouse Performance': p.lighthouse?.performance ?? null,
    'Lighthouse Accessibility': p.lighthouse?.accessibility ?? null,
    'Lighthouse Best Practices': p.lighthouse?.bestPractices ?? null,
    'Lighthouse SEO': p.lighthouse?.seo ?? null,
    'Perf Band': p.bands?.performance || null,
    'Accessibility Band': p.bands?.accessibility || null,
    'Best-Practices Band': p.bands?.bestPractices || null,
    'SEO Band': p.bands?.seo || null,
    'llms.txt Status': p.llms?.status || null,
    'llms.txt URL': p.llms?.url || null,
    'Has HTTPS': !!p.features?.hasHttps,
    'Has Viewport Meta': !!p.features?.hasViewportMeta,
    'Has Schema.org': !!p.features?.hasSchemaOrg,
    'Has Click-to-Call': !!p.features?.hasClickToCall,
    'Has Booking Widget': !!p.features?.booking?.present,
    'Booking Vendor': p.features?.booking?.vendor || '',
    'Has Contact Form': !!p.features?.hasContactForm,
    'Per-Service Page Count': p.features?.serviceLinkCount ?? 0,
    'Dated-Tech Flags': p.features?.datedTechFlagCount ?? 0,
    'Dated-Tech Flag List': (p.features?.datedTechFlags || []).map((f) => f.id).join(', '),
    // Attachments: Airtable fetches these URLs server-side at write time.
    ...(p.desktopUrl ? { 'Desktop Screenshot': [{ url: p.desktopUrl }] } : {}),
    ...(p.mobileUrl ? { 'Mobile Screenshot': [{ url: p.mobileUrl }] } : {}),
    'Quality Score': p.scores?.qualityScore ?? null,
    'Weakness Score': p.scores?.weaknessScore ?? null,
    'Missing Items': (p.checklist?.missing || []).join('\n• '),
    'Business Tier': p.scores?.bizTier || null,
    'Weakness Tier': p.scores?.weakTier || null,
    'Is Exemplar': !!p.isExemplar,
    'Exemplar Blocked By': (p.exemplarFailedOn || []).join(', '),
    'Research Tier': p.researchTier || null,
    'Is Research Pool': !!p.isResearchPool,
    'Research Blocked By': (p.researchFailedOn || []).join(', '),
    'Tier': p.scores?.tier || null,
    'Quadrant': p.scores?.quadrant || null,
    'Status': p.status || 'new',
    'Last Audited At': p.lastAuditedAt || null,
    'Rubric Version': p.rubricVersion || '',
  };
}
