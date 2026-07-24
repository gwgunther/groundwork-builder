# Handoff checklist — founding client baseline

> Lifecycle phase: **preview live → handoff complete** (between Pitched and Signed/Live).  
> Hub: [CUSTOMER_JOURNEY.md](../lifecycle/CUSTOMER_JOURNEY.md)

Capture baseline measurements at handoff so you can publish attributed case studies at 60–90 days.

---

## When this runs

Automatically when `build-site.js --publish` completes **and ship gates pass** (`publish.js` → `baseline-capture.js`):

- Writes `clients/<slug>/_pipeline/baseline.json`
- Updates D1 Account: `Baseline PageSpeed`, `Baseline Ranks`, `Launch Date`, `Re-audit Due`

If ship gates **fail**, handoff is blocked — fix issues in `_pipeline/missing.html` first.

---

## Automated baseline (no action needed)

| Field | Source |
|-------|--------|
| Old-site mobile PageSpeed | `_audits/<slug>/_data/pagespeed.json` |
| New-site mobile PageSpeed | Live preview PageSpeed after publish |
| Launch Date | Date publish gates pass |
| Re-audit Due | Launch + 75 days (~60–90 window) |

---

## Manual steps (~20 min per founding client)

Complete these on the D1 Account row (ops dashboard) after preview goes live:

### 1. Local rank terms (3–5)

Until the GRADER keyword module ships, record manually in **Baseline Ranks**:

```
dentist [city], dental implants [city], emergency dentist [city], ...
```

Use the same terms at re-audit for apples-to-apples comparison.

### 2. Calls / forms baseline (optional)

If the practice shares analytics:

- Monthly contact form submissions (avg last 3 months)
- Monthly phone calls from website (if tracked)

Add to Account notes or a custom field until a dedicated column exists.

### 3. Case study consent

At handoff, confirm in intake / Account:

- `case_study_consent`: yes / no / pending
- `consent_scope`: performance-only / named results / none

Store in `clients/<slug>/intake.json` under `content.case_study_consent` or D1 **intake_json**.

**Rule:** Launch on artifact performance (PageSpeed, accessibility). Graduate to outcome claims (calls, rankings) only with named consent.

### 4. Ship gates verified

Confirm `_pipeline/12-ship-gates.json` shows `"passed": true`:

- Mobile PageSpeed ≥ 90
- Lighthouse accessibility ≥ 90
- 0 axe critical/serious violations

**Built-in a11y (proactive):** Template includes skip link, keyboard focus rings, and `prefers-reduced-motion`. Pipeline Phase 3c-ter/3f fills missing image alt text. Axe post-build is still the verification gate.

See [BUILD_BEST_PRACTICES.md](../engineering/BUILD_BEST_PRACTICES.md) §10.

---

## Re-audit at 60–90 days

When **Re-audit Due** approaches:

```bash
node scripts/pipeline/audit-site.js --url https://their-domain.com
```

Compare new `_audits/<slug>/_data/pagespeed.json` to `clients/<slug>/_pipeline/baseline.json`.

Use attributed template (only with consent):

> "[Practice Name] went from mobile PageSpeed [X] to [Y] in [N] days after launching their Groundwork site."

---

## D1 fields (accounts table)

Add these columns if missing:

| Field | Type | Set by |
|-------|------|--------|
| Baseline PageSpeed | Number | `baseline-capture.js` |
| Baseline Ranks | Long text | Auto placeholder → you fill terms |
| Launch Date | Date | `baseline-capture.js` |
| Re-audit Due | Date | `baseline-capture.js` |
| Intake JSON | Long text | Manual / onboarding form |

---

## Related

- Ship gates: `scripts/pipeline/lib/ship-gates.js`
- Baseline writer: `scripts/pipeline/lib/baseline-capture.js`
- Care plan (separate SOW): sites hand off with no Groundwork runtime dependency
