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

## Stage 13 handoff — paid medical services and contracts — 2026-10-13

Stage 13 adds migration `025_paid_medical_services.sql` and reuses existing patients, appointments, medical organizations, doctors and payments. The new commercial domain contains organization-owned service catalogs/offers, immutable versioned contract text, patient contract records and append-only acceptance evidence. Accepted contracts preserve an immutable commercial snapshot of the organization/license, service, doctor, exact appointment price, conditions, refund terms, service procedure and contract version/hash.

Doctor slots can now reference a configured service offer. Booking copies that offer to the appointment and preserves the offer price. Legacy/unconfigured slots remain bookable for compatibility, but the payment API rejects payment-session creation until the appointment has a matching accepted patient contract. This is a server-side gate, not only a frontend check.

The patient booking/consultation UI uses `CommercialCheckoutCard` to show all required pre-payment facts and exact contract text before acceptance, then unlocks the existing payment flow. `/admin/services` provides configuration for service catalogs, contract templates/versions and offers; the doctor calendar can link new slots to an available offer. No legal contract text is fabricated or seeded by the application.

Conceptual architecture was checked against open healthcare service models (Medplum/FHIR HealthcareService-style service definitions and FHIR price-definition patterns); no external source code was copied into this repository.

Stage 13 source/type/build validation passed with 25 Next.js routes. PostgreSQL migration execution and end-to-end payment/contract runtime remain unverified on this HP because Docker/PostgreSQL runtime is unavailable here.

Next roadmap item is Stage 14 payment + KKT/fiscalization. Extend the existing provider abstraction, `payments`, `payment_events` and `refunds`; do not create a second payment subsystem.

## Stage 14 handoff — payments, 54-ФЗ and KKT — 2026-11-03

Stage 14 keeps the existing `payments`/`payment_events`/`refunds` model and adds the fiscal contour on top of it through migration `028_payment_fiscal_lifecycle.sql`. The payment state set now matches the roadmap (`created, pending, authorized, paid, failed, refunded, partially_refunded, cancelled`), inbound provider callbacks are stored in `payment_webhooks` with signature presence/validity, and the previously unused `payment_fiscal_receipts` queue is wired into the application.

Fiscal registration is a separate boundary (`apps/api/src/payments/fiscalization`) with a provider-neutral `FiscalReceiptProvider`, a Robokassa adapter built on the MIT `@robokassa/sdk` (`receipt.sendSecondCheck`, `receipt.getCheckStatus`), and a development adapter that records `not_provided` instead of faking a receipt. The final receipt is queued in the same transaction as appointment completion, so the fiscal duty cannot be lost between commits; the worker uses the same lease/claim/heartbeat pattern as document scanning, retries transport failures and stops on a final KKT decision.

Only attributes confirmed by the KKT operator are persisted (FN number, fiscal document number, fiscal attribute, registration date). Nothing about the receipt is calculated locally, and clinical text is never copied into fiscal payloads or admin read models.

Not done and not claimed: correction receipts, refund receipts, first-receipt attribute tracking (Robokassa issues it with the payment), and any live registration — there is no merchant/KKT test contour on this workstation and Docker/PostgreSQL are unavailable here. Migration `028`, the API typecheck, the Web typecheck and the production build are the only verified artefacts.

Next roadmap item after Stage 14 is Stage 15 telemedicine session: bind the existing LiveKit provider to the `appointment → encounter` chain instead of creating a parallel video system.

## Stage 15 handoff — telemedicine session — 2026-11-03

Stage 15 adds migration `029_telemedicine_sessions.sql` and does not touch the LiveKit provider boundary, `video_rooms`, `video_join_events`, the appointment model or the medical encounter model. A `telemedicine_sessions` row references the appointment, the medical encounter (when one exists) and the transport room, and carries lifecycle status, technical status, recording status, first-join timestamps, start/end time and a disconnect counter.

The session is created inside the same transaction that provisions the room, so a room can never exist without a clinical session; rooms created before this migration receive a session on their next join. Join and leave are appended to `telemedicine_session_events`, unexpected disconnects are reported by the client as `connection_lost`, and technical failures are recorded separately so a weak network does not look like a missed appointment. Completing or cancelling an appointment closes the session even if the doctor never calls the room-close endpoint.

Recording is deliberately state-only: no egress, no recording storage, no playback. `recording_status` stays `not_recorded` and the UI says that recording is not happening. Chat and consultation materials belong to Stage 16, retention to Stage 17.

Not verified: migration `029` execution on PostgreSQL, a real LiveKit room lifecycle against a running SFU, and the recording integration. Docker and PostgreSQL remain unavailable on this workstation.

Next roadmap item is Stage 16 consultation chat and materials: extend the existing document/encounter model with `ConsultationMaterial` rather than adding a parallel storage subsystem.

## Stage 16 handoff — consultation chat and materials — 2026-11-03

Stage 16 adds migration `030_consultation_materials.sql`. Every chat message and every attached material carries both `encounter_id` and `appointment_id`, so nothing can exist outside a medical case. Files are not duplicated: `medical_documents`, MinIO and the ClamAV pipeline stay the only storage path, and `consultation_materials.document_id` only classifies and links an existing document.

The API (`/v1/consultation-materials/appointments/:id`, `/chat`, `/documents`) resolves the caller through the encounter. A consultation is writable while the encounter is `scheduled`, `waiting` or `active` and becomes read-only after completion, cancellation or no-show. When an appointment exists but the encounter has not been created yet the API returns `409` instead of silently creating a clinical case. Attaching a document requires that the actor can already read it (owner or active doctor grant) and that it belongs to the same patient. Chat text is medical free text and is deliberately excluded from audit metadata.

