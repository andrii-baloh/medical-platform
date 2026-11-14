# Security model — Stage 19

Status: source-complete, **not production-ready**, runtime-unverified. Docker and PostgreSQL are
not installed on this workstation, so nothing in this document is a claim that a control works in
a running deployment. No STRATO VPS or other live host was used for testing, migration or
configuration.

## 1. Inventory of existing controls

| Area | Mechanism | Where | How it was verified |
|---|---|---|---|
| Authentication | OIDC bearer token: signature, issuer, audience | `auth/oidc.guard.ts` | source + API boot |
| MFA for staff | `REQUIRE_PRIVILEGED_MFA` with AMR/ACR checks for privileged roles; production now refuses startup if it is disabled | `auth/oidc.guard.ts`, `config/env.ts` | startup guard unit tests; Keycloak live flow remains unverified |
| Authorization | Per-resource server-side checks (owner, doctor relationship, grant, admin role) | each module | source review |
| Denied access audit | `outcome: "denied"` events written before refusing | documents, consultation materials, telemedicine, admin | source |
| Rate limiting | Per-identity/TCP-peer read and write buckets; forwarded headers cannot select a new bucket | `auth/rate-limit.guard.ts` | spoofing regression tests added; distributed runtime unverified |
| Upload validation | size, declared MIME, magic bytes, optional SHA-256, quarantine + scanner | `documents/documents.service.ts` | source |
| Security headers (web) | nosniff, referrer policy, permissions policy | `apps/web/next.config.ts` | source |
| Security headers (API) | nosniff, frame deny, no-referrer, COOP/CORP, no-store | `apps/api/src/main.ts` | source + boot |
| Production config guard | refuses development placeholders, disabled rate limiting, disabled MFA, bypassed document scanning and unset country | `config/env.ts` | unit tests; live scanner unverified |
| Secrets hygiene | no secrets in git, `.env*` ignored, placeholders only | `.gitignore`, `.env.example` | `git status` |
| Audit integrity | append-only events, no clinical text, retention refused for `audit_logs` | `audit/*`, `retention/*` | source |

## Production payment safety gate (2026-11-12)

The API now refuses production startup when `PAYMENT_PROVIDER=development`,
`ROBOKASSA_TEST_MODE=true`, or the required Robokassa merchant credentials
(`ROBOKASSA_MERCHANT_LOGIN`, `ROBOKASSA_PASSWORD1`, `ROBOKASSA_PASSWORD2`)
are absent. The development adapter remains available outside production.
Four Vitest cases cover the gate in `apps/api/src/config/env.test.ts`.

This prevents simulated payment acceptance in production; it does **not**
validate real acquiring, callback signature delivery, refunds, KKT registration,
or fiscal receipt reconciliation. Those remain deployment acceptance tests.
Upstream integration: `@robokassa/sdk` ^1.0.0 (MIT; existing dependency).
No new dependency was introduced.

Production OIDC endpoint configuration is now fail-closed: both the issuer and remote JWKS URL must use HTTPS without embedded credentials, query parameters or fragments. This is implemented with the existing Node.js URL parser and Zod-based environment validation, and covered by six regression cases. The live Keycloak identity flow, certificate trust, network policy and token revocation still require deployment-level verification.

## 2. Gap analysis after Stage 19

Closed in this stage:

- API baseline security headers (previously none);
- production configuration guard against development placeholders, disabled privileged MFA and `development-pass` document scanning;
- denied-access audit events (previously documented but not emitted);
- isolated local test contour definition and lifecycle scripts;
- backup/restore scripts with explicit destructive confirmation;
- dependency and infrastructure audit script.

The production document-scanning guard requires `DOCUMENT_SCAN_PROVIDER=clamav` and `DOCUMENT_SCAN_WORKER_ENABLED=true`. This only validates configuration: ClamAV reachability, signature freshness, queue processing and quarantine-to-clean behavior still need live E2E verification. Development/test environments may continue to use the development adapter with synthetic data only.

Still open:

