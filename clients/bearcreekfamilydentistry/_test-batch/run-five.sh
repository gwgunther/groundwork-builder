#!/usr/bin/env bash
# Batch: audit + build for 5 sourced test candidates.
set -uo pipefail
cd "$(dirname "$0")/.."
export GOOGLE_APPLICATION_CREDENTIALS="${GOOGLE_APPLICATION_CREDENTIALS:-./_credentials/groundwork-dental-e4d49e06a82a.json}"

LOG_DIR="_test-batch/logs"
mkdir -p "$LOG_DIR" clients

# name|url|place_id|slug
PRACTICES=(
  "Illinois Family Dentistry|https://illinoisdentistrydallas.com/|ChIJrc42J42bToYRcVHVbiREO3Q|illinois-family-dentistry"
  "Bear Creek Family Dentistry|https://www.bearcreekfamilydentistry.com/|ChIJu62AD-yaToYRP_jutrx7fxE|bear-creek-family-dentistry"
  "Dentiq Dentistry Houston|https://www.dentiq.dental/|ChIJ_Ru-FaHAQIYRByxtRN6K3Ck|dentiq-dentistry"
  "Butterfly Orthodontics|https://www.butterflybraces.com/|ChIJYYhldCtpK4cRVxXuYFjLvdo|butterfly-orthodontics"
  "Arizona Biltmore Dentistry|https://www.arizonabiltmoredentistry.com/|ChIJ4ZWT6ggNK4cRYbJNuSOvfJE|arizona-biltmore-dentistry"
)

SUMMARY="$LOG_DIR/summary.jsonl"
: > "$SUMMARY"

run_one() {
  local name="$1" url="$2" place_id="$3" slug="$4"
  local audit_log="$LOG_DIR/${slug}-audit.log"
  local build_log="$LOG_DIR/${slug}-build.log"
  local audit_out="_audits/${slug}"
  local client_out="clients/${slug}"

  echo ""
  echo "========== AUDIT: $name =========="
  local audit_start=$(date +%s)
  if node scripts/pipeline/audit-site.js \
    --url "$url" \
    --place-id "$place_id" \
    --business-name "$name" \
    --source manual \
    --output "$audit_out" \
    > "$audit_log" 2>&1; then
    local audit_status=ok
  else
    local audit_status=fail
  fi
  local audit_end=$(date +%s)

  echo ""
  echo "========== BUILD: $name =========="
  local build_start=$(date +%s)
  if node scripts/pipeline/build-site.js \
    --url "$url" \
    --output "$client_out" \
    --preset dental \
    > "$build_log" 2>&1; then
    local build_status=ok
  else
    local build_status=fail
  fi
  local build_end=$(date +%s)

  echo "{\"slug\":\"$slug\",\"name\":\"$name\",\"audit\":\"$audit_status\",\"audit_s\":$((audit_end-audit_start)),\"build\":\"$build_status\",\"build_s\":$((build_end-build_start))}" >> "$SUMMARY"
  echo "DONE $slug audit=$audit_status build=$build_status"
}

echo "Batch started $(date -Iseconds)" | tee "$LOG_DIR/batch.log"

for entry in "${PRACTICES[@]}"; do
  IFS='|' read -r name url place_id slug <<< "$entry"
  run_one "$name" "$url" "$place_id" "$slug" 2>&1 | tee -a "$LOG_DIR/batch.log"
done

echo "Batch finished $(date -Iseconds)" | tee -a "$LOG_DIR/batch.log"
