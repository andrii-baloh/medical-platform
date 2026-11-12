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
| Vulnerability management | `npm audit` script exists; no CI gate, no container scanning | partial |
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


## Dependency security findings — GitHub Actions, 2026-11-11

Evidence: [CI run 43103159346](https://github.com/andrii-baloh/medical-platform/actions/runs/43103159346), commit `5510a08`. API/Web typecheck, 24 Vitest tests and production build **passed**. The overall workflow **failed** because both vulnerability gates detected findings. Do not bypass these gates.

- `multer@2.4.0`: HIGH denial-of-service on aborted requests with asynchronous file filtering; Trivy CVE-2026-113872 / npm GHSA-q7qp-rjg7-q26m. Trivy reports fixed version `2.5.0`. Transitive dependency of `@nestjs/platform-express`.
- `postcss@8.4.31`: two HIGH findings in Trivy (CVE-2026-45623, CVE-2026-73646); npm also reports multiple PostCSS advisories. Dependency supplied through `next`; `npm audit fix --force` proposes `next@16.4.6`, a breaking major upgrade requiring compatibility testing.
- `fast-xml-parser<=5.11.2`: npm reports quadratic CPU consumption (GHSA-474x-hrwr-fgx4), with a non-forced `npm audit fix` available.

Remediation: upgrade to registry-confirmed patched releases, regenerate and commit `package-lock.json`, then run `npm ci`, API/Web typecheck, Vitest, production build, `npm audit --omit=dev --audit-level=high` and Trivy. For PostCSS, test a supported patched Next.js release or a narrowly scoped compatible override; do not suppress findings or force an untested major upgrade. Repeat clinical/runtime regressions after framework changes.

Open-source scanner upstreams: [npm CLI](https://github.com/npm/cli) (Artistic-2.0), [Trivy](https://github.com/aquasecurity/trivy) (Apache-2.0), [Vitest](https://github.com/vitest-dev/vitest) (MIT). No third-party source code copied.
