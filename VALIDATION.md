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


## GitHub Actions verification — 2026-11-13

- [Run 43442390640](https://github.com/andrii-baloh/medical-platform/actions/runs/43442390640), commit `224d41fef9abfeab6680320c8a41daf51f4e0f0b`: `migrations` job **passed** using the PostgreSQL 16 service. All 35 SQL migrations (001–035) were applied, the `schema_migrations` count was checked, and the migrator was run again to verify repeat execution.
- The overall workflow **failed**: `verify` failed at `Production dependency audit` (`npm audit --omit=dev --audit-level=high`), and `trivy` failed at `Scan dependencies and secrets (Trivy)`. These security gates remain blockers; do not interpret the successful migration job as production readiness.
- This CI run does **not** establish end-to-end application behavior, OIDC, object storage, malware scanning, LiveKit sessions, or deployment readiness. Those runtime checks remain unverified.

## Runtime not yet verified

Docker Desktop currently reports a WSL command failure on this computer. Consequently, the following are not yet claimed as passed after recovery:

- image pull/build against the Docker daemon
- service startup/health for PostgreSQL, Keycloak, MinIO, ClamAV and LiveKit
- migration execution in the recovered local Docker stack (separate from the successful PostgreSQL 16 GitHub Actions migration job)
- browser OIDC login
- MinIO signed upload/download
- ClamAV scan pipeline
- LiveKit audio/video session
- complete end-to-end booking/consultation flow

Run `scripts/check.ps1` after WSL/Docker Desktop is repaired. It intentionally reports runtime as BLOCKED instead of pretending the runtime checks passed.
