# Security baseline

This is the baseline, not a legal compliance certificate.

## Identity
- OIDC Authorization Code flow; PKCE where applicable.
- MFA required for doctors and administrators before production.
- No custom password database in the application.
- Short-lived access tokens; refresh-token rotation handled by the IdP.
- Brute-force protection and account recovery handled by the IdP.

## Authorization
- API checks ownership/relationship for every protected resource.
- UI visibility is never treated as an authorization boundary.
- Roles are coarse (`patient`, `doctor`, `admin`); sensitive resources also use relationship checks (ABAC).
- Admin role must not imply unrestricted medical-record access.

## Data
- TLS everywhere in production.
- PostgreSQL encryption at rest at infrastructure level; encrypted backups.
- Private object buckets only.
- Short-lived signed URLs; default 5 minutes.
- No PII in object keys, logs, metrics, URLs or analytics events.
- Secrets only in a secret manager, never in the repository.
- Separate production, staging and development environments and credentials.

## Audit
Audit events are append-only application records for: login-sensitive operations, appointment changes, medical-document access, permission grants/revocations, consultation signing and admin actions. Production retention and tamper-evidence must be defined per jurisdiction.

## Documents
The upload-to-activation pipeline is implemented in the API and the scan worker:

1. Upload intent creates a row with status `uploading` and a short-lived signed PUT URL.
2. On `complete`, the API inspects the object server-side:
   - declared size vs `HeadObject` content length;
   - declared `Content-Type` vs stored content type;
   - magic-byte sniffing (the browser `Content-Type` is never trusted on its own);
   - authoritative SHA-256 recomputed from the object body and compared with the client-provided checksum when supplied.
3. Any mismatch is recorded as a quarantine-integrity failure (`size_mismatch`, `content_type_mismatch`, `object_body_missing`, `magic_bytes_mismatch`, `sha256_mismatch`) and the document stays `quarantined` with `scan_status='error'`.
4. A clean integrity check moves the document to `quarantined` with `scan_status='pending'` and enqueues a leased `document_scan_jobs` row.
5. The scan worker asks the configured `DOCUMENT_SCANNER` provider (`development-pass` locally, `clamav` for real scanning) for a verdict. The verdict type is `clean | infected | error`.
6. Only `clean` promotes the document to `status='active'`, `scan_status='clean'`.

**Scan error is not an allow.** A verdict of `error`, an exception in the scanner, or a lease failure keeps the document `quarantined` with `scan_status='error'` and it remains unavailable through downloads or doctor access. The same applies to `infected`. Migration `006_document_security.sql` also refuses to silently declare pre-existing documents clean: they are moved to `quarantined` with `scan_status='pending'` until the worker processes them.

Doctor access is a separate boundary from scanning. A `clean`/`active` document is still not visible to a doctor without an explicit `document_grants` row created by the patient (granted_by_user_id, optional expires_at, revocable via revoked_at) and a patient/doctor relationship.

Still required before real-patient launch:
- object versioning/retention policy;
- KMS-backed encryption or application envelope encryption where required.

## Web hardening
- strict CSP;
- HSTS;
- secure/HTTP-only/SameSite cookies for web sessions;
- CSRF protection on cookie-authenticated mutations;
- rate limiting/WAF;
- dependency/SBOM scanning;
- SAST and secret scanning in CI;
- no third-party analytics on medical pages unless explicitly reviewed.
