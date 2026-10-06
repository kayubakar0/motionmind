#!/usr/bin/env sh
# Backup MotionMind: dump Postgres + arsip volume uploads, retensi 14 hari.
# Pakai: sudo bash deploy/backup.sh [folder-tujuan]
set -eu

cd "$(dirname "$0")/.."

TS="$(date -u +%Y%m%dT%H%M%SZ)"
OUT="${1:-/var/backups/motionmind}"
mkdir -p "$OUT"

docker compose exec -T db sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB"' \
  | gzip > "$OUT/db-$TS.sql.gz"

docker run --rm -v motionmind_uploads:/src:ro alpine tar czf - -C /src . \
  > "$OUT/uploads-$TS.tar.gz"

find "$OUT" -maxdepth 1 -type f -name "*.gz" -mtime +14 -delete

echo "Backup selesai:"
echo "  $OUT/db-$TS.sql.gz"
echo "  $OUT/uploads-$TS.tar.gz"
