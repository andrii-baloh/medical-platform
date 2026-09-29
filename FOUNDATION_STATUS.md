# Foundation status 0.5

## Completed in code

- provider-neutral web/API/database/storage architecture
- OIDC bearer-token verification at the API boundary
- trusted role synchronization from verified identity claims
- PostgreSQL domain model
- transactional booking + idempotency + outbox
- patient ownership and doctor relationship authorization
- private S3 medical documents and explicit document grants
- audit event trail and appointment state history
- doctor dashboard, calendar, patient list/card and appointment workspace
- consultation draft lifecycle
- signed immutable consultation snapshots
- SHA-256 version hash chaining and explicit amendment workflow
- completion rule requiring a signed current clinical version
- patient read-only access to signed consultation versions
- provider-neutral video abstraction with LiveKit adapter
- backend-enforced video participant role, relationship, status and join window
- short-lived video tokens that are not persisted
- patient and doctor LiveKit video UI with camera/microphone controls
- in-app notifications with unread/read/read-all API and UI
- leased PostgreSQL outbox worker with deduplication and crash-recovery lease expiry
- local LiveKit Docker configuration
- responsive desktop/mobile doctor UI

## Validated locally

- API TypeScript typecheck passes
- Web TypeScript typecheck passes
- API production build has passed during this milestone
- Web production build has passed during this milestone

The final build sequence must be rerun after the last 0.5 edits before committing the milestone.

## Not runtime-validated on this computer

Docker is not installed and PostgreSQL is not currently reachable. Therefore the following are not claimed as verified:

- executing migrations `003_video_notifications.sql` and `004_outbox_claiming.sql` against PostgreSQL;
- starting the local PostgreSQL/Keycloak/MinIO/LiveKit Docker stack;
- real two-party patient ↔ doctor WebRTC session through LiveKit;
- full end-to-end booking → video → signed result → notification flow.

## Intentionally not declared production-complete

- real doctor onboarding and admin verification console
- country-specific clinician e-signature / legal document signing
- payment provider adapter and webhook reconciliation
- outbound email/SMS/push delivery providers
- antivirus/document quarantine worker
- backup/restore automation and tested disaster recovery
- KMS/envelope encryption integration
- observability/alerting
- production CI/CD and security scanning
- production MFA enforcement for doctor/admin accounts
- country-specific retention, consent and telemedicine configuration

The next product milestone is the full UI/UX design pass, followed by payments/admin and production infrastructure hardening.
