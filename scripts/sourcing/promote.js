#!/usr/bin/env node
// Promote a sourced practice into the Accounts CRM table.
//
// Usage:
//   node scripts/sourcing/promote.js <place_id>
//
// What it does:
//   1. Look up the Sourced Practices row by Place ID
//   2. Create a new row in AIRTABLE_ACCOUNTS_TABLE with mapped fields
//      (Practice Name, Practice URL, Phone, City, State, Source='sourcing')
//   3. Update the Sourced row's Status → 'promoted-to-accounts' and link to
//      the new Account record
//
// If you'd rather do this from the Airtable UI, the equivalent button script
// is in docs/sourcing/airtable-promote-button.js (paste into a Button field).

import './lib/env.js';

const AIRTABLE_API = 'https://api.airtable.com/v0';
const apiKey = process.env.AIRTABLE_API_KEY;
const baseId = process.env.AIRTABLE_BASE_ID;
const accountsTable = process.env.AIRTABLE_ACCOUNTS_TABLE; // existing table id/name
const sourcedTable = 'Sourced Practices';

const placeId = process.argv[2];
if (!placeId) {
  console.error('Usage: node scripts/sourcing/promote.js <place_id>');
  process.exit(2);
}
for (const [k, v] of Object.entries({ AIRTABLE_API_KEY: apiKey, AIRTABLE_BASE_ID: baseId, AIRTABLE_ACCOUNTS_TABLE: accountsTable })) {
  if (!v) { console.error(`${k} missing from env`); process.exit(1); }
}

async function api(method, path, body) {
  const res = await fetch(`${AIRTABLE_API}/${baseId}/${path}`, {
    method,
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json; try { json = JSON.parse(text); } catch { json = { raw: text }; }
  if (!res.ok) throw new Error(`Airtable ${method} ${res.status}: ${json.error?.message || text.slice(0, 300)}`);
  return json;
}

async function main() {
  // 1. Look up the sourced row
  const filter = encodeURIComponent(`{Place ID}="${placeId}"`);
  const found = await api('GET', `${encodeURIComponent(sourcedTable)}?filterByFormula=${filter}&maxRecords=1`);
  const sourced = found.records?.[0];
  if (!sourced) {
    console.error(`No row found in "${sourcedTable}" with Place ID = ${placeId}`);
    process.exit(1);
  }
  const f = sourced.fields;
  console.error(`Found: ${f['Practice Name']} (${f['City']}, ${f['State']})`);

  // 2. Create in Accounts table
  // Note: the Accounts schema uses 'Practice URL' for the website; sourcing
  // uses 'Website URL'. We map them. Other fields are best-effort.
  const accountFields = {
    'Practice Name': f['Practice Name'],
    'Practice URL': f['Website URL'] || f['Final URL'] || '',
    'Phone': f['Phone'] || '',
    'City': f['City'] || '',
    'State': f['State'] || '',
    'Source': 'sourcing',
    'Slug': (f['Practice Name'] || '').toLowerCase().replace(/[^a-z0-9]+/g, ''),
    'Notes': `Promoted from sourcing pipeline.\nOpportunity Score: ${f['Opportunity Score']}\nTier: ${f['Tier']}\nQuadrant: ${f['Quadrant']}\nVendor: ${f['Vendor']} (${f['Vendor Category']})`,
  };
  const created = await api('POST', encodeURIComponent(accountsTable), {
    records: [{ fields: accountFields }],
    typecast: true,
  });
  const newAccount = created.records[0];
  console.error(`Created account: ${newAccount.id}`);

  // 3. Update sourced row's status
  await api('PATCH', encodeURIComponent(sourcedTable), {
    records: [{
      id: sourced.id,
      fields: {
        'Status': 'promoted-to-accounts',
        // 'Promoted To Account' linked-record field — only set if it exists.
        // Comment out if Promoted To Account isn't a real link field yet.
        // 'Promoted To Account': [newAccount.id],
      },
    }],
  });
  console.error(`Updated sourced row → status: promoted-to-accounts`);
  console.error(`\nDone. New account id: ${newAccount.id}`);
}

main().catch((e) => { console.error('Failed:', e); process.exit(1); });
