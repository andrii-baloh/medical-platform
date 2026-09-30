# Foundation status 0.10

## Completed in code

- provider-neutral web/API/database/storage architecture
- OIDC bearer-token verification and persisted patient/doctor/admin role checks
- responsive patient, doctor and admin workspaces
- transactional booking, idempotency and leased outbox processing
- private S3 medical documents with explicit doctor grants
- server-side file-size/content-type checks, magic-byte validation and authoritative SHA-256
- quarantine-before-activation document lifecycle
- provider-neutral document scanner plus ClamAV `INSTREAM` adapter
- leased, retryable document-scan jobs with crash recovery and lease renewal
- consultation draft lifecycle and immutable signed SHA-256 version chain
- provider-neutral LiveKit video adapter and patient/doctor video UI
- in-app notifications with unread/read-all UI
- migration 008 outbound notification delivery queue with leases, retry state and per-notification dedupe
- provider-neutral outbound email interface plus development-only simulated provider
- admin outbound-delivery journal
- provider-neutral payment interface, development provider, webhook event dedupe and refund records
- admin dashboard, doctor verification/publication, appointments, payments and audit views
- migration 009 support tickets/messages with user ownership and admin role enforcement
- patient support center with threaded replies
- admin support queue with status and priority controls
- support notifications contain only generic operational text; support message bodies are not copied into notification payloads

## Development-only adapters

`PAYMENT_PROVIDER=development` does not move money or process card data.

`NOTIFICATION_EMAIL_PROVIDER=development` simulates a successful send and does not contact an external mail service. The notification delivery worker is disabled by default.

`DOCUMENT_SCAN_PROVIDER=development-pass` does not detect malware. The ClamAV adapter is implemented but requires a real `clamd` deployment and current signature database.

## Validated locally

- root TypeScript typecheck passes through the 0.10 support/outbound-delivery changes
- 0.9 API/Web production build passed before the 0.10 communication/support additions
- final 0.10 production build must pass before the milestone is committed

## Not runtime-validated on this computer

Docker is not installed and PostgreSQL is not reachable. Therefore these are not claimed as runtime-verified:

- executing migrations 003–009 against PostgreSQL
- starting PostgreSQL/Keycloak/MinIO/LiveKit/ClamAV through Docker
- multi-process outbox, scan-job and outbound-delivery worker behavior against a real PostgreSQL instance
- real two-party patient ↔ doctor WebRTC
- real document scan against ClamAV
- real outbound email delivery
- full booking → payment → upload/quarantine → video → signed result → notification/support E2E flow

## Still required for production

- launch-country payment provider, settlement/payout integration and production webhook verification
- real outbound email provider and any required SMS/push adapters
- runtime validation/monitoring of ClamAV, signature updates and capacity limits
- real clinician licensing/onboarding operations
- legally appropriate clinician identity and e-signature method
- MFA enforcement for doctor/admin
- backup/restore automation and tested disaster recovery
- KMS/envelope encryption where required
- observability, alerting, CI/CD and security scanning
- retention/deletion policy implementation
- country-specific consent, telemedicine, data-residency and cross-border configuration
