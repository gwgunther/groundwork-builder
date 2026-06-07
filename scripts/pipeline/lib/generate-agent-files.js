/**
 * generate-agent-files.js
 *
 * Generates two files that make every built site pass the Lighthouse
 * Agentic Browsing category (shipped in Lighthouse 13.3 / Chrome 150):
 *
 *   public/llms.txt               — machine-readable site summary (llms.txt audit)
 *   public/.well-known/webmcp.json — agent-callable action declarations (WebMCP audit)
 *
 * Call after Phase 3 template injection (content + nav are fully resolved).
 */

import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

/**
 * @param {object} merged     - Merged practice data
 * @param {Array}  navLinks   - Resolved navigation links array (from navigation.ts shape)
 * @param {string} outputDir  - Root of the generated project
 * @returns {{ llmsTxtBytes: number, toolCount: number }}
 */
export async function generateAgentFiles(merged, navLinks, outputDir) {
  const practice = merged.practice || {};
  const address  = merged.address  || {};
  const services = merged.services?.offered || [];
  const phone    = practice.phone || '';
  const domain   = practice.domain || '';

  // Flatten nav into a page list (top-level + dropdown items)
  const allPages = (navLinks || [])
    .flatMap(l => [l, ...(l.dropdown || [])])
    .filter(l => l?.href && l?.label);

  // ------------------------------------------------------------------
  // 1. llms.txt
  // ------------------------------------------------------------------
  const locationParts = [
    address.street,
    address.city,
    address.state ? `${address.state} ${address.zip || ''}`.trim() : address.zip,
  ].filter(Boolean);
  const locationText = locationParts.join(', ');

  const servicesLines = services.slice(0, 20).map(s => `- ${s.name}`).join('\n');
  const pagesLines    = allPages.map(l => `- [${l.label}](${l.href})`).join('\n');

  const llmsTxt = [
    `# ${practice.name || 'Dental Practice'}`,
    `> ${practice.tagline || practice.description || `Providing quality dental care${address.city ? ` in ${address.city}` : ''}.`}`,
    '',
    ...(locationText ? [`Located at ${locationText}.`] : []),
    ...(phone  ? [`Phone: ${phone}`]                                           : []),
    ...(domain ? [`Website: https://${domain.replace(/^https?:\/\//, '')}`]   : []),
    '',
    '## Key pages',
    pagesLines,
    '',
    ...(servicesLines ? ['## Services offered', servicesLines] : []),
  ].join('\n').trim() + '\n';

  await writeFile(resolve(outputDir, 'public', 'llms.txt'), llmsTxt, 'utf-8');

  // ------------------------------------------------------------------
  // 2. .well-known/webmcp.json
  // ------------------------------------------------------------------
  const wellKnownDir = resolve(outputDir, 'public', '.well-known');
  await mkdir(wellKnownDir, { recursive: true });

  const tools = [
    {
      name:        'book_appointment',
      description: `Book an appointment with ${practice.name || 'the practice'}`,
      action:      { type: 'navigate', href: '/schedule' },
    },
    phone
      ? {
          name:        'call_practice',
          description: `Call ${practice.name || 'the practice'} at ${phone}`,
          action:      { type: 'navigate', href: `tel:${phone.replace(/\D/g, '')}` },
        }
      : null,
    {
      name:        'contact_practice',
      description: `Send a message or inquiry to ${practice.name || 'the practice'}`,
      action:      { type: 'navigate', href: '/contact' },
    },
    {
      name:        'view_services',
      description: `Browse all dental services offered by ${practice.name || 'the practice'}`,
      action:      { type: 'navigate', href: '/services' },
    },
  ].filter(Boolean);

  const webmcpJson = { tools };

  await writeFile(
    resolve(wellKnownDir, 'webmcp.json'),
    JSON.stringify(webmcpJson, null, 2),
    'utf-8',
  );

  // ------------------------------------------------------------------
  // 3. llms-full.txt (expanded: doctor bios, hours, full service desc, FAQs)
  // ------------------------------------------------------------------
  const allDoctors = (merged.doctors || (merged.doctor?.name ? [merged.doctor] : [])).filter(d => d?.name);
  const doctorsText = allDoctors
    .map(d => `- ${d.name}${d.credentials ? `, ${d.credentials}` : ''}${d.bio ? `\n  ${d.bio.slice(0, 250)}` : ''}`)
    .join('\n');

  const fullServicesLines = services.slice(0, 30).map(s => {
    const desc = s.description ? `\n  ${s.description.slice(0, 300)}` : '';
    return `- ${s.name}${desc}`;
  }).join('\n');

  const hoursLines = (merged.hours?.display || []).map(h => `- ${h.day}: ${h.time}`).join('\n');

  const faqs = (merged.content?.faqs || merged.content?.generatedFAQs || []).slice(0, 10);
  const faqText = faqs.length
    ? faqs.map(f => `**Q:** ${f.question}\n**A:** ${f.answer}`).join('\n\n')
    : '';

  const llmsFullTxt = [
    `# ${practice.name || 'Dental Practice'} — Full Site Summary`,
    `> ${practice.tagline || practice.description || `Quality dental care${address.city ? ` in ${address.city}` : ''}.`}`,
    '',
    ...(locationText ? [`**Location:** ${locationText}`]                                  : []),
    ...(phone        ? [`**Phone:** ${phone}`]                                             : []),
    ...(domain       ? [`**Website:** https://${domain.replace(/^https?:\/\//, '')}`]      : []),
    '',
    '## Key Pages',
    pagesLines,
    '',
    ...(doctorsText      ? ['## Our Doctors',                 doctorsText,      ''] : []),
    ...(hoursLines       ? ['## Hours',                       hoursLines,       ''] : []),
    ...(fullServicesLines? ['## Services',                    fullServicesLines, ''] : []),
    ...(faqText          ? ['## Frequently Asked Questions',  faqText             ] : []),
  ].join('\n').trim() + '\n';

  await writeFile(resolve(outputDir, 'public', 'llms-full.txt'), llmsFullTxt, 'utf-8');

  console.log(`  Agent files: llms.txt (${llmsTxt.length}B) + llms-full.txt (${llmsFullTxt.length}B) + .well-known/webmcp.json (${tools.length} tools) written.`);
  return { llmsTxtBytes: llmsTxt.length, llmsFullTxtBytes: llmsFullTxt.length, toolCount: tools.length };
}
