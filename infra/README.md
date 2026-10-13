# MediCare 0.13 — local Docker stack

This directory contains the local-development infrastructure for the recovered MediCare 0.13 repository.

## Services

- PostgreSQL 17 — application DB plus a separate Keycloak DB.
- Keycloak — local OIDC identity provider; realm import is in `keycloak/realm-export.json`.
- MinIO — private S3-compatible medical-document storage.
- ClamAV — document malware scanner.
- LiveKit — local video consultation server.
- API and Web are added by the root `docker-compose.override.yml`.

## Windows startup

1. Copy `.env.example` to `.env` and change local secrets if desired.
2. Start Docker Desktop and make sure WSL2 works.
3. From the repository root run `powershell -ExecutionPolicy Bypass -File scripts/dev-up.ps1`.
4. Stop with `powershell -ExecutionPolicy Bypass -File scripts/dev-down.ps1`.

`dev-down.ps1` deliberately does **not** pass `-v`; PostgreSQL, MinIO and ClamAV named volumes are preserved.

## Addresses

- Web: `http://localhost:3000`
- API readiness: `http://localhost:4000/health/ready`
- Keycloak: `http://localhost:8080`
- MinIO API: `http://localhost:9000`
- MinIO console: `http://localhost:9001`
- LiveKit: `ws://localhost:7880`

Keycloak uses `host.docker.internal` as its external hostname so browser tokens have the same issuer that the API validates. The API fetches JWKS over the internal Docker network from `keycloak:8080`.

## Database initialization and upgrades

A brand-new PostgreSQL volume creates the application database and the Keycloak database. Application migrations are executed by the API migration runner and recorded in `schema_migrations` with checksums. Never edit an already-applied migration; add a new migration instead.

PostgreSQL's `/docker-entrypoint-initdb.d` scripts run only for a fresh volume. An existing volume therefore needs an explicit upgrade/backfill procedure when infrastructure bootstrap behavior changes. Do not delete the volume merely to force re-initialization if it contains data.

## MinIO

`minio/init.sh` creates the selected medical bucket and a separate least-privilege application user. The application user is intentionally forbidden from being the MinIO root user. The policy is rendered from `minio/app-policy.template.json` for the configured bucket.

Existing MinIO users may retain policies attached outside this project; the init script does not destructively remove unrelated policies.

## Keycloak

The imported realm contains development-only doctor, patient and admin identities. `AUTH_KEYCLOAK_SECRET` must match the `medicare-web` client secret in the realm import. Changing only `.env` does not rewrite an already-imported realm in an existing Keycloak database.

The demo credentials are local fixtures only. Never use them in staging/production and never put real patient data into this stack.

## Validation

Run:

```powershell
node scripts/check-infra.cjs
npm run typecheck
npm run build
docker compose --env-file .env.example config --quiet
```

`scripts/check.ps1` combines these checks. If Docker Desktop is unavailable it exits with code 2 and reports runtime verification as BLOCKED rather than claiming success.

## Runtime limitations

This stack is for local development. It uses local HTTP endpoints and single-host LiveKit settings. Production requires country-specific security, retention, identity, signing, backup/restore, observability, network and compliance configuration.
