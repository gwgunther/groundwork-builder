/**
 * Step 5 — Plan Content & Pages.
 *
 * Deterministically PLACES the merged practice content onto a page/section
 * structure. Placement is rule-based (so coverage is auditable by construction);
 * net-new gap copy is the only thing that would need AI (flagged, added later).
 *
 * Output: a content plan — pages[] with sections[], each section referencing
 * real merged content, tagged verbatim|optimizable|generated. Plus unplaced[]
 * (must be empty) and generated[] (flagged net-new).
 *
 * No visual layout here — that's Step 6 (assembly).
 */

import { slugify } from '../utils.js';

// Which content tier a section's content is (drives the fidelity audit).
const VERBATIM = 'verbatim';        // never altered (names, NAP, testimonials, FAQ answers, insurance)
const OPTIMIZABLE = 'optimizable';  // meaning-preserving polish allowed (taglines, about prose, descriptions)

// Policy: faithful MIMICRY. Place every distinct piece of the practice's content
// in its best spot (reorganize/optimize), but never OMIT and never editorialize
// (no "this doctor seems to be leaving" judgments — whoever the practice features,
// we feature). Consolidating genuinely redundant repeats is fine; dropping is not.
export function planContent(merged) {
  const placed = new Set();          // keys of merged items that landed somewhere
  const mark = (k) => placed.add(k);
  const pages = [];
  const generated = [];
  const announcements = [];          // captured but ephemeral — flagged, not featured (evergreen policy)

  const practice = merged.practice || {};
  const address = merged.address || {};
  const content = merged.content || {};
  const doctors = merged.doctors || [];
  const staff = merged.staff || [];
  const services = (merged.services?.offered || []);
  const testimonials = content.testimonials || [];
  const faqs = content.faqs || [];
  const insurance = content.insurance || [];
  const financing = content.financingOptions || [];
  const payments = content.paymentMethods || [];
  const areasServed = content.areasServed || [];
  const additional = content.additionalContent || [];

  const section = (type, source, heading, body, ref) => ({ type, source, heading: heading || null, body: body || null, contentRef: ref || null });

  // ---- HOME ---------------------------------------------------------------
  const home = { slug: '/', title: practice.name || 'Home', role: 'home', sections: [] };
  if (content.heroTagline) { home.sections.push(section('hero', OPTIMIZABLE, content.heroTagline, content.heroSubheadline || null, 'content.heroTagline')); mark('content.heroTagline'); if (content.heroSubheadline) mark('content.heroSubheadline'); }
  if (content.valueProp || content.aboutText) { home.sections.push(section('intro', OPTIMIZABLE, content.aboutHeadline || 'Welcome', content.valueProp || content.aboutText, content.valueProp ? 'content.valueProp' : 'content.aboutText')); mark(content.valueProp ? 'content.valueProp' : 'content.aboutText'); }
  if (services.length) { home.sections.push(section('services-overview', VERBATIM, 'Our Services', services.map(s => s.name).join(', '), 'services.offered')); }
  // Feature the practice's full roster, exactly as they present it.
  if (doctors.length === 1) {
    home.sections.push(section('doctor-intro', VERBATIM, doctors[0].name, doctors[0].bio || null, 'doctors[0]'));
  } else if (doctors.length > 1) {
    home.sections.push(section('providers', VERBATIM, 'Meet Our Doctors', doctors.map(d => d.name).join(', '), doctors.map((_, i) => `doctors[${i}]`).join(',')));
  }
  if (testimonials.length) { home.sections.push(section('testimonials', VERBATIM, 'What Patients Say', `${testimonials.length} reviews`, 'content.testimonials')); testimonials.forEach((_, i) => mark(`content.testimonials[${i}]`)); }
  if (content.stats && Object.values(content.stats).some(Boolean)) { home.sections.push(section('stats', VERBATIM, 'By the Numbers', JSON.stringify(content.stats), 'content.stats')); mark('content.stats'); }
  home.sections.push(section('cta', OPTIMIZABLE, 'Request an Appointment', null, null));
  pages.push(home);

  // ---- ABOUT --------------------------------------------------------------
  const about = { slug: '/about', title: 'About', role: 'about', sections: [] };
  if (content.aboutText) { about.sections.push(section('about', OPTIMIZABLE, content.aboutHeadline || 'About Us', content.aboutText, 'content.aboutText')); mark('content.aboutText'); }
  if (content.philosophy) { about.sections.push(section('philosophy', OPTIMIZABLE, 'Our Philosophy', content.philosophy, 'content.philosophy')); mark('content.philosophy'); }
  // Every doctor gets a featured bio — faithful to the practice's roster.
  doctors.forEach((d, i) => { about.sections.push(section('doctor-bio', VERBATIM, d.name, d.bio || null, `doctors[${i}]`)); mark(`doctors[${i}]`); });
  if (staff.length) { staff.forEach((s, i) => mark(`staff[${i}]`)); about.sections.push(section('team', VERBATIM, 'Our Team', `${staff.length} team members`, 'staff')); }
  // additionalContent: place ALL of it verbatim (rescued) — never omit. The
  // practice put it on their site; we reproduce it.
  additional.forEach((a, i) => {
    about.sections.push(section('rescued', VERBATIM, a.title || a.type, a.content, `content.additionalContent[${i}]`));
    mark(`content.additionalContent[${i}]`);
  });
  if (about.sections.length) pages.push(about);

  // ---- SERVICE PAGES (one per service) ------------------------------------
  services.forEach((s, i) => {
    const sp = { slug: `/services/${s.slug || slugify(s.name)}`, title: s.name, role: 'service', sourcePath: s.source || null, sections: [] };
    sp.sections.push(section('service-detail', OPTIMIZABLE, s.name, s.description || null, `services.offered[${i}]`));
    (s.details || []).forEach((d, di) => { sp.sections.push(section('service-fact', VERBATIM, null, d, `services.offered[${i}].details[${di}]`)); });
    sp.sections.push(section('cta', OPTIMIZABLE, 'Schedule a Consultation', null, null));
    pages.push(sp);
    mark(`services.offered[${i}]`);
  });

  // ---- FAQ ----------------------------------------------------------------
  if (faqs.length) {
    const fp = { slug: '/faqs', title: 'FAQs', role: 'faq', sections: [] };
    faqs.forEach((f, i) => { fp.sections.push(section('faq', VERBATIM, f.question, f.answer, `content.faqs[${i}]`)); mark(`content.faqs[${i}]`); });
    pages.push(fp);
  }

  // ---- FINANCIAL / INSURANCE ----------------------------------------------
  if (insurance.length || financing.length || payments.length) {
    const fin = { slug: '/financial', title: 'Insurance & Financing', role: 'financial', sections: [] };
    if (insurance.length) { fin.sections.push(section('insurance', VERBATIM, 'Insurance We Accept', insurance.join(', '), 'content.insurance')); insurance.forEach((_, i) => mark(`content.insurance[${i}]`)); }
    if (financing.length) { fin.sections.push(section('financing', VERBATIM, 'Financing Options', financing.join(', '), 'content.financingOptions')); financing.forEach((_, i) => mark(`content.financingOptions[${i}]`)); }
    if (payments.length) { fin.sections.push(section('payment', VERBATIM, 'Payment Methods', payments.join(', '), 'content.paymentMethods')); payments.forEach((_, i) => mark(`content.paymentMethods[${i}]`)); }
    pages.push(fin);
  }

  // ---- CONTACT ------------------------------------------------------------
  const contact = { slug: '/contact', title: 'Contact', role: 'contact', sections: [] };
  contact.sections.push(section('contact-info', VERBATIM, 'Contact Us',
    [address.full, practice.phone, practice.fax ? `Fax: ${practice.fax}` : null, practice.email].filter(Boolean).join(' · '),
    'practice+address'));
  if (practice.phone) mark('practice.phone'); if (practice.email) mark('practice.email'); if (practice.fax) mark('practice.fax');
  if (address.full) mark('address.full');
  if (merged.hours && !isEmptyHours(merged.hours)) { contact.sections.push(section('hours', VERBATIM, 'Office Hours', hoursText(merged.hours), 'hours')); mark('hours'); }
  if (areasServed.length) { contact.sections.push(section('areas-served', VERBATIM, 'Areas We Serve', areasServed.join(', '), 'content.areasServed')); areasServed.forEach((_, i) => mark(`content.areasServed[${i}]`)); }
  pages.push(contact);

  // ---- coverage bookkeeping: which merged items did NOT get placed ----
  // (announcements count as placed — captured, just flagged/not-featured.)
  const unplaced = computeUnplaced(merged, placed);

  return { pages, generated, announcements, unplaced, _placedKeys: [...placed] };
}

