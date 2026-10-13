# AI coordination — recovered project state

> Recovery note: the original untracked coordination file was deleted with the working tree. This file reconstructs the latest accepted engineering state from `C:\Users\orest\AppData\Local\MedicalPlatform\AiSupervisor\codex-CX-002.log`; it is not claimed to be byte-for-byte identical to the deleted file.

## Current baseline

Project version: **0.13.0**.

Recovered application source includes migrations `001` through `010_patient_engagement.sql`, engagement/favorites/reviews, patient profiles, API/Web Dockerfiles and the full API/Web source trees recovered from Docker build layers.

## Last accepted infrastructure task — CX-001

Goal: make the 0.13 monorepo runnable as a local Docker Desktop stack on Windows without weakening existing medical/business authorization.

Scope recorded in the surviving log:

- `docker-compose.yml`
- `docker-compose.override.yml`
- `.dockerignore`
- `apps/api/Dockerfile`
- `apps/web/Dockerfile`
- `infra/**` while preserving Keycloak user/business semantics
- `scripts/**`
- `infra/README.md`

Acceptance behavior recorded in the log:

- PostgreSQL bootstrap and separate Keycloak DB;
- TCP-based PostgreSQL readiness;
- Keycloak health check accepting HTTP/1.0 or HTTP/1.1;
- external Keycloak issuer based on `host.docker.internal`, internal JWKS access;
- MinIO bucket initialization and separate least-privilege app user;
- ClamAV health/scanner integration;
- LiveKit config, ports and secret injection;
- API depends on successful `minio-init` plus healthy required services;
- Web depends on API readiness;
- Windows scripts `dev-up.ps1`, `dev-down.ps1`, `check.ps1`;
- static YAML/JSON/bind-source validation;
- normal shutdown must preserve named volumes;
- no real secrets committed.

Original CX-001 validation recorded in the log: API/Web typecheck and build passed, 22 Next.js pages were produced, static infrastructure checks passed. Docker runtime was marked BLOCKED because Docker Desktop was unavailable at that time.

## Recovery validation — 2026-10-09

After recovery/repair:

- `npm run typecheck` — PASS;
- `npm run build` — PASS;
- 22 Next.js pages generated;
- `node scripts/check-infra.cjs` — PASS;
- root and legacy Compose config rendering — PASS;
- PowerShell parser for all restored `scripts/*.ps1` — PASS.

Docker runtime remains blocked by the machine's current WSL/Docker Desktop startup error and must not be reported as E2E-verified until that host issue is repaired.

## Safety rules for further work

- Do not edit already-applied migrations; add a new migration.
- Do not weaken ownership, doctor verification or document-grant checks.
- Do not log access tokens, video tokens, secrets or clinical free text.
- Do not delete named Docker volumes as a troubleshooting shortcut.
- Do not overwrite the recovery backups on `D:\MedicalPlatformRecovery`.
