#!/bin/sh
# Back up the Fair-Share database: a plain SQL dump of the `public` schema (tables, data, RLS),
# gzipped, in backups/ (git-ignored: a backup is data and must never be committed).
#
#   DATABASE_URL='postgresql://…' sh scripts/db-backup.sh   # Supabase: the session pooler URL
#   sh scripts/db-backup.sh --compose                        # the local Compose database
#
# Needs only Docker (or Podman: DOCKER=podman). pg_dump must be at least as new as the server, so it
# runs in the official postgres image of the server's own major version. The connection string is
# passed to the container through the environment, never on a command line or in the output.
# Docs: docs/PERSISTENCE_DRILL.md
set -eu

DOCKER=${DOCKER:-docker}
cd "$(dirname "$0")/.."
mkdir -p backups
out="backups/fairshare-$(date -u +%Y%m%d-%H%M%S).sql.gz"
dump_options="--schema=public --no-owner --no-privileges"

if [ "${1:-}" = "--compose" ]; then
  echo "Dumping the local Compose database…"
  # shellcheck disable=SC2086
  $DOCKER compose exec -T db pg_dump -U app -d appdb $dump_options | gzip > "$out"
else
  if [ -z "${DATABASE_URL:-}" ]; then
    echo "Set DATABASE_URL (Supabase session pooler URL), or use --compose." >&2
    exit 2
  fi
  export DATABASE_URL
  # DOCKER_NETWORK: only to reach a database inside a Compose network (used when testing this script).
  network=${DOCKER_NETWORK:+--network $DOCKER_NETWORK}
  # shellcheck disable=SC2086,SC2016
  major=$($DOCKER run --rm $network -e DATABASE_URL postgres:17-alpine \
    sh -c 'psql "$DATABASE_URL" -tAc "SHOW server_version_num"' | cut -c1-2) || true
  case $major in
    '' | *[!0-9]*)
      echo "Could not reach the database (paused project? wrong DATABASE_URL?). Nothing written." >&2
      exit 1 ;;
  esac
  echo "Server is PostgreSQL $major; dumping with pg_dump $major…"
  # shellcheck disable=SC2086,SC2016
  $DOCKER run --rm $network -e DATABASE_URL -e OPTS="$dump_options" "postgres:$major-alpine" \
    sh -c 'pg_dump "$DATABASE_URL" $OPTS' | gzip > "$out"
fi

# Keep only a complete dump of our tables, otherwise fail loudly and keep nothing:
# - sh has no pipefail, so if pg_dump dies halfway, gzip still writes a file; pg_dump ends every
#   complete dump with this line, so a cut-off one does not have it (suggested by Tiến on #115);
# - a complete dump without our tables (wrong database) is no backup of Fair-Share either.
problem=""
if ! gunzip -c "$out" | tail -n 5 | grep -q "^-- PostgreSQL database dump complete"; then
  problem="the dump is incomplete (pg_dump stopped before the end)"
elif ! gunzip -c "$out" | grep -q "CREATE TABLE public.households"; then
  problem="the dump has no households table (wrong database?)"
fi
if [ -n "$problem" ]; then
  rm -f "$out"
  echo "Not a usable backup: $problem; nothing kept." >&2
  exit 1
fi

echo "Backup written: $out ($(wc -c < "$out" | tr -d ' ') bytes)"
echo "Rows per table:"
gunzip -c "$out" | awk '
  /^COPY public\./ { table = $2; sub(/^public\./, "", table); rows = 0; next }
  /^\\\.$/ && table != "" { printf "  %-18s %d\n", table, rows; table = ""; next }
  table != "" { rows++ }
'
