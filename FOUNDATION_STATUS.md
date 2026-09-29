# Foundation status 0.4

## Completed

- provider-neutral web/API/database/storage architecture
- OIDC bearer-token verification at the API boundary
- trusted role synchronization from verified identity claims
- PostgreSQL domain model
- transactional booking + idempotency + outbox
- patient ownership and doctor relationship authorization
- private S3 medical documents and explicit document grants
- audit event trail
- appointment state history
- doctor dashboard
- doctor calendar and concrete slot management
- weekly working-hours template
- doctor patient list and patient card
- doctor appointment workspace
- consultation draft lifecycle
- signed immutable consultation snapshots
- SHA-256 version hash chaining
- explicit amendment workflow
- completion rule requiring a signed current clinical version
- responsive desktop/mobile doctor UI
- local Keycloak doctor/patient demo identities
- self-contained doctor UI preview

## Intentionally not declared complete

- real doctor onboarding and admin verification console
- country-specific clinician e-signature / legal document signing
- video provider adapter and room-token service
- payment provider adapter and webhook reconciliation
- email/SMS/push outbox worker
- antivirus/document quarantine worker
- backup/restore automation
- KMS/envelope encryption integration
- observability/alerting
- production CI/CD and security scanning
- country-specific retention, consent and telemedicine configuration

The next engineering milestone should connect video consultation rooms and patient-visible signed results without weakening the access boundaries introduced here.
