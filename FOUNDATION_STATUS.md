# Foundation status 0.9

## Completed in code

- provider-neutral web/API/database/storage architecture
- OIDC bearer-token verification and persisted role checks
- patient, doctor and admin workspaces
- transactional booking, idempotency and leased outbox processing
- private S3 medical documents and explicit doctor grants
- consultation draft lifecycle + immutable signed SHA-256 version chain
- provider-neutral LiveKit video adapter and patient/doctor video UI
- in-app notifications and generic payment-status notifications
- provider-neutral payment interface, development provider, webhook event dedupe and refund records
- admin dashboard, doctor verification/publication, appointments, payments and audit views
- migration 005 for payment/admin reconciliation structures
- migration 006 for document-security metadata and leased scan jobs
- server-side file-size/content-type checks
- PDF/JPEG/PNG/WebP magic-byte verification
- authoritative server-side SHA-256 verification after upload
- quarantine-before-activation document lifecycle
- provider-neutral `DocumentScannerProvider`
- leased, retryable multi-worker-safe document scan worker
- infected/error files remain quarantined and cannot be downloaded or shared
- existing pre-scan active files are quarantined by migration 006 instead of being silently declared clean
- patient document UI exposes Проверяется / Проверен / Заблокирован / Ошибка проверки states

## Important development limitation

`DOCUMENT_SCAN_PROVIDER=development-pass` is a local-development stub only. It does not detect malware. It exists so the quarantine workflow can be exercised without pretending that antivirus protection is present. A real scanner must replace it before staging/production.

The development payment provider likewise does not move real money or process card data.

## Validated locally

- API TypeScript typecheck passes after document-security implementation
- Web TypeScript typecheck passes after document-security UI changes
- previous 0.8 root production build passed with all patient/doctor/admin routes
- current 0.9 production build is used to validate the complete milestone before commit

## Not runtime-validated on this computer

Docker is not installed and PostgreSQL is not reachable. Therefore these are not claimed as verified:

- executing migrations 003–006 against PostgreSQL
- starting PostgreSQL/Keycloak/MinIO/LiveKit through Docker
- real two-party patient ↔ doctor WebRTC
- real document scan against an antivirus engine
- full booking → payment → upload/quarantine → video → signed result → notification E2E flow

## Still required for production

- real malware scanner / quarantine service integration
- launch-country payment provider and settlement/payout integration
- production webhook signature verification requirements for that provider
- real clinician licensing/onboarding operations
- country-specific clinician e-signature method
- outbound email/SMS/push providers and delivery tracking
- backup/restore automation and tested disaster recovery
- KMS/envelope encryption where required
- observability and alerting
- production CI/CD and security scanning
- MFA enforcement for doctor/admin
- country-specific retention, consent, telemedicine and data-residency configuration
