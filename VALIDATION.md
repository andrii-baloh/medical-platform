# Validation notes — recovered MediCare 0.13

Validation performed on 2026-10-09 after recovery of the deleted working tree.

## Passed

- `npm run typecheck` — API and Web completed with exit code 0.
- `npm run build` — NestJS and Next.js completed with exit code 0.
- Next.js 15.5.26 production build compiled successfully and generated 22 static pages.
- `node scripts/check-infra.cjs` — PASS.
- `node --check infra/web/next.config.mjs` — PASS.
- `node --check scripts/check-infra.cjs` — PASS.
- PowerShell parser — PASS for `check.ps1`, `dev-up.ps1`, `dev-down.ps1`.
- `docker compose --env-file .env.example config --quiet` — PASS.
- legacy `docker compose --env-file .env.example -f infra/docker-compose.dev.yml config --quiet` — PASS.
- Database migrations 001 through 010 are present; `010_patient_engagement.sql` is confirmed.

## Recovery-specific repair

Some files extracted from one containerd snapshot were zero-filled. Recovery selected valid copies of the same repository paths from surviving Docker layers. After replacement, TypeScript typecheck and production builds passed.

The recovered `package-lock.json` from an older build layer did not match the final package manifests. It is preserved as `package-lock.recovered-original.json`; the active lockfile was regenerated from the recovered 0.13 manifests before validation.

## Runtime not yet verified

Docker Desktop currently reports a WSL command failure on this computer. Consequently, the following are not yet claimed as passed after recovery:

- image pull/build against the Docker daemon
- service startup/health for PostgreSQL, Keycloak, MinIO, ClamAV and LiveKit
- migration execution against a running PostgreSQL instance
- browser OIDC login
- MinIO signed upload/download
- ClamAV scan pipeline
- LiveKit audio/video session
- complete end-to-end booking/consultation flow

Run `scripts/check.ps1` after WSL/Docker Desktop is repaired. It intentionally reports runtime as BLOCKED instead of pretending the runtime checks passed.