| Gap | Why it matters | Status |
|---|---|---|
| MFA enforcement not runtime-tested | Production startup now rejects `REQUIRE_PRIVILEGED_MFA=false`, but the Keycloak flow and privileged login still require real E2E checks | blocker |
| RBAC not exercised against a live database | permission matrix is source-inspected only | blocker |
| Encryption at rest and in transit | DB/object-storage TLS, disk encryption and key custody are deployment responsibilities | blocker |
| Secrets management | placeholders are rejected in production, but no vault/KMS integration exists | blocker |
| Backup and restore not executed | scripts exist; no restore has ever been verified | blocker |
| Log protection | access logs contain method/path/status only, but there is no central protected sink | partial |
| Vulnerability management | GitHub Actions runs production `npm audit --omit=dev --audit-level=high` and Trivy filesystem vulnerability/secret scanning (`aquasecurity/trivy-action@v0.36.0`, HIGH/CRITICAL, `ignore-unfixed: true`, blocking exit code); both failed in CI #43514964135 on 2026-11-14. Container image scanning and remediation are not verified. | blocker |
| Brute-force / password policy | delegated to Keycloak; realm policy not reviewed here | partial |
| Session policy | token lifetime/refresh owned by the IdP; no revocation list in the API | blocker |
| Threat model review | drafted below, not reviewed with the customer | partial |
| Incident response | Stage 21 | planned |

### Reverse-proxy rate-limit limitation

Anonymous requests are currently bucketed by the actual TCP peer, not by client-supplied `X-Forwarded-For`. This prevents spoofed headers from bypassing throttling, but clients behind one ingress proxy share a bucket. Before exposing production traffic, implement a trusted-proxy allowlist and shared distributed rate-limit store (for example Redis) or enforce anonymous throttling at the ingress. `TRUST_PROXY=true` alone does **not** authorize trusting arbitrary forwarding headers.

## 3. Threat model (draft)

Assets: patient identity data, clinical records and conclusions, documents, chat/materials,
payment and fiscal records, audit trail, credentials and tokens.

Actors: anonymous internet user, authenticated patient, legal representative (future), doctor,
administrator, compromised staff account, malicious insider, payment provider.

Primary threats and mitigations:

- **IDOR on clinical objects** — every clinical route resolves the object through the caller's
  relationship; denied attempts are audited.
- **Privilege escalation via token claims** — roles are re-validated against `user_roles`, not
  trusted from the token alone; admin and doctor checks are server-side.
- **Document exfiltration** — private bucket, short-lived signed URLs, owner/grant check, access
  log table plus audit event.
- **Uploaded malware** — quarantine, magic-byte validation, ClamAV scan before activation.
- **Brute force and enumeration** — rate limiting per identity/IP; 404/403 do not disclose object
  contents.
- **Payment callback forgery** — provider signature verification, amount match, idempotent event
  store.
- **Fiscal receipt loss** — transactional queue plus leased worker.
- **Audit tampering** — append-only convention; audit retention is refused until a legal
  procedure exists.
- **Insider bulk export** — no export endpoint; reads are audited and rate limited.

## 4. Data classification

| Class | Examples | Handling |
|---|---|---|
| Special category (health) | encounter, conclusion, diagnoses, chat, materials | server-side authorization, audit, no external logging, retention policy required |
| Personal data | profile, phone, email, ESIA identity | same as above; minimization in audit metadata |
| Payment data | payments, refunds, receipts | no card data stored; fiscal data retained per accounting rules |
| Credentials and secrets | tokens, passwords, keys | never logged, never committed, IdP/vault custody |
| Technical data | request ids, statuses, timings | may be logged without patient content |

## 5. Isolated local test contour

`scripts/test-up.ps1` starts Docker compose under the project name `medicare-test` with
`.env.test` (separate ports, volumes and test-only credentials). `.env.test.example` documents
every value; test data must never include real patients. `scripts/test-down.ps1` removes the
contour, including volumes unless `-KeepVolumes` is passed.

Backups: `scripts/backup.ps1` writes a custom-format dump into `backups/`.
Restore: `scripts/restore.ps1 -Dump <file> -Confirm` refuses to run without `-Confirm`, refuses
project names containing `prod`, and must be followed by an integrity check.

Dependency and infrastructure audit: `scripts/security-audit.ps1`.

None of these scripts has been executed on this workstation: Docker is absent. They are
definitions, not evidence.

## 6. Production blockers (must stay visible)

1. MFA enforcement verified end-to-end for doctor and admin accounts.
2. RBAC matrix verified against a live database for every clinical resource.
3. TLS termination, encryption at rest and key custody defined with the deployment provider.
4. Secret manager integration and rotation (no environment placeholders).
5. Verified backup and **restore** with integrity checks and documented RPO/RTO.
6. Session lifetime, revocation and logout semantics agreed with the identity provider.
7. Central protected log sink with retention and access control.
8. Vulnerability management in CI (dependency and container scanning).
9. Legal hold for retention (Stage 17) and abandoned-run recovery.
10. Security review of the deployment contour by the customer's security function.

