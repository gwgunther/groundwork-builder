/**
 * Load client intake data from a JSON file or Supabase.
 * Normalizes the 8-section intake structure into the unified PracticeData shape.
 */
import { readFile } from 'node:fs/promises';
import { slugify } from './utils.js';

export async function loadIntake(optsOrFilePath, clientIdArg) {
  // Support both: loadIntake({ filePath, clientId }) and loadIntake(filePath, clientId)
  let filePath, clientId;
  if (optsOrFilePath && typeof optsOrFilePath === 'object') {
    filePath = optsOrFilePath.filePath;
    clientId = optsOrFilePath.clientId;
  } else {
    filePath = optsOrFilePath;
    clientId = clientIdArg;
  }

  let raw;

  if (filePath) {
    const text = await readFile(filePath, 'utf-8');
    raw = JSON.parse(text);
  } else if (clientId) {
    raw = await loadFromSupabase(clientId);
  } else {
    return {};
  }

  return normalizeIntake(raw);
}

async function loadFromSupabase(clientId) {
  const url = process.env.SUPABASE_URL || process.env.PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error('SUPABASE_URL and SUPABASE_SERVICE_KEY required for --client-id mode');
  }

  const res = await fetch(
    `${url}/rest/v1/clients?id=eq.${clientId}&select=intake_data,practice_name,contact_email,contact_phone`,
    {
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
      },
    }
  );

  const [client] = await res.json();
  if (!client) throw new Error(`No client found with ID: ${clientId}`);

  return {
    _topLevel: {
      practice_name: client.practice_name,
      contact_email: client.contact_email,
      contact_phone: client.contact_phone,
    },
    ...client.intake_data,
  };
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
    },
    meta: {
      intakeSource: raw._topLevel ? 'supabase' : 'file',
    },
  };
}
