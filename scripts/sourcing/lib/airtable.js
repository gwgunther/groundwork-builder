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
    { name: 'Place ID', type: 'singleLineText' },                          // primary key
    { name: 'Practice Name', type: 'singleLineText' },
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
    { name: 'Is Chain / DSO', type: 'checkbox', options: { icon: 'check', color: 'redBright' } },
    { name: 'Chain Name', type: 'singleLineText' },
    { name: 'Multi-Location', type: 'checkbox', options: { icon: 'check', color: 'blueBright' } },
    { name: 'Multi-Location Signals', type: 'singleLineText' },
    { name: 'Lighthouse Performance', type: 'number', options: { precision: 0 } },
    { name: 'Lighthouse Accessibility', type: 'number', options: { precision: 0 } },
    { name: 'Lighthouse Best Practices', type: 'number', options: { precision: 0 } },
    { name: 'Has HTTPS', type: 'checkbox', options: { icon: 'check', color: 'greenBright' } },
    { name: 'Has Viewport Meta', type: 'checkbox', options: { icon: 'check', color: 'greenBright' } },
    { name: 'Has Schema.org', type: 'checkbox', options: { icon: 'check', color: 'greenBright' } },
    { name: 'Has Click-to-Call', type: 'checkbox', options: { icon: 'check', color: 'greenBright' } },
    { name: 'Has Booking Widget', type: 'checkbox', options: { icon: 'check', color: 'greenBright' } },
    { name: 'Booking Vendor', type: 'singleLineText' },
    { name: 'Per-Service Page Count', type: 'number', options: { precision: 0 } },
    { name: 'Dated-Tech Flags', type: 'number', options: { precision: 0 } },
    { name: 'Dated-Tech Flag List', type: 'multilineText' },

    // AI vision
    { name: 'Vision: Visual Craft', type: 'number', options: { precision: 0 } },
    { name: 'Vision: Clarity & Hierarchy', type: 'number', options: { precision: 0 } },
    { name: 'Vision: Modernity', type: 'number', options: { precision: 0 } },
    { name: 'Vision Unrenderable', type: 'checkbox', options: { icon: 'xCheckbox', color: 'grayBright' } },
    { name: 'Vision Observations', type: 'multilineText' },
    { name: 'Desktop Screenshot', type: 'multipleAttachments' },
    { name: 'Mobile Screenshot', type: 'multipleAttachments' },

    // Ad spend
    { name: 'Running Google Ads', type: 'checkbox', options: { icon: 'check', color: 'yellowBright' } },
    { name: 'Google Ads Count', type: 'number', options: { precision: 0 } },
    { name: 'Running Meta Ads', type: 'checkbox', options: { icon: 'check', color: 'yellowBright' } },
    { name: 'Meta Ads Count', type: 'number', options: { precision: 0 } },

    // Computed scores (formulas — we'll set these via API after table creation,
    // since formula creation requires a follow-up PATCH to each field).
    // For v1 we write the computed numbers from Node so it works even if the
    // formulas aren't set up. If formulas are later added in the UI, they'll
    // override the written values.
    { name: 'Design Score', type: 'number', options: { precision: 0 } },
    { name: 'Business Value Score', type: 'number', options: { precision: 0 } },
    { name: 'Vendor Multiplier', type: 'number', options: { precision: 2 } },
    { name: 'Opportunity Score', type: 'number', options: { precision: 0 } },
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
        { name: 'contacted' }, { name: 'replied' }, { name: 'promoted-to-accounts' },
      ] } },
    { name: 'Notes', type: 'multilineText' },
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
export async function ensureTable({ apiKey, baseId, allowCreate = false } = {}) {
  const client = new AirtableClient({ apiKey, baseId });
  const { tables } = await client.listTables();
  const existing = tables.find((t) => t.name === TABLE_NAME);

  if (existing) {
    return { tableId: existing.id, created: false, fieldCount: existing.fields.length };
  }

  if (!allowCreate) {
    throw new Error(
      `Table "${TABLE_NAME}" does not exist in base ${baseId}. ` +
      `Re-run with allowCreate=true (or --create flag) to create it programmatically.`,
    );
  }

  const created = await client.createTable(TABLE_SCHEMA);
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
    'Website URL': p.websiteUrl || '',
    'Final URL': p.finalUrl || '',
    'Phone': p.phone || '',
    'Primary Type': p.primaryType || '',
    'Types': (p.types || []).join(', '),
    'Rating': p.rating ?? null,
    'Review Count': p.reviewCount ?? null,
    'Business Status': p.businessStatus || 'OPERATIONAL',
    'HTTP Status': p.httpStatus ?? null,
    'Vendor': p.vendor || '',
    'Vendor Category': p.vendorCategory || 'unknown',
    'WordPress Theme': p.wpTheme?.name || '',
    'Is Chain / DSO': !!p.isChain,
    'Chain Name': p.chainName || '',
    'Multi-Location': !!p.multiLocation?.multiLocation,
    'Multi-Location Signals': p.multiLocation?.reason || '',
    'Lighthouse Performance': p.lighthouse?.performance ?? null,
    'Lighthouse Accessibility': p.lighthouse?.accessibility ?? null,
    'Lighthouse Best Practices': p.lighthouse?.bestPractices ?? null,
    'Has HTTPS': !!p.features?.hasHttps,
    'Has Viewport Meta': !!p.features?.hasViewportMeta,
    'Has Schema.org': !!p.features?.hasSchemaOrg,
    'Has Click-to-Call': !!p.features?.hasClickToCall,
    'Has Booking Widget': !!p.features?.booking?.present,
    'Booking Vendor': p.features?.booking?.vendor || '',
    'Per-Service Page Count': p.features?.serviceLinkCount ?? 0,
    'Dated-Tech Flags': p.features?.datedTechFlagCount ?? 0,
    'Dated-Tech Flag List': (p.features?.datedTechFlags || []).map((f) => f.id).join(', '),
    'Vision: Visual Craft': p.vision?.visualCraft ?? null,
    'Vision: Clarity & Hierarchy': p.vision?.clarityHierarchy ?? null,
    'Vision: Modernity': p.vision?.modernity ?? null,
    'Vision Unrenderable': !!p.vision?.unrenderable,
    'Vision Observations': (p.vision?.observations || []).join('\n• '),
    'Running Google Ads': !!p.ads?.google?.running,
    'Google Ads Count': p.ads?.google?.count ?? 0,
    'Running Meta Ads': !!p.ads?.meta?.running,
    'Meta Ads Count': p.ads?.meta?.count ?? 0,
    'Design Score': p.scores?.design ?? null,
    'Business Value Score': p.scores?.businessValue ?? null,
    'Vendor Multiplier': p.scores?.vendorMultiplier ?? null,
    'Opportunity Score': p.scores?.opportunity ?? null,
    'Tier': p.scores?.tier || null,
    'Quadrant': p.scores?.quadrant || null,
    'Status': p.status || 'new',
  };
}
