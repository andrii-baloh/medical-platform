# Foundation status 0.13

## Recovered foundation

- provider-neutral Web/API/database/storage architecture
- OIDC bearer-token verification at the API boundary
- trusted patient/doctor/admin role synchronization
- patient/family profile ownership controls
- public doctor catalog and appointment booking
- doctor dashboard, calendar, patient list and consultation workspace
- consultation draft lifecycle and immutable signed clinical snapshots
- SHA-256 clinical-version hash chaining
- protected medical-document upload/download/grant flow
- document quarantine and scanner worker with ClamAV adapter
- video provider boundary with LiveKit implementation
- notification/outbox modules
- development payment provider and admin payment surface
- support/admin modules
- favorite doctors and appointment rating/review flow
- local Docker integration definition for PostgreSQL, Keycloak, MinIO, ClamAV, LiveKit, API and Web
- Windows development scripts and static infrastructure validation

## Russian telemedicine roadmap source now present

The current source also contains:

- medical encounters separated from appointment records
- medical-record aggregation
- medical conclusions
- immutable medical-document versions and registration storage
- signature-provider abstraction and signature records
- versioned patient consents
- medical-organization regulatory data
- doctor regulatory credentials
- legal-representative relations and scoped permissions
- ESIA identity-linking architecture through Keycloak federation
- EGISZ integration boundary with organization, doctor, REMD and patient adapters
- durable EGISZ integration jobs, events, sanitized errors and retry scheduling
- REMD readiness checks and registration queue built on `medical_document_registrations`
- synchronized REMD registration/job lifecycle for queue, submit, retry, register and fail states
- admin REMD operations screen without clinical-document content

Database migrations currently run from `001_initial.sql` through `024_remd_registration_workflow.sql`.

## Validation on 2026-10-13

- root TypeScript typecheck: PASS after Stage 12 changes
- API TypeScript typecheck: PASS after Stage 12 changes
- production build: PASS after Stage 12 changes (API + Web, 24 Next.js routes)
- infrastructure static validation: PASS after Stage 12 changes
- `git diff --check`: PASS before final Stage 12 commit

## Runtime status for this change

Docker CLI is not installed on the HP workstation used for this change. Therefore migration `024`, PostgreSQL execution and full Docker/E2E runtime are not claimed as locally verified here. Source/type/build validation is separate from database/runtime validation and the latter must run in a Docker/PostgreSQL-capable environment before production use.

## EGISZ / REMD boundary status

Stage 11 provides the durable integration boundary and queue semantics. Stage 12 connects REMD registration to the existing immutable medical-document/version model and refuses to bypass readiness requirements through the generic integration-job endpoint.

A version is locally eligible for REMD only when it has an immutable SHA-256, belongs to an active and clean document, has a valid qualified clinician signature, the signing doctor's regulatory profile is verified and that doctor is linked to an active medical organization. These are local readiness gates, not a claim of EGISZ conformance.

No fake EGISZ/REMD network success path is implemented. A real provider adapter must be wired only after the selected integration contract, endpoint, test environment and credentials/certificates are known.

## Next roadmap item

After Stage 12 validation, the next unfinished roadmap item is the patient/medical-service contract layer. It must be added without duplicating appointments, consents, payments or medical-organization ownership already present in the domain model.

## Not production-complete

- live EGISZ/REMD provider integration and conformance testing
- production clinician identity proofing and qualified electronic-signature provider
- patient/medical-service contract workflow
- production payment provider, reconciliation and KKT
- production email/SMS/push provider configuration
- KMS/envelope encryption where required
- tested production backup/restore and disaster recovery
- production observability/alerting and security scanning
- retention/deletion policy implementation
- final Russian legal/compliance validation for the selected deployment and medical organization

Do not use local demo identities, development signatures, development credentials or real patient data outside an isolated development environment.
