# Operator onboarding playbook — Signed → Live

> Lifecycle stage: **Signed → Onboarding → Live**  
> Pre-requisite: Audit run, pitch delivered, contract signed.  
> Related: [gbp-setup-walkthrough.md](../gbp/gbp-setup-walkthrough.md) · [HANDOFF.md](./HANDOFF.md) · [CUSTOMER_JOURNEY.md](../lifecycle/CUSTOMER_JOURNEY.md)

---

## Phase 1 — Before the call (you, ~20 min)

### 1.1 Run the existing-site audit

```bash
npm run audit -- --url https://their-current-site.com --source manual
```

This runs the full SEO + AEO + tech audit and saves results under `_audits/<slug>/`. You'll use the findings to prioritize what intake info matters most.

### 1.2 Update lifecycle stage in Airtable

```
Account → Lifecycle Stage → Onboarding
```

Or via code: `setAccountLifecycle(slug, 'Onboarding')` in `airtable.js`.

### 1.3 Create the client directory

```bash
mkdir -p clients/<slug>
```

Where `<slug>` is the kebab-case practice name (e.g. `riverside-family-dental`). This matches the Airtable Account slug.

### 1.4 Send the pre-call email

Send two attachments before the call:
- **[gbp-client-browser-checklist.md](../gbp/gbp-client-browser-checklist.md)** — what they'll do on screen share (non-technical one-pager)
- The **intake questionnaire** (see Phase 2 — send as a Google Doc or typeform; you need answers before you build)

---

## Phase 2 — Collect from the practice (async, before or during call)

Everything below feeds `intake.json`. Send as a form or Google Doc; fill it in yourself if you collected it verbally on a call. Store the result at `clients/<slug>/intake.json` **or** paste into the Airtable Account's `Intake JSON` field.

Template: [`docs/onboarding/intake-template.json`](./intake-template.json)

### Practice basics

| What | Notes |
|------|-------|
| **Legal / trading name** | Exactly as it appears on their GBP and signage |
| **Phone number** | Main patient-facing line |
| **Email** | Public patient-facing email |
| **Website domain** | Current domain they want to keep |
| **Street address** | Full address with suite |
| **City, state, ZIP** | |
| **Office hours** | All days, including "closed" days |

### Doctor / team

