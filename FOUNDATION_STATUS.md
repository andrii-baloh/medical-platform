# Foundation status 0.12

## Completed in code

- provider-neutral web/API/database/storage architecture
- OIDC bearer-token verification and persisted patient/doctor/admin role checks
- responsive patient, doctor and admin workspaces
- transactional booking, idempotency and leased outbox processing
- private S3 medical documents with explicit doctor grants
- quarantine-before-activation document lifecycle with server-side MIME/signature/SHA verification
- provider-neutral scanner plus ClamAV `INSTREAM` adapter and leased scan jobs
- consultation draft lifecycle and immutable signed SHA-256 version chain
- provider-neutral LiveKit video adapter and patient/doctor video UI
- in-app notifications, leased outbound email-delivery queue and admin delivery journal
- patient/admin support ticket workflow with threaded replies, status and priority controls
- provider-neutral payment interface, development provider, webhook dedupe and refund records
- admin dashboard, doctor verification/publication, appointments, payments, support, delivery and audit views
- request correlation with validated/generated `x-request-id`
- AsyncLocalStorage request context; AuditService automatically records the active request ID
- structured request completion logs limited to requestId, method, path, status and duration
- liveness `/health/live` separated from DB-backed readiness `/health/ready`; `/health` remains readiness-compatible
- verified OIDC `amr`/`acr` extraction and configurable MFA-evidence enforcement for doctor/admin tokens
- per-instance fixed-window API rate-limit safety net keyed by subject or public client IP, with stricter write limits
- GitHub Actions CI baseline for install, typecheck, production build, critical dependency audit and whitespace checks
- PostgreSQL custom-format backup, archive verification and explicit-target destructive restore scripts
- operational runbook for health checks, migrations, backup drills, secret rotation and provider monitoring

## Security boundary notes

`REQUIRE_PRIVILEGED_MFA=false` remains the local-development default because the fixture Keycloak realm is not enrolled for MFA. Production can enable the API evidence boundary only after the IdP issues the expected `amr`/`acr` claims. This is not a substitute for country-specific clinician identity or qualified e-signature requirements.

The built-in rate limiter is process-local. It is useful as an application safety net but is not cluster-wide; multi-instance production deployments still require edge/distributed abuse controls.

Access logging does not intentionally record request bodies, query strings, Authorization headers, tokens, email addresses or clinical fields.

## Development-only adapters

- `PAYMENT_PROVIDER=development` does not move money or process card data.
- `NOTIFICATION_EMAIL_PROVIDER=development` simulates a successful send and does not contact an external mail service; its worker is disabled by default.
- `DOCUMENT_SCAN_PROVIDER=development-pass` does not detect malware. The ClamAV adapter requires a real `clamd` deployment and current signatures.

## Validation status

- 0.12 root TypeScript typecheck: passed
- 0.12 root production build: passed
- 0.12 `npm audit --audit-level=critical`: passed; one high and one moderate PostCSS finding remain behind a breaking Next.js major upgrade
- 0.12 PowerShell backup/verify/restore scripts: syntax parsed successfully
- 0.12 `git diff --check`: passed (line-ending warnings only)
- Docker/PostgreSQL runtime validation remains unavailable on this computer

## Not runtime-validated on this computer

Docker is not installed and PostgreSQL is not reachable. Therefore these are not claimed as runtime-verified:

- executing migrations 003–009 against PostgreSQL
- starting PostgreSQL/Keycloak/MinIO/LiveKit/ClamAV through Docker
- multi-process outbox, scan-job and outbound-delivery leases against PostgreSQL
- real two-party patient ↔ doctor WebRTC
- real ClamAV scan or outbound email delivery
- privileged MFA flow against an MFA-enabled Keycloak realm
- full booking → payment → upload/quarantine → video → signed result → notification/support E2E flow

## Still required for production

- launch-country payment provider, settlement/payout integration and production webhook verification
- real outbound email provider and any required SMS/push adapters
- edge/distributed rate limiting and WAF/abuse controls for multi-instance deployment
- production IdP MFA enrollment/policies and operational recovery procedures
- runtime validation/monitoring of ClamAV, signature updates and capacity limits
- real clinician licensing/onboarding operations and legally appropriate e-signature
- scheduled/encrypted backup execution, off-host retention and tested disaster recovery (manual backup/restore scripts now exist)
- KMS/envelope encryption where required
- metrics/tracing aggregation, alerting and log shipping
- deployment automation and broader software-supply-chain/security scanning beyond the current CI baseline
- retention/deletion policy implementation
- country-specific consent, telemedicine, data-residency and cross-border configuration
