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
- organization-owned paid medical service catalogs and doctor service offers
- immutable versioned contract text and patient contract acceptance evidence
- immutable patient commercial snapshots for appointment price/terms/organization/doctor
- patient pre-payment view of organization, license, service, doctor, price, refund terms and service procedure
- server-side payment gate requiring a matching accepted commercial contract
- admin paid-service configuration screen and doctor slot-to-offer linking
- Robokassa payment adapter (MIT `@robokassa/sdk`) with invoice references, signed callback verification and refunds
- provider-neutral fiscalization boundary with a Robokassa KKT adapter for the 54-ФЗ final receipt
- durable fiscal receipt queue with a lease-based worker, confirmed FN/document/attribute storage
- raw provider callback log (`payment_webhooks`) with signature outcome, separate from `payment_events`
- patient receipt state on the checkout card and a KKT section on the admin payments screen
- telemedicine session bound to `appointment → medical encounter` with its own lifecycle and timeline
- session join timestamps, connection-loss/technical events and recording state (54-ФЗ not implied)
- session state surfaced in the video call panel for both patient and doctor
- consultation chat and materials bound to the medical encounter (`consultation_materials`)
- attachment of existing patient documents to a consultation without duplicating storage
- read-only chat after completion and no clinical text in audit metadata
- retention policy registry with explicit period and legal basis, journaled runs and a deletion log
- preview (dry-run) and a retention worker that is disabled by default
- automatic retention only for consultation materials and medical-document soft delete; auditing, payment and consent classes refuse execution

Database migrations currently run from `001_initial.sql` through `031_retention_policies.sql`.

## Validation on 2026-11-03

- API TypeScript typecheck: PASS after Stage 14 changes
- Web TypeScript typecheck: PASS after Stage 14 changes
- production build: PASS after Stage 14 changes
- infrastructure static validation: PASS after Stage 14 changes
- `git diff --check`: PASS
- Stage 15: API and Web typecheck PASS, production build PASS, infrastructure validation PASS
- Stage 16: API and Web typecheck PASS, production build PASS, infrastructure validation PASS
- Stage 17: API typecheck PASS, production build PASS, infrastructure validation PASS

## Runtime status for this change

Docker CLI and PostgreSQL are not installed on the HP workstation used for this change. Therefore migrations `028`–`031`, PostgreSQL execution and full Docker/E2E runtime are not claimed as locally verified here. Source/type/build validation is separate from database/runtime validation and the latter must run in a Docker/PostgreSQL-capable environment before production use.

## Fiscalization boundary status

Stage 14 implements the 54-ФЗ final receipt as a provider boundary, not as a hand-rolled protocol:
`@robokassa/sdk` signs and transports `Receipt/Attach` and `Receipt/Status`, MedicalPlatform only
builds the documented payload and stores confirmed fiscal attributes. The development adapter
records `not_provided` and never pretends a receipt was issued. No live merchant credentials, KKT
contract or test contour were available, so no fiscal registration has been executed end-to-end;
correction and refund receipts remain unimplemented.

## EGISZ / REMD boundary status

Stage 11 provides the durable integration boundary and queue semantics. Stage 12 connects REMD registration to the existing immutable medical-document/version model and refuses to bypass readiness requirements through the generic integration-job endpoint.

A version is locally eligible for REMD only when it has an immutable SHA-256, belongs to an active and clean document, has a valid qualified clinician signature, the signing doctor's regulatory profile is verified and that doctor is linked to an active medical organization. These are local readiness gates, not a claim of EGISZ conformance.

No fake EGISZ/REMD network success path is implemented. A real provider adapter must be wired only after the selected integration contract, endpoint, test environment and credentials/certificates are known.

## Telemedicine session status

Stage 15 binds the existing LiveKit room to the clinical case: `telemedicine_sessions` references
the appointment and (when it exists) the medical encounter, keeps first-join timestamps, a
connection-loss counter and a recording state, and `telemedicine_session_events` is an append-only
timeline. The LiveKit provider boundary, `video_rooms` and the join-window rules are unchanged.

Recording is stored as state only. No egress/recording engine is implemented, so the default is
`not_recorded` and no recording is claimed. Session rows are created on the first room provisioning;
the migration itself has not been executed because Docker/PostgreSQL are unavailable here.

## Next roadmap item

After Stage 17, the next unfinished roadmap item is Stage 18: audit expansion. Extend the existing
`audit_events` stream with the event catalogue from the brief (patient record opened, document
viewed/downloaded/modified, signature created, consent signed, payment operation, admin action,
role change, representative access) while keeping clinical free text out of audit metadata.

## Not production-complete

- live EGISZ/REMD provider integration and conformance testing
- production clinician identity proofing and qualified electronic-signature provider
- production payment provider, reconciliation and KKT/fiscal receipt delivery
- production email/SMS/push provider configuration
- KMS/envelope encryption where required
- tested production backup/restore and disaster recovery
- production observability/alerting and security scanning
- telemedicine session recording/egress (state only today)
- configured retention policies with a customer-approved legal basis, storage-aware document purge and legal hold
- legal hold / litigation hold for retention (mandatory production blocker: a retention job must never delete held data)
- retention/deletion policy implementation
- final Russian legal/compliance validation for the selected deployment and medical organization

Do not use local demo identities, development signatures, development credentials or real patient data outside an isolated development environment.
