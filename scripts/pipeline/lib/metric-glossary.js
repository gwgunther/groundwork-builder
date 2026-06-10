/**
 * Plain-English definitions for Google Lighthouse / Core Web Vitals metrics.
 * Used in audit findings and report UI so acronyms are always spelled out.
 */

export const LIGHTHOUSE_METRICS = {
  lcp: {
    acronym: 'LCP',
    name: 'Largest Contentful Paint',
    shortDesc: 'How long until the main visible content loads — usually the hero image, headline, or largest text block.',
    thresholds: { good: '2.5s', poor: '4.0s' },
  },
  cls: {
    acronym: 'CLS',
    name: 'Cumulative Layout Shift',
    shortDesc: 'How much the page jumps around while loading — buttons or text shifting under the user\'s finger.',
    thresholds: { good: '0.1', poor: '0.25' },
  },
  fcp: {
    acronym: 'FCP',
    name: 'First Contentful Paint',
    shortDesc: 'How long until anything first appears on screen (text, image, or background).',
    thresholds: { good: '1.8s', poor: '3.0s' },
  },
  tbt: {
    acronym: 'TBT',
    name: 'Total Blocking Time',
    shortDesc: 'How long the page is unresponsive to taps and scrolls while JavaScript runs.',
    thresholds: { good: '200ms', poor: '600ms' },
  },
  si: {
    acronym: 'SI',
    name: 'Speed Index',
    shortDesc: 'How quickly the page visually fills in — a perceived-load score.',
    thresholds: { good: '3.4s', poor: '5.8s' },
  },
  tti: {
    acronym: 'TTI',
    name: 'Time to Interactive',
    shortDesc: 'How long until the page is fully ready to respond to clicks and form input.',
    thresholds: { good: '3.8s', poor: '7.3s' },
  },
};

/**
 * @param {'lcp'|'cls'} key
 * @param {number|null|undefined} value - LCP in ms; CLS as unitless score
 */
export function formatMetricFindingDetail(key, value) {
  const m = LIGHTHOUSE_METRICS[key];
  if (!m) return null;

  if (value == null) {
    return `${m.name} (${m.acronym}) was not measured.`;
  }

  if (key === 'lcp') {
    const sec = (value / 1000).toFixed(2);
    return `${m.name} (${m.acronym}) is ${sec}s — ${m.shortDesc} Google threshold: under ${m.thresholds.good} good, under ${m.thresholds.poor} poor.`;
  }

  if (key === 'cls') {
    const display = typeof value === 'number' ? value.toFixed(3) : value;
    return `${m.name} (${m.acronym}) is ${display} — ${m.shortDesc} Google threshold: under ${m.thresholds.good} good, under ${m.thresholds.poor} poor.`;
  }

  return null;
}
