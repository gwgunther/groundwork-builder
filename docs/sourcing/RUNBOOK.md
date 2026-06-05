# Sourcing — Production Runbook

How to run the dental-practice sourcing pipeline on your own machine (stable
network, unattended). The pipeline is self-contained; the only reason **not**
to run it inside the Claude agent is that the agent's sandbox network is flaky
for sustained bulk crawling. **Run it from your own Terminal.**

---

## 0. One-time setup (do once)

The repo is already on this machine at `~/Projects/groundwork-builder`. In a
normal Terminal (Terminal.app / iTerm — *not* the agent):

```bash
cd ~/Projects/groundwork-builder

# Node 22 (already pinned in .node-version). Confirm:
node --version          # should be v22.x

# Install deps (if not already) + the Playwright browser the pipeline drives:
npm install
npx playwright install chromium
```

### Required credentials (already in `.env`)
| Key | Used for |
|---|---|
| `GOOGLE_PLACES_API_KEY` | Places search + geocode + PageSpeed/Lighthouse |
| `AIRTABLE_API_KEY`, `AIRTABLE_BASE_ID` | writing the `Sourced Practices` table |
| `GOOGLE_APPLICATION_CREDENTIALS` (or `GOOGLE_CLOUD_CREDENTIALS_JSON`) + `GOOGLE_CLOUD_STORAGE_BUCKET` | screenshots + rendered-HTML + checkpoint backup to GCS |

> Vision/Anthropic and ad-detection are **not** used in sourcing — no token needed for a sourcing run.

Sanity check before a big run:
```bash
npm run sourcing:metros        # lists all 100 metro keys → confirms registry loads
node scripts/sourcing/run.js --metro dallas-tx --limit 5 --no-airtable   # ~1 min smoke test
```

---

## 1. Run a single metro

```bash
node scripts/sourcing/run.js --metro phoenix-az
```
- Sources the **200 most-prominent practices** in the metro (geo-radius), scores them, writes to the canonical `Sourced Practices` Airtable table (segmented by the `MSA / Market` column).
- `--list-metros` shows every key. Common flags: `--limit N`, `--no-screenshots` (faster), `--no-lighthouse` (skip the slow step while testing).
- **Resumable:** re-running the same metro skips practices already checkpointed in `_sourcing/checkpoints/`. To force a fresh pass, add `--force`.

Time/cost per metro: **~20–30 min** (Lighthouse is the bottleneck) · **~$0.20** Places API · Lighthouse free · GCS pennies.

---

## 2. Run the whole campaign (all 100 metros, unattended)

```bash
# All metros, largest first. Resumable — safe to Ctrl-C and re-run.
node scripts/sourcing/campaign.js

# Or a subset:
node scripts/sourcing/campaign.js --top 25
node scripts/sourcing/campaign.js --metros dallas-tx,phoenix-az,tampa-fl
```

- Runs metros **one at a time** in fresh child processes (clean memory/browser each; one metro crashing never aborts the campaign).
- Progress tracked in `_sourcing/campaign-progress.json` → **re-running skips completed metros.** A full 100-metro campaign is ~30–50 hours of wall-clock; just leave it running (see §3 for keeping it alive).
- Per-metro logs: `_sourcing/logs/<key>.log`. Live one-line status per metro on stdout.
- Retry only the metros that failed: `node scripts/sourcing/campaign.js --retry-failed`

### Keep it running after you close the laptop lid / Terminal
```bash
# caffeinate prevents sleep; nohup detaches from the Terminal; log to a file
caffeinate -s nohup node scripts/sourcing/campaign.js > _sourcing/campaign.out 2>&1 &
echo $!            # the PID, in case you want to stop it later
```
Check on it anytime: `tail -f _sourcing/campaign.out`

---

## 3. Monitor

```bash
tail -f _sourcing/campaign.out          # campaign-level progress
tail -f _sourcing/logs/phoenix-az.log   # a specific metro
cat _sourcing/campaign-progress.json    # done / failed lists
```
And the Airtable `Sourced Practices` table fills in live (filter by `MSA / Market`).

---

## 4. Expected per-metro output

- **~200 rows** appended (minus chains/DSOs, unreachable, no-website — typically ~160–180 active prospects).
- Healthy network → unreachable should be **<10%** (if you see ~25%+, it's a network blip — re-run that metro; resume keeps the good rows).
- Each row: objective `Quality Score` (0–11) + `Weakness Score`, Google Lighthouse bands, `Missing Items` (the outreach pitch), `Business Tier`, `Tier`/`Quadrant`, `Is Exemplar`, contact info, screenshots.

---

## 5. After the scrape

1. **Tune exemplar floors** to land ~1,000 top sites across all metros (instant, no re-crawl):
   edit `EXEMPLAR_MIN_REVIEWS` / `EXEMPLAR_MIN_RATING` in `scripts/sourcing/lib/scoring.js`, then
   ```bash
   node scripts/sourcing/run.js --rescore         # recomputes ALL checkpoints + re-syncs Airtable
   ```
2. **Work the prospect list** — Airtable view: `Quadrant = Prime`, sorted by Review Count; filter `Vendor Category = dental-mill` for the hottest segment. `Missing Items` is the cold-email body.
3. **Promote** a prospect into the Accounts CRM when ready to pitch: `node scripts/sourcing/promote.js <place_id>`.
4. **Build Product #2** (best-practices checklist) once exemplars have accumulated across ~10–20 metros — runs on the cached HTML/screenshots, no re-crawl.

---

## 6. Troubleshooting

| Symptom | Cause / fix |
|---|---|
| High "unreachable" (>20%) | Network instability during the run. Re-run the metro (resume keeps good rows); delete `excluded-unreachable` checkpoints first to retry them. |
| A metro times out repeatedly on the same sites | A few genuinely-slow sites hit the 200s per-practice cap — they're dropped and logged; re-run to retry. (GCS uploads are already hard-capped at 25s so they can't cause this.) |
| `ANTHROPIC_API_KEY missing` | Not needed for sourcing; ignore. |
| Airtable row-ceiling | Confirm your plan's per-base limit (Team/Pro 50k, Business 125k). 100 metros × ~180 ≈ 18k rows — fine. |
| Want to re-sync without re-crawl | `node scripts/sourcing/run.js --sync-only` (uploads + Airtable from cached checkpoints). |

---

## 7. What each command does (quick reference)

| Command | Action |
|---|---|
| `npm run sourcing:metros` | list all 100 metro keys |
| `node scripts/sourcing/run.js --metro <key>` | source one metro |
| `node scripts/sourcing/campaign.js [--top N \| --metros a,b]` | source many, resumable |
| `node scripts/sourcing/campaign.js --retry-failed` | retry failed metros |
| `node scripts/sourcing/run.js --rescore` | recompute scores from cache + re-sync (no crawl) |
| `node scripts/sourcing/run.js --sync-only` | re-push cached data to Airtable |
| `node scripts/sourcing/promote.js <place_id>` | promote a prospect to Accounts |
