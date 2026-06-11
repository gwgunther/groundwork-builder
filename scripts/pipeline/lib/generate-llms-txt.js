/**
 * llms.txt content builder — used by audit-data-assembler for preview/evidence.
 *
 * The build pipeline writes the actual public/llms.txt via generate-agent-files.js
 * (Phase 3c-bis), which also has nav context. This module provides previewLlmsTxt()
 * for audit previews where there is no output directory to write to.
 */

import { slugify } from './utils.js';

/**
 * Build llms.txt content without writing to disk (for audit previews).
 *
 * @param {object} merged - PracticeData from merger
 * @returns {string}
 */
export function previewLlmsTxt(merged) {
  return buildLlmsTxtContent(merged);
}

function buildLlmsTxtContent(merged) {
  const practice = merged?.practice || {};
  const address = merged?.address || {};
  const name = practice.name?.trim() || 'Dental Practice';
  const city = address.city?.trim() || '';
  const state = address.state?.trim() || '';
  const phone = practice.phone?.trim() || '';
  const doctor = merged?.doctor?.name?.trim() || '';

  let baseUrl = '';
  if (practice.domain) {
    baseUrl = /^https?:\/\//i.test(practice.domain)
      ? practice.domain.replace(/\/$/, '')
      : `https://${practice.domain.replace(/\/$/, '')}`;
  } else if (practice.url) {
    try {
      const u = new URL(practice.url);
      baseUrl = `${u.protocol}//${u.host}`;
    } catch { /* ignore */ }
  }

  const location = [city, state].filter(Boolean).join(', ');
  const tagline = practice.tagline?.trim()
    || (location
      ? `Dental practice serving ${location}${doctor ? ` — led by ${doctor}` : ''}.`
      : `Dental practice${doctor ? ` led by ${doctor}` : ''}.`);

  const services = (merged?.services?.offered || []).slice(0, 16);
  const lines = [];

  lines.push(`# ${name}`);
  lines.push('');
  lines.push(`> ${tagline}`);
  lines.push('');
  lines.push('## Key pages');
  lines.push('');
  if (baseUrl) {
    const pages = [
      ['Homepage', '/'],
      ['About', '/about/'],
      ['Services', '/services/'],
      ['Schedule an appointment', '/schedule/'],
      ['FAQ', '/faq/'],
      ['Gallery', '/gallery/'],
      ['Blog', '/blog/'],
    ];
    for (const [label, path] of pages) {
      lines.push(`- [${label}](${baseUrl}${path})`);
    }
  } else {
    lines.push('- Homepage, About, Services, Schedule, FAQ');
  }

  if (services.length) {
    lines.push('');
    lines.push('## Services');
    lines.push('');
    for (const svc of services) {
      const label = typeof svc === 'string' ? svc : (svc.name || svc.title || '');
      if (!label) continue;
      const slug = typeof svc === 'object' && svc.slug ? svc.slug : slugify(label);
      if (baseUrl) {
        lines.push(`- [${label}](${baseUrl}/services/${slug}/)`);
      } else {
        lines.push(`- ${label}`);
      }
    }
  }

  lines.push('');
  lines.push('## Contact');
  lines.push('');
  if (phone) lines.push(`- Phone: ${phone}`);
  if (location) lines.push(`- Location: ${location}`);
  if (practice.email) lines.push(`- Email: ${practice.email}`);

  return lines.join('\n') + '\n';
}
