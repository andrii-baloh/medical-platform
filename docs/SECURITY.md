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
Before real-patient launch add:
- malware scanning/quarantine;
- MIME sniffing instead of trusting browser `Content-Type`;
- hash verification;
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
