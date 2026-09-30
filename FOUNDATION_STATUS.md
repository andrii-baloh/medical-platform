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
- ClamAV `clamd` adapter using streamed `INSTREAM` scanning of private S3 objects
- leased, retryable multi-worker-safe document scan worker with expired-processing reclaim and lease heartbeat
- infected/error files remain quarantined and cannot be downloaded or shared
- existing pre-scan active files are quarantined by migration 006 instead of being silently declared clean
- patient document UI exposes Проверяется / Проверен / Заблокирован / Ошибка проверки states

## Important development limitation

`DOCUMENT_SCAN_PROVIDER=development-pass` is a local-development stub only and does not detect malware. `DOCUMENT_SCAN_PROVIDER=clamav` uses a real ClamAV daemon through the `INSTREAM` protocol, but the ClamAV path has not been runtime-tested on this computer because Docker is unavailable. Production still requires validated signature updates, monitoring, capacity limits and deployment hardening.

The development payment provider likewise does not move real money or process card data.

## Validated locally

- root 0.9 production build passed after the document-security milestone
- API TypeScript typecheck passes after the ClamAV adapter and scan-lease recovery hardening
- API production build passes after the ClamAV adapter and scan-lease recovery hardening
- Web TypeScript/build validation from the 0.9 milestone remains clean

## Not runtime-validated on this computer

Docker is not installed and PostgreSQL is not reachable. Therefore these are not claimed as verified:

- executing migrations 003–007 against PostgreSQL
- starting PostgreSQL/Keycloak/MinIO/LiveKit/ClamAV through Docker
- real two-party patient ↔ doctor WebRTC
- real document scan against the ClamAV daemon
- full booking → payment → upload/quarantine → video → signed result → notification E2E flow

## Still required for production

- runtime validation and production hardening of the implemented ClamAV scanner integration
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
