#!/usr/bin/env bash
set -euo pipefail

source_url="${SOURCE_DATABASE_URL:-${DATABASE_URL:-}}"
if [[ -z "$source_url" ]]; then
  echo "SOURCE_DATABASE_URL or DATABASE_URL is required" >&2
  exit 1
fi

source_database="$(node -e "const u=new URL(process.argv[1]); console.log(decodeURIComponent(u.pathname.replace(/^\\//,'')))" "$source_url")"
if [[ -z "$source_database" ]]; then
  echo "Source database name is missing" >&2
  exit 1
fi

admin_url="${ADMIN_DATABASE_URL:-$(node -e "const u=new URL(process.argv[1]); u.pathname='/postgres'; u.searchParams.delete('schema'); console.log(u.toString())" "$source_url")}"
restore_database="catdiary_restore_$(date -u +%Y%m%d%H%M%S)_$RANDOM"
restore_url="$(node -e "const u=new URL(process.argv[1]); u.pathname='/'+process.argv[2]; console.log(u.toString())" "$source_url" "$restore_database")"
work_dir="$(mktemp -d "${TMPDIR:-/tmp}/cat-diary-restore.XXXXXX")"

cleanup() {
  psql "$admin_url" -v ON_ERROR_STOP=1 -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '$restore_database' AND pid <> pg_backend_pid()" >/dev/null 2>&1 || true
  psql "$admin_url" -v ON_ERROR_STOP=1 -c "DROP DATABASE IF EXISTS \"$restore_database\"" >/dev/null 2>&1 || true
  rm -rf "$work_dir"
}
trap cleanup EXIT

table_counts() {
  local database_url="$1"
  local postgres_url
  local table
  postgres_url="$(node -e "const u=new URL(process.argv[1]); u.searchParams.delete('schema'); console.log(u.toString())" "$database_url")"
  while IFS= read -r table; do
    printf '%s=' "$table"
    psql "$postgres_url" -X -A -t -v ON_ERROR_STOP=1 -c "SELECT count(*) FROM \"$table\""
  done < <(psql "$postgres_url" -X -A -t -v ON_ERROR_STOP=1 -c "SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename")
}

source_counts="$(table_counts "$source_url")"
backup_file="$(DATABASE_URL="$source_url" BACKUP_DIR="$work_dir" BACKUP_RETENTION_DAYS=1 ./scripts/backup-postgres.sh)"

psql "$admin_url" -v ON_ERROR_STOP=1 -c "CREATE DATABASE \"$restore_database\"" >/dev/null
if DATABASE_URL="$restore_url" RESTORE_CONFIRM_DATABASE="wrong-database" \
  ./scripts/restore-postgres.sh --confirm "$backup_file" >/dev/null 2>&1; then
  echo "Restore safety check accepted an incorrect database confirmation" >&2
  exit 1
fi
cp "$backup_file" "$work_dir/no-checksum.dump"
if DATABASE_URL="$restore_url" RESTORE_CONFIRM_DATABASE="$restore_database" \
  ./scripts/restore-postgres.sh --confirm "$work_dir/no-checksum.dump" >/dev/null 2>&1; then
  echo "Restore safety check accepted a backup without checksum" >&2
  exit 1
fi
DATABASE_URL="$restore_url" RESTORE_CONFIRM_DATABASE="$restore_database" \
  ./scripts/restore-postgres.sh --confirm "$backup_file" >/dev/null

restored_counts="$(table_counts "$restore_url")"
if [[ "$source_counts" != "$restored_counts" ]]; then
  echo "Restored row counts differ from source snapshot" >&2
  diff <(printf '%s\n' "$source_counts") <(printf '%s\n' "$restored_counts") || true
  exit 1
fi

DATABASE_URL="$restore_url" pnpm exec prisma migrate status >/dev/null
psql "$(node -e "const u=new URL(process.argv[1]); u.searchParams.delete('schema'); console.log(u.toString())" "$restore_url")" -X -A -t -v ON_ERROR_STOP=1 -c "SELECT 1" | grep -qx '1'

echo "BACKUP_RESTORE_DRILL_OK source=$source_database restored=$restore_database tables=$(printf '%s\n' "$source_counts" | wc -l | tr -d ' ')"
