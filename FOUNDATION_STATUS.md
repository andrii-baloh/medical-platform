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

Database migrations currently run from `001_initial.sql` through `023_egisz_integration.sql`.

## Validation on 2026-10-13

- root TypeScript typecheck: PASS
- API TypeScript typecheck after the EGISZ changes: PASS
- API production build after the EGISZ changes: PASS
- Web production build: PASS
- Next.js pages generated: 23
- infrastructure static validation: PASS
- `git diff --check`: PASS

The web build initially exposed an imported root `route.ts` that conflicted with the real root `page.tsx`. The conflicting handler only served the historical `igor.html` artifact and was removed; the actual Next.js home page remains the root route.

## Runtime status for this change

Docker CLI is not installed on the HP workstation used for this change. Therefore migration `023`, PostgreSQL execution and full Docker/E2E runtime are not claimed as locally verified here. Source/type/build validation is complete; database/runtime validation must run in a Docker/PostgreSQL-capable environment before production use.

## EGISZ boundary status

Stage 11 provides the durable integration boundary and queue semantics, but no fake EGISZ network success path is implemented. A real provider adapter must be wired only after the selected integration contract, endpoint, test environment and credentials/certificates are known.

## Not production-complete

- live EGISZ/REMD provider integration and conformance testing
- production clinician identity proofing and qualified electronic-signature provider
- production payment provider and reconciliation/KKT
- production email/SMS/push provider configuration
- KMS/envelope encryption where required
- tested production backup/restore and disaster recovery
- production observability/alerting and security scanning
- retention/deletion policy implementation
- final Russian legal/compliance validation for the selected deployment and medical organization

Do not use local demo identities, development signatures, development credentials or real patient data outside an isolated development environment.