The web app mounts `ConsultationChat` on both the patient consultation page and the doctor consultation workspace; the doctor side can attach documents from the patient's document list. Retention and deletion are explicitly out of scope (Stage 17), and no recording engine was added.

Not verified: migration `030` execution on PostgreSQL and a real two-party chat against the Docker stack. Typecheck, build, infrastructure validation and API boot (routes mapped) passed.

Next roadmap item is Stage 17 retention: classify data first, then apply policy-based, journaled deletion on top of the existing tables.

## Stage 17 handoff — retention — 2026-11-03

Stage 17 adds migration `031_retention_policies.sql` and deliberately invents no retention periods. `retention_policies` stores one row per roadmap data class with `retention_days`, `action`, `legal_basis` and `active`, and a database CHECK refuses an active policy without a period and a legal basis. `retention_runs` records every preview/execution with cutoff and counters (one running execution per class), and `retention_deletion_log` records every removed or soft-deleted object, so deletion is journaled rather than silent.

Only classes with a real executor can be processed: consultation materials are deleted row by row after the cutoff, and medical documents are soft-deleted (`status='deleted'`) without touching storage objects or immutable version history. Audit logs, security logs, payment records and consent records keep their policy rows but execution is refused with an explicit reason — these require a documented legal/accounting procedure, not a cron job. The admin API exposes list/configure/preview/run/runs; every policy change and run is also written to `audit_events`.

`RetentionWorker` is disabled by default and bounded by batch settings. No admin UI is provided yet, and no storage-object purge exists.

Not verified: migration `031` execution on PostgreSQL and any destructive run against real data. Typecheck, build, infrastructure validation and API boot passed.

Next roadmap item is Stage 18 audit expansion: extend the existing `audit_events` stream with the event catalogue from the brief (record opened, document viewed/downloaded/modified, signature created, consent signed, payment operation, role change, representative access) without copying clinical text.

## Stage 18 handoff — audit — 2026-11-03

Stage 18 does not create a second audit subsystem: `audit_events` already carries actor, resource, outcome, request id and metadata, and most modules already emit events. This stage adds `apps/api/src/audit/audit-events.ts` as the single place that names events and documents the rules (no clinical free text, no tokens, denied actions recorded as `denied`), then closes two real gaps: `consultation.opened` when a patient opens their consultation, and `user.role.changed` written in the same transaction as the trusted role rows whenever the role set actually changes.

`docs/AUDIT.md` contains the full coverage matrix against the brief. Remaining gaps are explicit: authentication events (login, logout, failed login) belong to Keycloak/ESIA and have no ingestion path yet; representative access has no clinical path to audit; document version creation by the scanner is not a separate event; audit retention remains refused by the retention engine until a legal procedure exists.

Not verified: runtime behaviour against PostgreSQL. Typecheck, build, infrastructure validation and API boot passed.

Next roadmap item is Stage 19 security/152-ФЗ: RBAC review, MFA enforcement, secrets management, encryption, backups/restore, log protection, headers, upload validation, rate limiting and the threat model — after the runtime contour is available in Docker.

## Stage 19 handoff — security baseline — 2026-11-03

Stage 19 is an inventory, gap analysis and a conservative baseline, not a production claim. `docs/SECURITY.md` lists every existing control with its location and how it was verified, the threat model, the data classification and ten production blockers.

Implemented: baseline security headers on every API response (nosniff, frame deny, no-referrer, COOP/CORP, no-store); a production-only configuration guard that refuses development placeholders in DATABASE_URL/OIDC/PAYMENT/S3/SMTP, disabled rate limiting and an unset DEPLOYMENT_COUNTRY; denied-access audit events at four authorization boundaries; an isolated Docker test contour (`medicare-test` project, `.env.test.example`, `scripts/test-up.ps1`/`test-down.ps1`); backup and restore scripts with explicit destructive confirmation; `scripts/security-audit.ps1` for dependency and infrastructure checks.

Not implemented and deliberately blocked: MFA end-to-end verification, RBAC matrix against a live database, encryption at rest/in transit, secret manager integration, verified restore, centralized protected logging, CI vulnerability gates, session revocation. No Docker or PostgreSQL is available on this workstation, so none of the scripts or controls has been executed; the STRATO VPS was not used.

Legal hold (Stage 17) and abandoned retention-run recovery remain mandatory blockers, listed in `docs/RETENTION.md` and `docs/SECURITY.md`.

Next roadmap item is Stage 20 data localization: deployment architecture for Russian infrastructure (database, object storage, backups, logs, LiveKit) with a provider chosen by the customer.

## Stage 20 handoff — data localization — 2026-11-03

Stage 20 is an architecture deliverable, not a provisioned environment. `docs/DATA_RESIDENCY.md` now contains the Russian deployment cell reference topology, a component requirement matrix (database, object storage, backups, logs, LiveKit, email/SMS, payments/KKT, identity) with explicit "must not be" constraints, the engineering constraints already enforced in code, and six acceptance criteria.

Nothing was provisioned and no provider was selected; the STRATO VPS was not used. Existing code already supports the topology without changes: `S3_ENDPOINT` and `LIVEKIT_URL` are configuration, payment/fiscal adapters are Russian, and production requires `DEPLOYMENT_COUNTRY` with development placeholders rejected.

Next roadmap item is Stage 21 incident response: `SecurityIncident` with timeline, containment actions, reporting deadline and regulator notification, built on the existing admin/audit patterns.
