# Google Business Profile API — Setup walkthrough (agency + practice)

Generic guide for connecting a **client-owned** Google Cloud project to the **GBP CLI** in this repo (`npm run gbp`). The practice owns Google Cloud and the Business Profile; you operate the tools from your laptop after one setup call.

**Related docs**

| Doc | Use for |
|-----|---------|
| [CUSTOMER_JOURNEY.md](../lifecycle/CUSTOMER_JOURNEY.md) | Where GBP setup fits in the client lifecycle (onboarding) |
| [gbp-cli.md](./gbp-cli.md) | Daily commands after setup |
| [gbp-offboarding.md](./gbp-offboarding.md) | Remove access when the engagement ends |
| [gbp-client-browser-checklist.md](./gbp-client-browser-checklist.md) | Short “what to expect” email for the practice |

---

## What you are setting up

| Piece | Owner | Purpose |
|-------|--------|---------|
| Google Cloud project | Practice | APIs + OAuth app |
| Google Business Profile | Practice | The real listing |
| OAuth Client ID + secret | Practice’s Cloud project | Identifies your CLI app |
| Refresh token + account/location IDs | Created at login; stored in **your** `.env` | Lets you call the API from your laptop |

You never need the practice’s Google **password**.

**Not included here:** homepage reviews via Places API (`GOOGLE_PLACES_API_KEY`) — separate from GBP management.

---

## Overview — one call, two parts

| Part | When | Who shares screen | Tools |
|------|------|-------------------|--------|
| **0** | Before call (~10 min) | — | **You:** Node, repo, `npm install`, `.env` |
| **1** | Call ~35 min | **Practice** | **They:** Chrome → Cloud Console + Business Profile |
| **2** | Call ~15 min | **You** | **You:** Terminal + Chrome on your laptop; **they:** remote control for Google sign-in |

