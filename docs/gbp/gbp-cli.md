# Google Business Profile CLI

Manage reviews and posts from the terminal after setup ([gbp-setup-walkthrough.md](./gbp-setup-walkthrough.md)).

## Quick start

Already set up? Verify and go:

```bash
npm run gbp -- status
npm run gbp -- reviews --limit 5
```

First time? Follow **[gbp-setup-walkthrough.md](./gbp-setup-walkthrough.md)** (agency call) or run `npm run gbp -- login` after Part 1 Cloud steps in that doc.

**Docs:** [Setup](./gbp-setup-walkthrough.md) · [Offboarding](./gbp-offboarding.md) · [Practice call sheet](./gbp-client-browser-checklist.md)

## Commands

| Command | Description |
|---------|-------------|
| `npm run gbp -- login` | OAuth in browser; updates `.env` |
| `npm run gbp -- status` | Check env vars, token, and API ping |
| `npm run gbp -- reviews` | List reviews |
| `npm run gbp -- reply` | Post a review reply |
| `npm run gbp -- post` | Create a GBP local post |
| `npm run gbp -- locations` | List locations (IDs for `.env`) |
| `npm run gbp -- help` | Show usage |

Aliases: `npm run gbp:login` and `npm run gbp:status`.

### Reviews

```bash
npm run gbp -- reviews --limit 10
npm run gbp -- reviews --stars 4 --unanswered
```

Output includes `Review ID` for replies.

### Reply

```bash
npm run gbp -- reply --review-id REVIEW_ID --reply "Thank you for your kind words!"
```

### Post

```bash
npm run gbp -- post --text "New patient consultation special this month." \
  --cta-type BOOK --cta-url https://hbimplants.com/schedule
```

CTA types: `LEARN_MORE`, `CALL`, `SIGN_UP`, `ORDER`, `BUY`, `GET_OFFER`, `BOOK`

### Locations

```bash
npm run gbp -- locations
```

Use when switching accounts or confirming `GBP_LOCATION_ID`.

## `.env` variables

| Variable | Set by | Purpose |
|----------|--------|---------|
| `GBP_CLIENT_ID` | You (GCP) | OAuth client |
| `GBP_CLIENT_SECRET` | You (GCP) | OAuth secret |
| `GBP_REFRESH_TOKEN` | `login` | Long-lived auth |
| `GBP_ACCOUNT_ID` | `login` | GBP account |
| `GBP_LOCATION_ID` | `login` | Practice location |

Do not commit `.env`. Avoid storing `GBP_ACCESS_TOKEN` — it expires; scripts refresh automatically.

## Homepage vs CLI

| | Homepage (`index.astro`) | GBP CLI |
|--|--------------------------|---------|
| **When** | `npm run build` | On demand |
| **API** | Places API (public) | GBP API v4 (owner) |
| **Env** | `GOOGLE_PLACES_API_KEY`, `GOOGLE_PLACE_ID` | `GBP_*` OAuth vars |
| **Use** | Show ~3 testimonials + rating | Triage, reply, post |

## Legacy scripts

These still work; the dispatcher calls them:

- `node scripts/gbp-reviews.js`
- `node scripts/gbp-respond.js`
- `node scripts/gbp-post.js`
- `node scripts/gbp-list-locations.js`

Prefer `npm run gbp -- …` for consistency.

## Re-authenticate

Revoke access at [Google Account → Third-party access](https://myaccount.google.com/permissions), then:

```bash
npm run gbp -- login
```
