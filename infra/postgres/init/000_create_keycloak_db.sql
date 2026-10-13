-- Local development infrastructure bootstrap only.
-- Application schema migrations are mounted separately.
SELECT 'CREATE DATABASE keycloak'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'keycloak')\gexec