**Scheduling note:** Google’s [Business Profile API access request](#part-1--step-4-request-api-access) can take **days**. You can finish Part 1 on the first call and book a **short follow-up** for Part 2 only after approval.

---

## Part 0 — Operator prep (your laptop, before the call)

Do this once per machine you will use for `npm run gbp`.

### 0.1 Install Node.js

1. Go to [nodejs.org](https://nodejs.org).
2. Download the **LTS** installer (20 or newer).
3. Install with defaults.
4. Open Terminal and verify:

   ```bash
   node -v
   ```

   You should see `v20.x.x` or higher.

### 0.2 Get the repo

1. Clone the project (or open your existing client copy).
2. `cd` into the folder that contains `package.json`.

   Example:

   ```bash
   cd ~/Projects/hbimplants
   ```

### 0.3 Install dependencies

```bash
npm install
```

Wait until it completes without errors.

### 0.4 Create `.env`

If you do not already have `.env` in the repo root:

```bash
cp .env.example .env
```

Leave `GBP_*` values empty for now. You will fill them during the call.

### 0.5 Test the CLI help (optional)

```bash
npm run gbp -- help
```

If this prints usage text, Part 0 is done.

---

## Part 1 — Google Cloud (practice browser, on the call)

### Before Part 1 starts

- **Video:** Zoom, Google Meet, or similar.
- **Practice screen share:** They share their screen.
- **Google account:** They must be signed in as the account that **manages** the Business Profile (usually the owner’s Gmail).
- **Your role:** Read each step below aloud; they click.

They do **not** install Node, git, or Terminal.

---

### Part 1 — Step 1: Create a Google Cloud project

1. Open [console.cloud.google.com](https://console.cloud.google.com/).
2. Top bar → **project dropdown** (may say “Select a project”).
3. **New Project**.
4. **Project name:** e.g. `Riverside Dental GBP` (any clear name).
5. **Create**.
6. Wait ~30 seconds.
7. Project dropdown again → **select** the new project.
8. Confirm the project name appears in the top bar. All following steps use **this** project.

---

### Part 1 — Step 2: Enable three APIs

Left menu → **APIs & Services** → **Library**.

For each API: search → open → **Enable** → go back to Library.

| Order | Search for | Action |
|-------|------------|--------|
| 1 | `My Business Account Management API` | Enable |
| 2 | `Google My Business API` | Enable |
| 3 | `My Business Business Information API` | Enable |

Optional: `My Business Lodging API` if post creation fails later.

**Verify:** **APIs & Services** → **Enabled APIs & services** — all three required APIs are listed.

If an API does not appear in search, complete Step 4 first and retry after Google approves access.

---

### Part 1 — Step 3: OAuth consent screen

Left menu → **APIs & Services** → **OAuth consent screen**.

1. **User type:** **External** → **Create** (if prompted).
2. **App information**
   - App name: e.g. `Practice GBP tools`
   - User support email: practice email
   - Logo: skip
3. **App domain:** leave blank.
4. **Developer contact:** at least one email → **Save and Continue**.
5. **Scopes** → **Add or Remove Scopes**
   - Search: `business.manage`
   - Select: `https://www.googleapis.com/auth/business.manage`
   - **Update** → **Save and Continue**
6. **Test users** — only if status is **Testing**:
   - **Add users** → owner’s Gmail (same account signed in now)
   - **Save and Continue**
7. **Summary** → **Back to Dashboard**.

**Publishing status: Testing** is fine for one practice. It does **not** mean a fake listing — it only limits who can click **Allow** in Part 2 to emails you listed.

---

### Part 1 — Step 4: Request API access

Google must approve Business Profile API use per project.

1. Open [GBP API prerequisites](https://developers.google.com/my-business/content/prereqs).
2. Submit the access request for **this project** (follow Google’s current form/process).
3. Wait for Google’s approval email (often several days).

**If approval is not in yet:** complete Steps 1–3, 5–7 today; schedule Part 2 when the email arrives.

**If approval is in:** continue to Part 2 on the same call.

---

### Part 1 — Step 5: Create OAuth Client ID and secret

Left menu → **APIs & Services** → **Credentials**.

1. **+ Create Credentials** → **OAuth client ID**.
2. If asked to configure consent screen → already done in Step 3.
3. **Application type:** **Desktop app**.
4. **Name:** e.g. `gbp-cli-desktop`.
5. **Create**.
6. Popup shows **Client ID** and **Client secret**:
   - **Leave open**, or
   - Practice copies both into **Notes** on their computer (not email/SMS to you).
7. To view again later: **Credentials** → click the Desktop client name.
8. If **Authorized redirect URIs** exists, add:

   ```text
   http://127.0.0.1:3456/oauth2callback
   ```

   → **Save**. If the field does not exist, skip.

You will copy these two values into your `.env` in Part 2.

---

### Part 1 — Step 6: Add operator to Google Cloud (IAM)

Still in Cloud Console, same project selected.

1. **IAM & Admin** → **IAM**.
2. **Grant access**.
3. **New principals:** your agency Gmail (`you@agency.com`).
4. **Role:** **Editor**.
5. **Save**.
6. You accept the invitation (email or during the call).

This lets you fix APIs/OAuth in Console later without their password.

---

### Part 1 — Step 7: Add operator to Business Profile

1. [business.google.com](https://business.google.com/) — signed in as the practice.
2. Select the correct **location**.
3. **Settings** / **Business profile settings** → **People and access** / **Managers** (wording varies).
4. **Add** / **Invite**.
5. Your agency Gmail → role **Manager**.
6. You accept the invite.

Part 1 is complete. Practice can **stop screen share**.

### Part 1 checklist

- [ ] Project created and selected
- [ ] Three APIs enabled
- [ ] `business.manage` scope; owner on Test users (if Testing)
- [ ] API access requested (approval received before Part 2, if possible)
- [ ] Desktop OAuth client; Client ID + secret available
- [ ] Operator **Editor** on IAM
- [ ] Operator **Manager** on listing

---

## Part 2 — Connect CLI (your laptop, same or follow-up call)

### Why Part 2 runs on your computer

`npm run gbp -- login` starts a small server on **your** machine at `http://127.0.0.1:3456`. After the practice clicks **Allow**, Google redirects to that address. The redirect must hit **the same computer** that ran the command.

That is why the practice does not “open a link on their laptop” for this step — unless they run `login` on their own machine (optional IT path; not required here).

### What Part 2 looks like on a video call (remote control)

1. **You** start screen sharing (your entire screen or one desktop).
2. **You** run Terminal commands (practice does not need to read Terminal).
3. When **Chrome** opens on your Mac:
   - In **Zoom:** practice clicks **Request remote control** (or you grant control), then they use their mouse on your Google sign-in window.
   - In **Google Meet:** similar remote control if available, or practice tells you which account/button to click.
   - **In person:** they use your keyboard/trackpad.
4. They sign in with the **practice owner** Google account — not your agency account unless you are a Manager on the profile.
5. They approve **2FA** on their phone if prompted.
6. They click **Continue** on “Google hasn’t verified this app” (normal for Testing).
7. They click **Allow** for Business Profile access.
8. Browser shows **Authorized** → close the tab.
9. You return to Terminal for any numbered prompts and verification.

They are **not** logging into your personal Gmail. They are authorizing **their** account for **their** Cloud OAuth app, in a browser on your machine.

**Skip Part 2** until Google approved API access (Part 1 Step 4). Otherwise `status` returns **403**.

---

### Part 2 — Step 1: Client ID and secret in your `.env`

1. Open `<repo>/.env` on your laptop.
2. Get values from practice screen share (**Credentials** page) or their Notes:

   ```env
   GBP_CLIENT_ID=paste-client-id.apps.googleusercontent.com
   GBP_CLIENT_SECRET=paste-GOCSPX-secret
   ```

3. Save. Do not set `GBP_REFRESH_TOKEN` yet.

---

### Part 2 — Step 2: Run login

Terminal, repo root:

```bash
npm run gbp -- login
```

Chrome should open. If not, copy the URL from Terminal into Chrome on your Mac.

---

### Part 2 — Step 3: Practice authorizes (remote control)

Use the table in [What Part 2 looks like](#what-part-2-looks-like-on-a-video-call-remote-control) above.

---

### Part 2 — Step 4: Complete login in Terminal

- If prompted for account or location number, ask which practice name matches → type `1` or `2` → Enter.
- Success line:

  ```text
  ✓ Saved to .env: GBP_REFRESH_TOKEN, GBP_ACCOUNT_ID, GBP_LOCATION_ID
  ```

**If** `No refresh token returned`:

1. Practice: [myaccount.google.com/permissions](https://myaccount.google.com/permissions) → remove your app.
2. Confirm owner Gmail is on OAuth **Test users** (Part 1 Step 3).
3. Run `npm run gbp -- login` again.

---

### Part 2 — Step 5: Verify

```bash
npm run gbp -- status
```

Expect:

- Masked `GBP_REFRESH_TOKEN` (not “not set”)
- `GBP_ACCOUNT_ID` and `GBP_LOCATION_ID` shown
- `✓ OAuth refresh token exchanged for access token`
- `✓ GBP API reachable`

```bash
npm run gbp -- reviews --limit 3
```

Expect real review text and `Review ID:` lines.

**Setup is complete.** Five values are in your `.env`:

| Variable | Set in |
|----------|--------|
| `GBP_CLIENT_ID` | Part 2 Step 1 |
| `GBP_CLIENT_SECRET` | Part 2 Step 1 |
| `GBP_REFRESH_TOKEN` | Part 2 Step 2–4 |
| `GBP_ACCOUNT_ID` | Part 2 Step 2–4 |
| `GBP_LOCATION_ID` | Part 2 Step 2–4 |

Optional: back up these lines in your password manager (your copy only).

---

## After setup — operator daily use

From repo root on your laptop (no practice on the call):

```bash
npm run gbp -- reviews --unanswered
npm run gbp -- reply --review-id REVIEW_ID --reply "Thank you for your review!"
npm run gbp -- post --text "Post caption here." --cta-type BOOK --cta-url https://example.com/schedule
```

See [gbp-cli.md](./gbp-cli.md) for all commands.

---

## Optional path — practice IT runs `login` on their PC

Use when remote control is not practical.

1. Part 1 unchanged (browser).
2. IT installs Node, clones repo, `npm install`, creates `.env` with Client ID + secret.
3. IT runs `npm run gbp -- login` on **their** computer (owner signs in locally).
4. IT sends you securely: `GBP_REFRESH_TOKEN`, `GBP_ACCOUNT_ID`, `GBP_LOCATION_ID` (+ ID/secret if needed).
5. You paste into **your** `.env` and run `npm run gbp -- status`.

You never run `login` on your laptop for that client.

---

## Troubleshooting

| Problem | What to try |
|---------|-------------|
| `redirect_uri_mismatch` | OAuth client → add `http://127.0.0.1:3456/oauth2callback` |
| No refresh token | [myaccount.google.com/permissions](https://myaccount.google.com/permissions) → remove app → `login` again; confirm owner on Test users |
| `403` on API calls | GBP API access not approved for project, or wrong `GBP_LOCATION_ID` |
| Access blocked at sign-in | Add owner Gmail under OAuth **Test users** |
| Wrong location | `npm run gbp -- locations` → update `GBP_LOCATION_ID` in `.env`, or re-run `login` |
| `Failed to get access token` | Re-run Part 2 Steps 2–4 (`login`) |
| Engagement ends | [gbp-offboarding.md](./gbp-offboarding.md) |

---

## Security

- Keep all `GBP_*` values in `.env` only (gitignored).
- Store `GBP_REFRESH_TOKEN`, not short-lived `GBP_ACCESS_TOKEN`.
- Rotate access: practice revokes app → run `login` again.

---

## Solo setup (you are the practice, one machine)

Same Cloud steps as **Part 1** on your own Google account, then on **your** laptop:

1. Complete **Part 0**.
2. Do **Part 1** Steps 1–5 yourself in Cloud Console (skip Steps 6–7 — no agency to invite).
3. Put `GBP_CLIENT_ID` and `GBP_CLIENT_SECRET` in your `.env`.
4. Run **Part 2** Steps 2–5 locally (you click **Allow** in your own browser — no remote control).
5. Use [gbp-cli.md](./gbp-cli.md) day to day.
