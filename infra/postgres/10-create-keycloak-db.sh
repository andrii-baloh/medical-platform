#!/bin/sh
set -eu
: "${KEYCLOAK_DB:=keycloak}"
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<EOSQL
SELECT 'CREATE DATABASE "${KEYCLOAK_DB}"'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = '${KEYCLOAK_DB}')\gexec
EOSQL
