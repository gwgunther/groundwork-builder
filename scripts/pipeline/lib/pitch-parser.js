/**
 * Tiny parser for `scripts/pipeline/config/pitch.md`.
 *
 * The pitch file is the *only* place in the codebase where pre-written
 * user-facing copy lives — and that copy is OUR pitch (Groundwork) to the
 * practice owner, not site copy. Both `one-pager.js` and `external-report.js`
 * render it.
 */

export function parsePitch(raw) {
  const lines = raw.split('\n');
  const result = {
    headline: '',
    subheadline: '',
    valueProps: [],
    engagement: { whatYouGet: [], nextStep: '' },
  };
  let mode = null;
  let subMode = null;
  let currentVP = null;

  for (const line of lines) {
    if (/^headline:\s*/.test(line)) {
      result.headline = line.replace(/^headline:\s*/, '').trim();
      mode = null; subMode = null;
      continue;
    }
    if (/^subheadline:\s*/.test(line)) {
      result.subheadline = line.replace(/^subheadline:\s*/, '').trim();
      mode = null; subMode = null;
      continue;
    }
    if (/^valueProps:\s*$/.test(line)) { mode = 'valueProps'; subMode = null; continue; }
    if (/^engagement:\s*$/.test(line)) { mode = 'engagement'; subMode = null; continue; }

    if (mode === 'valueProps') {
      const titleMatch = line.match(/^\s*-\s*title:\s*(.+)$/);
      if (titleMatch) {
        currentVP = { title: titleMatch[1].trim(), body: '' };
        result.valueProps.push(currentVP);
        continue;
      }
      const bodyMatch = line.match(/^\s+body:\s*(.+)$/);
      if (bodyMatch && currentVP) {
        currentVP.body = bodyMatch[1].trim();
        continue;
      }
    }

    if (mode === 'engagement') {
      if (/^\s+whatYouGet:\s*$/.test(line)) { subMode = 'whatYouGet'; continue; }
      if (/^\s+nextStep:\s*/.test(line)) {
        result.engagement.nextStep = line.replace(/^\s+nextStep:\s*/, '').trim();
        subMode = null;
        continue;
      }
      if (subMode === 'whatYouGet') {
        const m = line.match(/^\s+-\s+(.+)$/);
        if (m) result.engagement.whatYouGet.push(m[1].trim());
      }
    }
  }
  return result;
}
