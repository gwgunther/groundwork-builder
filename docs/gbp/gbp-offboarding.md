# Google Business Profile API — Offboarding (remove agency access)

Use this when the practice **no longer wants you** to manage GBP via the CLI, Cloud Console, or Business Profile dashboard — or when the engagement ends and they will operate everything themselves or with another vendor.

**Goal:** Revoke API access (refresh token), remove your Google Cloud and Business Profile roles, and delete secrets from your machines.

This doc is a living checklist — add practice-specific steps under [Custom additions](#custom-additions) as needed.

---

## Who does what

| Action | Practice (client) | Operator (you) |
|--------|-------------------|------------------|
| Revoke OAuth app (kills refresh token) | **Yes** — required | Delete your `.env` lines |
| Remove you from Cloud IAM | **Yes** — recommended | — |
| Remove you from GBP Managers | **Yes** — recommended | — |
| Delete OAuth client / Cloud project | Optional (their choice) | — |
| Delete local copies of secrets | — | **Yes** |

The practice should complete their steps even if you delete your `.env` first — otherwise your refresh token may still work until they revoke the app.

---

## Recommended order

```text
1. Practice revokes OAuth app (immediate API stop)
2. Practice removes operator from IAM + Business Profile
3. Operator deletes GBP_* from .env and any password manager
4. (Optional) Practice disables or deletes Cloud resources
```

---

## Step 1 — Practice: revoke OAuth access (most important)

This invalidates the **refresh token** in your `.env`. Your `npm run gbp` commands will stop working immediately.

**Owner Google account** (who clicked Allow during setup):

1. Go to [myaccount.google.com/permissions](https://myaccount.google.com/permissions).
2. Find the app name from setup (e.g. `Practice GBP tools` / OAuth consent app name).
3. Select it → **Remove access** / **Revoke**.

**Verify (operator):** From your laptop:

```bash
npm run gbp -- status
```

Expect OAuth or API failure after revocation.

---

## Step 2 — Practice: remove operator from Google Cloud IAM

Removes your ability to open their Cloud project in [console.cloud.google.com](https://console.cloud.google.com/).

1. Cloud Console → select **their** project.
2. **IAM & Admin** → **IAM**.
3. Find your agency Gmail.
4. **Delete** the principal (trash icon) or **Edit** → remove roles → save.

You should no longer see the project in your project picker (after refresh).

---

## Step 3 — Practice: remove operator from Business Profile

Removes your access to [business.google.com](https://business.google.com/) for their location.

1. Sign in as practice account.
2. Open the correct **location**.
3. **Settings** / **People and access** / **Managers**.
4. Find your agency Gmail → **Remove** / **Revoke access**.

---

## Step 4 — Operator: delete local secrets

On **every** machine and backup where you stored credentials:

### 4.1 Repo `.env`

Edit `<repo>/.env` and **remove** (or clear) these lines:

```env
GBP_CLIENT_ID=
GBP_CLIENT_SECRET=
GBP_REFRESH_TOKEN=
GBP_ACCOUNT_ID=
GBP_LOCATION_ID=
```

Do not commit `.env` to git.

### 4.2 Password manager

Delete any vault item created for this practice (GBP API / Client ID / refresh token).

### 4.3 Optional

- Remove practice-specific notes, 1:1 call recordings with credentials visible, or exported `.env` backups.
- If you use CI secrets for GBP (uncommon for this CLI), remove GitHub/Cloudflare secrets for that client.

---

## Step 5 — Practice (optional): disable or tear down Cloud resources

Only if they will **not** use the API again themselves or with another agency.

| Option | When | Rough steps |
|--------|------|-------------|
| **Disable OAuth client** | Keep project, stop new logins | **Credentials** → OAuth client → disable or delete |
| **Disable APIs** | Reduce attack surface | **APIs & Services** → **Enabled APIs** → disable GBP APIs |
| **Delete project** | Full removal | **IAM & Admin** → **Settings** → **Shut down** project (irreversible after deletion period) |

Deleting the project destroys Client ID/secret and any billing linkage to that project. They still keep their Business Profile listing — it is separate from Cloud.

---

## What still works after offboarding

| Item | After revoke + IAM removal |
|------|----------------------------|
| Their public Google listing | Unchanged |
| Their website | Unchanged |
| Your `npm run gbp` commands | **Stop** (no valid token) |
| Your Cloud Console access | **Gone** (after IAM removal) |
| Your Business Profile dashboard access | **Gone** (after Manager removal) |

**Homepage reviews** via Places API (`GOOGLE_PLACES_API_KEY`) are unrelated — remove those separately if you were also managing website build secrets.

---

## Email template for the practice

Copy and adjust:

```text
Subject: Removing [Agency] access to Google Business Profile tools

Hi [Name],

As requested, here’s how we’re disconnecting our GBP management access:

1. Please revoke our app: https://myaccount.google.com/permissions
   (App name: [OAuth app name from setup])

2. Please remove [your@agency.com] from:
   - Google Cloud Console → IAM (Editor role)
   - Google Business Profile → Managers for [location name]

We have deleted our local API credentials on our side.

If you work with a new partner, they can set up a new Cloud project or reuse yours — [gbp-setup-walkthrough.md](./gbp-setup-walkthrough.md)

Thanks,
[You]
```

---

## Re-onboarding later

If they hire you again:

- If OAuth was only revoked: Part 2 (`login`) on a new call may be enough; same Client ID/secret if unchanged.
- If OAuth client or project was deleted: full [gbp-setup-walkthrough.md](./gbp-setup-walkthrough.md) Part 1 + Part 2.
- New refresh token; old token in deleted backups must not be reused.

---

## Custom additions

_Add practice- or agency-specific steps here (e.g. remove from Slack, stop Zapier, cancel retainer tools)._

| Tool / access | Removed? | Date | Notes |
|---------------|----------|------|-------|
| | | | |
| | | | |

---

## Offboarding checklist (printable)

**Practice**

- [ ] Revoke app at [myaccount.google.com/permissions](https://myaccount.google.com/permissions)
- [ ] Remove operator from Cloud IAM (**Editor**)
- [ ] Remove operator from Business Profile (**Manager**)
- [ ] (Optional) Disable/delete OAuth client or project
- [ ] Confirm with operator that access is removed

**Operator**

- [ ] `npm run gbp -- status` fails (confirms revoke) or skip if already deleted `.env`
- [ ] Deleted all `GBP_*` lines from `.env` on all machines
- [ ] Deleted password manager / backup copies
- [ ] Removed custom rows from table above
- [ ] Sent confirmation email (optional)
