# Audit data architecture

> **Lifecycle context:** Audit + preview-request = journey phases ②–③. Full map → [../../../docs/lifecycle/CUSTOMER_JOURNEY.md](../../../docs/lifecycle/CUSTOMER_JOURNEY.md).

One scan emits **`audit-data.json`** (`groundwork-audit/v1`). HTML reports are renders only.

## Outputs (audit-site.js)

| File | Audience | Purpose |
|------|----------|---------|
| `audit-data.json` | Machines + operators | Source of truth |
| `audit-summary.html` | Prospect | Sales one-pager (hosted as `/audits/<slug>/`) |
| `precall-brief.html` | Operator | Slim pre-call doc (`npm run audit:precall`) |
| `audit-report.html` | Prospect | Full tabbed deep-dive |
| `build-spec.html` | Operator / builder agent | Human-readable view of entire JSON |

## Pipeline modules

- `lib/audit-data-assembler.js` — scanners → JSON
- `lib/audit-data-copy.js` — consumer phrasing templates (never numbers)
- `lib/sales-audit-renderer.js` — JSON → `audit-summary.html`
- `lib/build-spec-renderer.js` — JSON → `build-spec.html`
- `lib/audit-report-generator.js` — orchestrates writes + full report

## Regen without re-scrape

```bash
node scripts/pipeline/regen-reports.js --audit-dir _audits/<slug>
```

Requires `_data/findings.json`, `_data/pagespeed.json`, `_data/silver.json`. For full evidence tables, `_data/bronze-pages.json` (saved on new audits).

## Not the same as build pipeline one-pager

`_pipeline/one-pager.html` from `build-site.js` is a **post-build redesign brief**. The audit sales doc is **`audit-summary.html`**.

## Preview request (lead capture)

The sales one-pager CTA opens a form (name, email, phone, role, message). Submitting:

1. Upserts **Airtable** Account (`Preview Requested`) + Build (`Queued`) + updates Audit
2. Optionally dispatches **`.github/workflows/audit-preview-build.yml`** when `GITHUB_TOKEN` is set
3. Prospect sees a thank-you — full audit + preview site are **emailed later**, not shown inline

**API:** `POST https://groundworkdental.com/api/audit-preview-request`  
(Copied to groundwork-dental `functions/` on `hostAuditReport`. Local dev: Studio `POST /api/audit-preview-request` or `request-preview.js` CLI.)

**Airtable fields** (add if missing): Account `Contact Name`, `Lifecycle Stage` = Preview Requested; Build `Queued` status, `Request Notes`, `Contact Name/Email/Phone/Role`; Audit status `Preview Requested`.

## Rescan

`runRescan()` refreshes **baseline** artifacts from original `findings.json`, then writes `audit-report-after.html` from preview scan. It does **not** overwrite `audit-data.json` with post-build findings.
