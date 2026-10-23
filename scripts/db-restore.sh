#!/bin/sh
# Restore a backup made by scripts/db-backup.sh into the LOCAL Compose database, then start the stack.
# This DELETES the local database first (docker compose down -v), so it asks for --yes.
#
#   sh scripts/db-restore.sh backups/fairshare-YYYYMMDD-HHMMSS.sql.gz --yes
#
# The API finds `schema_migrations` already filled in, so it applies nothing, and the demo seed only
# fills an empty database, so the restored data is left exactly as it was. Docs: docs/PERSISTENCE_DRILL.md
set -eu

DOCKER=${DOCKER:-docker}
cd "$(dirname "$0")/.."
file=${1:-}
if [ -z "$file" ] || [ ! -f "$file" ]; then
  echo "Usage: sh scripts/db-restore.sh backups/<file>.sql.gz --yes" >&2
  exit 2
fi
if [ "${2:-}" != "--yes" ]; then
  echo "This deletes the local Compose database and replaces it with $file. Add --yes to go on." >&2
  exit 2
fi

echo "Removing the local database and starting an empty one…"
$DOCKER compose down -v
$DOCKER compose up -d --wait db

echo "Restoring $file…"
# Two lines are left out, any other error stops the restore:
# - CREATE SCHEMA public: every new database already has it (found by the first drill run);
# - SET transaction_timeout: written by pg_dump 17, unknown to an older local server, means "no limit".
gunzip -c "$file" | grep -vE '^(CREATE SCHEMA public;|SET transaction_timeout)' |
  $DOCKER compose exec -T db psql -U app -d appdb -q -v ON_ERROR_STOP=1 > /dev/null

echo "Starting the whole stack…"
$DOCKER compose up -d --wait
echo "Rows per table after the restore:"
$DOCKER compose exec -T db psql -U app -d appdb -tA -F ' ' -c "
  SELECT 'households', count(*) FROM households UNION ALL
  SELECT 'members', count(*) FROM members UNION ALL
  SELECT 'expenses', count(*) FROM expenses UNION ALL
  SELECT 'expense_shares', count(*) FROM expense_shares UNION ALL
  SELECT 'settlements', count(*) FROM settlements" | awk '{ printf "  %-18s %s\n", $1, $2 }'