| What | Notes |
|------|-------|
| **Doctor first + last name** | |
| **Credentials** | DDS, DMD, MS, etc. |
| **Short bio** | 2–4 sentences; what they want patients to know |
| **Education / residency** | School, program, year (only what's true) |
| **Headshot photo** | High-res JPG or PNG; not a selfie |
| **Healthgrades profile URL** | For sameAs schema (entity authority) |
| **LinkedIn URL** | Optional but adds entity signal |
| **Zocdoc / Vitals URLs** | If they have them |

### Services

| What | Notes |
|------|-------|
| **List of services offered** | One per line; these become service pages |
| **Primary / flagship service** | The one they most want to rank for |
| **Services they do NOT offer** | To avoid the pipeline pulling them from scrape |

### Brand

| What | Notes |
|------|-------|
| **Logo file** | SVG preferred; PNG acceptable (transparent background) |
| **Primary color** | Hex code, or "match our existing site" |
| **Secondary / accent color** | If known |
| **Font preference** | Or "use your judgment" |

### Photos

| What | Notes |
|------|-------|
| **Exterior photo** | Storefront / building |
| **Waiting room** | |
| **Treatment room(s)** | |
| **Team photo** | |
| **Before / after cases** | Only with patient consent; optional |

### Content

| What | Notes |
|------|-------|
| **Patient FAQs** | Real questions they hear; 5–10 is ideal |
| **Testimonials** | Real patient quotes (attribution optional) |
| **Insurance plans accepted** | List; "PPO only", "Delta Dental", etc. |
| **Financing options** | CareCredit, in-house plans, etc. |
| **Scheduling software** | Dentrix, NexHealth, Zocdoc, etc. (for booking button link) |
| **Case study consent** | yes / no / pending |

### Accounts and access needed

These are permissions, not passwords. You never need their Google password.

| What | How you get it | Why |
|------|----------------|-----|
| **GBP owner access** | They add you as Manager during setup call | CLI tools for reviews, posts; profile completion |
| **Google Cloud project** (Client ID + Secret) | They create it on the call; you paste into `.env` | GBP API auth |
| **Domain registrar login** | They share (or their IT does) | DNS cutover at go-live |
| **DNS access** | Cloudflare, GoDaddy, Namecheap, etc. | Point domain to new hosting |
| **Current hosting** | Read-only is fine | Understand what's there; not required to build |
| **Google Analytics (existing)** | They add you as Editor | Transfer property or link to new one |
| **Google Search Console (existing)** | They add you as Owner | Submit sitemap, request indexing, verify coverage |
| **Social profile URLs** | They provide | Populate `sameAs` in LocalBusiness schema |

Social URLs to collect:
- [ ] Facebook page URL
- [ ] Instagram profile URL
- [ ] Yelp listing URL
- [ ] Healthgrades listing URL
- [ ] Google Maps listing URL (share from Maps)

---

## Phase 3 — Setup call (~60 min)

Agenda: GBP API setup (Part 1 + Part 2 from the [walkthrough](../gbp/gbp-setup-walkthrough.md)), any outstanding intake questions, DNS discussion.

### Before the call starts (your machine)

```bash
# Confirm repo is ready
npm install

# Confirm .env has empty GBP_* fields (you'll fill during call)
grep GBP_ .env
```

### Part 1 — Their screen share (~35 min)

Walk them through [gbp-setup-walkthrough.md Part 1](../gbp/gbp-setup-walkthrough.md#part-1--google-cloud-practice-browser-on-the-call):

1. Create Google Cloud project
2. Enable Business Profile API
3. Configure OAuth consent screen
4. Request API access (**note:** this step can take days — book a follow-up if needed)
5. Create Client ID + Client secret → they read it to you, you paste into `.env`:

```
GBP_CLIENT_ID=...
GBP_CLIENT_SECRET=...
```

6. Add you as Editor in Cloud Console IAM
7. Add you as Manager on their Business Profile

### Part 2 — Your screen share + their remote control (~15 min)

Walk through [gbp-setup-walkthrough.md Part 2](../gbp/gbp-setup-walkthrough.md#part-2--cli-login-your-terminal):

```bash
npm run gbp -- login
```

Browser opens on your machine → they take remote control (Zoom: Request Remote Control) → sign in with their Google account → click Allow.

### Verify the connection

```bash
npm run gbp -- status
npm run gbp -- locations
npm run gbp -- reviews --limit 3
```

All three should succeed. `locations` gives you the `GBP_LOCATION_ID` — add it to `.env`:

```
GBP_LOCATION_ID=accounts/XXXXXX/locations/YYYYYY
```

Save `.env` values to your password manager. They don't get committed.

---

## Phase 4 — Create intake.json

Fill in `clients/<slug>/intake.json` from everything collected in Phase 2. Use the template:

```bash
cp docs/onboarding/intake-template.json clients/<slug>/intake.json
# then edit it
```

Or paste the filled JSON into the Airtable Account's `Intake JSON` field if you prefer Airtable as the source of truth.

Verify the pipeline can load it:

```bash
node -e "
import('./scripts/pipeline/lib/intake.js').then(m =>
  m.loadIntake({ filePath: 'clients/<slug>/intake.json' }).then(d => console.log(JSON.stringify(d, null, 2)))
)
"
```

No errors = ready to build.

---

## Phase 5 — Build the site

```bash
# Full build (scrape + merge + generate + publish to preview URL)
node scripts/pipeline/build-site.js --slug <slug> --publish

# Or via npm start (prompts for slug if not passed)
npm start
```

Preview URL will be: `https://<slug>.groundworkdental.com`

Check `clients/<slug>/_pipeline/` for phase outputs. If anything looks wrong:

```bash
# See the merged data (what the builder used)
cat clients/<slug>/_pipeline/02-merged.json | jq .

# See audit findings the builder responded to
cat _audits/<slug>/_data/findings.json | jq .
```

Ship gates must pass before go-live (`_pipeline/12-ship-gates.json` → `"passed": true`):
- Mobile PageSpeed ≥ 90
- Lighthouse accessibility ≥ 90
- 0 axe critical/serious violations

---

## Phase 6 — Complete the GBP profile via CLI + browser

The CLI handles reviews and posts. Profile fields (categories, description, hours, photos, Q&A) are done via the GBP web UI — you access it as Manager.

### Via CLI

```bash
# Pull and review existing reviews
npm run gbp -- reviews --unanswered

# Reply to a review (prompts for review ID and reply text)
npm run gbp -- reply

# Publish a post (new service, offer, etc.)
npm run gbp -- post

# Check current listing status
npm run gbp -- status
```

### Via browser (business.google.com — log in as their account or use Manager access)

Work through this list after getting Manager access:

- [ ] **Primary category**: Dentist (+ secondary: Cosmetic Dentist, Pediatric Dentist, Emergency Dental Service as applicable)
- [ ] **Business description**: 750 characters, written in their voice, includes city + primary service
- [ ] **Hours**: all days including exceptions (holidays)
- [ ] **Services**: add each service from intake with a short description
- [ ] **Attributes**: wheelchair accessible, parking, insurance accepted, languages, etc.
- [ ] **Website link**: points to final domain (not preview URL — update at go-live)
- [ ] **Photos**: minimum 10 — exterior, waiting room, treatment room, team, doctor headshot
- [ ] **Q&A**: plant 3–5 common patient questions with answers ("Do you accept Delta Dental?" "Is parking available?")
- [ ] **Social links**: add Facebook, Instagram under Info → Social profiles

---

## Phase 7 — DNS cutover and go-live

### Before cutting DNS

- [ ] Preview site reviewed and approved (send them the `<slug>.groundworkdental.com` URL)
- [ ] Ship gates passed
- [ ] GBP website link ready to update
- [ ] Old site backup saved
- [ ] Domain registrar login in hand

### DNS records to set

Point the domain to Cloudflare Pages (or wherever the site is deployed). Exact records depend on the hosting setup — check `public/` or `deploy/` for the deployed URL and use that as the CNAME target.

Typical Cloudflare Pages setup:

```
CNAME  @    <slug>.pages.dev   (or the assigned Pages domain)
CNAME  www  <slug>.pages.dev
```

DNS propagation: 5 min to a few hours depending on TTL.

### Immediately after DNS propagates

```bash
# Verify the site is live on their domain
curl -I https://their-domain.com

# Run a post-launch audit
npm run audit -- --url https://their-domain.com --source manual
```

- [ ] Update GBP website link to the real domain (`business.google.com` → Info → Website)
- [ ] Submit sitemap in Google Search Console:
  - Open [search.google.com/search-console](https://search.google.com/search-console)
  - Add property (domain property preferred) → verify via DNS TXT record or HTML file
  - Sitemaps → submit `https://their-domain.com/sitemap.xml`
- [ ] Request indexing on key pages via URL Inspection tool (homepage, each service page)
- [ ] Update Airtable lifecycle: `Onboarding → Live`

```
Account → Lifecycle Stage → Live
```

---

## Phase 8 — Post-launch baseline (automated)

`build-site.js --publish` triggers `baseline-capture.js` when ship gates pass, writing:

- `clients/<slug>/_pipeline/baseline.json`
- Airtable Account: `Baseline PageSpeed`, `Launch Date`, `Re-audit Due` (75 days out)

### Manual steps after launch (~20 min)

See [HANDOFF.md](./HANDOFF.md) for full detail. Summary:

1. **Record 3–5 local rank terms** in Airtable `Baseline Ranks` (e.g. "dentist Austin", "dental implants Austin", "emergency dentist Austin")
2. **Confirm case study consent** is set in intake or Airtable
3. **Re-audit is scheduled** — `Re-audit Due` field should be ~75 days from `Launch Date`

---

## Quick-reference — all CLI commands in order

```bash
# 1. Audit existing site (before call)
npm run audit -- --url https://old-site.com

# 2. Prep .env for GBP (before call)
grep GBP_ .env

# 3. GBP login (during call)
npm run gbp -- login

# 4. Verify GBP connection (during call)
npm run gbp -- status
npm run gbp -- locations
npm run gbp -- reviews --limit 3

# 5. Load + verify intake.json (after call)
node -e "import('./scripts/pipeline/lib/intake.js').then(m => m.loadIntake({ filePath: 'clients/<slug>/intake.json' }).then(console.log))"

# 6. Build + publish to preview
node scripts/pipeline/build-site.js --slug <slug> --publish

# 7. Inspect merged data
cat clients/<slug>/_pipeline/02-merged.json | jq .

# 8. Post-launch audit
npm run audit -- --url https://their-domain.com

# 9. GBP: pull unanswered reviews
npm run gbp -- reviews --unanswered

# 10. GBP: post an update
npm run gbp -- post
```

---

## Checklist summary

- [ ] Existing-site audit run
- [ ] Lifecycle → Onboarding
- [ ] Pre-call email + attachments sent
- [ ] Intake questionnaire received and complete
- [ ] `clients/<slug>/intake.json` created (or Airtable `Intake JSON` filled)
- [ ] Setup call done: GBP API auth working (`npm run gbp -- status` passes)
- [ ] `.env` has `GBP_CLIENT_ID`, `GBP_CLIENT_SECRET`, `GBP_LOCATION_ID`, refresh token
- [ ] Build complete; ship gates pass
- [ ] Preview approved by practice
- [ ] GBP profile complete (categories, description, hours, services, 10+ photos, Q&A)
- [ ] DNS cutover done
- [ ] Post-launch audit clean
- [ ] GBP website link updated to real domain
- [ ] Search Console: sitemap submitted, indexing requested
- [ ] Lifecycle → Live
- [ ] Baseline rank terms recorded in Airtable
- [ ] Re-audit Due date set (~75 days)