Until these are closed, the platform must not be described as production-ready.


## Production CORS configuration gate — 2026-11-12

The API uses NestJS 11 / Express 5 CORS support (MIT) and Zod 4 validation (MIT); no third-party source code was copied and no new dependency was introduced. The production startup guard now rejects the development `http://localhost:3000` default, wildcard origins, non-HTTPS origins, URL paths, and credential-bearing origins in `CORS_ORIGINS`. Configure a comma-separated allowlist of exact HTTPS origins for the deployed web clients. Development remains unchanged. The API's existing `enableCors` uses that same environment variable.

This is an origin allowlist, not an authentication or CSRF substitute. Deployment still requires TLS termination, correctly configured reverse proxies, verified session protections, and real end-to-end authorization tests. CI checks are tracked separately; code commits do not imply tests passed.

## Dependency security findings — GitHub Actions, 2026-11-11

Evidence: [CI run 43103159346](https://github.com/andrii-baloh/medical-platform/actions/runs/43103159346), commit `5510a08`. API/Web typecheck, 24 Vitest tests and production build **passed**. The overall workflow **failed** because both vulnerability gates detected findings. Do not bypass these gates.

- `multer@2.4.0`: HIGH denial-of-service on aborted requests with asynchronous file filtering; Trivy CVE-2026-113872 / npm GHSA-q7qp-rjg7-q26m. Trivy reports fixed version `2.5.0`. Transitive dependency of `@nestjs/platform-express`.
- `postcss@8.4.31`: two HIGH findings in Trivy (CVE-2026-45623, CVE-2026-73646); npm also reports multiple PostCSS advisories. Dependency supplied through `next`; `npm audit fix --force` proposes `next@16.4.6`, a breaking major upgrade requiring compatibility testing.
- `fast-xml-parser<=5.11.2`: npm reports quadratic CPU consumption (GHSA-474x-hrwr-fgx4), with a non-forced `npm audit fix` available.

Remediation: upgrade to registry-confirmed patched releases, regenerate and commit `package-lock.json`, then run `npm ci`, API/Web typecheck, Vitest, production build, `npm audit --omit=dev --audit-level=high` and Trivy. For PostCSS, test a supported patched Next.js release or a narrowly scoped compatible override; do not suppress findings or force an untested major upgrade. Repeat clinical/runtime regressions after framework changes.

Open-source scanner upstreams: [npm CLI](https://github.com/npm/cli) (Artistic-2.0), [Trivy](https://github.com/aquasecurity/trivy) (Apache-2.0), [Vitest](https://github.com/vitest-dev/vitest) (MIT). No third-party source code copied.

## LiveKit production startup gate (2026-11-12)

The API now refuses production startup unless `LIVEKIT_URL`, `LIVEKIT_PUBLIC_URL`, `LIVEKIT_API_KEY` and `LIVEKIT_API_SECRET` are configured. Both URLs must use encrypted `https://` or `wss://` transport and must not contain embedded credentials. The existing LiveKit server SDK (`livekit-server-sdk` ^2.19.1, Apache-2.0) remains the provider adapter; no dependency was added. Regression tests cover missing credentials and insecure endpoints.

This is configuration validation only. It does **not** prove LiveKit connectivity, TLS certificate validity, country-specific media residency, TURN routing, or an end-to-end clinical video call. Those remain production acceptance blockers.

## Medical object storage production gate (2026-11-12)

Production API startup now requires an explicit `S3_ENDPOINT` using HTTPS without URL-embedded credentials or query parameters, plus nonempty `S3_ACCESS_KEY` and `S3_SECRET_KEY`. This avoids an implicit S3 destination or plaintext transport for clinical uploads. Six Vitest cases cover the new validation. Existing AWS SDK for JavaScript v3 (`@aws-sdk/client-s3` ^3.879.0, Apache-2.0, upstream: https://github.com/aws/aws-sdk-js-v3) is retained; no new dependency or copied upstream source.

This configuration gate does not verify server certificate trust, region/data residency, bucket policy, server-side encryption, credentials validity or key rotation. Those remain live deployment acceptance checks. Dependency vulnerability CI gates remain failing independently and must not be bypassed.
