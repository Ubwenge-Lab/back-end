#!/bin/bash
# Runs once, on first boot of an empty primary data dir (standard postgres
# docker-entrypoint-initdb.d hook). Creates a replication role and opens
# pg_hba.conf so the standby container can stream WAL from this primary.
set -e

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
    CREATE ROLE "${REPLICATION_USER}" WITH REPLICATION LOGIN PASSWORD '${REPLICATION_PASSWORD}';
EOSQL

echo "host replication ${REPLICATION_USER} all md5" >> "$PGDATA/pg_hba.conf"
