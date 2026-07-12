#!/usr/bin/env bash
set -euo pipefail

if [[ "${1:-}" != "--confirm" || -z "${2:-}" ]]; then
  echo "Usage: DATABASE_URL=... $0 --confirm /path/to/backup.dump" >&2
  exit 1
fi
if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "DATABASE_URL is required" >&2
  exit 1
fi

database_name="$(node -e "const u=new URL(process.argv[1]); console.log(decodeURIComponent(u.pathname.replace(/^\\//,'')))" "$DATABASE_URL")"
postgres_url="$(node -e "const u=new URL(process.argv[1]); u.searchParams.delete('schema'); console.log(u.toString())" "$DATABASE_URL")"
if [[ -z "$database_name" || "$database_name" == "postgres" || "$database_name" == template* ]]; then
  echo "Refusing to restore into reserved database: $database_name" >&2
  exit 1
fi
if [[ "${RESTORE_CONFIRM_DATABASE:-}" != "$database_name" ]]; then
  echo "RESTORE_CONFIRM_DATABASE must exactly equal target database '$database_name'" >&2
  exit 1
fi

backup_file="$2"
if [[ ! -f "$backup_file" ]]; then
  echo "Backup file not found: $backup_file" >&2
  exit 1
fi
if [[ -f "$backup_file.sha256" ]]; then
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum --check "$backup_file.sha256"
  else
    shasum -a 256 --check "$backup_file.sha256"
  fi
elif [[ "${ALLOW_MISSING_CHECKSUM:-false}" != "true" ]]; then
  echo "Checksum file is required: $backup_file.sha256" >&2
  exit 1
fi

pg_restore --list "$backup_file" >/dev/null
pg_restore --dbname="$postgres_url" --clean --if-exists --no-owner --no-privileges --exit-on-error "$backup_file"
echo "Restore completed from $backup_file"
