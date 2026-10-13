# Production architecture — MediCare

## Principle

The platform is provider-independent. The browser never talks directly to PostgreSQL or object storage. All authorization decisions are enforced by the API.

```text
Browser / future mobile app
        │
        ▼
Identity Provider (OIDC/OAuth2, MFA)
        │
        ▼
Next.js web ──────► NestJS API
                       │
          ┌────────────┼─────────────┐
          ▼            ▼             ▼
      PostgreSQL   S3-compatible   Outbox worker
                     storage       notifications
```

## Technology boundaries

- `apps/web`: Next.js UI. No database credentials, no S3 credentials, no service-role keys.
- `apps/api`: NestJS domain API. The only component allowed to reach PostgreSQL and private object storage.
- OIDC: Keycloak in local development. Production can use Keycloak or another standards-compatible provider without changing domain code.
- PostgreSQL: ordinary PostgreSQL. No dependency on Supabase extensions or vendor RPC.
- Storage: S3 API. Local development uses MinIO; production can use a country-local S3-compatible provider.
- `outbox_events`: reliable integration boundary for email/SMS/push/payment/video workers.

## Country-cell deployment

For countries that require data localization, deploy independent cells:

```text
country A: API + PostgreSQL + object storage + KMS
country B: API + PostgreSQL + object storage + KMS
country C: API + PostgreSQL + object storage + KMS
```

Health data and directly identifying patient data remain in the selected cell. A future global control plane must contain only non-medical configuration and routing metadata. Do not solve data residency with a single global database plus a `country` column.

## Domain boundaries

1. Identity and accounts
2. Patients and legal representatives
3. Doctors and verification
4. Scheduling
5. Appointments
6. Consultations and signed medical results
7. Medical documents, scanning/quarantine and grants
8. Payments
9. Notifications
10. Consents and legal-document versions
11. Audit
12. Administration

## Booking consistency

Booking is executed server-side in one database transaction. The API atomically changes the slot from `available` to `booked`; only one concurrent request can succeed. An `Idempotency-Key` prevents duplicate appointments when a mobile connection retries a POST.

## Medical document flow

1. Client asks API for upload intent.
2. API verifies patient ownership and creates a DB row with status `uploading`.
3. API returns a short-lived signed PUT URL with a random storage key containing no patient name.
4. Client uploads directly to the private bucket.
5. Client calls `complete`.
6. API inspects the object server-side and enforces integrity: declared size vs `HeadObject` content length, declared `Content-Type` vs stored content type, magic-byte sniffing and a recomputed SHA-256. The browser `Content-Type` is never trusted on its own.
7. On any integrity mismatch the document is moved to `quarantined` with `scan_status='error'` and stays unavailable. On success the document becomes `quarantined` with `scan_status='pending'`, and a leased row in `document_scan_jobs` is enqueued.
8. The scan worker runs the configured `DOCUMENT_SCANNER` provider (`development-pass` locally, `clamav` for real scanning). The verdict is `clean | infected | error`.
9. Only a `clean` verdict promotes the document to `status='active'`, `scan_status='clean'`. `infected` keeps it `quarantined` with `scan_status='infected'`; `error` (verdict, exception or lease failure) keeps it `quarantined` with `scan_status='error'`. Neither state allows download or doctor access.
10. Downloads use short-lived signed GET URLs only after an access check.
11. Doctor access is a separate boundary: even an `active`/`clean` document is not visible to a doctor without an explicit `document_grants` row (created by the patient, optional `expires_at`, revocable via `revoked_at`) and a patient/doctor relationship.

Production still requires provider-side KMS/envelope encryption and an object versioning/retention policy.
