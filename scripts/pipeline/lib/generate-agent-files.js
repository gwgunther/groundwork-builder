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

  console.log(`  Agent files: llms.txt (${llmsTxt.length}B) + .well-known/webmcp.json (${tools.length} tools) written.`);
  return { llmsTxtBytes: llmsTxt.length, toolCount: tools.length };
}
