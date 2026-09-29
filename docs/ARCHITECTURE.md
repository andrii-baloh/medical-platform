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
7. Medical documents and grants
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
6. API verifies the object with HEAD and marks the document active.
7. Downloads use short-lived signed GET URLs only after an access check.
8. Doctor access requires an explicit active `document_grant` and a patient/doctor relationship.

For production, add malware scanning/quarantine before step 6 and provider-side KMS/envelope encryption.
