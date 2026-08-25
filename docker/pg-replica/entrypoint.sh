#!/bin/bash
# On first boot (empty data dir), clones the primary via pg_basebackup with
# -R, which writes standby.signal + primary_conninfo automatically so the
# clone comes up as a streaming hot-standby replica. On restarts, the data
# dir is already populated so this is skipped and postgres just resumes
# streaming from where it left off.
set -e

if [ -z "$(ls -A "$PGDATA" 2>/dev/null)" ]; then
  echo "[pg-replica] Empty data dir — waiting for primary at ${PRIMARY_HOST}:${PRIMARY_PORT:-5432}..."
  until PGPASSWORD="$REPLICATION_PASSWORD" pg_isready -h "$PRIMARY_HOST" -p "${PRIMARY_PORT:-5432}" -U "$REPLICATION_USER" >/dev/null 2>&1; do
    sleep 2
  done

  echo "[pg-replica] Primary is reachable — running pg_basebackup..."
  PGPASSWORD="$REPLICATION_PASSWORD" pg_basebackup \
    -h "$PRIMARY_HOST" -p "${PRIMARY_PORT:-5432}" \
    -U "$REPLICATION_USER" \
    -D "$PGDATA" \
    -Fp -Xs -P -R

  chmod 0700 "$PGDATA"
  echo "[pg-replica] Clone complete — starting as streaming standby."
fi

exec docker-entrypoint.sh postgres
