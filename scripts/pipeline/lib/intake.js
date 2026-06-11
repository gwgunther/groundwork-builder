/**
 * Load client intake data from a JSON file or Airtable Account.
 * Normalizes the 8-section intake structure into the unified PracticeData shape.
 */
import { readFile } from 'node:fs/promises';
import { resolve, join, dirname } from 'node:path';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
import { slugify } from './utils.js';
import { findAccountBySlug } from './d1.js';

export async function loadIntake(optsOrFilePath, clientIdArg) {
  // Support both: loadIntake({ filePath, clientId, airtableSlug }) and loadIntake(filePath, clientId)
  let filePath, clientId, airtableSlug;
  if (optsOrFilePath && typeof optsOrFilePath === 'object') {
    filePath = optsOrFilePath.filePath;
    clientId = optsOrFilePath.clientId;
    airtableSlug = optsOrFilePath.airtableSlug;
  } else {
    filePath = optsOrFilePath;
    clientId = clientIdArg;
  }

  let raw;

  if (filePath) {
    const text = await readFile(filePath, 'utf-8');
    raw = JSON.parse(text);
  } else if (airtableSlug) {
    raw = await loadFromAirtable(airtableSlug);
  } else if (clientId) {
    // Legacy alias — treat as Airtable slug lookup, not Supabase UUID
    raw = await loadFromAirtable(clientId);
  } else {
    return {};
  }

  return normalizeIntake(raw);
}

async function loadFromAirtable(slug) {
  const account = await findAccountBySlug(slug);
  if (!account) {
    throw new Error(`No Airtable Account found with Slug: ${slug}`);
  }

  // D1 rows are snake_case (intake_json); legacy Airtable records used display
  // names ('Intake JSON') — support both so old call sites keep working.
  const fields = account.fields || {};
  const intakeJson = fields.intake_json ?? fields['Intake JSON'];
  if (intakeJson) {
    try {
      const parsed = typeof intakeJson === 'string' ? JSON.parse(intakeJson) : intakeJson;
      return {
        _topLevel: {
          practice_name: fields.practice_name ?? fields['Practice Name'] ?? null,
          contact_email: fields.contact_email ?? fields.business_email ?? fields['Contact Email'] ?? fields['Business Email'] ?? null,
          contact_phone: fields.phone ?? fields['Phone'] ?? null,
        },
        ...parsed,
        meta: { intakeSource: 'db' },
      };
    } catch (err) {
      throw new Error(`Invalid Intake JSON on Account ${slug}: ${err.message}`);
    }
  }

  // Local fallback: clients/<slug>/intake.json
  const localPath = join(REPO_ROOT, 'clients', slug, 'intake.json');
  if (existsSync(localPath)) {
    const text = await readFile(localPath, 'utf-8');
    const parsed = JSON.parse(text);
    return {
      _topLevel: {
        practice_name: fields.practice_name ?? fields['Practice Name'] ?? null,
        contact_email: fields.contact_email ?? fields['Contact Email'] ?? null,
        contact_phone: fields.phone ?? fields['Phone'] ?? null,
      },
      ...parsed,
    };
  }

  throw new Error(
    `Account "${slug}" has no Intake JSON field and no clients/${slug}/intake.json — add intake data first.`,
  );
}

function normalizeIntake(raw) {
  const pi = raw.practice_info || raw._topLevel || {};
  const dt = raw.doctor_team || {};
  const sv = raw.services || {};
  const ins = raw.insurance_financing || {};
  const br = raw.branding || {};
  const co = raw.content || {};

  return {
    practice: {
      name: pi.practice_name || pi.name || null,
      domain: pi.domain || null,
      phone: pi.phone || pi.contact_phone || null,
      email: pi.email || pi.contact_email || null,
    },
    doctor: dt.primary_doctor ? {
      firstName: dt.primary_doctor.first_name || null,
      lastName: dt.primary_doctor.last_name || null,
      credentials: dt.primary_doctor.credentials || null,
      bio: dt.primary_doctor.bio || null,
      education: dt.primary_doctor.education || null,
    } : null,
    address: pi.address ? {
      street: pi.address.street || null,
      city: pi.address.city || null,
      state: pi.address.state || null,
      zip: pi.address.zip || null,
    } : null,
    hours: pi.hours || null,
    services: sv.list ? {
      offered: (Array.isArray(sv.list) ? sv.list : []).map(s => ({
        name: typeof s === 'string' ? s : s.name || s,
        slug: slugify(typeof s === 'string' ? s : s.name || s),
        source: 'intake',
        confidence: 1.0,
      })),
    } : null,
    brand: {
      colors: br.colors || null,
      fonts: br.fonts || null,
    },
    content: {
      insurance: ins.plans || [],
      faqs: co.faqs || [],
      testimonials: co.testimonials || [],
      caseStudyConsent: co.case_study_consent ?? raw.case_study_consent ?? null,
      consentScope: co.consent_scope ?? raw.consent_scope ?? null,
      ga4MeasurementId: co.ga4_measurement_id || null,
    },
    meta: {
      intakeSource: raw.meta?.intakeSource || (raw._topLevel ? 'airtable' : 'file'),
    },
  };
}
