# Foundation status 0.8

## Completed in code

- provider-neutral web/API/database/storage architecture
- OIDC bearer-token verification at the API boundary
- trusted role synchronization from verified identity claims
- PostgreSQL domain model and versioned migrations
- transactional booking + idempotency + leased outbox processing
- patient ownership and doctor relationship authorization
- private S3 medical documents and explicit document grants
- audit event trail and appointment state history
- unified responsive patient and doctor workspaces
- consultation draft lifecycle and immutable signed version history
- SHA-256 version hash chaining and amendment workflow
- patient read-only access to signed consultation versions
- provider-neutral video abstraction with LiveKit adapter
- backend-enforced video role, relationship, status and join window
- short-lived video tokens that are not persisted
- patient and doctor LiveKit UI with camera/microphone controls
- in-app notifications with unread/read/read-all UI and API
- payment-status notifications generated from the transactional outbox
- provider-neutral payment interface
- development-only payment adapter that does not move money or process card data
- payment session records and provider/session identifiers
- webhook event deduplication and payment status reconciliation
- refund request records with refundable-amount protection
- patient payment actions on booking success and consultation detail
- admin dashboard and responsive admin shell
- admin doctor verification/publication controls
- admin appointment and payment operational tables
- searchable audit trail
- admin API authorization requiring both OIDC admin role and persisted admin membership
- admin views intentionally exclude clinical free text
- local LiveKit Docker configuration
- migration 005 for payment reconciliation/refund structures

## Validated locally

- API TypeScript typecheck passes
- Web TypeScript typecheck passes
- patient UI milestone 0.6 production build passed
- doctor UI milestone 0.7 production build passed
- current 0.8 root TypeScript typecheck passes
- current 0.8 root production build passes, including all patient/doctor/admin routes
- after the final payment concurrency/status hardening, API typecheck and API production build pass again

## Not runtime-validated on this computer

Docker is not installed and PostgreSQL is not currently reachable. Therefore the following are not claimed as verified:

- executing migrations `003_video_notifications.sql`, `004_outbox_claiming.sql` and `005_payments_admin.sql` against PostgreSQL
- starting the local PostgreSQL/Keycloak/MinIO/LiveKit Docker stack
- real two-party patient ↔ doctor WebRTC session through LiveKit
- full end-to-end booking → payment event → video → signed result → notification flow
- payment webhook processing against a running PostgreSQL instance

## Intentionally not declared production-complete

- real launch-country payment provider and settlement/payout integration
- provider-specific production webhook signature verification using raw request payloads where required
- real doctor credential/licensing verification operations
- country-specific clinician e-signature / legal document signing
- outbound email/SMS/push delivery providers
- antivirus/document quarantine worker
- backup/restore automation and tested disaster recovery
- KMS/envelope encryption integration
- observability/alerting
- production CI/CD and security scanning
- production MFA enforcement for doctor/admin accounts
- country-specific retention, consent and telemedicine configuration

The next product milestone after 0.8 is production hardening plus the remaining operational modules such as support, outbound notifications and real payment-provider selection for the first launch country.
