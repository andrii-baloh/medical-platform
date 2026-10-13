# Foundation status 0.13

## Recovered and verified

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
- PostgreSQL migrations 001–010
- local Docker integration definition for PostgreSQL, Keycloak, MinIO, ClamAV, LiveKit, API and Web
- Windows development scripts and static infrastructure validation

## Current recovery validation

- root TypeScript typecheck: PASS
- API production build: PASS
- Web production build: PASS
- Next.js pages generated: 22
- infrastructure YAML/JSON/bind-source validation: PASS
- Docker Compose config rendering: PASS
- PowerShell script syntax: PASS

## Runtime status

Full Docker runtime/E2E is not currently declared verified because Docker Desktop on this computer reports a WSL startup problem. Source recovery is independent of that machine-level issue.

## Not production-complete

- country-specific medical/legal compliance validation
- production clinician identity proofing and e-signature
- production payment provider and reconciliation
- production email/SMS/push provider configuration
- KMS/envelope encryption where required
- tested production backup/restore and disaster recovery
- production observability/alerting and security scanning
- retention/deletion policy implementation
- country-specific consent, telemedicine and cross-border data rules

Do not use local demo identities, credentials or real patient data outside an isolated development environment.