function isEmptyHours(h) {
  if (!h) return true;
  if (h.raw) return false;
  if (h.display && h.display.length) return false;
  if (h.byDay && Object.values(h.byDay).some(Boolean)) return false;
  return true;
}
function hoursText(h) {
  if (h.raw) return h.raw;
  if (h.display?.length) return h.display.map(d => `${d.day}: ${d.time}`).join(' / ');
  if (h.byDay) return Object.entries(h.byDay).filter(([, v]) => v).map(([k, v]) => `${k}: ${v}`).join(' / ');
  return '';
}

// Enumerate the information-bearing merged items and check each got placed.
function computeUnplaced(merged, placed) {
  const want = [];
  const c = merged.content || {};
  (merged.doctors || []).forEach((d, i) => want.push({ key: `doctors[${i}]`, label: `doctor ${d.name}` }));
  (merged.staff || []).forEach((s, i) => want.push({ key: `staff[${i}]`, label: `staff ${s.name}` }));
  (merged.services?.offered || []).forEach((s, i) => want.push({ key: `services.offered[${i}]`, label: `service ${s.name}` }));
  (c.testimonials || []).forEach((t, i) => want.push({ key: `content.testimonials[${i}]`, label: `testimonial ${t.author || i}` }));
  (c.faqs || []).forEach((f, i) => want.push({ key: `content.faqs[${i}]`, label: `faq ${(f.question||'').slice(0,30)}` }));
  (c.insurance || []).forEach((x, i) => want.push({ key: `content.insurance[${i}]`, label: `insurance ${x}` }));
  (c.financingOptions || []).forEach((x, i) => want.push({ key: `content.financingOptions[${i}]`, label: `financing ${x}` }));
  (c.paymentMethods || []).forEach((x, i) => want.push({ key: `content.paymentMethods[${i}]`, label: `payment ${x}` }));
  (c.areasServed || []).forEach((x, i) => want.push({ key: `content.areasServed[${i}]`, label: `area ${x}` }));
  (c.additionalContent || []).forEach((a, i) => want.push({ key: `content.additionalContent[${i}]`, label: `content ${(a.title||a.type||'').slice(0,30)}` }));
  if (c.aboutText) want.push({ key: 'content.aboutText', label: 'about text' });
  if (c.philosophy) want.push({ key: 'content.philosophy', label: 'philosophy' });
  if (c.heroTagline) want.push({ key: 'content.heroTagline', label: 'hero tagline' });
  if (merged.practice?.phone) want.push({ key: 'practice.phone', label: 'phone' });
  if (merged.practice?.email) want.push({ key: 'practice.email', label: 'email' });
  if (merged.practice?.fax) want.push({ key: 'practice.fax', label: 'fax' });
  if (merged.address?.full) want.push({ key: 'address.full', label: 'address' });
  if (merged.hours && !isEmptyHours(merged.hours)) want.push({ key: 'hours', label: 'hours' });

  return want.filter(w => !placed.has(w.key));
}
