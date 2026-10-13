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

## Roadmap handoff — 2026-10-13

The current merged source contains the Russian-market roadmap foundations through stage 10: medical encounter/lifecycle, medical record, medical conclusions, immutable medical-document versions, signature abstraction, versioned consents, medical organizations, doctor regulatory credentials, legal representatives and ESIA identity-linking architecture (`012`–`022`).

Stage 11 adds a separate `integrations/egisz` boundary and migration `023_egisz_integration.sql` with durable `IntegrationJob`, `IntegrationEvent`, `IntegrationError` and `IntegrationRetry` storage. The REMD adapter targets immutable `medical_document_versions`, not mutable document heads. Manual integration-job administration is admin-only and idempotency-protected; worker lifecycle methods keep retries and errors out of medical-domain services.

No fake production EGISZ success path is allowed. A real EGISZ/REMD transport adapter must only be wired when the selected integration contract, endpoint, credentials/certificates and test environment are known. Until then the provider interfaces remain explicit boundaries rather than demo network calls.

Next roadmap item after stage 11 validation is stage 12 REMD workflow. Extend the existing `medical_document_registrations` model instead of creating a parallel document-registration system.

## Stage 12 handoff — REMD workflow — 2026-10-13

Stage 12 extends the existing `medical_document_registrations` model through migration `024_remd_registration_workflow.sql`; it does not create a second registration subsystem. Each REMD registration can reference the durable Stage 11 `integration_jobs` queue and records requester, submit/attempt timestamps and sanitized error code.

REMD submission now has explicit local readiness gates before a job can be created: immutable document-version hash, active document, clean scan result, valid qualified clinician signature, verified doctor regulatory profile and active medical-organization membership. Generic manual EGISZ job creation rejects `remd`, so this validation cannot be bypassed accidentally.

Integration lifecycle methods keep the registration record synchronized when a REMD job is claimed, retried, succeeds or fails. Provider result metadata may update only technical REMD state/external ID; clinical document text is not copied into integration errors, audit metadata or the admin REMD screen.

The admin UI at `/admin/integrations/remd` lists ready candidates and registrations, performs readiness checks, queues eligible immutable versions and retries failed jobs. It deliberately does not claim that a queued item was sent to EGISZ: there is still no live REMD transport adapter until the actual contract, test contour and credentials/certificates are known.

After Stage 12 validation, continue with the next roadmap item: contracts. Reuse existing patient profiles, medical organizations, appointments, consents and payment references rather than introducing parallel patient/service entities.
