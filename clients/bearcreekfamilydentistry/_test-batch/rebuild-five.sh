#!/usr/bin/env bash
# Build-only eval loop — rebuild 5 test sites until all pass.
set -uo pipefail
cd "$(dirname "$0")/.."
export GOOGLE_APPLICATION_CREDENTIALS="${GOOGLE_APPLICATION_CREDENTIALS:-./_credentials/groundwork-dental-e4d49e06a82a.json}"

LOG_DIR="_test-batch/rebuild-logs"
mkdir -p "$LOG_DIR"

PRACTICES=(
  "Illinois Family Dentistry|https://illinoisdentistrydallas.com/|illinois-family-dentistry"
  "Bear Creek Family Dentistry|https://www.bearcreekfamilydentistry.com/|bear-creek-family-dentistry"
  "Dentiq Dentistry Houston|https://www.dentiq.dental/|dentiq-dentistry"
  "Butterfly Orthodontics|https://www.butterflybraces.com/|butterfly-orthodontics"
  "Arizona Biltmore Dentistry|https://www.arizonabiltmoredentistry.com/|arizona-biltmore-dentistry"
)

attempt=0
while true; do
  attempt=$((attempt + 1))
  echo ""
  echo "========== ATTEMPT $attempt $(date -Iseconds) =========="
  failed=0
  for entry in "${PRACTICES[@]}"; do
    IFS='|' read -r name url slug <<< "$entry"
    log="$LOG_DIR/${slug}-attempt${attempt}.log"
    echo "--- BUILD $slug ---"
    if node scripts/pipeline/build-site.js --url "$url" --output "clients/$slug" --preset dental > "$log" 2>&1; then
      if [ -d "clients/$slug/dist" ]; then
        echo "  OK $slug"
      else
        echo "  FAIL $slug (exit 0 but no dist/)"
        failed=$((failed + 1))
      fi
    else
      echo "  FAIL $slug (see $log)"
      failed=$((failed + 1))
    fi
  done
  echo "Attempt $attempt: $((5 - failed))/5 passed, $failed failed"
  if [ "$failed" -eq 0 ]; then
    echo "ALL 5 PASSED on attempt $attempt"
    exit 0
  fi
  if [ "$attempt" -ge 10 ]; then
    echo "Gave up after 10 attempts"
    exit 1
  fi
  echo "Fix issues and retrying..."
  sleep 2
done
