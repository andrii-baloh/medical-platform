# Stage 18 — audit

Status: source-complete for the event catalogue and the missing access events, runtime-unverified.

## What audit already was

`audit_events` exists since migration 001 and already carries: actor, actor subject, action,
resource type and id, outcome, request id, timestamp and JSON metadata. Many modules already
emit events, so Stage 18 does not build a second audit subsystem — it closes gaps and gives the
event names one source of truth.

## What this stage adds

- `apps/api/src/audit/audit-events.ts` — the event catalogue (`AUDIT_EVENT`) with the rules that
  apply to every event: no clinical free text, no tokens, no document content, and denied actions
  recorded with `outcome: "denied"`.
- `consultation.opened` — a patient opening their consultation is now audited (resource:
  appointment, metadata: status and role only). The doctor side already emitted
  `doctor.appointment.view`.
- `user.role.changed` — when the trusted role set of an account actually changes after token
  verification, the change is written inside the same transaction as the role rows, with the
  added and removed roles. It is not written on every request.

## Coverage against the brief

| Brief event | Emitted as | Status |
|---|---|---|
| login | Keycloak/ESIA IdP events; `federated_auth_events` for ESIA | partial — platform does not ingest IdP login events |
| logout | — | gap: no server session, logout is client-side |
| failed login | IdP-side | gap: the API never sees a failed credential check |
| patient record opened | `medical_record.view`, `medical_encounter.view`, `doctor.patient.view` | covered |
| document viewed / downloaded | `document.download_url`, `document.versions.read` | covered |
| document modified | `document.upload.intent`, `document.upload.complete` | partial — version creation happens in the scanner worker |
| consultation opened | `doctor.appointment.view`, `consultation.opened` | covered |
| signature created | `medical_document.signature.create` | covered |
| consent signed / revoked | `consent.sign`, `consent.revoke`, `consent.list` | covered |
| payment operation | `payment.session.create`, `payment.webhook.process`, `payment.refund.request` | covered |
| admin action | `admin.doctor.update`, commercial/admin events | covered |
| role change | `user.role.changed` | covered |
| representative access | — | gap: representatives have no clinical access path yet, so there is nothing to audit |

## Known gaps (must stay visible)

- **Authentication events** (login, logout, failed login) are owned by the identity provider. A
  production audit contour needs an ingestion path for Keycloak/ЕСИА events, or explicit session
  endpoints on the API; neither exists yet.
- **Representative access** is not implemented in clinical endpoints; when it is, every
  representative action must be audited with both the representative and the patient.
- **Document modification** through the scanner-driven version creation is not audited as a
  separate event; only the upload intent/complete pair is.
- No audit retention or archival yet: retention for `audit_logs` is intentionally refused by the
  retention engine until a legal procedure exists.

## Verification

- API typecheck: PASS
- production build: PASS
- infrastructure validation: PASS
- API boot: PASS (routes unchanged, module graph resolved)

Not verified against a database: no PostgreSQL on this workstation.
