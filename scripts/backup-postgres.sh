#!/usr/bin/env bash
set -euo pipefail

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "DATABASE_URL is required" >&2
  exit 1
fi

backup_dir="${BACKUP_DIR:-./output/backups}"
retention_days="${BACKUP_RETENTION_DAYS:-14}"
if [[ ! "$retention_days" =~ ^[0-9]+$ ]]; then
  echo "BACKUP_RETENTION_DAYS must be a non-negative integer" >&2
  exit 1
fi
timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
mkdir -p "$backup_dir"
backup_file="$backup_dir/cat-diary-$timestamp.dump"
postgres_url="$(node -e "const u=new URL(process.argv[1]); u.searchParams.delete('schema'); console.log(u.toString())" "$DATABASE_URL")"

pg_dump --dbname="$postgres_url" --format=custom --no-owner --no-privileges --file="$backup_file"
if [[ ! -s "$backup_file" ]]; then
  echo "Backup is empty: $backup_file" >&2
  exit 1
fi
pg_restore --list "$backup_file" >/dev/null
if command -v sha256sum >/dev/null 2>&1; then
  sha256sum "$backup_file" > "$backup_file.sha256"
else
  shasum -a 256 "$backup_file" > "$backup_file.sha256"
fi
find "$backup_dir" -type f \( -name 'cat-diary-*.dump' -o -name 'cat-diary-*.dump.sha256' \) -mtime "+$retention_days" -delete

echo "$backup_file"
