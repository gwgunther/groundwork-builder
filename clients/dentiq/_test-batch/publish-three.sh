#!/usr/bin/env bash
# Full rebuild + publish for 3 test-batch practices (Airtable Builds rows + live URLs).
set -uo pipefail
cd "$(dirname "$0")/.."
export GOOGLE_APPLICATION_CREDENTIALS="${GOOGLE_APPLICATION_CREDENTIALS:-./_credentials/groundwork-dental-e4d49e06a82a.json}"

LOG_DIR="_test-batch/publish-logs"
mkdir -p "$LOG_DIR" clients _audits

# name|url|canonical_slug|audit_batch_dir
PRACTICES=(
  "Bear Creek Family Dentistry|https://www.bearcreekfamilydentistry.com/|bearcreekfamilydentistry|bear-creek-family-dentistry"
  "Dentiq Dentistry Houston|https://www.dentiq.dental/|dentiq|dentiq-dentistry"
  "Arizona Biltmore Dentistry|https://www.arizonabiltmoredentistry.com/|arizonabiltmoredentistry|arizona-biltmore-dentistry"
)

SUMMARY="$LOG_DIR/summary.jsonl"
: > "$SUMMARY"

link_audit_dir() {
  local canonical="$1" batch="$2"
  local target="_audits/$canonical"
  local source="_audits/$batch"
  if [[ -e "$target" ]]; then return 0; fi
  if [[ ! -d "$source" ]]; then
    echo "WARN: audit source missing: $source"
    return 1
  fi
  ln -s "$batch" "$target"
  echo "Linked $target -> $batch"
}

run_one() {
  local name="$1" url="$2" slug="$3" audit_batch="$4"
  local log="$LOG_DIR/${slug}-publish.log"
  local start end status

  echo ""
  echo "========== PUBLISH: $name ($slug) =========="
  link_audit_dir "$slug" "$audit_batch" || true

  start=$(date +%s)
  if node scripts/pipeline/build-site.js \
    --url "$url" \
    --preset dental \
    --publish \
    > "$log" 2>&1; then
    status=ok
  else
    status=fail
  fi
  end=$(date +%s)

  echo "{\"slug\":\"$slug\",\"name\":\"$name\",\"publish\":\"$status\",\"duration_s\":$((end-start))}" >> "$SUMMARY"
  echo "DONE $slug publish=$status ($((end-start))s)"
}

echo "Publish batch started $(date -Iseconds)" | tee "$LOG_DIR/batch.log"

for entry in "${PRACTICES[@]}"; do
  IFS='|' read -r name url slug audit_batch <<< "$entry"
  run_one "$name" "$url" "$slug" "$audit_batch" 2>&1 | tee -a "$LOG_DIR/batch.log"
done

echo "Publish batch finished $(date -Iseconds)" | tee -a "$LOG_DIR/batch.log"
